# Souls on the Banks of the Acheron Art Essay

## Goal

Add a concise, informative Art-sphere essay about Adolf Hirémy-Hirschl’s *Souls on the Banks of the Acheron* (1898), using the supplied painting image as the artifact’s hero image.

## Content shape

- Publish as an `essay` artifact using the existing content schema.
- Keep the body short: introduce the artist, date, medium, scale, mythological setting, and the painting’s basic visual drama, then invite the reader to observe the image and form their own interpretation.
- Avoid exhaustive symbolism or over-explaining; the image should remain the primary experience.
- Use the Belvedere collection record as the source link for factual metadata.

## Project integration

- Add the supplied image to `public/media/art/adolf-hiremy-hirschl/souls-on-the-banks-of-the-acheron-1898.jpg`.
- Add a published Markdown artifact at `src/content/artifacts/essays/souls-on-the-banks-of-the-acheron.md`.
- Associate the artifact with the existing `art` sphere and focused tags for the artist, Symbolism, mythology, and painting.
- Use the existing `feature` layout and `hero` media pattern so the current artifact route renders it without component changes.
- Include an image credit noting the Belvedere collection/source context and critical-commentary use.

## Verification

- Validate the content collection schema through the project’s build/check command.
- Confirm the new asset exists at the root-relative path referenced by frontmatter.
- Confirm the generated artifact route is `/artifacts/souls-on-the-banks-of-the-acheron`.
