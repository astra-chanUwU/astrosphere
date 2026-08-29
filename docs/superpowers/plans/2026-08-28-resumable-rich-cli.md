# Resumable Video Optimization and Rich CLI Implementation Plan

**Goal:** Add explicit safe resume semantics to anime optimization and a shared rich terminal experience to AstroSphere commands.

**Architecture:** Keep media operations independent of presentation. Extend the optimizer's plan with reuse/create classifications, then introduce a dependency-free terminal session used by `media.ts` and `content.ts`. Interactive and plain renderers consume the same task state.

**Spec:** `docs/superpowers/specs/2026-08-28-resumable-rich-cli-design.md`

## Constraints

- Existing create-only behavior remains the default.
- Resume never overwrites an existing output.
- Sources and `MEDIA_ROOT/.astrosphere/` remain private and read-only except operation records/staging.
- Rich output must degrade to deterministic plain text.
- Implementation follows red-green-refactor with focused tests.

## Work

1. Add failing CLI and optimizer tests for `--resume`, reuse planning, invalid/unknown output refusal, missing-output installation, and operation records.
2. Implement optimizer resume planning and no-replace installation while retaining strict default collisions.
3. Add failing terminal tests for timing, ETA, spinner frames, interactive redraws, plain output, and width handling.
4. Implement shared terminal formatting/session primitives and migrate media/content entry points.
5. Update anime workflow documentation and command help.
6. Run focused tests, `astro check`, and the Luluco resume dry-run once.
