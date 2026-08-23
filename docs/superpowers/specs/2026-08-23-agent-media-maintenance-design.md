# Agent Media Maintenance Design

**Date:** 2026-08-23
**Status:** Approved design; implementation paused before public CLI completion

> `media:maintain` is not currently a supported public command. Use the documented add, remove, optimize, validate, and sync workflows until implementation resumes.

## Purpose

AstroSphere's unified media CLI can import, optimize, validate, remove, serve, and synchronize media, but it does not provide a reusable way to maintain the live managed library. The recent cleanup required custom one-off commands to classify orphans, convert referenced JPEG and PNG files to WebP, rewrite content references, validate the replacement state, and permanently delete obsolete files.

This change adds one agent-oriented maintenance workflow that makes those operations deterministic and repeatable. It is designed primarily for autonomous agents, uses versioned JSON instead of prose parsing, and intentionally supports permanent deletion. Every mutation still requires a separate immutable plan followed by apply-time revalidation.

## Goals

- Add one `media:maintain` command with separate `plan` and `apply` operations.
- Detect valid orphaned managed media and referenced non-WebP media.
- Convert supported referenced media to verified WebP without recompressing existing WebP files.
- Rewrite explicit media references and implicit manga reader extensions safely.
- Permanently delete planned orphans and replaced originals only after the replacement state validates.
- Produce stable JSON responses and immutable manifests suitable for autonomous agents.
- Reject stale plans, unsafe paths, changed inputs, collisions, and concurrent apply operations.
- Keep execution efficient on large libraries through one-pass planning, candidate-only hashing, and bounded parallel conversion.
- Make interrupted operations resumable and completed operations idempotent.

## Non-goals

This phase does not:

- redesign `media:add`, `media:remove`, `media:optimize`, `media:validate`, or `media:sync`;
- add a CMS, browser administration interface, MCP server, daemon, or scheduler;
- perform hash-based or perceptual deduplication;
- recompress existing WebP files;
- optimize AVIF inputs;
- modify draft-only media policy beyond the validator's existing published-content rules;
- run Git commands, commit, push, deploy, or synchronize the VPS;
- replace backups or make permanent deletion recoverable.

## Public workflow

The package command is:

```text
bun run media:maintain plan
bun run media:maintain apply <operation-id>
```

Planning accepts:

```text
--quality <1..100>  WebP quality recorded in the plan; default 85
```

Applying accepts:

```text
--jobs <positive integer>  Maximum parallel conversions
```

The default job count is derived from available processors and bounded to avoid excessive memory pressure. Execution order and final output do not depend on the job count.

There is no one-shot mode, confirmation prompt, `--yes`, or `--force`. `plan` is the read-only preview. `apply` is the only mutating operation and accepts only an operation ID created beneath the configured private maintenance directory.

## JSON command contract

Each invocation writes exactly one versioned JSON envelope to stdout. Phase-level progress may be written to stderr, but per-file prose is omitted. Nonzero exits also emit a JSON envelope so agents do not need to parse stack traces.

Successful planning returns one of:

- `status: "clean"` when no orphan deletion or conversion is needed;
- `status: "planned"` with the operation ID, manifest location, counts, source bytes, estimated output bytes when available, and planned deletion bytes.

Successful apply returns one of:

- `status: "applied"` with conversion, rewrite, deletion, byte, and final-validation totals;
- `status: "already-applied"` when the same completed operation is reapplied.

Failures include a stable error category, machine-readable code, concise message, operation ID when available, and safe contextual fields. Usage, configuration, validation, optimization, and maintenance-state failures use consistent nonzero exit categories. Raw stack traces remain disabled by default.

## Private operation storage

Maintenance data lives only beneath:

```text
MEDIA_ROOT/.astrosphere/maintenance/
```

Each operation owns:

```text
<operation-id>.manifest.json
<operation-id>.state.json
<operation-id>/staging/
```

The manifest is immutable after publication. The state file is an atomically replaced journal recording the current phase, completed conversions, activated replacements, completed deletions, final result, and failure details. Staging belongs exclusively to its operation and is never served, synchronized, or included in orphan counts.

Applying acquires an exclusive maintenance lock through atomic filesystem creation. Another apply fails with a machine-readable busy result. Read-only planning may run concurrently, but its manifest becomes stale if another operation changes any planned input before apply.

## Manifest contract

The version 1 manifest records:

- schema version, operation ID, generation time, and requested quality;
- canonical project and media root identities;
- validator baseline totals;
- affected content paths and SHA-256 hashes;
- each conversion source's root-relative path, public URL, byte size, modification time, SHA-256, detected format, intended WebP path, and referencing content fields;
- each deletion target's root-relative path, public URL, byte size, SHA-256, and reason (`orphan` or `replaced-original`);
- expected intermediate and final file, reference, error, and orphan totals;
- expected content rewrites and destination collision checks.

Filesystem targets are stored relative to approved roots. Absolute paths from a manifest are never trusted. Apply resolves every path through the existing managed-path policy and rejects traversal, symlinks, root substitution, portable-name collisions, and destinations outside the managed trees or approved content files.

## Planning

Planning performs one managed-library scan. It reuses the existing content loader, managed-reference collector, path resolver, format detection, and validator behavior.

The planner:

1. Validates configuration and the current published media library.
2. Refuses to create a plan when validation has missing, corrupt, unsafe, unsupported, or format-mismatch errors.
3. Classifies valid unreferenced managed files as permanent orphan deletions.
4. Classifies referenced JPEG, PNG, and GIF files as WebP conversions.
5. Leaves existing WebP and AVIF files unchanged; AVIF is reported but not treated as maintenance failure.
6. Maps every conversion to a unique WebP destination and rejects collisions rather than renaming or choosing a winner.
7. Plans exact reference rewrites. Explicit frontmatter and body URLs use simultaneous exact replacements so overlapping legacy names cannot corrupt each other. Manga reader pages update the chapter's single `pageExtension` field once.
8. Hashes only conversion inputs, deletion targets, and affected content files.
9. Checks that enough temporary disk space exists for staged output plus a conservative margin.
10. Writes the immutable manifest atomically, or returns `clean` without creating an empty operation.

Draft-only or archived content continues to follow the validator's existing publication rules. This command does not silently broaden which content establishes a live media reference.

## Apply lifecycle

Apply is a resumable state machine:

1. **Preflight**: load the immutable manifest, validate its schema and operation ownership, acquire the exclusive lock, and compare all affected paths, hashes, content files, roots, and destinations with the planned state.
2. **Stage**: convert JPEG and PNG with `cwebp`, GIF with `gif2webp`, and verify every staged output with `webpinfo`. Existing WebP files are never included. Conversion uses a bounded worker pool and the existing retained-input and output-verification primitives.
3. **Activate**: install verified WebP destinations without replacement, then atomically rewrite affected content files. Originals still exist during activation. Any failure removes operation-owned outputs and restores original content.
4. **Validate replacement state**: run full media validation. It must report no errors, and its orphan set must exactly equal the manifest's orphan and replaced-original deletion targets. Any extra or missing orphan stops and rolls back activation.
5. **Delete permanently**: unlink only the exact, revalidated manifest targets. Files are not moved to Trash or retained in quarantine. Empty directories created by those files may be removed only while walking upward inside the two managed roots; the roots themselves are never removed.
6. **Validate final state**: run full media validation again and require the manifest's expected final counts with zero errors and zero orphans.
7. **Complete**: atomically record the result, remove operation-owned staging, release the lock, and emit the final JSON response.

Before permanent deletion begins, failures are fully rolled back because originals remain available. Once deletion begins, the validated replacement state is authoritative. The journal records each successful unlink. Rerunning the same operation accepts an already absent target only when the operation journal records it or the activated replacement and content state still match the manifest, then continues remaining deletions and final validation.

An external mutation after permanent deletion begins can make recovery impossible. The command reports that state honestly and never claims rollback. This risk is accepted because project backups are the recovery mechanism.

## Efficiency model

- Planning walks content and managed media once.
- Routine inspection reads bounded headers and metadata; SHA-256 is limited to affected candidates and content files.
- Apply revalidates candidates instead of rescanning the entire library before conversion.
- Conversion uses bounded parallel workers and streams files rather than holding image bodies in memory.
- Progress is emitted by phase or coarse count, not once per file.
- Existing WebP files are untouched.
- Full library validation runs only at the two safety boundaries: immediately before deletion and after deletion.
- Manifest and state writes use atomic replacement and remain small relative to media data.

## Code organization

The existing `scripts/media.ts` remains the public entry point and gains a thin `maintain` dispatcher. Focused modules under `src/lib/media/` own:

- maintenance CLI argument parsing and JSON envelopes;
- manifest schema, serialization, hashing, and path validation;
- one-pass planning and reference-rewrite formation;
- exclusive locking and atomic state journaling;
- bounded conversion staging;
- activation, rollback, permanent deletion, resume, and final verification.

Existing validator, content-source, reference, path, image-format, optimizer, archive-capability, and process primitives are reused or narrowly extracted where needed. Maintenance orchestration does not duplicate their security policies.

The package adds `media:maintain` while preserving every current command and alias.

## Testing strategy

Automated tests use temporary repositories and media roots. They cover:

- deterministic versioned manifests and JSON response schemas;
- a clean no-op plan;
- one-pass orphan and non-WebP classification;
- candidate-only hashing;
- explicit and reader reference rewrites;
- overlapping legacy URLs and destination collisions;
- JPEG, PNG, and animated GIF conversion routing;
- bounded concurrency with deterministic results;
- changed files, content, roots, and destinations producing stale-plan failures;
- traversal, symlink, portable-name, and arbitrary-manifest rejection;
- insufficient disk-space refusal before conversion;
- exclusive apply locking;
- conversion, verification, activation, and content-write rollback;
- exact-orphan-set enforcement before deletion;
- permanent deletion and bounded empty-directory cleanup;
- interruption during deletion and idempotent resume;
- already-applied results;
- final zero-error, zero-orphan validation;
- unchanged behavior for existing media commands.

Final verification runs the full Bun test suite, focused media validation, Astro check, and production build. No test operates on the real external media root.

## Documentation sequence

Implementation and tests land before operational documentation is changed. After the command is verified, update:

- `AGENTS.md` and any scoped agent instruction files;
- `README.md`;
- media CLI help and package command references;
- VPS/deployment guidance where maintenance affects synchronization;
- relevant content and BLACKSOULS media guides.

The documentation will define the JSON plan/apply workflow, permanent-deletion semantics, autonomous-agent permissions, required validation, idempotent resume behavior, and the boundary that the command never commits, pushes, deploys, or synchronizes by itself.

Historical specifications and plans remain historical records rather than being rewritten to imply they originally included this command.

## Acceptance criteria

- `media:maintain plan` creates a safe immutable plan or reports a clean library.
- `media:maintain apply <operation-id>` performs only the exact current plan, with no prompt.
- Stale or unsafe plans mutate nothing.
- Supported referenced non-WebP files become verified WebP with correct content references.
- Planned orphans and replaced originals are permanently deleted only after exact replacement-state validation.
- Interrupted deletion resumes safely; completed operations are idempotent.
- Final media validation reports zero errors and zero orphans.
- Existing commands and public media URLs continue to work.
- Outputs are stable JSON suitable for autonomous agents.
- Documentation is updated only after implementation passes verification.
