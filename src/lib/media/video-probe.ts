import type { CommandRunner } from "./process";
import type { VideoStreamSelector } from "./video-manifest";

export type VideoStreamType = "video" | "audio" | "subtitle";
export type ProbedVideoStream = {
  index: number;
  codecType: VideoStreamType;
  codecName: string;
  profile?: string;
  width?: number;
  height?: number;
  pixelFormat?: string;
  channels?: number;
  language?: string;
  title?: string;
};

export type ProbedVideo = {
  path: string;
  durationSeconds: number;
  bytes: number;
  formatName: string;
  streams: ProbedVideoStream[];
};

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const finiteNumber = (value: unknown, label: string): number => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} is invalid`);
  return number;
};

export const parseVideoProbe = (source: string, path: string): ProbedVideo => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid ffprobe JSON for ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = record(parsed, `ffprobe result for ${path}`);
  const format = record(root.format, `ffprobe format for ${path}`);
  if (!Array.isArray(root.streams) || root.streams.length === 0) {
    throw new Error(`ffprobe found no streams in ${path}`);
  }
  const streams = root.streams.map((value, streamIndex): ProbedVideoStream | undefined => {
    const stream = record(value, `ffprobe stream ${streamIndex} for ${path}`);
    const codecType = stream.codec_type;
    if (codecType === "attachment") return undefined;
    if (codecType !== "video" && codecType !== "audio" && codecType !== "subtitle") {
      throw new Error(`Unsupported ffprobe stream type in ${path}: ${String(codecType)}`);
    }
    if (!Number.isInteger(stream.index) || (stream.index as number) < 0) {
      throw new Error(`Invalid ffprobe stream index in ${path}`);
    }
    if (typeof stream.codec_name !== "string" || stream.codec_name.length === 0) {
      throw new Error(`Missing ffprobe codec name in ${path}`);
    }
    const tags = stream.tags === undefined ? {} : record(stream.tags, `ffprobe stream tags for ${path}`);
    return {
      index: stream.index as number,
      codecType,
      codecName: stream.codec_name,
      ...(typeof stream.profile === "string" ? { profile: stream.profile } : {}),
      ...(Number.isInteger(stream.width) ? { width: stream.width as number } : {}),
      ...(Number.isInteger(stream.height) ? { height: stream.height as number } : {}),
      ...(typeof stream.pix_fmt === "string" ? { pixelFormat: stream.pix_fmt } : {}),
      ...(Number.isInteger(stream.channels) ? { channels: stream.channels as number } : {}),
      ...(typeof tags.language === "string" ? { language: tags.language } : {}),
      ...(typeof tags.title === "string" ? { title: tags.title } : {}),
    };
  }).filter((stream): stream is ProbedVideoStream => stream !== undefined);
  const durationSeconds = finiteNumber(format.duration, `ffprobe duration for ${path}`);
  const bytes = finiteNumber(format.size, `ffprobe size for ${path}`);
  if (durationSeconds <= 0 || bytes <= 0) throw new Error(`ffprobe reported an empty video: ${path}`);
  return {
    path,
    durationSeconds,
    bytes,
    formatName: typeof format.format_name === "string" ? format.format_name : "",
    streams,
  };
};

export const probeVideo = async (
  path: string,
  ffprobe: string,
  runner: CommandRunner,
): Promise<ProbedVideo> => {
  const result = await runner([
    ffprobe,
    "-v", "error",
    "-show_entries",
    "format=duration,size,format_name:stream=index,codec_type,codec_name,profile,width,height,pix_fmt,channels:stream_tags=language,title",
    "-of", "json",
    path,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`ffprobe failed for ${path}: ${result.stderr.trim() || `exit ${result.exitCode}`}`);
  }
  return parseVideoProbe(new TextDecoder().decode(result.stdout), path);
};

export const selectVideoStream = (
  probe: ProbedVideo,
  type: VideoStreamType,
  selector: VideoStreamSelector,
): ProbedVideoStream => {
  if (selector.index !== undefined) {
    const stream = probe.streams.find((candidate) => candidate.index === selector.index);
    if (!stream) throw new Error(`${type} stream index ${selector.index} did not match ${probe.path}`);
    if (stream.codecType !== type) {
      throw new Error(`stream index ${selector.index} is ${stream.codecType}, expected ${type}`);
    }
    return stream;
  }
  const normalizedLanguage = selector.language?.toLowerCase();
  const normalizedTitle = selector.title?.toLowerCase();
  const matches = probe.streams.filter((stream) =>
    stream.codecType === type &&
    (normalizedLanguage === undefined || stream.language?.toLowerCase() === normalizedLanguage) &&
    (normalizedTitle === undefined || stream.title?.toLowerCase() === normalizedTitle),
  );
  if (matches.length === 0) {
    throw new Error(`${type} selector did not match any stream in ${probe.path}`);
  }
  if (matches.length > 1) {
    throw new Error(`${type} selector is ambiguous in ${probe.path}`);
  }
  return matches[0]!;
};

export const shouldRemuxVideo = (
  probe: ProbedVideo,
  video: ProbedVideoStream,
  audio: ProbedVideoStream,
  subtitle?: ProbedVideoStream,
): boolean =>
  subtitle === undefined &&
  probe.formatName.includes("webm") &&
  video.codecName === "vp9" &&
  video.profile === "Profile 0" &&
  video.pixelFormat === "yuv420p" &&
  video.width !== undefined && video.width <= 1920 &&
  video.height !== undefined && video.height <= 1080 &&
  audio.codecName === "opus" &&
  audio.channels !== undefined && audio.channels <= 2;

export const createVideoCommand = (options: {
  ffmpeg: string;
  input: string;
  output: string;
  video: ProbedVideoStream;
  audio: ProbedVideoStream;
  subtitle?: ProbedVideoStream;
  remux: boolean;
}): string[] => {
  const command = [
    options.ffmpeg,
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-progress", "pipe:2",
    "-nostats",
    "-n",
    "-i", options.input,
  ];
  if (options.subtitle) {
    command.push(
      "-filter_complex",
      `[0:${options.video.index}][0:${options.subtitle.index}]overlay=eof_action=pass[v]`,
      "-map", "[v]",
    );
  } else {
    command.push("-map", `0:${options.video.index}`);
  }
  command.push(
    "-map", `0:${options.audio.index}`,
    "-map_metadata", "-1",
    "-map_chapters", "-1",
  );
  if (options.remux) {
    command.push("-c", "copy");
  } else {
    command.push(
      "-c:v", "libvpx-vp9",
      "-profile:v", "0",
      "-pix_fmt", "yuv420p",
      "-crf", "28",
      "-b:v", "0",
      "-deadline", "good",
      "-cpu-used", "2",
      "-row-mt", "1",
      "-tile-columns", "2",
      "-c:a", "libopus",
      "-b:a", "160k",
      "-ac", "2",
    );
  }
  command.push("-f", "webm", options.output);
  return command;
};
