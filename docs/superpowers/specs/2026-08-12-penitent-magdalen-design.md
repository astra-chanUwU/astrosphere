# The Penitent Magdalen Art Entry

## Scope

Add a short published gallery-style art entry for Georges de La Tour’s *The Penitent Magdalen*. The entry uses the supplied image as its hero and keeps the writing focused on candlelight, the mirror, the skull, and the red drapery as signs of penitence and vanitas.

## Content shape

- Collection: `artifacts`
- Type: `image-set`
- Layout: `gallery`
- Sphere: `art`
- Asset: local JPEG copied into `public/media/art/la-tour-penitent-magdalen/`
- No trails, related artifacts, or application-code changes

## Verification

Run `bun run astro check` and `bun run build` after adding the content and asset. Confirm the generated artifact can resolve its hero image and that the content schema accepts the frontmatter.
