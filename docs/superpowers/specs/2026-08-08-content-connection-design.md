# Content Connection Design

## Goal

Make AstroSphere's published content navigable as a coherent web of spheres, artifacts, trails, and signals without manufacturing editorial relationships.

## Model

- Spheres remain the shared thematic hub.
- Artifacts and signals connect to spheres through their existing `spheres` fields.
- Artifact pages show explicit related artifacts and the relevant trails and signals discovered through shared spheres/tags.
- Sphere pages show their artifacts, trails, and signals.
- Trails can optionally include a signal as a deliberate external stop.

## Rules

- Preserve existing frontmatter as the editorial source of truth.
- Do not add speculative artifact-to-artifact links.
- Use exact tag overlap for artifact-to-signal matches, with shared sphere as the fallback only when an explicit trail includes the signal.
- Validate all collection references and publish only links whose targets are published.

## Verification

Run Astro type checking and the production build after the data model and templates are updated.
