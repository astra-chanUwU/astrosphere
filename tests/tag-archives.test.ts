import { expect, test } from "bun:test";

const workspace = new URL("..", import.meta.url).pathname;
const build = Bun.spawnSync(["./node_modules/.bin/astro", "build"], {
  cwd: workspace,
  stdout: "pipe",
  stderr: "pipe",
});

async function readBuiltPage(path: string) {
  return Bun.file(new URL(`../dist${path}/index.html`, import.meta.url));
}

test("generates static tag archives for artifacts, manga, and signals", async () => {
  expect(build.exitCode).toBe(0);

  const artifactTag = await readBuiltPage("/tags/cyberpunk");
  const mangaTag = await readBuiltPage("/tags/comedy");
  const signalTag = await readBuiltPage("/tags/archive");

  expect(await artifactTag.exists()).toBe(true);
  expect(await mangaTag.exists()).toBe(true);
  expect(await signalTag.exists()).toBe(true);
});

test("groups matching published content under its content type", async () => {
  const artifactTag = await (await readBuiltPage("/tags/cyberpunk")).text();
  const mangaTag = await (await readBuiltPage("/tags/comedy")).text();
  const signalTag = await (await readBuiltPage("/tags/archive")).text();

  expect(artifactTag).toContain("Artifacts");
  expect(artifactTag).toContain("Ace Combat 3: Electrosphere");
  expect(mangaTag).toContain("Manga");
  expect(mangaTag).toContain("Dorohedoro");
  expect(signalTag).toContain("Signals");
  expect(signalTag).toContain("MangaDex");
});

test("renders visible tags as ordinary archive links", async () => {
  const artifactTag = await (await readBuiltPage("/tags/cyberpunk")).text();
  const mangaTag = await (await readBuiltPage("/tags/comedy")).text();
  const signalTag = await (await readBuiltPage("/tags/archive")).text();

  expect(artifactTag).toContain('href="/tags/cyberpunk"');
  expect(mangaTag).toContain('href="/tags/comedy"');
  expect(signalTag).toContain('href="/tags/archive"');
});

test("links contextual sidebar tags to their archive", async () => {
  const artifact = await (await readBuiltPage("/artifacts/ace-combat-3-electrosphere")).text();

  expect(artifact).toMatch(/<a href="\/tags\/cyberpunk"[^>]*>#cyberpunk<\/a>/);
});
