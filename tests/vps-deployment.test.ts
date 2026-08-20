import { expect, test } from "bun:test";
import { createImageSetSyncCommand, createMangaSyncCommand, getDeploymentCommands, getVpsLayout } from "../src/lib/vps-operations";

test("builds an incremental manga sync command without remote deletion", () => {
  const command = createMangaSyncCommand({
    source: "/Users/example/astrosphere-media/manga",
    target: "astro@example.test:/srv/astrosphere/media/manga",
    dryRun: false,
  });

  expect(command).toEqual([
    "rsync",
    "--archive",
    "--partial",
    "--human-readable",
    "--progress",
    "/Users/example/astrosphere-media/manga/",
    "astro@example.test:/srv/astrosphere/media/manga/",
  ]);
  expect(command).not.toContain("--delete");
});

test("adds rsync dry-run only when requested", () => {
  expect(createMangaSyncCommand({
    source: "/Users/example/astrosphere-media/manga",
    target: "astro@example.test:/srv/astrosphere/media/manga",
    dryRun: true,
  })).toContain("--dry-run");
});

test("builds an incremental image-set sync command without remote deletion", () => {
  const command = createImageSetSyncCommand({
    source: "/Users/example/astrosphere-media/images",
    target: "astro@example.test:/srv/astrosphere/media/images",
    dryRun: false,
  });

  expect(command).toEqual([
    "rsync", "--archive", "--partial", "--human-readable", "--progress",
    "/Users/example/astrosphere-media/images/", "astro@example.test:/srv/astrosphere/media/images/",
  ]);
  expect(command).not.toContain("--delete");
});

test("rejects unsafe or ambiguous VPS media targets", () => {
  expect(() => createMangaSyncCommand({ source: "/media/manga", target: "/srv/media", dryRun: true }))
    .toThrow("user@host:/absolute/path");
  expect(() => createMangaSyncCommand({ source: "/media/manga", target: "root@example.test:relative", dryRun: true }))
    .toThrow("user@host:/absolute/path");
});

test("defines the fixed VPS layout and locked build sequence", () => {
  expect(getVpsLayout("/srv/astrosphere")).toEqual({
    root: "/srv/astrosphere",
    app: "/srv/astrosphere/app",
    releases: "/srv/astrosphere/releases",
    site: "/srv/astrosphere/site",
    media: "/srv/astrosphere/media/manga",
    imageSets: "/srv/astrosphere/media/images",
  });
  expect(getDeploymentCommands()).toEqual([
    ["git", "pull", "--ff-only"],
    ["bun", "install", "--frozen-lockfile"],
    ["bun", "test"],
    ["bun", "run", "build"],
  ]);
});

test("Caddy serves the active release and external media trees", async () => {
  const caddyfile = await Bun.file(new URL("../ops/Caddyfile", import.meta.url)).text();
  const lines = caddyfile.split("\n").map((line) => line.trim());
  const mangaMediaHandler = lines.indexOf("handle_path /manga/* {");
  const redirects = [
    "redir /manga /shelf permanent",
    "redir /manga/ /shelf permanent",
    "redir /image-sets /shelf/image-sets permanent",
    "redir /image-sets/ /shelf/image-sets permanent",
  ];

  expect(mangaMediaHandler).toBeGreaterThanOrEqual(0);
  for (const redirect of redirects) {
    expect(lines).toContain(redirect);
    expect(lines.indexOf(redirect)).toBeLessThan(mangaMediaHandler);
  }
  expect(lines.some((line) => /^redir \/manga\/\*/.test(line))).toBe(false);
  expect(caddyfile).toContain("root * /srv/astrosphere/media/manga");
  expect(caddyfile).toContain("handle_path /media/images/*");
  expect(caddyfile).toContain("root * /srv/astrosphere/media/images");
  expect(caddyfile).toContain('header Cache-Control "public, max-age=31536000, immutable"');
  expect(caddyfile).toContain("root * /srv/astrosphere/site");
});
