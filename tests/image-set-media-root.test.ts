import { expect, test } from "bun:test";
import { requireImageSetMediaRoot, resolveImageSetMediaFile } from "../src/lib/image-set-media-root";

test("requires an absolute image-set media root", () => {
  expect(() => requireImageSetMediaRoot("")).toThrow("Set IMAGE_SET_MEDIA_ROOT");
  expect(() => requireImageSetMediaRoot("relative/images")).toThrow("must be an absolute path");
});

test("maps public image-set URLs beneath the external media root", () => {
  expect(resolveImageSetMediaFile("/media/images/flou-sona/001.webp", "/srv/astrosphere/media/images"))
    .toBe("/srv/astrosphere/media/images/flou-sona/001.webp");
});

test("rejects unrelated and traversing image-set paths", () => {
  expect(() => resolveImageSetMediaFile("/media/art/image.webp", "/srv/astrosphere/media/images"))
    .toThrow("Expected a /media/images asset path");
  expect(() => resolveImageSetMediaFile("/media/images/../secret.txt", "/srv/astrosphere/media/images"))
    .toThrow("escapes IMAGE_SET_MEDIA_ROOT");
});
