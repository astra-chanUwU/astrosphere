import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runContent = async (args: string[], cwd: string) => {
  const child = Bun.spawn(
    ["bun", new URL("../scripts/content.ts", import.meta.url).pathname, ...args],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

test("exposes content:new and creates an essay draft", async () => {
  const packageJson = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(packageJson.scripts["content:new"]).toBe("bun scripts/content.ts new");
  const root = await mkdtemp(join(tmpdir(), "content-cli-"));
  try {
    const result = await runContent(["new", "essay", "my-essay", "--plain"], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("◆ content new");
    expect(result.stdout).toContain("Draft created");
    expect(result.stdout).toContain("Elapsed");
    expect(result.stdout).not.toContain("\u001b[");
    expect(await readFile(join(root, "src/content/articles/essays/my-essay.md"), "utf8"))
      .toContain("slug: my-essay");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsupported types and unsafe slugs", async () => {
  const root = await mkdtemp(join(tmpdir(), "content-cli-"));
  try {
    const type = await runContent(["new", "video", "my-video"], root);
    expect(type.exitCode).not.toBe(0);
    expect(type.stderr).toContain("type must be essay, doujinshi, or image-set");
    const slug = await runContent(["new", "essay", "Not A Slug"], root);
    expect(slug.exitCode).not.toBe(0);
    expect(slug.stderr).toContain("lowercase letters, numbers, and hyphens");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
