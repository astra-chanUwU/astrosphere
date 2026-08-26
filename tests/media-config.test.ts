import { expect, test } from "bun:test";
import { getMediaLayout, requireMediaPort, requireMediaRoot, requireMediaSyncTarget } from "../src/lib/media/config";
import { exitCodeForMediaError, MediaError } from "../src/lib/media/errors";

test("requires one absolute media root and derives private and public trees", () => {
  expect(() => requireMediaRoot("")).toThrow("Set MEDIA_ROOT");
  expect(() => requireMediaRoot("relative/media")).toThrow("absolute path");
  expect(getMediaLayout("/srv/astrosphere/media/")).toEqual({
    root: "/srv/astrosphere/media",
    manga: "/srv/astrosphere/media/manga",
    images: "/srv/astrosphere/media/images",
    anime: "/srv/astrosphere/media/anime",
    operations: "/srv/astrosphere/media/.astrosphere",
  });
});

test("validates the optional standalone port", () => {
  expect(requireMediaPort(undefined)).toBe(4322);
  expect(requireMediaPort("8080")).toBe(8080);
  expect(() => requireMediaPort("0")).toThrow("1 to 65535");
});

test("requires a restricted rsync-style synchronization target", () => {
  expect(requireMediaSyncTarget("astro@example.test:/srv/astrosphere/media"))
    .toBe("astro@example.test:/srv/astrosphere/media");
  expect(() => requireMediaSyncTarget("example.test:relative")).toThrow("user@host:/absolute/path");
});

test("preserves an absolute remote root while removing repeated trailing slashes", () => {
  expect(requireMediaSyncTarget("astro@example.test:/")).toBe("astro@example.test:/");
  expect(requireMediaSyncTarget("astro@example.test://")).toBe("astro@example.test:/");
  expect(requireMediaSyncTarget("astro@example.test:/srv/astrosphere/media///"))
    .toBe("astro@example.test:/srv/astrosphere/media");
});

test("uses stable nonzero exit codes by failure category", () => {
  expect(exitCodeForMediaError(new MediaError("usage", "bad arguments"))).toBe(2);
  expect(exitCodeForMediaError(new MediaError("configuration", "bad root"))).toBe(3);
  expect(exitCodeForMediaError(new MediaError("validation", "missing file"))).toBe(4);
  expect(exitCodeForMediaError(new MediaError("optimization", "conversion failed"))).toBe(5);
  expect(exitCodeForMediaError(new MediaError("synchronization", "rsync failed"))).toBe(6);
  expect(exitCodeForMediaError(new Error("unexpected"))).toBe(1);
});
