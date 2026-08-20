# Artifact hero frame design

## Goal

Keep the full lead image visible on artifact pages while ensuring the beginning of the article remains visible without scrolling on ordinary desktop viewports.

## Design

- Apply the treatment only to the lead `hero` media rendered on an artifact page.
- Place the hero in a shared frame with a viewport-aware maximum height.
- Center images within that frame with `object-fit: contain`, preserving their full composition without cropping or distortion.
- Use the existing surface color behind unused space so portrait and landscape images have a deliberate, consistent presentation.
- Keep body media, captions, video, audio, and embeds on their existing layouts.

## Acceptance criteria

- A tall hero cannot occupy the whole initial viewport on a typical desktop screen.
- The hero’s full image remains visible.
- The opening article text begins immediately after the hero and is reachable without a large, image-dependent scroll.
- The site continues to build successfully.
