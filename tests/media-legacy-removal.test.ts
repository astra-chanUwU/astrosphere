import { expect, test } from "bun:test";

const legacyScripts = [
  "manga:sanitize",
  "manga:serve",
  "manga:sync",
  "image-sets:sync",
  "manga:validate",
  "deploy:vps",
];

const legacyFiles = [
  "scripts/sanitize-manga.ts",
  "scripts/serve-manga.ts",
  "scripts/validate-manga-media.ts",
  "scripts/sync-manga.ts",
  "scripts/sync-image-sets.ts",
  "scripts/deploy-vps.ts",
  "scripts/generate-bs2-batch.mjs",
  "src/lib/manga-sanitizer.ts",
  "src/lib/manga-media-root.ts",
  "src/lib/manga-media-server.ts",
  "src/lib/image-set-media-root.ts",
  "src/lib/image-set-media-server.ts",
  "src/lib/vps-operations.ts",
];

test("the executable project exposes only unified media infrastructure", async () => {
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  for (const name of legacyScripts) expect(pkg.scripts[name]).toBeUndefined();
  for (const path of legacyFiles) {
    expect(
      await Bun.file(new URL(`../${path}`, import.meta.url)).exists(),
    ).toBe(false);
  }
});

test("active instructions use only the unified media vocabulary", async () => {
  const activeDocuments = [
    "AGENTS.md",
    ".env.example",
    "README.md",
    "docs/deployment-vps.md",
    "docs/BLACKSOULS-II-CONTENT-GUIDE.md",
  ];
  const retiredTerms = [
    "MANGA_MEDIA_ROOT",
    "IMAGE_SET_MEDIA_ROOT",
    "MANGA_MEDIA_PORT",
    "PUBLIC_MANGA_ASSET_BASE_URL",
    "MANGA_VALIDATE_EXTERNAL",
    "IMAGE_SET_VALIDATE_EXTERNAL",
    "VPS_MEDIA_TARGET",
    "VPS_IMAGE_SET_TARGET",
    "manga:serve",
    "manga:sync",
    "image-sets:sync",
    "manga:validate",
    "deploy:vps",
  ];

  for (const path of activeDocuments) {
    const contents = await Bun.file(
      new URL(`../${path}`, import.meta.url),
    ).text();
    expect(contents).toContain("MEDIA_ROOT");
    for (const retired of retiredTerms) expect(contents).not.toContain(retired);
  }
});
