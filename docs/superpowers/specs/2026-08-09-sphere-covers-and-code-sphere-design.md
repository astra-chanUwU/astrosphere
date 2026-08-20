# Sphere Covers and Code Sphere Design

## Goal

Give the six current public spheres visual cover images, rename Independent Systems to Code Sphere with the approved description, and remove Artificial Nature without leaving broken content references.

## Scope

- Add the supplied images to `public/media/spheres/` using stable, descriptive filenames.
- Add image covers to Code, Games, Anime, Old Internet, Art, and Iran.
- Update `SphereCard.astro` to render a cover image when present, with alt text and a layout that keeps the existing card metadata readable.
- Rename only the display title of `independent-systems` to `Code Sphere`; keep its slug unchanged so existing links and references continue to work.
- Remove `src/content/spheres/artificial-nature.md`.
- Remove the deleted sphere from parent metadata, trails, and sphere references. Preserve published content by assigning `Slow Orbit` to Code Sphere and keeping the published garden essay under Old Internet. Draft garden content may use the existing Field Images sphere.
- Update the sphere-page regression test to assert the deleted route is absent and the Code Sphere route still builds.

## Image mapping

| Sphere | Asset |
| --- | --- |
| Code Sphere | `code-sphere-pic.png` |
| Games | `game-sphere-pic.webp` |
| Anime | `anime-sphere-pic.png` |
| Old Internet | `old-internet-pic.webp` |
| Art | `art-sphere-pic.png` |
| Iran | `iran-sphere-pic.jpg` |

## Design

Sphere frontmatter will use the existing `cover` media schema with root-relative public paths, meaningful alt text, and a brief credit noting the image was supplied for the AstroSphere sphere cover. `SphereCard` will place the image above the card text with `width: 100%`, a consistent aspect ratio, `object-fit: cover`, and a modest border treatment matching the existing visual language. Cards without covers will continue to render normally.

Artificial Nature is removed as a public collection entry. `Old Internet` and `Field Images` become top-level spheres by removing their deleted parent reference. Published route metadata is kept valid by removing Artificial Nature from the published Ways of Entering trail, moving Slow Orbit to Code Sphere, and retaining the garden essay in Old Internet. Draft garden records and documentation examples will no longer reference the deleted slug.

## Verification

- Run focused tests for sphere page output and content references.
- Run the full test suite and production build.
- Inspect the generated sphere pages for the six cover paths, Code Sphere title/summary, and absence of the Artificial Nature route.
