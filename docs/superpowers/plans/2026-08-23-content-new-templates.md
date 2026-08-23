# Content Template Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one small command that creates valid, editable draft templates for essays, doujinshi, and image sets.

**Architecture:** A strict parser selects a template type and slug, while a focused module renders the matching current collection shape and writes it exclusively. Templates contain no heavy media and print the appropriate follow-up workflow.

**Tech Stack:** Bun, TypeScript, Astro content conventions, `yaml`

**Spec:** `docs/superpowers/specs/2026-08-23-batch-doujinshi-image-set-import-design.md`

## Global Constraints

- Templates are drafts and must pass current content schemas.
- Existing files are never overwritten.
- Templates contain no copied or embedded binaries.
- Creator entries use `{ name, slug }`.
- Use `apply_patch` for repository edits.
- Do not run Git commands without explicit authorization.

## File Structure

- `src/lib/content/templates.ts`: supported template types, rendering, destination selection, and exclusive creation.
- `scripts/content.ts`: strict `content:new` CLI and user-facing output.
- `tests/content-templates.test.ts`: renderer, destination, and overwrite tests.
- `tests/content-cli.test.ts`: public CLI parsing and package alias tests.
- `package.json`: `content:new` alias.

---

### Task 1: Draft template creation

**Files:**
- Create: `src/lib/content/templates.ts`
- Create: `tests/content-templates.test.ts`

**Interfaces:**
- Produces: `ContentTemplateType = "essay" | "doujinshi" | "image-set"`.
- Produces: `renderContentTemplate(type, slug, date): string`.
- Produces: `createContentTemplate({ type, slug, projectRoot, date }): Promise<{ path: string; next: string }>`.

- [ ] **Step 1: Write failing renderer and overwrite tests**

```ts
expect(renderContentTemplate("essay", "new-essay", new Date("2026-08-23")))
  .toContain("slug: new-essay\ntitle: New Essay\ntype: essay\nstatus: draft");
expect(renderContentTemplate("doujinshi", "new-book", date))
  .toContain("format: doujinshi");
expect(renderContentTemplate("image-set", "new-gallery", date))
  .toContain("status: draft");
await expect(createContentTemplate(existingOptions)).rejects.toThrow("already exists");
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/content-templates.test.ts`

Expected: FAIL because the template module does not exist.

- [ ] **Step 3: Implement deterministic valid drafts**

```ts
const destinations: Record<ContentTemplateType, (root: string, slug: string) => string> = {
  essay: (root, slug) => join(root, "src/content/artifacts/essays", `${slug}.md`),
  doujinshi: (root, slug) => join(root, "src/content/manga/series", `${slug}.md`),
  "image-set": (root, slug) => join(root, "src/content/image-sets", `${slug}.md`),
};

export const createContentTemplate = async (options: CreateTemplateOptions) => {
  const path = destinations[options.type](resolve(options.projectRoot), options.slug);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderContentTemplate(options.type, options.slug, options.date), { flag: "wx" });
  return { path, next: nextInstruction(options.type, options.slug) };
};
```

Essay drafts include a non-empty summary, current date, one `personal` sphere, empty tags/media/related, and a starter heading. Doujinshi drafts include completed/original/explicit defaults, `Unknown` creator objects, no cover, and a short editable body. Image-set drafts include non-empty summary, current date, explicit rating, gallery layout, and empty media.

- [ ] **Step 4: Run template tests**

Run: `bun test tests/content-templates.test.ts`

Expected: PASS.

### Task 2: Public `content:new` command

**Files:**
- Create: `scripts/content.ts`
- Create: `tests/content-cli.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ContentTemplateType`, `createContentTemplate`.
- Produces: `bun run content:new <essay|doujinshi|image-set> <slug>`.

- [ ] **Step 1: Write failing CLI tests**

```ts
expect(packageJson.scripts["content:new"]).toBe("bun scripts/content.ts new");
expect(await runContent(["new", "essay", "my-essay"])).toMatchObject({ exitCode: 0 });
expect((await runContent(["new", "video", "my-video"])).stderr)
  .toContain("type must be essay, doujinshi, or image-set");
expect((await runContent(["new", "essay", "Not A Slug"])).stderr)
  .toContain("lowercase letters, numbers, and hyphens");
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/content-cli.test.ts`

Expected: FAIL because the script and alias do not exist.

- [ ] **Step 3: Implement the strict CLI and alias**

```ts
const [command, type, slug, ...extra] = Bun.argv.slice(2);
if (command !== "new" || extra.length > 0) throw new Error(help);
if (!types.includes(type as ContentTemplateType))
  throw new Error("type must be essay, doujinshi, or image-set");
if (!slugPattern.test(slug ?? ""))
  throw new Error("slug must use lowercase letters, numbers, and hyphens only");
const result = await createContentTemplate({
  type: type as ContentTemplateType,
  slug: slug!,
  projectRoot: process.cwd(),
  date: new Date(),
});
console.log(`Created draft: ${result.path}`);
console.log(result.next);
```

Add `"content:new": "bun scripts/content.ts new"` to `package.json` and document the three examples in `README.md`.

- [ ] **Step 4: Verify templates and the complete project**

Run:

```text
bun test tests/content-templates.test.ts tests/content-cli.test.ts
bun run astro check
bun run build
```

Expected: all tests pass, Astro check has zero errors, and the build succeeds.
