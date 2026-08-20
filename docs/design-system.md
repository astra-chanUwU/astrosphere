# AstroSphere design system

## Visual direction

AstroSphere is a quiet editorial archive: warm paper, restrained borders, generous space, and system typography that prioritizes reading. Its visual atmosphere comes from rhythm and material contrast, not animation or decorative interfaces.

## Tokens and layout

`src/styles/tokens.css` owns repeated visual values. The base palette uses `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-border`, `--color-accent`, and `--color-accent-warm`. Sphere palette values only alter an accent marker or border; body text always uses the high-contrast core text token.

Use the serif stack for long-form headings and reading text, and the sans stack for navigation and metadata. `--reading-width` constrains prose; `--content-width` permits indexes and media to breathe. Page gutters, section spacing, font sizes, line heights, and radii all use tokens.

## Components

- `BaseLayout` owns document structure, global CSS, skip navigation, and chrome.
- Header and footer own stable archive navigation and identity.
- Cards present existing collection entries only; they do not contain archive-specific copy.
- `ArtifactMeta` renders only available metadata.
- `MediaFrame` treats media as first-class content with captions, controls, and fallback links.
- `RelatedArtifacts` receives resolved entries rather than resolving relationships itself.

Use scoped CSS in components for local composition. Put only shared resets, typography, layout primitives, focus behavior, and tokens in global styles. Do not add a token unless a visual value has a repeated need, and do not create an abstraction before at least two real pages need it.

## Accessibility and behavior

Reading quality comes before atmosphere. Use semantic headings, landmarks, a skip link, visible keyboard focus, descriptive links, captions, meaningful alt text, and media controls. Motion is optional enhancement and must respect reduced-motion preferences.

The site remains useful with JavaScript disabled. JavaScript is allowed only when CSS and semantic HTML cannot provide the interaction or accessibility behavior; it is not used for navigation, discovery, or reading.

## Archive principles

1. Reading quality comes before atmosphere.
2. Every artifact must be reachable by a stable URL.
3. Spheres are places, not decorative tags.
4. Motion is optional enhancement.
5. Media is content, not ornament.
6. Components should emerge from real pages.
7. Do not introduce a token without a repeated visual need.
8. Do not add a dependency for a problem CSS or Astro can solve.
9. Empty states should feel intentional.
10. The site must remain useful with JavaScript disabled.
