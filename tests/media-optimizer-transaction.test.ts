import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { MediaError } from "../src/lib/media/errors";
import { optimizeMedia } from "../src/lib/media/optimizer";
import { runCommand, type CommandRunner } from "../src/lib/media/process";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const webp = new TextEncoder().encode("RIFF1234WEBP");
const tools = {
  which: (name: string) => `/tools/${name}`,
  verifyOutput: async () => undefined,
};

const expectOptimizationRejection = async (
  operation: Promise<unknown>,
  message: string,
): Promise<void> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(MediaError);
    expect((error as MediaError).kind).toBe("optimization");
    expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error("Expected media optimization to reject.");
};

const withTemporaryRoot = async (
  operation: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "media-optimize-"));
  try {
    await operation(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const stagingNames = async (root: string): Promise<string[]> =>
  (await readdir(root)).filter(
    (name) =>
      name.includes("media-staging") ||
      name.includes("media-extraction") ||
      name.includes(".extract-"),
  );

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatenate = (parts: Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
};

const storedZip = (entries: Array<{ path: string; bytes: Uint8Array }>) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path);
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.bytes.byteLength, true);
    localView.setUint32(22, entry.bytes.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    local.set(name, 30);
    localParts.push(local, entry.bytes);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.bytes.byteLength, true);
    centralView.setUint32(24, entry.bytes.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);

    localOffset += local.byteLength + entry.bytes.byteLength;
  }

  const central = concatenate(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, central.byteLength, true);
  endView.setUint32(16, localOffset, true);
  return concatenate([...localParts, central, end]);
};

test("refuses an existing destination before creating staging", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(source);
    await mkdir(destination);
    await Bun.write(join(source, "1.jpg"), jpeg);

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        tools,
      ),
      "destination already exists",
    );
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("copies WebP and converts JPEG through an injected command", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(source);
    await Bun.write(join(source, "1.webp"), webp);
    await Bun.write(join(source, "2.jpg"), jpeg);
    const calls: string[][] = [];
    const runner: CommandRunner = async (argv) => {
      calls.push(argv);
      await Bun.write(argv[argv.indexOf("-o") + 1]!, webp);
      return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
    };

    const result = await optimizeMedia(
      {
        source,
        destination,
        profile: "reader",
        quality: 85,
        dryRun: false,
      },
      { ...tools, runner },
    );

    expect(calls[0]?.[0]).toBe("cwebp");
    expect(result).toMatchObject({
      converted: 1,
      copied: 1,
      ignored: 0,
      failed: 0,
      originalBytes: jpeg.byteLength + webp.byteLength,
      optimizedBytes: webp.byteLength * 2,
      savedBytes: jpeg.byteLength - webp.byteLength,
    });
    expect(await Bun.file(join(destination, "001.webp")).exists()).toBe(true);
    expect(await Bun.file(join(destination, "002.webp")).exists()).toBe(true);
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("cleans staging and leaves source untouched on conversion failure", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(source);
    const input = join(source, "1.jpg");
    await Bun.write(input, jpeg);
    const before = await Bun.file(input).bytes();
    const runner: CommandRunner = async () => ({
      exitCode: 1,
      stdout: new Uint8Array(),
      stderr: "failed",
    });

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        { ...tools, runner },
      ),
      "1.jpg",
    );
    expect(await Bun.file(destination).exists()).toBe(false);
    expect(await Bun.file(input).bytes()).toEqual(before);
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("preserves a replacement installed at optimizer staging before cleanup", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    const heldStaging = join(root, "held-staging");
    let staging = "";
    await mkdir(source);
    await Bun.write(join(source, "1.jpg"), jpeg);
    const runner: CommandRunner = async (argv) => {
      const output = argv[argv.indexOf("-o") + 1]!;
      staging = dirname(output);
      await rename(staging, heldStaging);
      await mkdir(staging);
      await writeFile(join(staging, "replacement.txt"), "preserve");
      return { exitCode: 1, stdout: new Uint8Array(), stderr: "failed" };
    };

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        { ...tools, runner },
      ),
      "1.jpg",
    );
    expect(await readFile(join(staging, "replacement.txt"), "utf8")).toBe(
      "preserve",
    );
    expect(await Bun.file(destination).exists()).toBe(false);
  });
});

test("dry-run creates no output and invokes no conversion", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(source);
    await Bun.write(join(source, "1.jpg"), jpeg);
    const runner: CommandRunner = async () => {
      throw new Error("runner must not execute");
    };

    const result = await optimizeMedia(
      {
        source,
        destination,
        profile: "reader",
        quality: 85,
        dryRun: true,
      },
      { ...tools, runner },
    );

    expect(result.plan.items).toHaveLength(1);
    expect(await Bun.file(destination).exists()).toBe(false);
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("derives direct-file inventory semantics from the real source stat", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "page.bin");
    const destination = join(root, "output");
    await Bun.write(source, jpeg);

    const result = await optimizeMedia(
      {
        source,
        destination,
        profile: "reader",
        quality: 85,
        dryRun: true,
      },
      {
        runner: async () => {
          throw new Error("direct-file inspection must not run a command");
        },
        which: () => {
          throw new Error("dry-run must not check tools");
        },
      },
    );

    expect(result.plan.items).toEqual([
      {
        sourcePath: source,
        sourceRelativePath: basename(source),
        outputRelativePath: "001.webp",
        format: "jpeg",
        action: "convert",
        bytes: jpeg.byteLength,
      },
    ]);
  });
});

test("directory inventories cannot acquire direct-file semantics", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(source);
    await Bun.write(join(source, "page.jpg"), jpeg);

    const result = await optimizeMedia({
      source,
      destination,
      profile: "reader",
      quality: 85,
      dryRun: true,
    });

    expect(result.plan.items[0]?.sourcePath).toBe(join(source, "page.jpg"));
    expect(result.plan.items[0]?.sourcePath).not.toBe(source);
  });
});

test("dry-run inspects archive entries without extraction, staging, or tool checks", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "chapter.cbz");
    const destination = join(root, "output");
    const archive = storedZip([{ path: "wrapper/page.jpg", bytes: jpeg }]);
    await Bun.write(source, archive);
    const before = await Bun.file(source).bytes();

    const result = await optimizeMedia(
      {
        source,
        destination,
        profile: "reader",
        quality: 85,
        dryRun: true,
      },
      {
        which: () => {
          throw new Error("dry-run must not check tools");
        },
      },
    );

    expect(result.plan.items[0]?.sourcePath).toBe(
      join(source, "wrapper/page.jpg"),
    );
    expect(result.plan.items[0]?.sourcePath).not.toBe(source);
    expect(await Bun.file(destination).exists()).toBe(false);
    expect(await Bun.file(source).bytes()).toEqual(before);
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("requires only the tools needed by the plan before staging", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(source);
    await Bun.write(join(source, "page.webp"), webp);
    const required: string[] = [];

    await optimizeMedia(
      {
        source,
        destination,
        profile: "reader",
        quality: 85,
        dryRun: false,
      },
      {
        which: (name) => {
          required.push(name);
          return `/tools/${name}`;
        },
        verifyOutput: async () => undefined,
      },
    );

    expect(required).toEqual(["webpinfo"]);
  });
});

test("a missing conversion tool fails before staging", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(source);
    await Bun.write(join(source, "page.jpg"), jpeg);

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        {
          which: () => null,
          verifyOutput: async () => undefined,
        },
      ),
      "cwebp",
    );
    expect(await Bun.file(destination).exists()).toBe(false);
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("creates gallery parents and verifies every staged output", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    await mkdir(join(source, "set-a"), { recursive: true });
    await mkdir(join(source, "set-b"), { recursive: true });
    await Bun.write(join(source, "set-a", "one.webp"), webp);
    await Bun.write(join(source, "set-b", "two.webp"), webp);
    const verified: string[] = [];

    await optimizeMedia(
      {
        source,
        destination,
        profile: "gallery",
        quality: 85,
        dryRun: false,
      },
      {
        ...tools,
        verifyOutput: async (path) => {
          verified.push(path);
        },
      },
    );

    expect(verified).toHaveLength(2);
    expect(
      verified.every((path) => path.includes(".output.media-staging-")),
    ).toBe(true);
    expect(verified.map((path) => basename(path)).sort()).toEqual([
      "one.webp",
      "two.webp",
    ]);
    expect(
      await Bun.file(join(destination, "set-a", "one.webp")).exists(),
    ).toBe(true);
    expect(
      await Bun.file(join(destination, "set-b", "two.webp")).exists(),
    ).toBe(true);
  });
});

test("no-replace publication preserves a destination created during execution", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destination = join(root, "output");
    const marker = join(destination, "marker.txt");
    await mkdir(source);
    await Bun.write(join(source, "page.webp"), webp);

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        {
          ...tools,
          verifyOutput: async () => {
            await mkdir(destination);
            await writeFile(marker, "preserve");
          },
        },
      ),
      "atomically publish",
    );
    expect(await readFile(marker, "utf8")).toBe("preserve");
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("revalidates the canonical destination parent before publication", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const destinationParent = join(root, "target");
    const heldParent = join(root, "held-target");
    const destination = join(destinationParent, "output");
    const marker = join(destinationParent, "replacement.txt");
    await mkdir(source);
    await mkdir(destinationParent);
    await Bun.write(join(source, "page.webp"), webp);

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        {
          ...tools,
          verifyOutput: async (stagedOutput) => {
            const stagingName = basename(dirname(stagedOutput));
            await rename(destinationParent, heldParent);
            await mkdir(destinationParent);
            await symlink(
              join(heldParent, stagingName),
              join(destinationParent, stagingName),
            );
            await writeFile(marker, "preserve");
          },
        },
      ),
      "destination parent changed",
    );
    expect(await readFile(marker, "utf8")).toBe("preserve");
    expect(await Bun.file(destination).exists()).toBe(false);
  });
});

test("extracts archives into owned temporary data and removes it after success", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "chapter.cbz");
    const destination = join(root, "output");
    const archive = storedZip([{ path: "wrapper/page.jpg", bytes: jpeg }]);
    await Bun.write(source, archive);
    const before = await Bun.file(source).bytes();
    const calls: string[][] = [];
    const runner: CommandRunner = async (argv, options) => {
      calls.push(argv);
      if (argv[0] === "unzip") return runCommand(argv, options);
      await Bun.write(argv[argv.indexOf("-o") + 1]!, webp);
      return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
    };

    const result = await optimizeMedia(
      {
        source,
        destination,
        profile: "reader",
        quality: 85,
        dryRun: false,
      },
      { ...tools, runner },
    );

    expect(calls.some((argv) => argv[0] === "unzip" && argv[1] === "-qq")).toBe(
      true,
    );
    expect(result).toMatchObject({
      converted: 1,
      copied: 0,
      failed: 0,
      originalBytes: jpeg.byteLength,
      optimizedBytes: webp.byteLength,
      savedBytes: jpeg.byteLength - webp.byteLength,
    });
    expect(await Bun.file(join(destination, "001.webp")).exists()).toBe(true);
    expect(await Bun.file(source).bytes()).toEqual(before);
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("validates source, destination, and destination parent before mutation", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "page.jpg");
    const destination = join(root, "missing-parent", "output");
    await Bun.write(source, jpeg);

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        tools,
      ),
      dirname(destination),
    );
    expect(await Bun.file(destination).exists()).toBe(false);
    expect(await stagingNames(root)).toEqual([]);
  });
});

test("refuses a destination inside a directory source without changing the tree", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const input = join(source, "page.webp");
    const destination = join(source, "output");
    await mkdir(source);
    await Bun.write(input, webp);
    const before = await Bun.file(input).bytes();

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        tools,
      ),
      "inside the source directory",
    );
    expect(await Bun.file(input).bytes()).toEqual(before);
    expect(await readdir(source)).toEqual(["page.webp"]);
  });
});

test("refuses a symlinked destination parent that resolves inside the source", async () => {
  await withTemporaryRoot(async (root) => {
    const source = join(root, "source");
    const nestedParent = join(source, "nested");
    const input = join(source, "page.webp");
    const sourceAlias = join(root, "source-alias");
    const destination = join(sourceAlias, "nested", "output");
    await mkdir(nestedParent, { recursive: true });
    await Bun.write(input, webp);
    await symlink(source, sourceAlias);
    const before = await Bun.file(input).bytes();

    await expectOptimizationRejection(
      optimizeMedia(
        {
          source,
          destination,
          profile: "reader",
          quality: 85,
          dryRun: false,
        },
        tools,
      ),
      "inside the source directory",
    );
    expect(await Bun.file(input).bytes()).toEqual(before);
    expect(await readdir(nestedParent)).toEqual([]);
  });
});
