import { expect, test } from "bun:test";

import { contentTypeForImageSetFile, resolveImageSetMediaRequestPath } from "../src/lib/image-set-media-server";

test("maps image-set requests into the configured external root", () => {
  expect(resolveImageSetMediaRequestPath("/media/images/flou-sona/001.webp", "/srv/astrosphere/media/images"))
    .toBe("/srv/astrosphere/media/images/flou-sona/001.webp");
});

test("ignores unrelated routes and rejects traversal", () => {
  expect(resolveImageSetMediaRequestPath("/media/other/image.webp", "/srv/astrosphere/media/images")).toBeUndefined();
  expect(() => resolveImageSetMediaRequestPath("/media/images/../secret.txt", "/srv/astrosphere/media/images"))
    .toThrow("escapes IMAGE_SET_MEDIA_ROOT");
});

test("returns image-set content types", () => {
  expect(contentTypeForImageSetFile("image.webp")).toBe("image/webp");
  expect(contentTypeForImageSetFile("image.jpg")).toBe("image/jpeg");
});
