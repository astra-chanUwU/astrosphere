# Content Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect published artifacts, spheres, trails, and signals through validated, editorially meaningful navigation.

**Architecture:** Keep content frontmatter as the source of truth. Extend the content query layer with published signal lookups and trail targets, then render those inverse relationships on sphere and artifact pages. Allow trails to name a signal explicitly when an external resource is a purposeful stop.

**Tech Stack:** Astro 7, TypeScript, Astro Content Collections, Bun.

## Global Constraints

- Only published targets may be rendered as navigable content.
- Existing artifact and signal sphere assignments remain authoritative.
- Artifact-to-signal matches require at least one shared tag.
- No dependencies are added.

---

### Task 1: Extend and validate the content graph

**Files:**
- Modify: `src/content.config.ts`
- Modify: `src/types/content.ts`
- Modify: `src/lib/content.ts`

**Interfaces:**
- Produces `TrailItem` support for `signal` entries.
- Produces `getSignalsForSphere(sphereSlug)` and `getSignalsForArtifact(artifact)`.
- Produces `TrailItemTarget` support for signal entries.

- [ ] **Step 1: Write the failing validation case**

Add a trail item with `kind: signal` to a temporary fixture and run `bun astro check`; it should fail before the schema supports the new kind.

- [ ] **Step 2: Implement the schema and queries**

Expand `trailItemSchema.kind` to include `signal`; resolve signal targets in `getTrailItemTargets`; validate and publish-guard signal trail targets; filter published signals by sphere and artifact tag overlap.

- [ ] **Step 3: Verify collection behavior**

Run: `bun astro check`

Expected: no diagnostics.

### Task 2: Render reciprocal connections

**Files:**
- Modify: `src/pages/spheres/[slug].astro`
- Modify: `src/pages/artifacts/[slug].astro`
- Modify: `src/pages/trails/[slug].astro`

**Interfaces:**
- Consumes the Task 1 query functions and trail target union.
- Produces visible sphere signals, artifact signals/trails, and external trail stops.

- [ ] **Step 1: Add sphere signal rendering**

Use `getSignalsForSphere` and `SignalCard` after the artifact section, rendering no empty section when no published signals exist.

- [ ] **Step 2: Add artifact continuation rendering**

Use shared-tag signal matches and containing trails. Render each section only when it has results.

- [ ] **Step 3: Add signal trail stop rendering**

Render signal items as external links with the same explanatory note treatment as internal trail items.

- [ ] **Step 4: Verify templates**

Run: `bun astro check`

Expected: no diagnostics.

### Task 3: Add intentional trail exits and verify production

**Files:**
- Modify: `src/content/trails/ghost-in-the-shell-orbit.md`
- Modify: `src/content/trails/ways-of-entering.md`

**Interfaces:**
- Consumes signal trail item support from Task 1.
- Produces curated, context-specific exits to the official Ghost in the Shell source and EFChat.

- [ ] **Step 1: Add only evidenced signal stops**

Add `the-ghost-in-the-shell-2026` after the related Ghost in the Shell artifact and `efchat` after the quiet-web note, each with a concise purpose note.

- [ ] **Step 2: Run production validation**

Run: `bun astro check && bun run build`

Expected: type check and build complete successfully.
