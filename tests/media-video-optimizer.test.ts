import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaError } from "../src/lib/media/errors";
import type { CommandRunner } from "../src/lib/media/process";
import type { ProbedVideo } from "../src/lib/media/video-probe";
import { optimizeVideoManifest } from "../src/lib/media/video-optimizer";

const manifestText = `
version: 1
title: example-show
variants:
  - label: Japanese with English subtitles
    source: episode.mkv
    output: /media/anime/example-show/videos/01/japanese-subbed.webm
    audio: { language: jpn }
    subtitle: { title: Dialogue, mode: burn }
  - label: English dub
    source: episode.mkv
    output: /media/anime/example-show/videos/01/english-dub.webm
    audio: { language: eng }
`;

const probe: ProbedVideo = {
  path: "episode.mkv",
  durationSeconds: 10,
  bytes: 8,
  formatName: "matroska,webm",
  streams: [
    { index: 0, codecType: "video", codecName: "h264", profile: "High 10", width: 1920, height: 1080, pixelFormat: "yuv420p10le" },
    { index: 1, codecType: "audio", codecName: "flac", channels: 2, language: "eng" },
    { index: 2, codecType: "audio", codecName: "flac", channels: 2, language: "jpn" },
    { index: 3, codecType: "subtitle", codecName: "hdmv_pgs_subtitle", language: "eng", title: "Dialogue" },
  ],
};

const withFixture = async (operation: (fixture: {
  root: string;
  sourceRoot: string;
  mediaRoot: string;
  manifestPath: string;
  sourcePath: string;
}) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), "video-optimizer-"));
  const sourceRoot = join(root, "source");
  const mediaRoot = join(root, "media");
  const manifestPath = join(root, "manifest.yaml");
  const sourcePath = join(sourceRoot, "episode.mkv");
  try {
    await mkdir(sourceRoot);
    await mkdir(mediaRoot);
    await writeFile(sourcePath, "original");
    await writeFile(manifestPath, manifestText);
    await operation({ root, sourceRoot, mediaRoot, manifestPath, sourcePath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const adapters = (runner: CommandRunner) => ({
  runner,
  which: (name: string) => `/tools/${name}`,
  probe: async (path: string) => ({ ...probe, path }),
  verify: async () => undefined,
  availableBytes: async () => 1_000_000,
  operationId: () => "operation-1",
});

const expectOptimizationError = async (promise: Promise<unknown>, text: string) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(MediaError);
    expect((error as Error).message).toContain(text);
    return;
  }
  throw new Error("Expected video optimization to fail");
};

test("dry-run resolves all streams without writing or running ffmpeg", async () => {
  await withFixture(async ({ sourceRoot, mediaRoot, manifestPath }) => {
    let calls = 0;
    const result = await optimizeVideoManifest({ sourceRoot, mediaRoot, manifestPath, dryRun: true }, adapters(async () => {
      calls += 1;
      throw new Error("runner must not be called");
    }));
    expect(result.items.map((item) => item.action)).toEqual(["transcode", "transcode"]);
    expect(result.installed).toBe(false);
    expect(calls).toBe(0);
    expect(await readdir(mediaRoot)).toEqual([]);
  });
});

test("refuses an existing final videos directory before transcoding", async () => {
  await withFixture(async ({ sourceRoot, mediaRoot, manifestPath }) => {
    await mkdir(join(mediaRoot, "anime", "example-show", "videos"), { recursive: true });
    let calls = 0;
    await expectOptimizationError(
      optimizeVideoManifest({ sourceRoot, mediaRoot, manifestPath, dryRun: false }, adapters(async () => {
        calls += 1;
        return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
      })),
      "already exists",
    );
    expect(calls).toBe(0);
  });
});

test("rejects insufficient staging space before creating public output", async () => {
  await withFixture(async ({ sourceRoot, mediaRoot, manifestPath }) => {
    await expectOptimizationError(
      optimizeVideoManifest(
        { sourceRoot, mediaRoot, manifestPath, dryRun: false },
        { ...adapters(async () => ({ exitCode: 0, stdout: new Uint8Array(), stderr: "" })), availableBytes: async () => 1 },
      ),
      "free space",
    );
    expect(await Bun.file(join(mediaRoot, "anime", "example-show", "videos")).exists()).toBe(false);
  });
});

test("a later conversion failure installs nothing and leaves sources untouched", async () => {
  await withFixture(async ({ sourceRoot, mediaRoot, manifestPath, sourcePath }) => {
    let calls = 0;
    const runner: CommandRunner = async (argv) => {
      calls += 1;
      if (calls === 2) return { exitCode: 1, stdout: new Uint8Array(), stderr: "encoder failed" };
      await writeFile(argv.at(-1)!, Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]));
      return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
    };
    await expectOptimizationError(
      optimizeVideoManifest({ sourceRoot, mediaRoot, manifestPath, dryRun: false }, adapters(runner)),
      "encoder failed",
    );
    expect(await Bun.file(join(mediaRoot, "anime", "example-show", "videos")).exists()).toBe(false);
    expect(await readFile(sourcePath, "utf8")).toBe("original");
    const operationFiles = await readdir(join(mediaRoot, ".astrosphere", "video-operations", "operation-1"));
    expect(operationFiles).toEqual(["result.json"]);
  });
});

test("verification failure removes staging and installs nothing", async () => {
  await withFixture(async ({ sourceRoot, mediaRoot, manifestPath }) => {
    const runner: CommandRunner = async (argv) => {
      await writeFile(argv.at(-1)!, Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]));
      return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
    };
    await expectOptimizationError(
      optimizeVideoManifest(
        { sourceRoot, mediaRoot, manifestPath, dryRun: false },
        { ...adapters(runner), verify: async () => { throw new Error("duration drift"); } },
      ),
      "duration drift",
    );
    expect(await Bun.file(join(mediaRoot, "anime", "example-show", "videos")).exists()).toBe(false);
  });
});

test("installs the complete verified videos tree and a private result record", async () => {
  await withFixture(async ({ sourceRoot, mediaRoot, manifestPath, sourcePath }) => {
    const runner: CommandRunner = async (argv) => {
      await mkdir(join(argv.at(-1)!, ".."), { recursive: true }).catch(() => undefined);
      await writeFile(argv.at(-1)!, Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 1]));
      return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
    };
    const result = await optimizeVideoManifest(
      { sourceRoot, mediaRoot, manifestPath, dryRun: false },
      adapters(runner),
    );
    expect(result.installed).toBe(true);
    expect(result.outputBytes).toBe(10);
    expect(await Bun.file(join(mediaRoot, "anime", "example-show", "videos", "01", "japanese-subbed.webm")).exists()).toBe(true);
    expect(await Bun.file(join(mediaRoot, "anime", "example-show", "videos", "01", "english-dub.webm")).exists()).toBe(true);
    expect(await readFile(sourcePath, "utf8")).toBe("original");
    expect(JSON.parse(await readFile(result.operationRecord!, "utf8"))).toMatchObject({ ok: true, title: "example-show", files: 2 });
  });
});
