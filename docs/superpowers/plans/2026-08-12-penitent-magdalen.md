# The Penitent Magdalen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a short published gallery-style artifact for Georges de La Tour’s *The Penitent Magdalen*.

**Architecture:** Extend the existing artifact content collection with one Markdown entry and one locally served image asset. Reuse the existing `image-set` and `gallery` schema values; do not change Astro components or routing.

**Tech Stack:** Astro content collections, Markdown frontmatter, local public media, Bun, TypeScript.

## Global Constraints

- Use the existing `art` sphere.
- Keep the entry JavaScript-free and application-code-free.
- Store media under `public/media/art/` and reference it with a root-relative URL.
- Do not modify Git state.

---

### Task 1: Add the art asset and content entry

**Files:**
- Create: `public/media/art/la-tour-penitent-magdalen/the-penitent-magdalen.jpg`
- Create: `src/content/artifacts/essays/penitent-magdalen-la-tour.md`

- [ ] Copy the supplied JPEG into the new public media directory.
- [ ] Add valid artifact frontmatter with `type: image-set`, `layout: gallery`, `status: published`, `spheres: [art]`, hero metadata, source credit, and a concise visual note.
- [ ] Keep the body focused on candlelight, mirror, skull, red cloth, and the painting’s suspended mood.

### Task 2: Verify the content

**Files:**
- Verify: `src/content/artifacts/essays/penitent-magdalen-la-tour.md`
- Verify: `public/media/art/la-tour-penitent-magdalen/the-penitent-magdalen.jpg`

- [ ] Run `bun run astro check`.
- [ ] Run `bun run build`.
- [ ] Confirm both commands exit successfully and the build resolves the local hero asset.
