import { expect, test } from "bun:test";
import { contentTypeForMediaFile, resolveMediaRequestPath, resolveMediaUrl } from "../src/lib/media/paths";

test("maps every public namespace through one root", () => {
  expect(resolveMediaUrl("/manga/example/chapter-001/001.webp", "/srv/astrosphere/media")).toMatchObject({
    namespace: "manga",
    filePath: "/srv/astrosphere/media/manga/example/chapter-001/001.webp",
  });
  expect(resolveMediaUrl("/media/images/example/loop.gif", "/srv/astrosphere/media")).toMatchObject({
    namespace: "images",
    filePath: "/srv/astrosphere/media/images/example/loop.gif",
  });
  expect(resolveMediaUrl("/media/anime/show/videos/01/japanese.webm", "/srv/astrosphere/media")).toMatchObject({
    namespace: "anime",
    filePath: "/srv/astrosphere/media/anime/show/videos/01/japanese.webm",
  });
  expect(resolveMediaRequestPath("/media/anime/legacy/theme.mp3", "/srv/astrosphere/media")?.namespace).toBe("anime");
  expect(resolveMediaRequestPath("/media/anime/legacy/clip.mp4", "/srv/astrosphere/media")?.namespace).toBe("anime");
});

test("passes unrelated requests and rejects traversal or private operations", () => {
  expect(resolveMediaRequestPath("/favicon.svg", "/srv/astrosphere/media")).toBeUndefined();
  expect(resolveMediaRequestPath("/manga/example", "/srv/astrosphere/media")).toBeUndefined();
  expect(resolveMediaRequestPath("/manga/example/chapter-001", "/srv/astrosphere/media")).toBeUndefined();
  expect(() => resolveMediaRequestPath("/manga/%2e%2e/secret.webp", "/srv/astrosphere/media")).toThrow("escapes MEDIA_ROOT");
  expect(() => resolveMediaRequestPath("/media/images/%2e%2e/.astrosphere/log.webp", "/srv/astrosphere/media")).toThrow("escapes MEDIA_ROOT");
  expect(() => resolveMediaRequestPath("/media/anime/%2e%2e/.astrosphere/secret.webm", "/srv/astrosphere/media")).toThrow("escapes MEDIA_ROOT");
});

test("returns one MIME policy for all media", () => {
  expect(contentTypeForMediaFile("loop.GIF")).toBe("image/gif");
  expect(contentTypeForMediaFile("loop.webp")).toBe("image/webp");
  expect(contentTypeForMediaFile("still.avif")).toBe("image/avif");
  expect(contentTypeForMediaFile("episode.webm")).toBe("video/webm");
  expect(contentTypeForMediaFile("theme.mp3")).toBe("audio/mpeg");
  expect(contentTypeForMediaFile("clip.mp4")).toBe("video/mp4");
  expect(contentTypeForMediaFile("notes.txt")).toBe("application/octet-stream");
});
