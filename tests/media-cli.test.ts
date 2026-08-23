import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  mediaHelp,
  parseMediaCommand,
  parseOptimizeArgs,
} from "../src/lib/media/cli";

const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const runMedia = async (args: string[]) => {
  const child = Bun.spawn([
    "bun",
    new URL("../scripts/media.ts", import.meta.url).pathname,
    ...args,
  ], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

test("parses the shared command vocabulary", () => {
  expect(parseMediaCommand(["serve"])).toEqual({ command: "serve", args: [] });
  expect(parseMediaCommand(["optimize", "book.cbz"])).toEqual({ command: "optimize", args: ["book.cbz"] });
  expect(() => parseMediaCommand(["manga:serve"])).toThrow("Unknown media command");
  expect(mediaHelp).toContain("media:serve");
});

test("parses required optimization options with resolved paths and defaults", () => {
  expect(parseOptimizeArgs(["book.cbz", "--output", "optimized", "--profile", "reader"])).toEqual({
    source: resolve("book.cbz"),
    destination: resolve("optimized"),
    profile: "reader",
    quality: 85,
    dryRun: false,
  });
});

test("parses optional optimization quality and dry-run", () => {
  expect(parseOptimizeArgs([
    "gallery",
    "--output",
    "/tmp/gallery",
    "--profile",
    "gallery",
    "--quality",
    "90",
    "--dry-run",
  ])).toEqual({
    source: resolve("gallery"),
    destination: "/tmp/gallery",
    profile: "gallery",
    quality: 90,
    dryRun: true,
  });
});

test("rejects missing, duplicate, unknown, and stray optimization arguments", () => {
  expect(() => parseOptimizeArgs([])).toThrow("source is required");
  expect(() => parseOptimizeArgs(["", "--output", "/tmp/book", "--profile", "reader"])).toThrow("source is required");
  expect(() => parseOptimizeArgs(["book.cbz", "--profile", "reader"])).toThrow("--output is required");
  expect(() => parseOptimizeArgs(["book.cbz", "--output", "/tmp/book"])).toThrow("--profile is required");
  expect(() => parseOptimizeArgs([
    "book.cbz",
    "--output",
    "/tmp/book",
    "--output",
    "/tmp/second-book",
    "--profile",
    "reader",
  ])).toThrow("--output may only be specified once");
  expect(() => parseOptimizeArgs([
    "book.cbz",
    "--output",
    "/tmp/book",
    "--profile",
    "reader",
    "--unknown",
  ])).toThrow("Unknown optimize option: --unknown");
  expect(() => parseOptimizeArgs([
    "book.cbz",
    "--output",
    "/tmp/book",
    "--profile",
    "reader",
    "unexpected",
  ])).toThrow("Unexpected optimize argument: unexpected");
});

test("rejects invalid optimization profiles and qualities", () => {
  const options = ["book.cbz", "--output", "/tmp/book", "--profile", "reader"];

  expect(() => parseOptimizeArgs([...options, "--profile", "gallery"])).toThrow("--profile may only be specified once");
  expect(() => parseOptimizeArgs([...options, "--dry-run", "--dry-run"])).toThrow("--dry-run may only be specified once");
  expect(() => parseOptimizeArgs([...options.slice(0, -1), "comic"])).toThrow("--profile must be reader or gallery");
  expect(() => parseOptimizeArgs([...options, "--quality", "101"])).toThrow("1 to 100");
  expect(() => parseOptimizeArgs([...options, "--quality", "1.5"])).toThrow("1 to 100");
  expect(() => parseOptimizeArgs([...options, "--quality", "0"])).toThrow("1 to 100");
});

test("exposes the standalone serve alias", async () => {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(pkg.scripts["media:serve"]).toBe("bun scripts/media.ts serve");
});

test("exposes the standalone optimize alias", async () => {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(pkg.scripts["media:optimize"]).toBe("bun scripts/media.ts optimize");
});

test("dispatches media optimization dry runs without creating an output directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-cli-"));
  const source = join(root, "001.png");
  const destination = join(root, "output");
  try {
    await writeFile(source, pngHeader);

    const result = await runMedia([
      "optimize",
      source,
      "--output",
      destination,
      "--profile",
      "reader",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.startsWith("Media optimization dry run:\n")).toBe(true);
    expect(result.stdout).toContain("001.png -> 001.webp");
    expect(existsSync(destination)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns the optimization exit code through the shared CLI catch", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-cli-"));
  const destination = join(root, "output");
  try {
    const result = await runMedia([
      "optimize",
      join(root, "missing.png"),
      "--output",
      destination,
      "--profile",
      "reader",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("Media command failed: Optimization source does not exist");
    expect(existsSync(destination)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
