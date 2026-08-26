import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { getMediaLayout } from "./config";
import { MediaError } from "./errors";
import { type CommandRunner, requireTool, runCommand } from "./process";
import {
  createVideoCommand,
  probeVideo,
  selectVideoStream,
  shouldRemuxVideo,
  type ProbedVideo,
  type ProbedVideoStream,
} from "./video-probe";
import { parseVideoManifest } from "./video-manifest";

export type VideoOptimizationItem = {
  label: string;
  sourcePath: string;
  outputPublicPath: string;
  outputRelativePath: string;
  action: "transcode" | "remux";
  probe: ProbedVideo;
  video: ProbedVideoStream;
  audio: ProbedVideoStream;
  subtitle?: ProbedVideoStream;
};

export type VideoOptimizeResult = {
  title: string;
  items: VideoOptimizationItem[];
  installed: boolean;
  originalBytes: number;
  outputBytes: number;
  operationRecord?: string;
};

export type VideoOptimizeOptions = {
  sourceRoot: string;
  manifestPath: string;
  mediaRoot: string;
  dryRun: boolean;
};

export type VideoOptimizeAdapters = {
  runner?: CommandRunner;
  which?: (name: string) => string | null;
  probe?: (path: string) => Promise<ProbedVideo>;
  verify?: (path: string, expectedDurationSeconds: number) => Promise<void>;
  availableBytes?: (path: string) => Promise<number>;
  operationId?: () => string;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const isWithin = (root: string, candidate: string): boolean => {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
};

const availableFilesystemBytes = async (path: string): Promise<number> => {
  const info = await statfs(path);
  return Number(info.bavail) * Number(info.bsize);
};

export const verifyWebm = async (options: {
  path: string;
  expectedDurationSeconds: number;
  ffprobe: string;
  ffmpeg: string;
  runner: CommandRunner;
}): Promise<void> => {
  const probe = await probeVideo(options.path, options.ffprobe, options.runner);
  const videos = probe.streams.filter((stream) => stream.codecType === "video");
  const audios = probe.streams.filter((stream) => stream.codecType === "audio");
  if (videos.length !== 1 || audios.length !== 1) {
    throw new Error(`Verified WebM must have exactly one video and one audio stream: ${options.path}`);
  }
  const video = videos[0]!;
  const audio = audios[0]!;
  if (
    !probe.formatName.includes("webm") ||
    video.codecName !== "vp9" ||
    video.profile !== "Profile 0" ||
    video.pixelFormat !== "yuv420p" ||
    video.width === undefined || video.width <= 0 || video.width > 1920 ||
    video.height === undefined || video.height <= 0 || video.height > 1080 ||
    audio.codecName !== "opus" ||
    audio.channels === undefined || audio.channels <= 0 || audio.channels > 2
  ) {
    throw new Error(`Staged output does not match the VP9 Profile 0/Opus WebM profile: ${options.path}`);
  }
  const tolerance = Math.max(1, options.expectedDurationSeconds * 0.005);
  if (Math.abs(probe.durationSeconds - options.expectedDurationSeconds) > tolerance) {
    throw new Error(`Staged output duration drift exceeds ${tolerance.toFixed(3)} seconds: ${options.path}`);
  }
  const seek = await options.runner([
    options.ffmpeg,
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(Math.max(0, options.expectedDurationSeconds / 2)),
    "-i", options.path,
    "-frames:v", "1",
    "-f", "null",
    "-",
  ]);
  if (seek.exitCode !== 0) {
    throw new Error(`Staged WebM is not seekable: ${options.path}: ${seek.stderr.trim()}`);
  }
};

const writeOperationRecord = async (
  operationRoot: string,
  value: Record<string, unknown>,
): Promise<string> => {
  await mkdir(operationRoot, { recursive: true, mode: 0o700 });
  const path = join(operationRoot, "result.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return path;
};

export const optimizeVideoManifest = async (
  options: VideoOptimizeOptions,
  adapters: VideoOptimizeAdapters = {},
): Promise<VideoOptimizeResult> => {
  const runner = adapters.runner ?? runCommand;
  const ffmpeg = requireTool("ffmpeg", adapters.which ?? Bun.which);
  const ffprobe = requireTool("ffprobe", adapters.which ?? Bun.which);
  try {
    const manifestSource = await readFile(options.manifestPath, "utf8");
    const manifest = parseVideoManifest(manifestSource, options.manifestPath);
    const layout = getMediaLayout(options.mediaRoot);
    const canonicalSourceRoot = await realpath(options.sourceRoot);
    const finalTitleRoot = join(layout.anime, manifest.title);
    const finalVideosRoot = join(finalTitleRoot, "videos");
    if (await exists(finalVideosRoot)) {
      throw new Error(`Video optimization destination already exists: ${finalVideosRoot}`);
    }

    const probe = adapters.probe ?? ((path: string) => probeVideo(path, ffprobe, runner));
    const items: VideoOptimizationItem[] = [];
    for (const variant of manifest.variants) {
      const candidate = resolve(canonicalSourceRoot, variant.source);
      const canonicalSource = await realpath(candidate);
      if (!isWithin(canonicalSourceRoot, canonicalSource)) {
        throw new Error(`Video source escapes the supplied source root: ${variant.source}`);
      }
      const sourceInfo = await lstat(canonicalSource);
      if (!sourceInfo.isFile()) throw new Error(`Video source is not a regular file: ${variant.source}`);
      const inspected = await probe(canonicalSource);
      const videoStreams = inspected.streams.filter((stream) => stream.codecType === "video");
      if (videoStreams.length !== 1) {
        throw new Error(`Expected exactly one video stream in ${variant.source}`);
      }
      const video = videoStreams[0]!;
      const audio = selectVideoStream(inspected, "audio", variant.audio);
      const subtitle = variant.subtitle?.mode === "burn"
        ? selectVideoStream(inspected, "subtitle", variant.subtitle)
        : undefined;
      const outputPrefix = `/media/anime/${manifest.title}/videos/`;
      const outputRelativePath = variant.output.slice(outputPrefix.length);
      items.push({
        label: variant.label,
        sourcePath: canonicalSource,
        outputPublicPath: variant.output,
        outputRelativePath,
        action: shouldRemuxVideo(inspected, video, audio, subtitle) ? "remux" : "transcode",
        probe: inspected,
        video,
        audio,
        ...(subtitle ? { subtitle } : {}),
      });
    }
    const originalBytes = items.reduce((total, item) => total + item.probe.bytes, 0);
    if (options.dryRun) {
      return { title: manifest.title, items, installed: false, originalBytes, outputBytes: 0 };
    }

    const availableBytes = await (adapters.availableBytes ?? availableFilesystemBytes)(options.mediaRoot);
    if (availableBytes < originalBytes) {
      throw new Error(`Insufficient free space for staged video output: need at least ${originalBytes} bytes, found ${availableBytes}`);
    }
    const operationId = (adapters.operationId ?? randomUUID)();
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(operationId)) {
      throw new Error("Invalid video operation ID");
    }
    const operationRoot = join(layout.operations, "video-operations", operationId);
    const stagedVideosRoot = join(operationRoot, "videos");
    await mkdir(stagedVideosRoot, { recursive: true, mode: 0o700 });
    let installed = false;
    try {
      for (const item of items) {
        const output = join(stagedVideosRoot, item.outputRelativePath);
        await mkdir(dirname(output), { recursive: true, mode: 0o700 });
        const result = await runner(createVideoCommand({
          ffmpeg,
          input: item.sourcePath,
          output,
          video: item.video,
          audio: item.audio,
          subtitle: item.subtitle,
          remux: item.action === "remux",
        }));
        if (result.exitCode !== 0) {
          throw new Error(`Video optimization failed for ${item.label}: ${result.stderr.trim() || `exit ${result.exitCode}`}`);
        }
        const verify = adapters.verify ?? ((path: string, expectedDurationSeconds: number) =>
          verifyWebm({ path, expectedDurationSeconds, ffprobe, ffmpeg, runner }));
        await verify(output, item.probe.durationSeconds);
      }
      await mkdir(finalTitleRoot, { recursive: true });
      if (await exists(finalVideosRoot)) {
        throw new Error(`Video optimization destination already exists: ${finalVideosRoot}`);
      }
      await rename(stagedVideosRoot, finalVideosRoot);
      installed = true;
      const outputBytes = (await Promise.all(items.map((item) =>
        stat(join(finalVideosRoot, item.outputRelativePath)).then((info) => info.size),
      ))).reduce((total, bytes) => total + bytes, 0);
      const operationRecord = await writeOperationRecord(operationRoot, {
        version: 1,
        ok: true,
        title: manifest.title,
        files: items.length,
        originalBytes,
        outputBytes,
      });
      return { title: manifest.title, items, installed, originalBytes, outputBytes, operationRecord };
    } catch (error) {
      if (!installed) await rm(stagedVideosRoot, { recursive: true, force: true });
      await writeOperationRecord(operationRoot, {
        version: 1,
        ok: false,
        title: manifest.title,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("optimization", error instanceof Error ? error.message : String(error));
  }
};
