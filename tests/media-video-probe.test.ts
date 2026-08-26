import { expect, test } from "bun:test";
import {
  createVideoCommand,
  parseVideoProbe,
  selectVideoStream,
  shouldRemuxVideo,
} from "../src/lib/media/video-probe";

const lulucoProbeJson = JSON.stringify({
  streams: [
    { index: 0, codec_name: "h264", profile: "High 10", codec_type: "video", width: 1920, height: 1080, pix_fmt: "yuv420p10le", tags: { language: "jpn", title: "Hi10 1080p h.264" } },
    { index: 1, codec_name: "flac", codec_type: "audio", channels: 6, tags: { language: "eng", title: "5.1 FLAC" } },
    { index: 2, codec_name: "flac", codec_type: "audio", channels: 2, tags: { language: "jpn", title: "2.0 FLAC" } },
    { index: 3, codec_name: "hdmv_pgs_subtitle", codec_type: "subtitle", tags: { language: "eng", title: "Signs & Songs" } },
    { index: 4, codec_name: "hdmv_pgs_subtitle", codec_type: "subtitle", tags: { language: "eng", title: "Dialogue" } },
  ],
  format: { duration: "472.014000", size: "362528317", format_name: "matroska,webm" },
});

const burnUpProbeJson = JSON.stringify({
  streams: [
    { index: 0, codec_name: "vp9", profile: "Profile 0", codec_type: "video", width: 1920, height: 1080, pix_fmt: "yuv420p" },
    { index: 1, codec_name: "opus", codec_type: "audio", channels: 2, tags: { language: "eng" } },
  ],
  format: { duration: "5950.041000", size: "389635937", format_name: "matroska,webm" },
});

test("parses real ffprobe shapes and selects tagged or indexed streams", () => {
  const probe = parseVideoProbe(lulucoProbeJson, "episode.mkv");
  expect(probe.durationSeconds).toBe(472.014);
  expect(selectVideoStream(probe, "video", { index: 0 }).index).toBe(0);
  expect(selectVideoStream(probe, "audio", { language: "jpn" }).index).toBe(2);
  expect(selectVideoStream(probe, "subtitle", { title: "Dialogue" }).index).toBe(4);
  expect(selectVideoStream(probe, "subtitle", { language: "eng", title: "Signs & Songs" }).index).toBe(3);
});

test("rejects missing, ambiguous, and wrong-type stream selectors", () => {
  const probe = parseVideoProbe(lulucoProbeJson, "episode.mkv");
  expect(() => selectVideoStream(probe, "subtitle", { language: "eng" })).toThrow("ambiguous");
  expect(() => selectVideoStream(probe, "audio", { language: "fra" })).toThrow("did not match");
  expect(() => selectVideoStream(probe, "audio", { index: 4 })).toThrow("is subtitle, expected audio");
});

test("uses stream-copy only for compatible WebM without burned subtitles", () => {
  const burnUp = parseVideoProbe(burnUpProbeJson, "burn-up-w.webm");
  const luluco = parseVideoProbe(lulucoProbeJson, "episode.mkv");
  expect(shouldRemuxVideo(
    burnUp,
    selectVideoStream(burnUp, "video", { index: 0 }),
    selectVideoStream(burnUp, "audio", { index: 1 }),
    undefined,
  )).toBe(true);
  expect(shouldRemuxVideo(
    luluco,
    selectVideoStream(luluco, "video", { index: 0 }),
    selectVideoStream(luluco, "audio", { index: 2 }),
    selectVideoStream(luluco, "subtitle", { index: 4 }),
  )).toBe(false);
});

test("builds explicit VP9 burn and WebM remux commands", () => {
  const luluco = parseVideoProbe(lulucoProbeJson, "episode.mkv");
  const transcode = createVideoCommand({
    ffmpeg: "/tools/ffmpeg",
    input: "/source/episode.mkv",
    output: "/stage/japanese.webm",
    video: selectVideoStream(luluco, "video", { index: 0 }),
    audio: selectVideoStream(luluco, "audio", { index: 2 }),
    subtitle: selectVideoStream(luluco, "subtitle", { index: 4 }),
    remux: false,
  });
  expect(transcode).toContain("libvpx-vp9");
  expect(transcode).toContain("libopus");
  expect(transcode).toContain("[0:0][0:4]overlay=eof_action=pass[v]");
  expect(transcode).toContain("160k");
  expect(transcode.at(-1)).toBe("/stage/japanese.webm");

  const burnUp = parseVideoProbe(burnUpProbeJson, "burn-up-w.webm");
  const remux = createVideoCommand({
    ffmpeg: "/tools/ffmpeg",
    input: "/source/burn-up-w.webm",
    output: "/stage/compilation.webm",
    video: selectVideoStream(burnUp, "video", { index: 0 }),
    audio: selectVideoStream(burnUp, "audio", { index: 1 }),
    remux: true,
  });
  expect(remux).toContain("copy");
  expect(remux).not.toContain("libvpx-vp9");
});
