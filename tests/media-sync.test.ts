import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMediaSyncCommand,
  createPruneManifest,
  createRemoteListCommand,
  assertPruneSnapshotCurrent,
  formatPruneManifest,
  listLocalMediaFiles,
  parseRemoteFileList,
  parseRemoteMediaTarget,
  writePruneManifest,
} from "../src/lib/media/sync";

test("parses only restricted remote media targets", () => {
  expect(
    parseRemoteMediaTarget("astro@example.test:/srv/astrosphere/media///"),
  ).toEqual({
    login: "astro@example.test",
    root: "/srv/astrosphere/media",
    value: "astro@example.test:/srv/astrosphere/media",
  });
  expect(() => parseRemoteMediaTarget("example.test:/srv/media")).toThrow(
    "user@host:/absolute/path",
  );
  expect(() => parseRemoteMediaTarget("astro@example.test:/srv/a b")).toThrow(
    "user@host:/absolute/path",
  );
  expect(() =>
    parseRemoteMediaTarget("astro@example.test:/srv/$media"),
  ).toThrow("user@host:/absolute/path");
});

test("builds one incremental synchronization command without deletion", () => {
  const command = createMediaSyncCommand({
    root: "/Users/example/astrosphere-media",
    target: "astro@example.test:/srv/astrosphere/media",
    dryRun: true,
  });

  expect(command).toEqual([
    "rsync",
    "--archive",
    "--human-readable",
    "--progress",
    "--exclude",
    "/.astrosphere/",
    "--dry-run",
    "/Users/example/astrosphere-media/",
    "astro@example.test:/srv/astrosphere/media/",
  ]);
  expect(command).not.toContain("--delete");
  expect(command).not.toContain("--partial");
});

test("builds and parses a deterministic remote inventory", () => {
  const target = parseRemoteMediaTarget(
    "astro@example.test:/srv/astrosphere/media",
  );
  expect(createRemoteListCommand(target)).toEqual([
    "rsync",
    "--recursive",
    "--list-only",
    "--out-format=%l|%n",
    "astro@example.test:/srv/astrosphere/media/",
  ]);

  expect(
    parseRemoteFileList(
      "120|manga/book/001.webp\n40|images/set/a|b.webp\n0|images/set/\n7|.astrosphere/log\n",
    ),
  ).toEqual([
    { path: "images/set/a|b.webp", bytes: 40 },
    { path: "manga/book/001.webp", bytes: 120 },
  ]);
});

test("rejects malformed or unsafe remote inventory entries", () => {
  expect(() => parseRemoteFileList("x|manga/book/001.webp")).toThrow(
    "invalid byte count",
  );
  expect(() => parseRemoteFileList("1|../secret.webp")).toThrow(
    "unsafe media path",
  );
  expect(() => parseRemoteFileList("1|/manga/book/001.webp")).toThrow(
    "unsafe media path",
  );
  expect(() => parseRemoteFileList("1|manga\\book.webp")).toThrow(
    "unsafe media path",
  );
  expect(() => parseRemoteFileList("1|manga/book\t001.webp")).toThrow(
    "unsafe media path",
  );
});

test("walks only regular files in the two local public media trees", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-sync-"));
  try {
    await mkdir(join(root, "manga/book"), { recursive: true });
    await mkdir(join(root, "images/set"), { recursive: true });
    await mkdir(join(root, ".astrosphere"));
    await writeFile(join(root, "manga/book/001.webp"), "1234");
    await writeFile(join(root, "images/set/cover.webp"), "123456");
    await writeFile(join(root, ".astrosphere/prune.json"), "private");
    await symlink(
      join(root, "manga/book/001.webp"),
      join(root, "images/set/link.webp"),
    );

    expect(await listLocalMediaFiles(root)).toEqual([
      { path: "images/set/cover.webp", bytes: 6 },
      { path: "manga/book/001.webp", bytes: 4 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const manifestTarget = parseRemoteMediaTarget(
  "astro@example.test:/srv/astrosphere/media",
);
const manifestLocal = [{ path: "manga/book/001.webp", bytes: 10 }];
const manifestRemote = [
  { path: "manga/book/001.webp", bytes: 11 },
  { path: "images/old/a.webp", bytes: 20 },
];

test("manifests only remote paths that are absent locally", () => {
  const manifest = createPruneManifest({
    target: manifestTarget,
    local: manifestLocal,
    remote: manifestRemote,
    operationId: "11111111-1111-4111-8111-111111111111",
    generatedAt: "2026-08-23T00:00:00.000Z",
  });

  expect(manifest).toEqual({
    version: 1,
    operationId: "11111111-1111-4111-8111-111111111111",
    generatedAt: "2026-08-23T00:00:00.000Z",
    target: "astro@example.test:/srv/astrosphere/media",
    files: [{ path: "images/old/a.webp", bytes: 20 }],
    totalBytes: 20,
  });
  expect(formatPruneManifest(manifest)).toBe(
    "Remote prune manifest:\n  images/old/a.webp (20 bytes)\nFiles: 1 | Bytes: 20",
  );
});

test("rejects a prune snapshot when a path or recorded size changes", () => {
  const manifest = createPruneManifest({
    target: manifestTarget,
    local: manifestLocal,
    remote: manifestRemote,
    operationId: "11111111-1111-4111-8111-111111111111",
    generatedAt: "2026-08-23T00:00:00.000Z",
  });

  expect(() =>
    assertPruneSnapshotCurrent(manifest, manifestLocal, [
      { path: "images/old/a.webp", bytes: 21 },
    ]),
  ).toThrow("remote media changed after the prune manifest was created");
  expect(() =>
    assertPruneSnapshotCurrent(
      manifest,
      [...manifestLocal, { path: "images/old/a.webp", bytes: 20 }],
      manifestRemote,
    ),
  ).toThrow("local media changed after the prune manifest was created");
  expect(() =>
    assertPruneSnapshotCurrent(manifest, manifestLocal, manifestRemote),
  ).not.toThrow();
});

test("writes a prune manifest atomically beneath the private operations root", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-manifest-"));
  const manifest = createPruneManifest({
    target: manifestTarget,
    local: manifestLocal,
    remote: manifestRemote,
    operationId: "11111111-1111-4111-8111-111111111111",
    generatedAt: "2026-08-23T00:00:00.000Z",
  });
  try {
    const path = await writePruneManifest(manifest, root);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(manifest);
    expect(await readdir(root)).toEqual([
      "prune-2026-08-23T00-00-00-000Z-11111111-1111-4111-8111-111111111111.json",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
