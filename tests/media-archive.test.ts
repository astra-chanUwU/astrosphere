import { expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractZipArchive, listZipEntries, readZipEntryHeader, validateArchiveEntryPath } from "../src/lib/media/archive";

const commandResult = (stdout = "", exitCode = 0, stderr = "") => ({
  exitCode,
  stdout: new TextEncoder().encode(stdout),
  stderr,
});

const expectRejection = async (operation: Promise<unknown>, message?: string): Promise<void> => {
  try {
    await operation;
  } catch (error) {
    if (message !== undefined) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) expect(error.message).toContain(message);
    }
    return;
  }
  throw new Error("Expected operation to reject");
};

test("accepts nested relative entries and rejects archive escapes", () => {
  expect(validateArchiveEntryPath("book/chapter/001.png")).toBe("book/chapter/001.png");
  for (const unsafe of ["../secret", "book/../../secret", "/absolute", "C:/absolute", "\\\\server\\share", "book\\..\\secret"]) {
    expect(() => validateArchiveEntryPath(unsafe)).toThrow("unsafe archive path");
  }
});

test("lists entries through unzip without extracting", async () => {
  const calls: string[][] = [];
  const entries = await listZipEntries("/tmp/book.cbz", async (argv) => {
    calls.push(argv);
    return commandResult("001.jpg\n__MACOSX/._001.jpg\n");
  });
  expect(calls).toEqual([["unzip", "-Z1", "/tmp/book.cbz"]]);
  expect(entries.map((entry) => entry.path)).toEqual(["001.jpg", "__MACOSX/._001.jpg"]);
});

test("normalizes safe archive paths and rejects ambiguous separators", () => {
  expect(validateArchiveEntryPath("book//chapter/./001.png")).toBe("book/chapter/001.png");
  expect(validateArchiveEntryPath("book//chapter/./")).toBe("book/chapter/");
  for (const unsafe of ["", ".", "C:relative", "//server/share", "book\0secret", "book\nsecret", "book\rsecret"]) {
    expect(() => validateArchiveEntryPath(unsafe)).toThrow("unsafe archive path");
  }
});

test("rejects unzip member selectors with pattern or option syntax", () => {
  for (const unsafe of ["page*.jpg", "page?.jpg", "page[0].jpg", "-page.jpg"]) {
    expect(() => validateArchiveEntryPath(unsafe)).toThrow("unsafe archive path");
  }
});

test("rejects unsafe entries returned by unzip", async () => {
  await expectRejection(listZipEntries("/tmp/book.cbz", async () => commandResult("page.jpg\nfolder\\..\\secret\n")), "unsafe archive path");
});

test("keeps normalized directory entries distinct from files", async () => {
  const entries = await listZipEntries("/tmp/book.cbz", async () => commandResult("pages//./\npages//./001.jpg\n"));
  expect(entries).toEqual([
    { path: "pages/", selector: "pages//./", isDirectory: true },
    { path: "pages/001.jpg", selector: "pages//./001.jpg", isDirectory: false },
  ]);
});

test("reports a failed ZIP listing with tool output", async () => {
  await expectRejection(listZipEntries("/tmp/broken.cbz", async () => commandResult("", 9, "End-of-central-directory signature not found")), "End-of-central-directory signature not found");
});

test("reads at most one ZIP entry stream chunk and terminates the child", async () => {
  const calls: string[][] = [];
  let killed = false;
  let resolveExit!: (exitCode: number) => void;
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  const header = await readZipEntryHeader("/tmp/book.cbz", { path: "001.jpg", isDirectory: false }, (argv) => {
    calls.push(argv);
    return {
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(Array.from({ length: 40 }, (_, index) => index)));
        },
      }),
      exited,
      kill: () => {
        killed = true;
        resolveExit(137);
      },
    };
  });

  expect(calls).toEqual([["unzip", "-p", "/tmp/book.cbz", "001.jpg"]]);
  expect(Array.from(header)).toEqual(Array.from({ length: 32 }, (_, index) => index));
  expect(killed).toBeTrue();
});

test("uses the raw ZIP selector when an entry path is normalized", async () => {
  const [entry] = await listZipEntries("/tmp/book.cbz", async () => commandResult("book//chapter/./001.jpg\n"));
  const calls: string[][] = [];

  await readZipEntryHeader("/tmp/book.cbz", entry, (argv) => {
    calls.push(argv);
    return {
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([0xff, 0xd8]));
        },
      }),
      exited: Promise.resolve(0),
      kill: () => undefined,
    };
  });

  expect(entry).toEqual({
    path: "book/chapter/001.jpg",
    selector: "book//chapter/./001.jpg",
    isDirectory: false,
  });
  expect(calls).toEqual([["unzip", "-p", "/tmp/book.cbz", "book//chapter/./001.jpg"]]);
});

test("reports a ZIP entry read that exits before yielding bytes", async () => {
  await expectRejection(
    readZipEntryHeader("/tmp/broken.cbz", { path: "001.jpg", isDirectory: false }, () => ({
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      exited: Promise.resolve(9),
      kill: () => undefined,
    })),
    "Unable to read ZIP entry header",
  );
});

test("reports a failed ZIP entry stream before it yields bytes", async () => {
  await expectRejection(
    readZipEntryHeader("/tmp/broken.cbz", { path: "001.jpg", isDirectory: false }, () => ({
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("pipe closed"));
        },
      }),
      exited: Promise.resolve(9),
      kill: () => undefined,
    })),
    "Unable to read ZIP entry header",
  );
});

test("rejects an unsafe ZIP header entry before spawning unzip", async () => {
  let spawned = false;
  await expectRejection(
    readZipEntryHeader("/tmp/book.cbz", { path: "../secret", isDirectory: false }, () => {
      spawned = true;
      return {
        stdout: new ReadableStream<Uint8Array>(),
        exited: Promise.resolve(0),
        kill: () => undefined,
      };
    }),
    "unsafe archive path",
  );
  expect(spawned).toBeFalse();
});

test("rejects unsafe preflight entries before extraction begins", async () => {
  let extractionStarted = false;
  await expectRejection(
    extractZipArchive("/tmp/book.cbz", "/tmp/owned-destination", async (argv) => {
      if (argv[1] === "-Z1") return commandResult("../escape\n");
      extractionStarted = true;
      return commandResult();
    }),
    "unsafe archive path",
  );
  expect(extractionStarted).toBeFalse();
});

test("rejects symbolic links created during extraction and removes its destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-archive-"));
  const destination = join(root, "extracted");
  const calls: string[][] = [];
  let stagingDestination = "";
  try {
    await expectRejection(
      extractZipArchive("/tmp/book.cbz", destination, async (argv) => {
        calls.push(argv);
        if (argv[1] === "-Z1") return commandResult("page.jpg\nescape\n");
        stagingDestination = argv[4];
        await writeFile(join(stagingDestination, "page.jpg"), "image");
        await symlink("../outside", join(stagingDestination, "escape"));
        return commandResult();
      }),
      "symbolic link",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["unzip", "-Z1", "/tmp/book.cbz"]);
    expect(calls[1].slice(0, 4)).toEqual(["unzip", "-qq", "/tmp/book.cbz", "-d"]);
    expect(stagingDestination).not.toBe(destination);
    await expectRejection(lstat(stagingDestination));
    await expectRejection(lstat(destination));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves a destination this extraction did not create", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-archive-"));
  const destination = join(root, "existing");
  const marker = join(destination, "marker.txt");
  await mkdir(destination);
  await writeFile(marker, "keep me");
  try {
    await expectRejection(extractZipArchive("/tmp/book.cbz", destination, async () => commandResult("page.jpg\n")));
    expect(await readFile(marker, "utf8")).toBe("keep me");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleans only private staging when extraction failure leaves a destination replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-archive-"));
  const destination = join(root, "extracted");
  const marker = join(destination, "replacement.txt");
  let stagingDestination = "";
  try {
    await expectRejection(
      extractZipArchive("/tmp/book.cbz", destination, async (argv) => {
        if (argv[1] === "-Z1") return commandResult("page.jpg\n");
        stagingDestination = argv[4];
        await writeFile(join(stagingDestination, "page.jpg"), "image");
        await mkdir(destination);
        await writeFile(marker, "replacement");
        return commandResult("", 1, "bad archive");
      }),
    );
    expect(await readFile(marker, "utf8")).toBe("replacement");
    expect(stagingDestination).not.toBe(destination);
    await expectRejection(lstat(stagingDestination));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishes a verified private staging tree only after extraction succeeds", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-archive-"));
  const destination = join(root, "extracted");
  let stagingDestination = "";
  try {
    const entries = await extractZipArchive("/tmp/book.cbz", destination, async (argv) => {
      if (argv[1] === "-Z1") return commandResult("page.jpg\n");
      stagingDestination = argv[4];
      await writeFile(join(stagingDestination, "page.jpg"), "image");
      return commandResult();
    });
    expect(entries.map((entry) => entry.path)).toEqual(["page.jpg"]);
    expect(stagingDestination).not.toBe(destination);
    expect(await readFile(join(destination, "page.jpg"), "utf8")).toBe("image");
    await expectRejection(lstat(stagingDestination));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves a destination that appears before the final staging rename", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-archive-"));
  const destination = join(root, "extracted");
  const marker = join(destination, "replacement.txt");
  let stagingDestination = "";
  try {
    await expectRejection(
      extractZipArchive("/tmp/book.cbz", destination, async (argv) => {
        if (argv[1] === "-Z1") return commandResult("page.jpg\n");
        stagingDestination = argv[4];
        await writeFile(join(stagingDestination, "page.jpg"), "image");
        await mkdir(destination);
        await writeFile(marker, "replacement");
        return commandResult();
      }),
    );
    expect(await readFile(marker, "utf8")).toBe("replacement");
    expect(stagingDestination).not.toBe(destination);
    await expectRejection(lstat(stagingDestination));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
