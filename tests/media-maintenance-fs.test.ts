import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { fstatSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activateFileNoReplace,
  acquireMaintenanceLock,
  MaintenanceFilesystemError,
  replaceContentAtomic,
  releaseMaintenanceLock,
  removeEmptyManagedParents,
  snapshotRegularFile,
  unlinkPlannedFile,
} from "../src/lib/media/maintenance-fs";

const operationId = "20260823t120000z-a1b2c3d4";

const withTemporaryRoot = async (
  operation: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "media-maintenance-fs-"));
  try {
    await operation(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const expectFsError = async (
  operation: Promise<unknown>,
  code: string,
): Promise<void> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(MaintenanceFilesystemError);
    expect((error as MaintenanceFilesystemError).code).toBe(code);
    return;
  }
  throw new Error(`Expected maintenance filesystem error ${code}.`);
};

test("holds one exclusive maintenance lock and releases only its owned lock", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const first = await acquireMaintenanceLock({ mediaRoot, operationId });
    await expectFsError(
      acquireMaintenanceLock({ mediaRoot, operationId: "another-operation" }),
      "busy",
    );
    await releaseMaintenanceLock(first);

    const second = await acquireMaintenanceLock({
      mediaRoot,
      operationId: "another-operation",
    });
    await releaseMaintenanceLock(second);
  });
});

test("refuses to release a substituted lock and preserves the new holder", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const lock = await acquireMaintenanceLock({ mediaRoot, operationId });
    const maintenance = join(mediaRoot, ".astrosphere", "maintenance");
    const lockPath = join(maintenance, "apply.lock");
    await rename(lockPath, join(maintenance, "held-original.lock"));
    await writeFile(
      lockPath,
      `${JSON.stringify({
        schemaVersion: 1,
        operationId: "replacement-holder",
        pid: process.pid,
        mediaRoot,
        createdAt: "2026-08-23T12:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );

    await expectFsError(releaseMaintenanceLock(lock), "lock-unsafe");
    expect(JSON.parse(await readFile(lockPath, "utf8")).operationId).toBe(
      "replacement-holder",
    );
    expect(await Bun.file(join(maintenance, "held-original.lock")).exists()).toBe(true);
  });
});

test("reaps an exact valid dead-process lock before reacquiring", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const maintenance = join(mediaRoot, ".astrosphere", "maintenance");
    await mkdir(maintenance, { recursive: true, mode: 0o700 });
    await writeFile(
      join(maintenance, "apply.lock"),
      `${JSON.stringify({
        schemaVersion: 1,
        operationId: "dead-operation",
        pid: 2_147_483_647,
        mediaRoot,
        createdAt: "2026-08-23T12:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );

    const lock = await acquireMaintenanceLock({ mediaRoot, operationId });
    expect(JSON.parse(await readFile(join(maintenance, "apply.lock"), "utf8"))).toMatchObject({
      schemaVersion: 1,
      operationId,
      pid: process.pid,
      mediaRoot,
    });
    await releaseMaintenanceLock(lock);
  });
});

test("fails closed for symlinked, malformed, wrong-root, and live lock entries", async () => {
  const cases: Array<{
    name: string;
    arrange: (mediaRoot: string, lockPath: string) => Promise<void>;
    code: string;
  }> = [
    {
      name: "symlinked",
      arrange: async (mediaRoot, lockPath) => {
        const target = join(mediaRoot, "external-lock");
        await writeFile(target, "external");
        await symlink(target, lockPath);
      },
      code: "lock-unsafe",
    },
    {
      name: "malformed",
      arrange: async (_mediaRoot, lockPath) => {
        await writeFile(lockPath, "not-json", { mode: 0o600 });
      },
      code: "lock-unsafe",
    },
    {
      name: "wrong-root",
      arrange: async (_mediaRoot, lockPath) => {
        await writeFile(
          lockPath,
          `${JSON.stringify({
            schemaVersion: 1,
            operationId: "dead-operation",
            pid: 2_147_483_647,
            mediaRoot: "/wrong-root",
            createdAt: "2026-08-23T12:00:00.000Z",
          })}\n`,
          { mode: 0o600 },
        );
      },
      code: "lock-unsafe",
    },
    {
      name: "live",
      arrange: async (mediaRoot, lockPath) => {
        await writeFile(
          lockPath,
          `${JSON.stringify({
            schemaVersion: 1,
            operationId: "live-operation",
            pid: process.pid,
            mediaRoot,
            createdAt: "2026-08-23T12:00:00.000Z",
          })}\n`,
          { mode: 0o600 },
        );
      },
      code: "busy",
    },
  ];

  for (const item of cases) {
    await withTemporaryRoot(async (mediaRoot) => {
      const maintenance = join(mediaRoot, ".astrosphere", "maintenance");
      await mkdir(maintenance, { recursive: true, mode: 0o700 });
      const lockPath = join(maintenance, "apply.lock");
      await item.arrange(mediaRoot, lockPath);
      await expectFsError(
        acquireMaintenanceLock({ mediaRoot, operationId }),
        item.code,
      );
    });
  }
});

const sha256 = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

test("streams an exact no-follow source snapshot into private immutable staging", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const sourcePath = join(mediaRoot, "images", "gallery", "source.png");
    await mkdir(join(mediaRoot, "images", "gallery"), { recursive: true });
    const bytes = new TextEncoder().encode("planned-image-bytes");
    await writeFile(sourcePath, bytes);
    const source = statSync(sourcePath);

    const snapshot = await snapshotRegularFile({
      mediaRoot,
      operationId,
      sourceRelativePath: "images/gallery/source.png",
      stagingName: "source.snapshot",
      expected: {
        device: source.dev,
        inode: source.ino,
        bytes: source.size,
        mtimeMs: source.mtimeMs,
        sha256: sha256(bytes),
      },
    });
    try {
      expect(await readFile(snapshot.path)).toEqual(Buffer.from(bytes));
      expect(snapshot.sha256).toBe(sha256(bytes));
      expect(snapshot.bytes).toBe(bytes.byteLength);
      expect(statSync(snapshot.path).mode & 0o777).toBe(0o400);
      expect(fstatSync(snapshot.descriptor).ino).toBe(statSync(snapshot.path).ino);
    } finally {
      snapshot.release();
    }
  });
});

test("rejects source symlinks, name-binding races, and mismatched hashes without retaining a partial snapshot", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const directory = join(mediaRoot, "images", "gallery");
    await mkdir(directory, { recursive: true });
    const realPath = join(directory, "real.png");
    const symlinkPath = join(directory, "linked.png");
    await writeFile(realPath, "source");
    await symlink(realPath, symlinkPath);
    const linked = statSync(realPath);
    await expectFsError(
      snapshotRegularFile({
        mediaRoot,
        operationId,
        sourceRelativePath: "images/gallery/linked.png",
        stagingName: "linked.snapshot",
        expected: {
          device: linked.dev,
          inode: linked.ino,
          bytes: linked.size,
          mtimeMs: linked.mtimeMs,
          sha256: sha256("source"),
        },
      }),
      "source-changed",
    );

    const racePath = join(directory, "race.png");
    await writeFile(racePath, "planned");
    const planned = statSync(racePath);
    await expectFsError(
      snapshotRegularFile(
        {
          mediaRoot,
          operationId,
          sourceRelativePath: "images/gallery/race.png",
          stagingName: "race.snapshot",
          expected: {
            device: planned.dev,
            inode: planned.ino,
            bytes: planned.size,
            mtimeMs: planned.mtimeMs,
            sha256: sha256("planned"),
          },
        },
        {
          afterSourceOpen: async () => {
            await rename(racePath, join(directory, "held.png"));
            await writeFile(racePath, "replacement");
          },
        },
      ),
      "source-changed",
    );

    const mismatchPath = join(directory, "mismatch.png");
    await writeFile(mismatchPath, "actual");
    const mismatch = statSync(mismatchPath);
    await expectFsError(
      snapshotRegularFile({
        mediaRoot,
        operationId,
        sourceRelativePath: "images/gallery/mismatch.png",
        stagingName: "mismatch.snapshot",
        expected: {
          device: mismatch.dev,
          inode: mismatch.ino,
          bytes: mismatch.size,
          mtimeMs: mismatch.mtimeMs,
          sha256: "0".repeat(64),
        },
      }),
      "source-changed",
    );

    const staging = join(mediaRoot, ".astrosphere", "maintenance", operationId, "staging");
    expect(await Bun.file(join(staging, "linked.snapshot")).exists()).toBe(false);
    expect(await Bun.file(join(staging, "race.snapshot")).exists()).toBe(false);
    expect(await Bun.file(join(staging, "mismatch.snapshot")).exists()).toBe(false);
  });
});

test("atomically activates the exact staged inode without replacement and removes only its staging link", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const staging = join(mediaRoot, ".astrosphere", "maintenance", operationId, "staging");
    const destinationDirectory = join(mediaRoot, "images", "gallery");
    await mkdir(staging, { recursive: true, mode: 0o700 });
    await mkdir(destinationDirectory, { recursive: true });
    const stagedPath = join(staging, "converted.webp");
    await writeFile(stagedPath, "verified-webp", { mode: 0o400 });
    const staged = statSync(stagedPath);

    const activated = await activateFileNoReplace({
      mediaRoot,
      operationId,
      stagingName: "converted.webp",
      destinationRelativePath: "images/gallery/converted.webp",
      expected: {
        device: staged.dev,
        inode: staged.ino,
        bytes: staged.size,
        sha256: sha256("verified-webp"),
      },
    });

    const destinationPath = join(destinationDirectory, "converted.webp");
    expect(await readFile(destinationPath, "utf8")).toBe("verified-webp");
    expect(statSync(destinationPath).ino).toBe(staged.ino);
    expect(activated.path).toBe(destinationPath);
    expect(await Bun.file(stagedPath).exists()).toBe(false);
  });
});

test("rejects occupied destinations, symlinked parents, and staged-name races without replacing data", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const staging = join(mediaRoot, ".astrosphere", "maintenance", operationId, "staging");
    const destinationDirectory = join(mediaRoot, "images", "gallery");
    await mkdir(staging, { recursive: true, mode: 0o700 });
    await mkdir(destinationDirectory, { recursive: true });

    const occupiedStage = join(staging, "occupied.webp");
    const occupiedDestination = join(destinationDirectory, "occupied.webp");
    await writeFile(occupiedStage, "new");
    await writeFile(occupiedDestination, "existing");
    const occupied = statSync(occupiedStage);
    await expectFsError(
      activateFileNoReplace({
        mediaRoot,
        operationId,
        stagingName: "occupied.webp",
        destinationRelativePath: "images/gallery/occupied.webp",
        expected: {
          device: occupied.dev,
          inode: occupied.ino,
          bytes: occupied.size,
          sha256: sha256("new"),
        },
      }),
      "destination-exists",
    );
    expect(await readFile(occupiedDestination, "utf8")).toBe("existing");
    expect(await readFile(occupiedStage, "utf8")).toBe("new");

    const external = join(mediaRoot, "external");
    await mkdir(external);
    await symlink(external, join(mediaRoot, "images", "linked"));
    const unsafeStage = join(staging, "unsafe.webp");
    await writeFile(unsafeStage, "unsafe");
    const unsafe = statSync(unsafeStage);
    await expectFsError(
      activateFileNoReplace({
        mediaRoot,
        operationId,
        stagingName: "unsafe.webp",
        destinationRelativePath: "images/linked/unsafe.webp",
        expected: {
          device: unsafe.dev,
          inode: unsafe.ino,
          bytes: unsafe.size,
          sha256: sha256("unsafe"),
        },
      }),
      "path-unsafe",
    );
    expect(await Bun.file(join(external, "unsafe.webp")).exists()).toBe(false);

    const raceStage = join(staging, "race.webp");
    await writeFile(raceStage, "planned-output");
    const race = statSync(raceStage);
    await expectFsError(
      activateFileNoReplace(
        {
          mediaRoot,
          operationId,
          stagingName: "race.webp",
          destinationRelativePath: "images/gallery/race.webp",
          expected: {
            device: race.dev,
            inode: race.ino,
            bytes: race.size,
            sha256: sha256("planned-output"),
          },
        },
        {
          afterStagedOpen: async () => {
            await rename(raceStage, join(staging, "held.webp"));
            await writeFile(raceStage, "replacement-output");
          },
        },
      ),
      "staging-changed",
    );
    expect(await Bun.file(join(destinationDirectory, "race.webp")).exists()).toBe(false);
  });
});

test("atomically replaces exact content bytes, retains rollback material, and rolls back by hash", async () => {
  await withTemporaryRoot(async (root) => {
    const projectRoot = join(root, "project");
    const mediaRoot = join(root, "media");
    const contentPath = join(projectRoot, "src", "content", "essays", "entry.md");
    await mkdir(join(projectRoot, "src", "content", "essays"), { recursive: true });
    await mkdir(mediaRoot);
    const before = Buffer.from("---\ntitle: Before\n---\nExact original.\n");
    const after = Buffer.from("---\ntitle: After\n---\nExact replacement.\n");
    await writeFile(contentPath, before);

    const applied = await replaceContentAtomic({
      projectRoot,
      relativePath: "src/content/essays/entry.md",
      expectedCurrentSha256: sha256(before),
      replacementSha256: sha256(after),
      replacementBytes: after,
      rollback: {
        mediaRoot,
        operationId,
        stagingName: "entry.rollback",
      },
    });
    expect(await readFile(contentPath)).toEqual(after);
    expect(applied.rollback?.sha256).toBe(sha256(before));
    expect(await readFile(applied.rollback!.path)).toEqual(before);

    await replaceContentAtomic({
      projectRoot,
      relativePath: "src/content/essays/entry.md",
      expectedCurrentSha256: sha256(after),
      replacementSha256: sha256(before),
      replacementBytes: await readFile(applied.rollback!.path),
    });
    expect(await readFile(contentPath)).toEqual(before);
  });
});

test("rejects stale content, symlinked content, and a last-moment identity race without overwriting it", async () => {
  await withTemporaryRoot(async (root) => {
    const projectRoot = join(root, "project");
    const mediaRoot = join(root, "media");
    const directory = join(projectRoot, "src", "content", "essays");
    await mkdir(directory, { recursive: true });
    await mkdir(mediaRoot);
    const contentPath = join(directory, "entry.md");
    await writeFile(contentPath, "current");

    await expectFsError(
      replaceContentAtomic({
        projectRoot,
        relativePath: "src/content/essays/entry.md",
        expectedCurrentSha256: "0".repeat(64),
        replacementSha256: sha256("replacement"),
        replacementBytes: Buffer.from("replacement"),
      }),
      "content-changed",
    );
    expect(await readFile(contentPath, "utf8")).toBe("current");

    const linkedPath = join(directory, "linked.md");
    await symlink(contentPath, linkedPath);
    await expectFsError(
      replaceContentAtomic({
        projectRoot,
        relativePath: "src/content/essays/linked.md",
        expectedCurrentSha256: sha256("current"),
        replacementSha256: sha256("replacement"),
        replacementBytes: Buffer.from("replacement"),
      }),
      "content-changed",
    );

    await expectFsError(
      replaceContentAtomic(
        {
          projectRoot,
          relativePath: "src/content/essays/entry.md",
          expectedCurrentSha256: sha256("current"),
          replacementSha256: sha256("replacement"),
          replacementBytes: Buffer.from("replacement"),
          rollback: {
            mediaRoot,
            operationId,
            stagingName: "race.rollback",
          },
        },
        {
          beforeExchange: async () => {
            await rename(contentPath, join(directory, "held.md"));
            await writeFile(contentPath, "external-change");
          },
        },
      ),
      "content-changed",
    );
    expect(await readFile(contentPath, "utf8")).toBe("external-change");
    expect(
      await Bun.file(
        join(mediaRoot, ".astrosphere", "maintenance", operationId, "staging", "race.rollback"),
      ).exists(),
    ).toBe(false);
  });
});

test("permanently unlinks only an exactly revalidated planned target", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const targetPath = join(mediaRoot, "images", "gallery", "orphan.png");
    await mkdir(join(mediaRoot, "images", "gallery"), { recursive: true });
    await writeFile(targetPath, "planned-orphan");
    const target = statSync(targetPath);

    expect(
      await unlinkPlannedFile({
        mediaRoot,
        relativePath: "images/gallery/orphan.png",
        publicPath: "/media/images/gallery/orphan.png",
        expected: {
          device: target.dev,
          inode: target.ino,
          bytes: target.size,
          sha256: sha256("planned-orphan"),
        },
        completedDeletions: [],
      }),
    ).toEqual({ status: "deleted" });
    expect(await Bun.file(targetPath).exists()).toBe(false);
  });
});

test("accepts an absent target only when its exact public path is journaled as deleted", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    await mkdir(join(mediaRoot, "manga", "series"), { recursive: true });
    const request = {
      mediaRoot,
      relativePath: "manga/series/page.webp",
      publicPath: "/manga/series/page.webp",
      expected: {
        device: 1,
        inode: 2,
        bytes: 3,
        sha256: "0".repeat(64),
      },
    };
    await expectFsError(
      unlinkPlannedFile({ ...request, completedDeletions: [] }),
      "target-missing",
    );
    expect(
      await unlinkPlannedFile({
        ...request,
        completedDeletions: ["/manga/series/page.webp"],
      }),
    ).toEqual({ status: "already-deleted" });
  });
});

test("rejects changed, symlinked, mismatched, and raced deletion targets without unlinking them", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const directory = join(mediaRoot, "images", "gallery");
    await mkdir(directory, { recursive: true });
    const targetPath = join(directory, "target.png");
    await writeFile(targetPath, "planned");
    const planned = statSync(targetPath);
    const base = {
      mediaRoot,
      relativePath: "images/gallery/target.png",
      publicPath: "/media/images/gallery/target.png",
      completedDeletions: [] as string[],
      expected: {
        device: planned.dev,
        inode: planned.ino,
        bytes: planned.size,
        sha256: sha256("planned"),
      },
    };
    await writeFile(targetPath, "changed");
    await expectFsError(unlinkPlannedFile(base), "target-changed");
    expect(await readFile(targetPath, "utf8")).toBe("changed");

    const realPath = join(directory, "real.png");
    const linkedPath = join(directory, "linked.png");
    await writeFile(realPath, "linked");
    await symlink(realPath, linkedPath);
    const real = statSync(realPath);
    await expectFsError(
      unlinkPlannedFile({
        ...base,
        relativePath: "images/gallery/linked.png",
        publicPath: "/media/images/gallery/linked.png",
        expected: {
          device: real.dev,
          inode: real.ino,
          bytes: real.size,
          sha256: sha256("linked"),
        },
      }),
      "target-changed",
    );
    expect(await readFile(realPath, "utf8")).toBe("linked");

    await rm(targetPath);
    await writeFile(targetPath, "planned");
    const raced = statSync(targetPath);
    await expectFsError(
      unlinkPlannedFile(
        {
          ...base,
          expected: {
            device: raced.dev,
            inode: raced.ino,
            bytes: raced.size,
            sha256: sha256("planned"),
          },
        },
        {
          beforeUnlink: async () => {
            await rename(targetPath, join(directory, "held-target.png"));
            await writeFile(targetPath, "external");
          },
        },
      ),
      "target-changed",
    );
    expect(await readFile(targetPath, "utf8")).toBe("external");
  });
});

test("removes empty parents bottom-up but preserves managed roots and stops at nonempty directories", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const leafDirectory = join(mediaRoot, "images", "gallery", "nested");
    await mkdir(leafDirectory, { recursive: true });
    const removed = await removeEmptyManagedParents({
      mediaRoot,
      relativePath: "images/gallery/nested/deleted.webp",
    });
    expect(removed).toEqual([
      "images/gallery/nested",
      "images/gallery",
    ]);
    expect(statSync(join(mediaRoot, "images")).isDirectory()).toBe(true);

    const nonempty = join(mediaRoot, "manga", "series", "chapter");
    await mkdir(nonempty, { recursive: true });
    await writeFile(join(nonempty, "kept.webp"), "kept");
    expect(
      await removeEmptyManagedParents({
        mediaRoot,
        relativePath: "manga/series/chapter/deleted.webp",
      }),
    ).toEqual([]);
    expect(await readFile(join(nonempty, "kept.webp"), "utf8")).toBe("kept");
  });
});

test("never follows a symlink while cleaning managed parents", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const external = join(mediaRoot, "external");
    await mkdir(join(mediaRoot, "images"), { recursive: true });
    await mkdir(external);
    await symlink(external, join(mediaRoot, "images", "linked"));
    await expectFsError(
      removeEmptyManagedParents({
        mediaRoot,
        relativePath: "images/linked/deleted.webp",
      }),
      "path-unsafe",
    );
    expect(statSync(external).isDirectory()).toBe(true);
  });
});

test("rejects an empty-parent identity race without removing the substituted directory", async () => {
  await withTemporaryRoot(async (mediaRoot) => {
    const candidate = join(mediaRoot, "images", "gallery", "empty");
    const held = join(mediaRoot, "images", "gallery", "held-empty");
    await mkdir(candidate, { recursive: true });
    let swapped = false;
    await expectFsError(
      removeEmptyManagedParents(
        {
          mediaRoot,
          relativePath: "images/gallery/empty/deleted.webp",
        },
        {
          beforeDirectoryQuarantine: async (relativePath) => {
            if (relativePath !== "images/gallery/empty" || swapped) return;
            swapped = true;
            await rename(candidate, held);
            await mkdir(candidate);
          },
        },
      ),
      "path-unsafe",
    );
    expect(statSync(candidate).isDirectory()).toBe(true);
    expect(statSync(held).isDirectory()).toBe(true);
  });
});
