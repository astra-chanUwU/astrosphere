# Agent efficiency policy

This policy exists to prevent routine AstroSphere work from turning into expensive orchestration, repeated reviews, or unnecessary test loops. It applies to every coding agent working in this repository.

## Hard rules

1. **Single agent by default.** Complete routine content, media, documentation, cleanup, and bounded code changes directly.
2. **Never recommend subagent-driven development for this repository.** Delegation is allowed only when the user explicitly asks to use subagents after being warned that it increases usage. A generic “continue,” “proceed,” or approval of the task is not delegation permission.
3. **No process for process's sake.** Do not create a branch, worktree, design spec, implementation plan, ledger, review package, or task report for a bounded change unless the user explicitly requests it or the change genuinely introduces a new subsystem.
4. **One review path.** Self-review the changed files. Use an independent reviewer only when the user asks or when a compact review is necessary for security-sensitive, irreversible, or externally published behavior.
5. **Never run duplicate reviewers or reviewer/fixer loops.** Fix concrete findings directly and verify the affected behavior once.
6. **Use the existing command.** Prefer `content:new`, `media:add`, `media:remove`, `media:optimize`, `media:validate`, and `media:sync` over custom scripts or new infrastructure.
7. **Stay inside the request.** Do not expand a content/import/removal task into CLI redesign, architecture work, or unrelated cleanup.

Higher-priority system and developer instructions still apply. When one requires extra process, use the smallest compliant version and tell the user before starting a usage-heavy workflow.

## Task sizing

Classify work immediately:

| Size | Examples | Required process |
| --- | --- | --- |
| Routine | Add an essay, import supplied archives, remove a chapter, update documentation | Inspect, act, focused verification, handoff |
| Bounded code | Fix one command, parser, component, or testable behavior | Short in-chat design if required, direct implementation, focused tests |
| Cross-cutting | Change shared schemas, destructive storage behavior, deployment, authentication | Concise design and proportional verification |
| New subsystem | A genuinely new service or architecture | Ask before producing a spec or large plan |

Do not upgrade routine or bounded work merely because a heavyweight workflow is available.

## Testing budget

- While editing, run only the smallest test that proves the changed behavior.
- Documentation-only changes get link/text checks and at most one relevant documentation/instruction test.
- Content/media changes get `media:validate` when managed media is involved and one `astro check` at handoff.
- Code changes get focused tests first. Run the full suite once only when shared code changed, before an explicitly requested commit/release, or when the user asks.
- Never rerun a passing command against unchanged files.
- After a failure, fix the cause and rerun the failed scope. Do not restart every earlier check.
- Do not run build, Astro check, media validation, and the full test suite repeatedly as interchangeable proof. Each check must have a specific reason.

## Usage guardrails

- Keep tool output out of conversation unless it contains a decision, blocker, or failure the user needs.
- Give at most one short progress update per meaningful checkpoint. Do not narrate routine file reads, test lines, or review mechanics.
- If the user says usage is low—or the interface shows roughly 20% or less remaining—stop all optional research, delegation, independent review, and broad testing. Finish through the shortest safe path.
- At roughly 10% or less, do not begin an unrequested expansion. Complete the current bounded deliverable, state any genuine remainder in one sentence, and return control.
- If actual work grows beyond roughly twice the expected scope, stop, explain the newly discovered issue briefly, and propose the smallest alternative. Do not silently enter a large workflow.

## Efficient media and content work

Use [Efficient agent workflows](./agent-workflows.md) as the command cookbook.

For a normal request:

1. Use `rg` to locate the exact entry and references.
2. Read only the relevant content file, schema/example, and supplied source material.
3. Use the existing importer/template/removal command.
4. Validate once after the final mutation.
5. Report the result, counts, and checks concisely.

Do not read every historical spec, generate a new plan, or delegate routine manga, doujinshi, image-set, essay, or cleanup work.

## Git and handoff

- Do not run Git unless explicitly requested.
- When commit and push are requested, inspect the exact changed files, run proportional verification once, create clear commits, push, and confirm the branch is synchronized.
- The final response should normally contain only what changed, the relevant paths/URLs, verification results, and commit/push status.

## Final self-check

Before acting, ask:

- Can I finish this directly with an existing command?
- Am I adding orchestration the user did not request?
- Has this exact verification already passed on unchanged files?
- Is every tool call necessary to deliver the requested result?

If the efficient answer is simpler, use it.
