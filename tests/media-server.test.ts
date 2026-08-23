import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { planMediaResponse } from "../src/lib/media/server";

const regularFile = (async () => ({ isFile: () => true })) as unknown as typeof import("node:fs/promises").stat;

test("plans files for both managed namespaces", async () => {
  const imagePlan = await planMediaResponse({
    method: "GET",
    pathname: "/media/images/example/loop.gif",
    root: "/srv/astrosphere/media",
    statFile: regularFile,
  });
  const mangaPlan = await planMediaResponse({
    method: "GET",
    pathname: "/manga/example/chapter-001/001.webp",
    root: "/srv/astrosphere/media",
    statFile: regularFile,
  });

  expect(imagePlan).toMatchObject({ kind: "file", status: 200, contentType: "image/gif" });
  expect(mangaPlan).toMatchObject({ kind: "file", status: 200, contentType: "image/webp" });
});

test("passes unrelated routes and handles media errors", async () => {
  expect(await planMediaResponse({ method: "GET", pathname: "/about", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toEqual({ kind: "next" });
  expect(await planMediaResponse({ method: "POST", pathname: "/manga/example/001.webp", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toMatchObject({ kind: "error", status: 405 });
  expect(await planMediaResponse({ method: "GET", pathname: "/manga/%2e%2e/secret.webp", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toMatchObject({ kind: "error", status: 400 });
  expect(await planMediaResponse({ method: "GET", pathname: "/manga/example/missing.webp", root: "/srv/astrosphere/media", statFile: async () => { throw new Error("missing"); } }))
    .toMatchObject({ kind: "error", status: 404 });
});

test("Astro delegates managed media to the shared response planner", async () => {
  const config = await readFile(new URL("../astro.config.mjs", import.meta.url), "utf8");

  expect(config).toContain("env.MEDIA_ROOT");
  expect(config).toContain("planMediaResponse");
  expect(config).not.toContain("IMAGE_SET_MEDIA_ROOT");
});
