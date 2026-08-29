import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  addHelp,
  mediaHelp,
  maintenanceHelp,
  optimizeHelp,
  parseAddArgs,
  parseMediaCommand,
  parseMaintainArgs,
  parseOptimizeArgs,
  parseRemoveArgs,
  removeHelp,
  parseSyncArgs,
  parseThumbnailArgs,
  parseValidateArgs,
  thumbnailHelp,
} from "../src/lib/media/cli";
import { formatProgressBar, MediaProgress } from "../src/lib/media/progress";
import {
  extractTerminalOptions,
  formatBytes,
  formatCommandHeader,
  formatDuration,
  formatSummary,
} from "../src/lib/media/terminal";
import {
  exitCodeForMediaError,
  mediaExitCodes,
  MediaError,
} from "../src/lib/media/errors";
import { TerminalSession } from "../src/lib/terminal/session";
import type {
  MaintenanceEnvelope,
  MaintenanceErrorEnvelope,
} from "../src/lib/media/maintenance-types";

const pngHeader = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test("formats terminal summaries with readable labels and bytes", () => {
  expect(formatCommandHeader("media", "optimize", { color: false })).toBe(
    "◆ media optimize",
  );
  expect(formatBytes(1536)).toBe("1.5 KiB");
  expect(formatSummary([[
    "Saved",
    formatBytes(1536),
  ], ["Files", "12"]])).toBe("  Saved  1.5 KiB\n  Files  12");
});

test("uses semantic terminal marks without coloring non-TTY output", () => {
  expect(formatCommandHeader("media", "validate", { color: true })).toContain(
    "\u001b[",
  );
  expect(formatSummary([["Status", "OK"]], { marker: "success", color: false })).toBe(
    "✓ Status  OK",
  );
});

test("formats a terminal progress bar with the active file and counts", () => {
  expect(formatProgressBar(3, 10, 12)).toBe("[████░░░░░░░░] 30%");
  const progress = new MediaProgress({ output: () => undefined, isTTY: true });
  progress.start("Converting videos", 2);
  progress.update({ current: "episode-01.mkv", completed: 1, detail: "transcode" });
  const rendered = progress.render();
  expect(rendered).toContain("Converting videos");
  expect(rendered).toContain("episode-01.mkv");
  expect(rendered).toContain("1/2");
  expect(rendered).toContain("transcode");
});

test("renders a separate per-file progress bar", () => {
  const progress = new MediaProgress({ output: () => undefined, isTTY: true });
  progress.start("Converting videos", 13);
  progress.update({
    current: "1.webm",
    completed: 2,
    detail: "transcoding",
    filePercent: 55,
  });
  expect(progress.render()).toContain("Overall [████░░░░░░░░░░░░░░░░░░░░] 15% 2/13");
  expect(progress.render()).toContain("File     ");
  expect(progress.render()).toContain("55% 1.webm");
});

test("renders measured elapsed time and approximate ETA", () => {
  let now = 0;
  const progress = new MediaProgress({
    output: () => undefined,
    isTTY: true,
    animate: false,
    now: () => now,
  });
  progress.start("Converting videos", 4);
  now = 10_000;
  progress.update({
    current: "episode-01.webm",
    completed: 1,
    detail: "transcoding",
    filePercent: 0,
  });
  expect(progress.render()).toContain("Elapsed 10s");
  expect(progress.render()).toContain("ETA ~30s");
  expect(formatDuration(3_725_000)).toBe("1h 2m");
});

test("renders measured processing speed and an ASCII fallback", () => {
  let now = 0;
  const progress = new MediaProgress({
    output: () => undefined,
    isTTY: true,
    animate: false,
    unicode: false,
    now: () => now,
  });
  progress.start("Converting videos", 2);
  progress.update({ current: "episode.webm", completed: 0, filePercent: 0 });
  now = 10_000;
  progress.update({
    current: "episode.webm",
    completed: 0,
    filePercent: 50,
    processedSeconds: 5,
  });
  expect(progress.render()).toMatch(/^[-\\|/] /);
  expect(progress.render()).toContain("[#");
  expect(progress.render()).toContain("Speed 0.50×");
});

test("uses an orbit spinner and restores the cursor after interactive progress", () => {
  let now = 0;
  const writes: string[] = [];
  const progress = new MediaProgress({
    output: (text) => writes.push(text),
    isTTY: true,
    animate: false,
    now: () => now,
  });
  progress.start("Inspecting sources", 1);
  now = 160;
  expect(progress.render()).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /);
  progress.finish();
  expect(writes.join("")).toContain("\u001b[?25l");
  expect(writes.join("")).toContain("\u001b[?25h");
});

test("plain progress is stable and global plain flags are removed before parsing", () => {
  const writes: string[] = [];
  const progress = new MediaProgress({
    output: (text) => writes.push(text),
    isTTY: false,
    animate: false,
  });
  progress.start("Converting videos", 2);
  progress.update({ current: "episode-01.webm", completed: 1, detail: "verified" });
  progress.finish();
  expect(writes.join("")).not.toContain("\u001b[");
  expect(writes.join("")).toContain("Converting videos: 1/2");
  expect(extractTerminalOptions(["optimize", "video", "/source", "--plain", "--resume"]))
    .toEqual({ args: ["optimize", "video", "/source", "--resume"], plain: true });
});

test("terminal sessions give commands a shared named lifecycle", () => {
  let now = 0;
  const writes: string[] = [];
  const session = new TerminalSession({
    scope: "media",
    command: "validate",
    plain: true,
    output: (text) => writes.push(text),
    now: () => now,
  });
  session.start({ title: "AstroSphere media library" });
  session.phase("Inspecting references");
  now = 2_500;
  session.phaseDone("38 references");
  session.complete("Media validation passed", [["Errors", 0]]);
  const output = writes.join("");
  expect(output).toContain("◆ media validate");
  expect(output).toContain("AstroSphere media library");
  expect(output).toContain("Inspecting references");
  expect(output).toContain("38 references");
  expect(output).toContain("Elapsed 3s");
});

test("terminal sessions send failures to the error stream", () => {
  const output: string[] = [];
  const errors: string[] = [];
  const session = new TerminalSession({
    scope: "media",
    command: "sync",
    plain: false,
    isTTY: true,
    output: (text) => output.push(text),
    errorOutput: (text) => errors.push(text),
  });
  session.start();
  session.progress().start("Synchronizing", 2);
  session.fail("Connection failed");
  expect(output.join("")).toContain("media");
  expect(output.join("")).toContain("\u001b[?25h");
  expect(errors.join("")).toContain("Connection failed");
  expect(errors.join("")).toContain("\u001b[31m");
});

const runMedia = async (
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
) => {
  const child = Bun.spawn(
    ["bun", new URL("../scripts/media.ts", import.meta.url).pathname, ...args],
    {
      cwd: options.cwd ?? new URL("..", import.meta.url).pathname,
      env: { ...process.env, ...options.env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

test("parses the shared command vocabulary", () => {
  expect(parseMediaCommand(["serve"])).toEqual({ command: "serve", args: [] });
  expect(parseMediaCommand(["optimize", "book.cbz"])).toEqual({
    command: "optimize",
    args: ["book.cbz"],
  });
  expect(parseMediaCommand(["add", "manga-volume", "book.cbz"])).toEqual({
    command: "add",
    args: ["manga-volume", "book.cbz"],
  });
  expect(parseMediaCommand(["remove", "manga", "series"])).toEqual({
    command: "remove",
    args: ["manga", "series"],
  });
  expect(parseMediaCommand(["thumbnails", "--dry-run"])).toEqual({
    command: "thumbnails",
    args: ["--dry-run"],
  });
  expect(() => parseMediaCommand(["maintain", "plan"])).toThrow(
    "Unknown media command",
  );
  expect(() => parseMediaCommand(["manga:serve"])).toThrow(
    "Unknown media command",
  );
  expect(mediaHelp).toContain("media:serve");
  expect(mediaHelp).toContain("media:sync [--dry-run] [--prune]");
  expect(mediaHelp).toContain("media:add manga-volume <source...> --series <slug>");
  expect(addHelp).toContain("media:add manga-volume <source...> --series <slug>");
  expect(removeHelp).toContain(
    "media:remove manga <series> --chapter <number> --unavailable",
  );
  expect(optimizeHelp).toContain(
    "media:optimize <source> (--output <destination> | --in-place) --profile <reader|gallery>",
  );
  expect(optimizeHelp).toContain("--resume");
  expect(thumbnailHelp).toContain(
    "media:thumbnails [--series <slug>] [--dry-run] [--force]",
  );
  expect(thumbnailHelp).toContain("all managed preview thumbnails");
  expect(mediaHelp).not.toContain("media:maintain");
  expect(maintenanceHelp).toContain("media:maintain plan");
});

test("parses explicit video resume without weakening the default", () => {
  const resumed = parseOptimizeArgs([
    "video",
    "/sources/show",
    "--manifest",
    "manifest.yaml",
    "--resume",
    "--dry-run",
  ]);
  expect(resumed).toMatchObject({ kind: "video", resume: true, dryRun: true });
  const fresh = parseOptimizeArgs([
    "video",
    "/sources/show",
    "--manifest",
    "manifest.yaml",
  ]);
  expect(fresh).toMatchObject({ kind: "video", resume: false });
});

test("parses safe thumbnail backfill options and rejects ambiguous input", () => {
  expect(parseThumbnailArgs([])).toEqual({
    series: undefined,
    dryRun: false,
    force: false,
  });
  expect(
    parseThumbnailArgs([
      "--series",
      "example-book",
      "--dry-run",
      "--force",
    ]),
  ).toEqual({ series: "example-book", dryRun: true, force: true });
  expect(() => parseThumbnailArgs(["--series", "../book"])).toThrow(
    "lowercase letters, numbers, and hyphens",
  );
  expect(() => parseThumbnailArgs(["--force", "--force"])).toThrow(
    "may only be specified once",
  );
  expect(() => parseThumbnailArgs(["unexpected"])).toThrow(
    "Unexpected thumbnails argument",
  );
});

test("parses maintenance planning and application arguments", () => {
  expect(parseMaintainArgs(["plan"], 12)).toEqual({
    action: "plan",
    quality: 85,
  });
  expect(parseMaintainArgs(["plan", "--quality", "91"], 12)).toEqual({
    action: "plan",
    quality: 91,
  });
  expect(
    parseMaintainArgs(["apply", "20260823t120000z-a1b2c3d4", "--jobs", "3"], 12),
  ).toEqual({
    action: "apply",
    operationId: "20260823t120000z-a1b2c3d4",
    jobs: 3,
  });
  expect(parseMaintainArgs(["apply", "safe-id"], 12)).toEqual({
    action: "apply",
    operationId: "safe-id",
    jobs: 4,
  });
  const singleProcessorApply = parseMaintainArgs(["apply", "safe-id"], 0);
  expect(singleProcessorApply.action).toBe("apply");
  if (singleProcessorApply.action === "apply") {
    expect(singleProcessorApply.jobs).toBe(1);
  }
  const manyProcessorApply = parseMaintainArgs(["apply", "safe-id"], 10);
  expect(manyProcessorApply.action).toBe("apply");
  if (manyProcessorApply.action === "apply") {
    expect(manyProcessorApply.jobs).toBe(4);
  }
});

test("rejects unsafe or ambiguous maintenance arguments", () => {
  expect(() => parseMaintainArgs(["apply", "../manifest"], 4)).toThrow(
    "operation ID",
  );
  expect(() => parseMaintainArgs(["apply", "safe-ID"], 4)).toThrow(
    "lowercase",
  );
  expect(() => parseMaintainArgs(["apply"], 4)).toThrow("operation ID");
  expect(() => parseMaintainArgs(["apply", "safe-id", "extra"], 4)).toThrow(
    "operation ID",
  );
  expect(() => parseMaintainArgs(["plan", "--jobs", "2"], 4)).toThrow(
    "Unknown plan option",
  );
  expect(() => parseMaintainArgs(["apply", "safe-id", "--quality", "80"], 4)).toThrow(
    "Unknown apply option",
  );
  expect(() => parseMaintainArgs(["plan", "--quality", "0"], 4)).toThrow(
    "1 to 100",
  );
  expect(() => parseMaintainArgs(["plan", "--quality", "101"], 4)).toThrow(
    "1 to 100",
  );
  expect(() => parseMaintainArgs(["plan", "--quality", "1.5"], 4)).toThrow(
    "1 to 100",
  );
  expect(() => parseMaintainArgs(["plan", "--quality", "85", "--quality", "90"], 4)).toThrow(
    "may only be specified once",
  );
  expect(() => parseMaintainArgs(["apply", "safe-id", "--jobs", "0"], 4)).toThrow(
    "1 to 32",
  );
  expect(() => parseMaintainArgs(["apply", "safe-id", "--jobs", "33"], 4)).toThrow(
    "1 to 32",
  );
  expect(() => parseMaintainArgs(["apply", "safe-id", "--jobs", "1.5"], 4)).toThrow(
    "1 to 32",
  );
  expect(() => parseMaintainArgs(["apply", "safe-id", "--jobs", "2", "--jobs", "3"], 4)).toThrow(
    "may only be specified once",
  );
  expect(() => parseMaintainArgs(["apply", "safe-id", "--unknown"], 4)).toThrow(
    "Unknown apply option",
  );
  expect(() => parseMaintainArgs(["archive"], 4)).toThrow("Unknown maintain action");
  const parseWithoutProcessor = parseMaintainArgs as unknown as (
    argv: string[],
  ) => unknown;
  expect(() => parseWithoutProcessor(["apply", "safe-id"])).toThrow(
    "processor count",
  );
});

test("exposes versioned maintenance envelopes and exit category", () => {
  const success: MaintenanceEnvelope<{ files: number }> = {
    schemaVersion: 1,
    command: "media:maintain",
    ok: true,
    result: { files: 2 },
  };
  const failure: MaintenanceErrorEnvelope = {
    schemaVersion: 1,
    command: "media:maintain",
    ok: false,
    error: {
      category: "usage",
      code: "invalid_arguments",
      message: "bad arguments",
      context: { retryable: false },
    },
  };
  expect(success.ok).toBe(true);
  expect(failure.error.category).toBe("usage");
  expect(mediaExitCodes.maintenance).toBe(7);
  expect(exitCodeForMediaError(new MediaError("maintenance", "failed"))).toBe(7);
});

test("parses a safe unavailable manga chapter removal", () => {
  expect(
    parseRemoveArgs([
      "manga",
      "android-series",
      "--chapter",
      "5.1",
      "--unavailable",
    ]),
  ).toEqual({
    kind: "manga",
    series: "android-series",
    chapter: 5.1,
  });
  expect(() =>
    parseRemoveArgs(["manga", "android-series", "--chapter", "5.1"]),
  ).toThrow("--unavailable is required");
  expect(() =>
    parseRemoveArgs([
      "manga",
      "android-series",
      "--chapter",
      "../5",
      "--unavailable",
    ]),
  ).toThrow("positive number");
});

test("parses a manga volume import", () => {
  expect(
    parseAddArgs([
      "manga-volume",
      "book.cbz",
      "--series",
      "does-it-count-if-you-lose-your-virginity-to-an-android",
    ]),
  ).toEqual({
    kind: "manga-volume",
    sources: [resolve("book.cbz")],
    series: "does-it-count-if-you-lose-your-virginity-to-an-android",
    quality: 90,
    status: "published",
  });
});

test("parses multiple volume sources and an explicit draft import", () => {
  expect(
    parseAddArgs([
      "manga-volume",
      "volume-1.cbz",
      "volume-2.zip",
      "--series",
      "android-series",
      "--draft",
    ]),
  ).toEqual({
    kind: "manga-volume",
    sources: [resolve("volume-1.cbz"), resolve("volume-2.zip")],
    series: "android-series",
    quality: 90,
    status: "draft",
  });
});

test("parses a batch import with a required manifest and dry run", () => {
  expect(
    parseAddArgs([
      "batch",
      "batch 1 doujinshi",
      "--manifest",
      "batch.yaml",
      "--dry-run",
    ]),
  ).toEqual({
    kind: "batch",
    source: resolve("batch 1 doujinshi"),
    manifest: resolve("batch.yaml"),
    quality: 90,
    dryRun: true,
    status: "published",
  });
  expect(addHelp).toContain(
    "media:add batch <source-folder> --manifest <file> [--quality <1..100>] [--dry-run] [--draft]",
  );
});

test("rejects incomplete and ambiguous batch import arguments", () => {
  expect(() => parseAddArgs(["batch", "source"])).toThrow(
    "--manifest is required",
  );
  expect(() =>
    parseAddArgs([
      "batch",
      "one",
      "two",
      "--manifest",
      "batch.yaml",
    ]),
  ).toThrow("exactly one source folder");
  expect(() =>
    parseAddArgs([
      "batch",
      "source",
      "--manifest",
      "batch.yaml",
      "--dry-run",
      "--dry-run",
    ]),
  ).toThrow("--dry-run may only be specified once");
});

test("rejects incomplete or unsafe manga volume import arguments", () => {
  expect(() => parseAddArgs([])).toThrow("manga-volume");
  expect(() => parseAddArgs(["image-set", "book.cbz"])).toThrow(
    "Unknown add type",
  );
  expect(() => parseAddArgs(["manga-volume"])).toThrow("source is required");
  expect(() => parseAddArgs(["manga-volume", "book.cbz"])).toThrow(
    "--series is required",
  );
  expect(() =>
    parseAddArgs([
      "manga-volume",
      "book.cbz",
      "--series",
      "Not A Slug",
    ]),
  ).toThrow("lowercase letters, numbers, and hyphens");
  expect(() =>
    parseAddArgs([
      "manga-volume",
      "book.cbz",
      "--series",
      "series",
      "--quality",
      "101",
    ]),
  ).toThrow("1 to 100");
  expect(() =>
    parseAddArgs([
      "manga-volume",
      "book.cbz",
      "--series",
      "series",
      "--draft",
      "--draft",
    ]),
  ).toThrow("--draft may only be specified once");
});

test("parses required optimization options with resolved paths and defaults", () => {
  expect(
    parseOptimizeArgs([
      "book.cbz",
      "--output",
      "optimized",
      "--profile",
      "reader",
    ]),
  ).toEqual({
    source: resolve("book.cbz"),
    destination: resolve("optimized"),
    profile: "reader",
    quality: 85,
    dryRun: false,
  });
});

test("parses a manifest-driven video optimization", () => {
  expect(
    parseOptimizeArgs([
      "video",
      "/sources/luluco",
      "--manifest",
      "manifest.yaml",
      "--dry-run",
    ]),
  ).toEqual({
    kind: "video",
    sourceRoot: "/sources/luluco",
    manifest: resolve("manifest.yaml"),
    dryRun: true,
    resume: false,
  });
});

test("rejects incomplete or ambiguous video optimization arguments", () => {
  expect(() => parseOptimizeArgs(["video", "/sources/luluco"])).toThrow("--manifest is required");
  expect(() => parseOptimizeArgs(["video", "/sources/luluco", "--manifest", "one.yaml", "--manifest", "two.yaml"])).toThrow("--manifest may only be specified once");
  expect(() => parseOptimizeArgs(["video", "/sources/luluco", "extra", "--manifest", "one.yaml"])).toThrow("exactly one source root");
  expect(() => parseOptimizeArgs(["video", "/sources/luluco", "--manifest", "one.yaml", "--quality", "80"])).toThrow("Unknown video optimize option");
});

test("parses optional optimization quality and dry-run", () => {
  expect(
    parseOptimizeArgs([
      "gallery",
      "--output",
      "/tmp/gallery",
      "--profile",
      "gallery",
      "--quality",
      "90",
      "--dry-run",
    ]),
  ).toEqual({
    source: resolve("gallery"),
    destination: "/tmp/gallery",
    profile: "gallery",
    quality: 90,
    dryRun: true,
  });
});

test("parses the web-reader in-place mode with its tested quality default", () => {
  expect(
    parseOptimizeArgs([
      "managed/chapter-011",
      "--profile",
      "reader",
      "--web-reader",
      "--in-place",
    ]),
  ).toEqual({
    source: resolve("managed/chapter-011"),
    destination: undefined,
    profile: "reader",
    quality: 90,
    dryRun: false,
    webReader: true,
    inPlace: true,
  });

  expect(() =>
    parseOptimizeArgs([
      "managed/chapter-011",
      "--output",
      "optimized",
      "--profile",
      "reader",
      "--web-reader",
      "--in-place",
    ]),
  ).toThrow("--output cannot be combined with --in-place");
  expect(() =>
    parseOptimizeArgs([
      "managed/chapter-011",
      "--profile",
      "reader",
      "--in-place",
    ]),
  ).toThrow("--in-place requires --web-reader");
});

test("rejects missing, duplicate, unknown, and stray optimization arguments", () => {
  expect(() => parseOptimizeArgs([])).toThrow("source is required");
  expect(() =>
    parseOptimizeArgs(["", "--output", "/tmp/book", "--profile", "reader"]),
  ).toThrow("source is required");
  expect(() => parseOptimizeArgs(["book.cbz", "--profile", "reader"])).toThrow(
    "--output is required",
  );
  expect(() =>
    parseOptimizeArgs(["book.cbz", "--output", "/tmp/book"]),
  ).toThrow("--profile is required");
  expect(() =>
    parseOptimizeArgs([
      "book.cbz",
      "--output",
      "/tmp/book",
      "--output",
      "/tmp/second-book",
      "--profile",
      "reader",
    ]),
  ).toThrow("--output may only be specified once");
  expect(() =>
    parseOptimizeArgs([
      "book.cbz",
      "--output",
      "/tmp/book",
      "--profile",
      "reader",
      "--unknown",
    ]),
  ).toThrow("Unknown optimize option: --unknown");
  expect(() =>
    parseOptimizeArgs([
      "book.cbz",
      "--output",
      "/tmp/book",
      "--profile",
      "reader",
      "unexpected",
    ]),
  ).toThrow("Unexpected optimize argument: unexpected");
});

test("rejects invalid optimization profiles and qualities", () => {
  const options = ["book.cbz", "--output", "/tmp/book", "--profile", "reader"];

  expect(() => parseOptimizeArgs([...options, "--profile", "gallery"])).toThrow(
    "--profile may only be specified once",
  );
  expect(() =>
    parseOptimizeArgs([...options, "--dry-run", "--dry-run"]),
  ).toThrow("--dry-run may only be specified once");
  expect(() => parseOptimizeArgs([...options.slice(0, -1), "comic"])).toThrow(
    "--profile must be reader or gallery",
  );
  expect(() => parseOptimizeArgs([...options, "--quality", "101"])).toThrow(
    "1 to 100",
  );
  expect(() => parseOptimizeArgs([...options, "--quality", "1.5"])).toThrow(
    "1 to 100",
  );
  expect(() => parseOptimizeArgs([...options, "--quality", "0"])).toThrow(
    "1 to 100",
  );
  expect(() => parseOptimizeArgs([...options, "--quality"])).toThrow(
    "--quality requires a value",
  );
  expect(() => parseOptimizeArgs([...options, "--quality", "-1"])).toThrow(
    "1 to 100",
  );
});

test("accepts a dash-prefixed source after the option terminator", () => {
  expect(
    parseOptimizeArgs([
      "--output",
      "optimized",
      "--profile",
      "reader",
      "--",
      "-book.cbz",
    ]).source,
  ).toBe(resolve("-book.cbz"));
});

test("exposes the standalone serve alias", async () => {
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  expect(pkg.scripts["media:serve"]).toBe("bun scripts/media.ts serve");
});

test("exposes the standalone optimize alias", async () => {
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  expect(pkg.scripts["media:optimize"]).toBe("bun scripts/media.ts optimize");
});

test("exposes the standalone add alias", async () => {
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  expect(pkg.scripts["media:add"]).toBe("bun scripts/media.ts add");
});

test("exposes the standalone remove alias", async () => {
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  expect(pkg.scripts["media:remove"]).toBe("bun scripts/media.ts remove");
});

test("exposes and dispatches the standalone thumbnail alias", async () => {
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  expect(pkg.scripts["media:thumbnails"]).toBe(
    "bun scripts/media.ts thumbnails",
  );

  const root = await mkdtemp(join(tmpdir(), "media-thumbnails-cli-"));
  const mediaRoot = join(root, "media");
  try {
    await mkdir(join(root, "src/content/manga"), { recursive: true });
    await mkdir(mediaRoot);
    const result = await runMedia(["thumbnails", "--plain", "--dry-run"], {
      cwd: root,
      env: { MEDIA_ROOT: mediaRoot },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("◆ media thumbnails");
    expect(result.stdout).not.toContain("\u001b[");
    expect(result.stdout).toContain("Selected thumbnails  0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatches manga volume imports through the shared CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-add-cli-"));
  const mediaRoot = join(root, "media");
  const source = join(root, "broken.cbz");
  try {
    await mkdir(join(root, "src/content/manga/series"), { recursive: true });
    await mkdir(mediaRoot);
    await writeFile(
      join(root, "src/content/manga/series/android-series.md"),
      "---\nslug: android-series\n---\n",
    );
    await writeFile(source, "not a zip");

    const result = await runMedia(
      ["add", "manga-volume", source, "--series", "android-series"],
      { cwd: root, env: { MEDIA_ROOT: mediaRoot } },
    );

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("Unable to import manga volume");
    expect(result.stderr).not.toContain("not available until");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatches batch imports through the shared CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-add-batch-cli-"));
  const mediaRoot = join(root, "media");
  const source = join(root, "source");
  const manifest = join(root, "batch.yaml");
  try {
    await mkdir(source);
    await mkdir(mediaRoot);
    await writeFile(
      manifest,
      "version: 1\ndefaults: { ignoreEntries: [] }\nentries: []\n",
    );

    const result = await runMedia(
      ["add", "batch", source, "--manifest", manifest, "--dry-run"],
      { cwd: root, env: { MEDIA_ROOT: mediaRoot } },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("entries must contain at least one entry");
    expect(result.stderr).not.toContain("manga volumes");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parses the argument-free validator command", async () => {
  expect(parseValidateArgs([])).toEqual({});
  expect(() => parseValidateArgs(["unexpected"])).toThrow(
    "validate command does not accept arguments",
  );
  expect(() => parseValidateArgs(["--unknown"])).toThrow(
    "validate command does not accept arguments",
  );
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  expect(pkg.scripts["media:validate"]).toBe("bun scripts/media.ts validate");
});

test("parses synchronization safety flags without a destructive bypass", async () => {
  expect(parseSyncArgs([])).toEqual({ dryRun: false, prune: false });
  expect(parseSyncArgs(["--dry-run"])).toEqual({
    dryRun: true,
    prune: false,
  });
  expect(parseSyncArgs(["--prune", "--dry-run"])).toEqual({
    dryRun: true,
    prune: true,
  });
  expect(() => parseSyncArgs(["--yes"])).toThrow("Unknown sync option: --yes");
  expect(() => parseSyncArgs(["--prune", "--prune"])).toThrow(
    "--prune may only be specified once",
  );
  expect(() => parseSyncArgs(["unexpected"])).toThrow(
    "Unexpected sync argument: unexpected",
  );

  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json();
  expect(pkg.scripts["media:sync"]).toBe("bun scripts/media.ts sync");
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
    expect(result.stdout).toContain("Media optimization dry run");
    expect(result.stdout.startsWith("◆ media optimize\n")).toBe(
      true,
    );
    expect(result.stdout).toContain("001.png -> 001.webp");
    expect(existsSync(destination)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prints optimizer-specific help without requiring arguments", async () => {
  const result = await runMedia(["optimize", "--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("--quality <1..100>");
  expect(result.stdout).toContain("--dry-run");
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
    expect(result.stderr).toContain(
      "Media command failed: Optimization source does not exist",
    );
    expect(existsSync(destination)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validates a repository without invoking an Astro build", async () => {
  const mediaScript = await Bun.file(
    new URL("../scripts/media.ts", import.meta.url),
  ).text();
  expect(mediaScript).not.toContain("astro build");
  expect(mediaScript).not.toContain("bun run build");
  expect(mediaScript).not.toContain("MANGA_VALIDATE_EXTERNAL");
  expect(mediaScript).not.toContain("IMAGE_SET_VALIDATE_EXTERNAL");

  const root = await mkdtemp(join(tmpdir(), "media-cli-validate-"));
  const mediaRoot = join(root, "media");
  try {
    await mkdir(join(root, "src/content/image-sets"), { recursive: true });
    await mkdir(mediaRoot);
    await writeFile(
      join(root, "src/content/image-sets/example.md"),
      "---\nslug: example\nstatus: published\nhero:\n  src: /media/images/example/cover.webp\n---\n",
    );

    const result = await runMedia(["validate"], {
      cwd: root,
      env: { MEDIA_ROOT: mediaRoot },
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "ERROR [missing] /media/images/example/cover.webp",
    );
    expect(result.stdout).toContain(
      "References: 1 | Files: 0 | Errors: 1 | Orphans: 0",
    );
    expect(existsSync(join(root, "dist"))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks synchronization before configuration or transfer when validation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-cli-sync-validation-"));
  const mediaRoot = join(root, "media");
  try {
    await mkdir(join(root, "src/content/image-sets"), { recursive: true });
    await mkdir(mediaRoot);
    await writeFile(
      join(root, "src/content/image-sets/example.md"),
      "---\nslug: example\nstatus: published\nhero:\n  src: /media/images/example/cover.webp\n---\n",
    );

    const result = await runMedia(["sync", "--dry-run"], {
      cwd: root,
      env: { MEDIA_ROOT: mediaRoot, MEDIA_SYNC_TARGET: "" },
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "References: 1 | Files: 0 | Errors: 1 | Orphans: 0",
    );
    expect(result.stdout).not.toContain("MEDIA_SYNC_TARGET");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
