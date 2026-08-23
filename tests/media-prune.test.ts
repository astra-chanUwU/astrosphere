import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandRunner } from "../src/lib/media/process";
import {
  confirmPrune,
  createPruneManifest,
  createRemotePruneScript,
  executePruneManifest,
  parseRemoteMediaTarget,
  syncMedia,
} from "../src/lib/media/sync";

const operationId = "11111111-1111-4111-8111-111111111111";
const target = parseRemoteMediaTarget(
  "astro@example.test:/srv/astrosphere/media",
);

const runPruneScript = async (root: string) => {
  const child = Bun.spawn(["sh", "-s", "--", root, operationId], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write(createRemotePruneScript());
  child.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

test("accepts only an explicit yes response", async () => {
  expect(await confirmPrune("Delete?", async () => "yes")).toBe(true);
  expect(await confirmPrune("Delete?", async () => " yes ")).toBe(true);
  expect(await confirmPrune("Delete?", async () => "y")).toBe(false);
  expect(await confirmPrune("Delete?", async () => "YES")).toBe(false);
  expect(await confirmPrune("Delete?", async () => "")).toBe(false);
});

test("remote pruning validates every manifest entry before moving any file", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-prune-preflight-"));
  try {
    await mkdir(join(root, "manga/book"), { recursive: true });
    await mkdir(join(root, "images/old"), { recursive: true });
    await mkdir(join(root, ".astrosphere"));
    await writeFile(join(root, "manga/book/001.webp"), "1234");
    await writeFile(join(root, "images/old/a.webp"), "12345");
    await writeFile(
      join(root, `.astrosphere/prune-${operationId}.tsv`),
      "4\tmanga/book/001.webp\n4\timages/old/a.webp\n",
    );

    const result = await runPruneScript(root);
    expect(result.exitCode).not.toBe(0);
    expect(await readFile(join(root, "manga/book/001.webp"), "utf8")).toBe(
      "1234",
    );
    expect(await readFile(join(root, "images/old/a.webp"), "utf8")).toBe(
      "12345",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote pruning rejects symlinks and leaves public media untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-prune-symlink-"));
  try {
    await mkdir(join(root, "manga/book"), { recursive: true });
    await mkdir(join(root, "images/old"), { recursive: true });
    await mkdir(join(root, ".astrosphere"));
    await writeFile(join(root, "manga/book/001.webp"), "1234");
    await symlink(
      join(root, "manga/book/001.webp"),
      join(root, "images/old/link.webp"),
    );
    await writeFile(
      join(root, `.astrosphere/prune-${operationId}.tsv`),
      "4\timages/old/link.webp\n",
    );

    const result = await runPruneScript(root);
    expect(result.exitCode).not.toBe(0);
    expect(existsSync(join(root, "images/old/link.webp"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote pruning removes only reviewed files and its operation data", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-prune-success-"));
  try {
    await mkdir(join(root, "manga/book"), { recursive: true });
    await mkdir(join(root, "images/keep"), { recursive: true });
    await mkdir(join(root, ".astrosphere"));
    await writeFile(join(root, "manga/book/old.webp"), "1234");
    await writeFile(join(root, "images/keep/cover.webp"), "12345");
    await writeFile(
      join(root, `.astrosphere/prune-${operationId}.tsv`),
      "4\tmanga/book/old.webp\n",
    );

    const result = await runPruneScript(root);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, "manga/book/old.webp"))).toBe(false);
    expect(await readFile(join(root, "images/keep/cover.webp"), "utf8")).toBe(
      "12345",
    );
    expect(
      existsSync(join(root, `.astrosphere/prune-${operationId}.tsv`)),
    ).toBe(false);
    expect(existsSync(join(root, `.astrosphere/prune-${operationId}`))).toBe(
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote pruning restores already moved files when a later move fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-prune-rollback-"));
  try {
    await mkdir(join(root, "manga/book"), { recursive: true });
    await mkdir(join(root, ".astrosphere"));
    await writeFile(join(root, "manga/book/old.webp"), "1234");
    await writeFile(
      join(root, `.astrosphere/prune-${operationId}.tsv`),
      "4\tmanga/book/old.webp\n4\tmanga/book/old.webp\n",
    );

    const result = await runPruneScript(root);
    expect(result.exitCode).not.toBe(0);
    expect(await readFile(join(root, "manga/book/old.webp"), "utf8")).toBe(
      "1234",
    );
    expect(existsSync(join(root, `.astrosphere/prune-${operationId}`))).toBe(
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uploads a private TSV and executes the fixed remote transaction", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-prune-upload-"));
  const calls: Array<{ argv: string[]; stdin?: string }> = [];
  let uploadedTsv = "";
  const runner: CommandRunner = async (argv, options) => {
    calls.push({ argv, stdin: options?.stdin?.toString() });
    if (argv[0] === "rsync") uploadedTsv = await readFile(argv.at(-2)!, "utf8");
    return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
  };
  const manifest = createPruneManifest({
    target,
    local: [],
    remote: [{ path: "images/old/a.webp", bytes: 20 }],
    operationId,
    generatedAt: "2026-08-23T00:00:00.000Z",
  });
  try {
    await executePruneManifest({ manifest, target, runner });
    expect(uploadedTsv).toBe("20\timages/old/a.webp\n");
    expect(calls.map(({ argv }) => argv[0])).toEqual(["ssh", "rsync", "ssh"]);
    expect(calls[0]?.stdin).toContain("mkdir -p");
    expect(calls[2]?.stdin).toBe(createRemotePruneScript());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a prune dry run creates no manifest and never prompts or mutates remotely", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-sync-dry-prune-"));
  const commands: string[][] = [];
  let confirmations = 0;
  let presentedManifests = 0;
  const runner: CommandRunner = async (argv) => {
    commands.push(argv);
    const output =
      argv.includes("--list-only") && commands.length === 2
        ? "10|manga/book/001.webp\n20|images/old/a.webp\n"
        : "";
    return {
      exitCode: 0,
      stdout: new TextEncoder().encode(output),
      stderr: "",
    };
  };
  try {
    await mkdir(join(root, "manga/book"), { recursive: true });
    await writeFile(join(root, "manga/book/001.webp"), "1234567890");
    const result = await syncMedia({
      root,
      target: target.value,
      dryRun: true,
      prune: true,
      runner,
      confirm: async () => {
        confirmations += 1;
        return true;
      },
      onManifest: () => {
        presentedManifests += 1;
      },
    });

    expect(result.manifest?.files).toEqual([
      { path: "images/old/a.webp", bytes: 20 },
    ]);
    expect(result.pruned).toBe(false);
    expect(confirmations).toBe(0);
    expect(presentedManifests).toBe(1);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("--dry-run");
    expect(existsSync(join(root, ".astrosphere"))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
