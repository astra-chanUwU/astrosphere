# Resumable Video Optimization and Rich CLI Design

## Goal

Make interrupted anime optimization safely resumable and give every AstroSphere-owned terminal command a coherent space-console presentation with accurate progress, elapsed time, and approximate ETA.

## Scope

The shared presentation applies to `media:*` and `content:*`. Long-running work receives animation and measured timing; short commands use the same headers, phases, statuses, and summaries without artificial delay. The implementation stays dependency-free and uses Bun's terminal/process primitives.

## Terminal behavior

Interactive terminals receive cyan/violet AstroSphere headers, an orbiting Unicode spinner, named phases, responsive progress bars, active-item labels, elapsed time, approximate ETA, and clear success/warning/error summaries. A renderer owns one multi-line live region so updates do not leave duplicate lines behind. Completed phases become permanent output.

Redirected output, CI, `NO_COLOR`, and `--plain` use stable line-oriented text with no cursor movement or animation. `--plain` is accepted by AstroSphere command entry points and is removed before command-specific parsing. Terminal teardown always restores the cursor, including errors and interrupts.

ETA is based on measured completed units plus the active item's reported fractional progress. It displays `estimating...` until progress is sufficient and is explicitly approximate. Rendering is rate-limited and adapts bar widths and labels to the terminal width.

## Resume behavior

`bun run media:optimize video <source-root> --manifest <file> --resume` enables continuation. Without `--resume`, an existing final `videos` directory remains a collision.

Resume planning still parses the complete manifest, resolves and probes every source, and rejects ambiguous selectors. Each existing manifest destination is verified as VP9 Profile 0, 8-bit `yuv420p`, stereo-or-mono Opus WebM with acceptable dimensions, duration, and seekability. Valid existing outputs are classified as `reuse`; missing outputs are `transcode` or `remux`. Invalid existing outputs stop before encoding and are never replaced automatically. Unrecognized files beneath the title's `videos` directory also stop the operation so resume cannot bless an unknown mixed tree.

Dry-run reports reused and planned outputs. Apply stages and verifies all missing outputs privately, then installs only those files using no-replace filesystem operations. Existing public outputs and sources remain untouched. An interruption may leave newly installed verified files, which a later `--resume` re-verifies and reuses. Operation records include reused, created, rejected, original/output byte counts, and elapsed milliseconds.

For the current Space Patrol Luluco tree, a resume dry-run is expected to verify seven existing outputs and plan the remaining twenty when those files are valid.

## Errors and cancellation

Failures name the phase, active item, cause, unchanged state, and safest retry command when applicable. Invalid existing media is a hard stop. `Ctrl-C` restores terminal state and leaves sources and pre-existing outputs untouched.

## Testing

Focused tests cover `--resume` and `--plain` parsing, strict create-only behavior, reuse/missing/invalid/unknown output handling, no-replace installation, operation records, deterministic interactive/plain rendering, fake-clock elapsed/ETA calculations, narrow terminals, Unicode fallback, `NO_COLOR`, redirected output, and content-command presentation. Existing media transaction tests continue to protect prior behavior. Final verification includes focused Bun tests, one `astro check`, and a Luluco `--resume --dry-run`; no transcode, synchronization, Git operation, or source deletion is part of verification.
