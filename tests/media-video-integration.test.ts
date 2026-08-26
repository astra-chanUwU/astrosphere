import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireTool, runCommand } from "../src/lib/media/process";
import { optimizeVideoManifest } from "../src/lib/media/video-optimizer";
import { probeVideo } from "../src/lib/media/video-probe";

test("real ffmpeg transcodes and verifies a tiny VP9/Opus WebM", async () => {
  const ffmpeg = requireTool("ffmpeg");
  const ffprobe = requireTool("ffprobe");
  const root = await mkdtemp(join(tmpdir(), "video-integration-"));
  const sourceRoot = join(root, "source");
  const mediaRoot = join(root, "media");
  const source = join(sourceRoot, "tiny.mkv");
  const manifestPath = join(root, "manifest.yaml");
  try {
    await mkdir(sourceRoot);
    await mkdir(mediaRoot);
    const generated = await runCommand([
      ffmpeg,
      "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
      "-f", "lavfi", "-i", "color=c=black:s=320x180:r=24:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      source,
    ]);
    expect(generated.exitCode).toBe(0);
    await writeFile(manifestPath, `
version: 1
title: tiny-show
variants:
  - label: Tiny test video
    source: tiny.mkv
    output: /media/anime/tiny-show/videos/01/default.webm
    audio: { index: 1 }
`);

    const result = await optimizeVideoManifest({
      sourceRoot,
      mediaRoot,
      manifestPath,
      dryRun: false,
    });
    expect(result.installed).toBe(true);
    expect(result.items[0]?.action).toBe("transcode");
    const output = join(mediaRoot, "anime", "tiny-show", "videos", "01", "default.webm");
    const verified = await probeVideo(output, ffprobe, runCommand);
    expect(verified.streams.find((stream) => stream.codecType === "video")).toMatchObject({
      codecName: "vp9",
      profile: "Profile 0",
      pixelFormat: "yuv420p",
    });
    expect(verified.streams.find((stream) => stream.codecType === "audio")?.codecName).toBe("opus");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
