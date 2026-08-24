import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import * as optimizer from "../src/lib/media/optimizer";

test("in-place web-reader optimization replaces verified WebP pages after confirmation", async () => {
  expect(typeof (optimizer as Record<string, unknown>).optimizeMediaInPlace).toBe("function");
  const optimizeMediaInPlace = (optimizer as typeof optimizer & {
    optimizeMediaInPlace: (options: {
      source: string;
      profile: "reader";
      quality: number;
      webReader: true;
      dryRun: false;
      confirm: (result: optimizer.OptimizeResult) => Promise<boolean>;
    }) => Promise<optimizer.OptimizeResult & { applied: boolean }>;
  }).optimizeMediaInPlace;

  const root = await mkdtemp(join(tmpdir(), "media-web-reader-"));
  const source = join(root, "chapter");
  const page = join(source, "001.webp");
  try {
    await mkdir(source);
    await sharp({
      create: { width: 2500, height: 3500, channels: 3, background: "white" },
    }).webp({ quality: 90 }).toFile(page);
    const before = await readFile(page);
    let confirmation: optimizer.OptimizeResult | undefined;

    const result = await optimizeMediaInPlace({
      source,
      profile: "reader",
      quality: 90,
      webReader: true,
      dryRun: false,
      confirm: async (prepared) => {
        confirmation = prepared;
        return true;
      },
    });

    expect(result.applied).toBe(true);
    expect(confirmation?.optimizedBytes).toBeGreaterThan(0);
    expect((await sharp(page).metadata()).width).toBe(2400);
    expect(await readFile(page)).not.toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
