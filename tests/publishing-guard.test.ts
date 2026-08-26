import { expect, test } from "bun:test";

import {
  collectPublishingAssetReferences,
  collectPublishingUrlReferences,
  validatePublishingAssetReferences,
  validatePublishedTarget,
  validatePublishingUrlReferences,
} from "../src/lib/publishing-guard";

const contentLibrary = await Bun.file(
  new URL("../src/lib/content.ts", import.meta.url),
).text();
const homepage = await Bun.file(
  new URL("../src/pages/index.astro", import.meta.url),
).text();

test("collects local frontmatter, markdown, and manga page assets", () => {
  const references = collectPublishingAssetReferences([
    {
      collection: "artifacts",
      data: {
        slug: "signal",
        hero: { src: "/media/signal.jpg" },
        media: [{ src: "/media/audio.ogg", poster: "/media/poster.jpg" }],
      },
      body: "![Map](/media/map.png)",
    },
    {
      collection: "mangaChapters",
      data: {
        slug: "chapter-001",
        pagePath: "/manga/example/chapter-001",
        pageExtension: "webp",
        pageCount: 2,
      },
    },
  ]);

  expect(references.map((reference) => reference.src)).toEqual([
    "/media/signal.jpg",
    "/media/audio.ogg",
    "/media/poster.jpg",
    "/media/map.png",
    "/manga/example/chapter-001/001.webp",
    "/manga/example/chapter-001/002.webp",
  ]);
});

test("reports a missing local publishing asset", async () => {
  const issues = await validatePublishingAssetReferences(
    [
      {
        source: "artifacts:signal",
        field: "hero.src",
        src: "/media/missing.jpg",
      },
    ],
    {
      publicRoot: "/workspace/public",
      accessFile: async () => false,
    },
  );

  expect(issues).toEqual([
    {
      source: "artifacts:signal",
      field: "hero.src",
      message: 'missing local file "/media/missing.jpg"',
    },
  ]);
});

test("ordinary publishing validation skips external manga files", async () => {
  const issues = await validatePublishingAssetReferences(
    [
      {
        source: "artifacts:signal",
        field: "hero.src",
        src: "/media/missing.jpg",
      },
      {
        source: "mangaChapters:example",
        field: "pages[1]",
        src: "/manga/example/chapter-001/001.webp",
      },
    ],
    {
      publicRoot: "/workspace/public",
      accessFile: async () => false,
    },
  );

  expect(issues).toEqual([
    {
      source: "artifacts:signal",
      field: "hero.src",
      message: 'missing local file "/media/missing.jpg"',
    },
  ]);
});

test("ordinary publishing validation skips external managed media files", async () => {
  const issues = await validatePublishingAssetReferences(
    [
      {
        source: "artifacts:flou-sona",
        field: "hero.src",
        src: "/media/images/flou-sona/001.webp",
      },
      {
        source: "artifacts:signal",
        field: "hero.src",
        src: "/media/missing.jpg",
      },
      {
        source: "animeTitles:show",
        field: "art[0].src",
        src: "/media/anime/show/key-visual.webp",
      },
    ],
    {
      publicRoot: "/workspace/public",
      accessFile: async () => false,
    },
  );

  expect(issues).toEqual([
    {
      source: "artifacts:signal",
      field: "hero.src",
      message: 'missing local file "/media/missing.jpg"',
    },
  ]);
});

test("rejects a published item that targets a draft", () => {
  expect(
    validatePublishedTarget({
      source: "trails:orbit",
      field: "items[artifact]",
      target: "draft-note",
      targetStatus: "draft",
    }),
  ).toEqual({
    source: "trails:orbit",
    field: "items[artifact]",
    message: 'targets unpublished entry "draft-note"',
  });
});

test("reports malformed external markdown URLs", () => {
  const issues = validatePublishingUrlReferences(
    collectPublishingUrlReferences("[bad](https://)", "artifacts:signal"),
  );

  expect(issues).toEqual([
    {
      source: "artifacts:signal",
      field: "body link",
      message: 'invalid URL "https://"',
    },
  ]);
});

test("runs the publishing guard during the production build", () => {
  expect(contentLibrary).toContain("assertPublishingGuardrails");
  expect(homepage).toContain("await assertPublishingGuardrails()");
});
