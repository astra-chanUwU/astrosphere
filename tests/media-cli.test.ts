import { expect, test } from "bun:test";
import { mediaHelp, parseMediaCommand } from "../src/lib/media/cli";

test("parses the shared command vocabulary", () => {
  expect(parseMediaCommand(["serve"])).toEqual({ command: "serve", args: [] });
  expect(parseMediaCommand(["optimize", "book.cbz"])).toEqual({ command: "optimize", args: ["book.cbz"] });
  expect(() => parseMediaCommand(["manga:serve"])).toThrow("Unknown media command");
  expect(mediaHelp).toContain("media:serve");
});

test("exposes the standalone serve alias", async () => {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(pkg.scripts["media:serve"]).toBe("bun scripts/media.ts serve");
});
