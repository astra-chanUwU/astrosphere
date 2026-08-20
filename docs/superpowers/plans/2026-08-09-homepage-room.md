# Homepage Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic AstroSphere home index with an editorial room built around a chosen focus and connected artifacts.

**Architecture:** A small homepage configuration module names the focus and constellation by artifact slug. A resolver in the same module turns published artifacts into safe homepage selections. `src/pages/index.astro` consumes those selections and uses existing content components and design tokens.

**Tech Stack:** Astro 7, TypeScript, Bun test, CSS.

## Global Constraints

- Keep content static-first; do not add dependencies or a content collection.
- Use a dedicated homepage configuration rather than the generic `featured` flag.
- Omit unavailable configured entries safely.
- Preserve mobile layout and semantic links.

---

### Task 1: Add homepage selection configuration and resolver

**Files:**
- Create: `tests/homepage.test.ts`
- Create: `src/config/homepage.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: an array of entries with `id` and `data.slug`.
- Produces: `getHomepageSelections(entries)` returning `{ focus, constellation }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { getHomepageSelections } from "../src/config/homepage";

describe("getHomepageSelections", () => {
  test("returns the configured focus and unique constellation without repeating focus", () => {
    const entries = [
      { id: "focus", data: { slug: "focus" } },
      { id: "one", data: { slug: "one" } },
      { id: "two", data: { slug: "two" } },
    ];

    expect(getHomepageSelections(entries, { focusSlug: "focus", constellationSlugs: ["focus", "one", "one", "missing", "two"] })).toEqual({
      focus: entries[0],
      constellation: [entries[1], entries[2]],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/homepage.test.ts`

Expected: FAIL because `src/config/homepage.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type HomepageSelectionConfig = {
  focusSlug: string;
  constellationSlugs: string[];
};

export function getHomepageSelections<T extends { data: { slug: string } }>(entries: T[], config: HomepageSelectionConfig) {
  const bySlug = new Map(entries.map((entry) => [entry.data.slug, entry]));
  const focus = bySlug.get(config.focusSlug);
  const seen = new Set(focus ? [focus.data.slug] : []);
  const constellation = config.constellationSlugs.flatMap((slug) => {
    const entry = bySlug.get(slug);
    if (!entry || seen.has(slug)) return [];
    seen.add(slug);
    return [entry];
  });
  return { focus, constellation };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/homepage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/homepage.test.ts src/config/homepage.ts package.json
git commit -m "feat: add homepage editorial selections"
```

### Task 2: Build the homepage room

**Files:**
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `homepageConfig` and `getHomepageSelections` from `src/config/homepage.ts`, published archive data from `src/lib/content.ts`.
- Produces: a responsive homepage with focus, constellation, orientation, trail, spheres, and random discovery.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

test("homepage uses the editorial selection resolver", async () => {
  const source = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
  expect(source).toContain("getHomepageSelections");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/homepage.test.ts`

Expected: FAIL because the homepage has not imported the resolver.

- [ ] **Step 3: Write minimal implementation**

Replace the current list-first layout with semantic sections for the room intro, current focus, constellation, archive orientation, one featured trail, selected spheres, and random discovery. Use the focus hero image when present and retain a text-only fallback.

- [ ] **Step 4: Run tests and build**

Run: `bun test && bunx astro check && bun run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro tests/homepage.test.ts
git commit -m "feat: redesign homepage as an archive room"
```
