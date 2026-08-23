import { expect, test } from "bun:test";
import { contentTypeForMediaFile, resolveMediaRequestPath, resolveMediaUrl } from "../src/lib/media/paths";

test("maps both public namespaces through one root", () => {
  expect(resolveMediaUrl("/manga/example/chapter-001/001.webp", "/srv/astrosphere/media")).toMatchObject({
    namespace: "manga",
    filePath: "/srv/astrosphere/media/manga/example/chapter-001/001.webp",
  });
  expect(resolveMediaUrl("/media/images/example/loop.gif", "/srv/astrosphere/media")).toMatchObject({
    namespace: "images",
    filePath: "/srv/astrosphere/media/images/example/loop.gif",
  });
});

test("passes unrelated requests and rejects traversal or private operations", () => {
  expect(resolveMediaRequestPath("/favicon.svg", "/srv/astrosphere/media")).toBeUndefined();
  expect(resolveMediaRequestPath("/manga/example", "/srv/astrosphere/media")).toBeUndefined();
  expect(resolveMediaRequestPath("/manga/example/chapter-001", "/srv/astrosphere/media")).toBeUndefined();
  expect(() => resolveMediaRequestPath("/manga/%2e%2e/secret.webp", "/srv/astrosphere/media")).toThrow("escapes MEDIA_ROOT");
  expect(() => resolveMediaRequestPath("/media/images/%2e%2e/.astrosphere/log.webp", "/srv/astrosphere/media")).toThrow("escapes MEDIA_ROOT");
});

test("returns one MIME policy for all media", () => {
  expect(contentTypeForMediaFile("loop.GIF")).toBe("image/gif");
  expect(contentTypeForMediaFile("loop.webp")).toBe("image/webp");
  expect(contentTypeForMediaFile("still.avif")).toBe("image/avif");
  expect(contentTypeForMediaFile("notes.txt")).toBe("application/octet-stream");
});
