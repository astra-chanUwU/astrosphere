import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBunMediaFetch, planMediaResponse } from "../src/lib/media/server";
import * as mediaServer from "../src/lib/media/server";

const regularFile = (async () => ({ isFile: () => true, size: 1000 })) as unknown as typeof import("node:fs/promises").stat;
const canonicalPath = (async (path: string) => path) as unknown as typeof import("node:fs/promises").realpath;

test("plans files for every managed namespace", async () => {
  const imagePlan = await planMediaResponse({
    method: "GET",
    pathname: "/media/images/example/loop.gif",
    root: "/srv/astrosphere/media",
    statFile: regularFile,
    realpathFile: canonicalPath,
  });
  const mangaPlan = await planMediaResponse({
    method: "GET",
    pathname: "/manga/example/chapter-001/001.webp",
    root: "/srv/astrosphere/media",
    statFile: regularFile,
    realpathFile: canonicalPath,
  });
  const animePlan = await planMediaResponse({
    method: "GET",
    pathname: "/media/anime/show/videos/01/japanese.webm",
    root: "/srv/astrosphere/media",
    statFile: regularFile,
    realpathFile: canonicalPath,
  });

  expect(imagePlan).toMatchObject({ kind: "file", status: 200, contentType: "image/gif" });
  expect(mangaPlan).toMatchObject({ kind: "file", status: 200, contentType: "image/webp" });
  expect(animePlan).toMatchObject({ kind: "file", status: 200, contentType: "video/webm" });
});

test("plans single byte ranges for seekable video", async () => {
  const options = {
    method: "GET",
    pathname: "/media/anime/show/episode.webm",
    root: "/srv/astrosphere/media",
    statFile: regularFile,
    realpathFile: canonicalPath,
  };

  expect(await planMediaResponse({ ...options, rangeHeader: "bytes=100-199" })).toMatchObject({
    kind: "file",
    status: 206,
    start: 100,
    end: 199,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": "100",
      "Content-Range": "bytes 100-199/1000",
      "Content-Type": "video/webm",
    },
  });
  expect(await planMediaResponse({ ...options, rangeHeader: "bytes=900-" })).toMatchObject({
    kind: "file", status: 206, start: 900, end: 999,
  });
  expect(await planMediaResponse({ ...options, rangeHeader: "bytes=-100" })).toMatchObject({
    kind: "file", status: 206, start: 900, end: 999,
  });
  expect(await planMediaResponse({ ...options, method: "HEAD", rangeHeader: "bytes=0-9" })).toMatchObject({
    kind: "file", status: 206, start: 0, end: 9,
  });
  expect(await planMediaResponse({ ...options, rangeHeader: "bytes=0-1,4-5" })).toMatchObject({
    kind: "error", status: 416, headers: { "Content-Range": "bytes */1000" },
  });
  expect(await planMediaResponse({ ...options, rangeHeader: "bytes=1000-" })).toMatchObject({
    kind: "error", status: 416, headers: { "Content-Range": "bytes */1000" },
  });
});

test("passes unrelated routes and handles media errors", async () => {
  expect(await planMediaResponse({ method: "GET", pathname: "/about", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toEqual({ kind: "next" });
  expect(await planMediaResponse({ method: "GET", pathname: "/manga/example", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toEqual({ kind: "next" });
  expect(await planMediaResponse({ method: "GET", pathname: "/manga/example/chapter-001", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toEqual({ kind: "next" });
  expect(await planMediaResponse({ method: "POST", pathname: "/manga/example/001.webp", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toMatchObject({ kind: "error", status: 405 });
  expect(await planMediaResponse({ method: "GET", pathname: "/manga/%2e%2e/secret.webp", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toMatchObject({ kind: "error", status: 400 });
  expect(await planMediaResponse({ method: "GET", pathname: "/manga/example/missing.webp", root: "/srv/astrosphere/media", statFile: async () => { throw new Error("missing"); } }))
    .toMatchObject({ kind: "error", status: 404 });
});

test("does not serve private operations through a manga symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "astrosphere-media-"));
  try {
    await mkdir(join(root, "manga"));
    await mkdir(join(root, ".astrosphere"));
    await writeFile(join(root, ".astrosphere", "secret.webp"), "private");
    await symlink("../.astrosphere", join(root, "manga", "private"));

    expect(await planMediaResponse({
      method: "GET",
      pathname: "/manga/private/secret.webp",
      root,
    })).toMatchObject({ kind: "error", status: 404 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Bun media responses slice ranges and expose unsatisfied range headers", async () => {
  const root = await mkdtemp(join(tmpdir(), "astrosphere-video-"));
  try {
    const directory = join(root, "anime", "show");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "episode.webm"), Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 4, 5, 6, 7]));
    const fetchMedia = createBunMediaFetch(root);

    const partial = await fetchMedia(new Request("http://localhost/media/anime/show/episode.webm", {
      headers: { Range: "bytes=2-4" },
    }));
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 2-4/8");
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(Uint8Array.from([0xdf, 0xa3, 4]));

    const unsatisfied = await fetchMedia(new Request("http://localhost/media/anime/show/episode.webm", {
      headers: { Range: "bytes=20-" },
    }));
    expect(unsatisfied.status).toBe(416);
    expect(unsatisfied.headers.get("content-range")).toBe("bytes */8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Node media middleware returns partial content for browser range requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "astrosphere-node-video-"));
  try {
    const directory = join(root, "anime", "show");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "episode.webm"), Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 4, 5, 6, 7]));

    const createMediaDevMiddleware = (
      mediaServer as typeof mediaServer & {
        createMediaDevMiddleware?: (mediaRoot: string) => Parameters<typeof createServer>[0];
      }
    ).createMediaDevMiddleware;
    expect(createMediaDevMiddleware).toBeFunction();

    const middleware = createMediaDevMiddleware!(root);
    const server = createServer(middleware);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP test server");
      const partial = await fetch(`http://127.0.0.1:${address.port}/media/anime/show/episode.webm`, {
        headers: { Range: "bytes=2-4" },
      });

      expect(partial.status).toBe(206);
      expect(partial.headers.get("content-range")).toBe("bytes 2-4/8");
      expect(new Uint8Array(await partial.arrayBuffer())).toEqual(Uint8Array.from([0xdf, 0xa3, 4]));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
