import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
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
  action: "transcode" | "remux" | "reuse";
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
  reused: number;
  created: number;
  operationRecord?: string;
};

export type VideoOptimizeOptions = {
  sourceRoot: string;
  manifestPath: string;
  mediaRoot: string;
  dryRun: boolean;
  resume?: boolean;
  onProgress?: (update: {
    current: string;
    completed: number;
    total: number;
    detail: string;
    filePercent?: number;
    processedSeconds?: number;
  }) => void;
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

const collectRelativeFiles = async (root: string): Promise<string[]> => {
  if (!(await exists(root))) return [];
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path).split(sep).join("/"));
      } else {
        throw new Error(`Existing video output contains an unsupported filesystem entry: ${path}`);
      }
    }
  };
  await visit(root);
  return files.sort();
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
  const startedAt = Date.now();
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
    const finalVideosExist = await exists(finalVideosRoot);
    if (finalVideosExist && !options.resume) {
      throw new Error(`Video optimization destination already exists: ${finalVideosRoot}`);
    }

    const probe = adapters.probe ?? ((path: string) => probeVideo(path, ffprobe, runner));
    const verify = adapters.verify ?? ((path: string, expectedDurationSeconds: number) =>
      verifyWebm({ path, expectedDurationSeconds, ffprobe, ffmpeg, runner }));
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
      const outputPath = join(finalVideosRoot, outputRelativePath);
      let action: VideoOptimizationItem["action"] = shouldRemuxVideo(inspected, video, audio, subtitle)
        ? "remux"
        : "transcode";
      if (options.resume && await exists(outputPath)) {
        const outputInfo = await lstat(outputPath);
        if (!outputInfo.isFile() || outputInfo.isSymbolicLink()) {
          throw new Error(`Existing video output is not a regular file: ${outputPath}`);
        }
        try {
          await verify(outputPath, inspected.durationSeconds);
        } catch (error) {
          throw new Error(
            `Existing video output failed verification: ${variant.output}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        action = "reuse";
      }
      items.push({
        label: variant.label,
        sourcePath: canonicalSource,
        outputPublicPath: variant.output,
        outputRelativePath,
        action,
        probe: inspected,
        video,
        audio,
        ...(subtitle ? { subtitle } : {}),
      });
    }
    if (options.resume && finalVideosExist) {
      const declared = new Set(items.map((item) => item.outputRelativePath));
      const unknown = (await collectRelativeFiles(finalVideosRoot)).filter((path) => !declared.has(path));
      if (unknown.length > 0) {
        throw new Error(`Existing video output is not declared by the manifest: ${unknown[0]}`);
      }
    }
    const originalBytes = items.reduce((total, item) => total + item.probe.bytes, 0);
    const reused = items.filter((item) => item.action === "reuse").length;
    const pending = items.filter((item) => item.action !== "reuse");
    if (options.dryRun) {
      const outputBytes = (await Promise.all(items
        .filter((item) => item.action === "reuse")
        .map((item) => stat(join(finalVideosRoot, item.outputRelativePath)).then((info) => info.size))))
        .reduce((total, bytes) => total + bytes, 0);
      return { title: manifest.title, items, installed: false, originalBytes, outputBytes, reused, created: 0 };
    }

    const availableBytes = await (adapters.availableBytes ?? availableFilesystemBytes)(options.mediaRoot);
    const requiredBytes = pending.reduce((total, item) => total + item.probe.bytes, 0);
    if (availableBytes < requiredBytes) {
      throw new Error(`Insufficient free space for staged video output: need at least ${requiredBytes} bytes, found ${availableBytes}`);
    }
    const operationId = (adapters.operationId ?? randomUUID)();
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(operationId)) {
      throw new Error("Invalid video operation ID");
    }
    const operationRoot = join(layout.operations, "video-operations", operationId);
    const stagedVideosRoot = join(operationRoot, "videos");
    await mkdir(stagedVideosRoot, { recursive: true, mode: 0o700 });
    let installed = false;
    let created = 0;
    try {
      for (const [index, item] of items.entries()) {
        if (item.action === "reuse") {
          options.onProgress?.({
            current: item.label,
            completed: index + 1,
            total: items.length,
            detail: "reused verified output",
            filePercent: 100,
          });
          continue;
        }
        options.onProgress?.({
          current: item.label,
          completed: index,
          total: items.length,
          detail: item.action === "transcode" ? "transcoding" : "remuxing",
        });
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
        }), {
          onProgress: (update) => {
            const filePercent = update.complete
              ? 100
              : update.seconds === undefined || item.probe.durationSeconds <= 0
                ? 0
                : Math.min(100, Math.round(update.seconds / item.probe.durationSeconds * 100));
            options.onProgress?.({
              current: item.label,
              completed: index,
              total: items.length,
              detail: item.action === "transcode" ? "transcoding" : "remuxing",
              filePercent,
              ...(update.seconds !== undefined ? { processedSeconds: update.seconds } : {}),
            });
          },
        });
        if (result.exitCode !== 0) {
          throw new Error(`Video optimization failed for ${item.label}: ${result.stderr.trim() || `exit ${result.exitCode}`}`);
        }
        await verify(output, item.probe.durationSeconds);
        options.onProgress?.({
          current: item.label,
          completed: index + 1,
          total: items.length,
          detail: "verified",
          filePercent: 100,
        });
      }
      await mkdir(finalTitleRoot, { recursive: true });
      if (options.resume) {
        await mkdir(finalVideosRoot, { recursive: true });
        for (const item of pending) {
          const staged = join(stagedVideosRoot, item.outputRelativePath);
          const destination = join(finalVideosRoot, item.outputRelativePath);
          await mkdir(dirname(destination), { recursive: true });
          if (await exists(destination)) {
            throw new Error(`Video optimization destination appeared during resume: ${destination}`);
          }
          await link(staged, destination);
          created += 1;
        }
        installed = created > 0;
      } else {
        if (await exists(finalVideosRoot)) {
          throw new Error(`Video optimization destination already exists: ${finalVideosRoot}`);
        }
        await rename(stagedVideosRoot, finalVideosRoot);
        created = pending.length;
        installed = true;
      }
      const outputBytes = (await Promise.all(items.map((item) =>
        stat(join(finalVideosRoot, item.outputRelativePath)).then((info) => info.size),
      ))).reduce((total, bytes) => total + bytes, 0);
      const operationRecord = await writeOperationRecord(operationRoot, {
        version: 1,
        ok: true,
        title: manifest.title,
        files: items.length,
        reused,
        created,
        originalBytes,
        outputBytes,
        elapsedMilliseconds: Date.now() - startedAt,
      });
      await rm(stagedVideosRoot, { recursive: true, force: true });
      return { title: manifest.title, items, installed, originalBytes, outputBytes, reused, created, operationRecord };
    } catch (error) {
      await rm(stagedVideosRoot, { recursive: true, force: true });
      await writeOperationRecord(operationRoot, {
        version: 1,
        ok: false,
        title: manifest.title,
        reused,
        created,
        elapsedMilliseconds: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("optimization", error instanceof Error ? error.message : String(error));
  }
};
