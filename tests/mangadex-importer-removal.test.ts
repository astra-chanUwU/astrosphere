import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);

test("does not expose the retired MangaDex importer", async () => {
  const packageJson = await Bun.file(new URL("package.json", root)).json();

  expect(await Bun.file(new URL("scripts/import-mangadex.ts", root)).exists()).toBe(false);
  expect(packageJson.scripts?.["manga:import"]).toBeUndefined();
});
