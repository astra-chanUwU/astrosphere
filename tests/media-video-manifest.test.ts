import { expect, test } from "bun:test";
import { parseVideoManifest } from "../src/lib/media/video-manifest";

const manifest = `
version: 1
title: space-patrol-luluco
variants:
  - label: Japanese with English subtitles
    source: "[RH] Uchuu Patrol Luluco - 01.mkv"
    output: /media/anime/space-patrol-luluco/videos/01/japanese-subbed.webm
    audio: { language: jpn }
    subtitle: { title: Dialogue, mode: burn }
  - label: English dub
    source: "[RH] Uchuu Patrol Luluco - 01.mkv"
    output: /media/anime/space-patrol-luluco/videos/01/english-dub.webm
    audio: { index: 1 }
    subtitle: { title: Signs & Songs, mode: burn }
`;

test("parses a versioned WebM manifest with explicit stream selectors", () => {
  expect(parseVideoManifest(manifest, "luluco.yaml")).toEqual({
    version: 1,
    title: "space-patrol-luluco",
    variants: [
      {
        label: "Japanese with English subtitles",
        source: "[RH] Uchuu Patrol Luluco - 01.mkv",
        output: "/media/anime/space-patrol-luluco/videos/01/japanese-subbed.webm",
        audio: { language: "jpn" },
        subtitle: { title: "Dialogue", mode: "burn" },
      },
      {
        label: "English dub",
        source: "[RH] Uchuu Patrol Luluco - 01.mkv",
        output: "/media/anime/space-patrol-luluco/videos/01/english-dub.webm",
        audio: { index: 1 },
        subtitle: { title: "Signs & Songs", mode: "burn" },
      },
    ],
  });
});

test("rejects unsafe or ambiguous sources and selectors", () => {
  expect(() => parseVideoManifest(manifest.replace("[RH] Uchuu Patrol Luluco - 01.mkv", "../episode.mkv"), "bad.yaml")).toThrow("source must stay inside");
  expect(() => parseVideoManifest(manifest.replace("[RH] Uchuu Patrol Luluco - 01.mkv", "/tmp/episode.mkv"), "bad.yaml")).toThrow("source must be relative");
  expect(() => parseVideoManifest(manifest.replace("audio: { language: jpn }", "audio: {}"), "bad.yaml")).toThrow("audio selector");
  expect(() => parseVideoManifest(manifest.replace("audio: { language: jpn }", "audio: { language: jpn, index: 2 }"), "bad.yaml")).toThrow("index cannot be combined");
});

test("rejects wrong roots, formats, title slugs, versions, and duplicate outputs", () => {
  expect(() => parseVideoManifest(manifest.replace("version: 1", "version: 2"), "bad.yaml")).toThrow("version must be 1");
  expect(() => parseVideoManifest(manifest.replace("space-patrol-luluco\nvariants", "Space Patrol Luluco\nvariants"), "bad.yaml")).toThrow("title must use");
  expect(() => parseVideoManifest(manifest.replace("/media/anime/space-patrol-luluco/", "/media/images/"), "bad.yaml")).toThrow("output must be beneath");
  expect(() => parseVideoManifest(manifest.replace("japanese-subbed.webm", "japanese-subbed.mp4"), "bad.yaml")).toThrow("output must end in .webm");
  expect(() => parseVideoManifest(manifest.replace("01/english-dub.webm", "01/JAPANESE-SUBBED.webm"), "bad.yaml")).toThrow("duplicate output");
  expect(() => parseVideoManifest(manifest.replace("English dub", ""), "bad.yaml")).toThrow("label is required");
});
