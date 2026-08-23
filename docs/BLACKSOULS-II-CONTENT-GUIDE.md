# BLACKSOULS II Content Guide

This guide explains how to create or repair BLACKSOULS II character, area, ending, fairytale, and H-scene content from an external guide—especially FGGuides—without losing the source article’s structure.

Agents should also follow [the efficient content/media workflow](./agent-workflows.md), especially its external-media and validation rules.

The goal is a faithful local adaptation, not a summary or a redesigned essay. Preserve the source’s order, headings, wording, route conditions, screenshots, and image placement unless there is a specific editorial reason to change them.

## Source-first workflow

1. Open the complete source article in a browser and inspect the rendered article, not only its search snippet or page metadata.
2. Record the source outline before writing: title, date, updated date, Contents entries, heading levels, subsection order, and any special dividers such as `DLC3`.
3. Read the article from top to bottom and make an image map. For every image, record the source section and the paragraph or interaction it illustrates.
4. Extract the prose and image order together. Never collect all images into a separate list and attach them to a generic Gallery later.
5. Adapt links to local pages where the project has an equivalent. Do not paste source-site character URLs into content when an internal artifact exists.
6. Add frontmatter and local media references, then compare the rendered page against the source again.

FGGuides may return an HTTP 403 to one retrieval method while remaining available in a browser or with a normal browser user-agent. If direct web retrieval fails, use the in-app browser or a focused `curl` request with a browser user-agent. Do not treat a blocked fetch as permission to reconstruct the article from memory.

## Preserve the source hierarchy

The source article’s hierarchy is part of its meaning. A typical BLACKSOULS II character page uses this shape:

```text
# Character
  introduction
  Contents
## Appearances | BS2
### Meeting the Character
### All Bonfire Conversations
### Optional event or minigame
### In the Dungeon
## Misc | BS2
### Boss or route interaction
### Ending interaction
## H Scenes | BS2
## Personality
## Design
## Gallery
```

Keep source section names and order. If the source has a `DLC3` divider inside the bonfire section, retain it in that position. Do not turn source subsections into a long unbroken block of paragraphs, and do not move route-specific material into a generalized “Additional information” section.

The Contents block should reflect the actual headings. Verify that every entry points to the matching rendered heading and that heading levels remain nested correctly.

## Place images where the source places them

Use the source article as an annotated sequence:

```text
section heading
explanation of interaction
related screenshot or screenshot group
next interaction
related screenshot or screenshot group
```

For example, in the Cheshire Cat article:

- the meeting screenshots appear before the dialogue choices;
- the free-items screenshot follows the gift list;
- each bonfire screenshot follows its named location’s conversation;
- the three Playing With the Cheshire Cat screenshots stay in that section;
- the Dungeon screenshots stay in the Dungeon section;
- the Dinah screenshots stay with the Dinah fight subsection;
- the two H-scene screenshots stay with their corresponding H-scene entries;
- only the three promotional images remain in Gallery.

An image is not automatically a gallery image because it is visual. Treat an artifact’s `hero` as its banner, `media` entries as supporting media, and body figures as editorial illustrations. Do not repeat the same file in all three places without a clear reason.

Use real Markdown/HTML line breaks between figures. Never write literal `\\n` text between `<figure>` elements.

## Media handling

Heavy binaries must stay outside the repository under `MEDIA_ROOT/images` (locally `/Users/astrochan/Documents/Workstation/astrosphere-media/images`). Store optimized local copies there, preferably as WebP, and reference them from content with root-relative URLs:

```md
<figure>
<img src="/media/images/black-souls-ii-cheshire-cat/meeting-the-cheshire-cat-1.webp" alt="Meeting the Cheshire Cat, 1" loading="lazy" decoding="async" />
<figcaption>Meeting the Cheshire Cat, 1</figcaption>
</figure>
```

Do not copy the gallery into `public/` to solve local 404s. Astro already routes `/media/images/*` to the external image-set root.

Use stable, descriptive filenames derived from the source caption. Keep the same order as the source. Every referenced file must exist in the external media root, and every local image used in the article should have one corresponding content reference.

## Frontmatter conventions

Use the existing artifact schema. A typical page includes:

```yaml
slug: black-souls-ii-character-name
title: "Character Name"
type: essay
status: published
summary: "A concise description of the source guide’s subject and coverage."
publishedAt: "YYYY-MM-DD"
spheres: [games]
tags: [black-souls, black-souls-ii, characters, guide]
hero:
  kind: image
  src: /media/images/black-souls-ii-character-name/hero.webp
  alt: "Character Name in BLACKSOULS II."
related: [black-souls-ii-characters, black-souls-ii]
sourceUrl: https://fgguides.com/blacksouls/character-path/
notes: "Adapted from the source guide; spoilers and adults-only content may be present."
```

Use the source publication date when it is known, and record later updates in notes or the project’s established metadata rather than inventing a new date. Keep source attribution factual and brief. Do not claim that a page is “source-faithful” if major source sections or inline image relationships are missing.

## Links and terminology

- Preserve the source’s game terminology, place names, item names, ending letters, route conditions, and quoted dialogue.
- Correct obvious formatting or HTML extraction damage, but do not silently rewrite the author’s meaning.
- Convert source links to local artifact links when the corresponding page exists.
- If no local page exists, retain the name as plain text rather than pasting an external creator or character URL into the article.
- Keep explicit, violent, coercive, and spoiler-heavy material under the appropriate adults-only tags and notes; do not remove route information merely because it is uncomfortable.

## Verification checklist

Before handoff:

- [ ] The article title and introduction match the source.
- [ ] Contents entries match the actual heading structure and order.
- [ ] No source subsection has been collapsed into an undifferentiated text block.
- [ ] Every source image group is placed beneath the section it documents.
- [ ] The final Gallery contains only images that are actually gallery material.
- [ ] Image references are root-relative and use `/media/images/...`.
- [ ] No heavy image binaries were added to the repository.
- [ ] Every referenced image has a corresponding WebP in `MEDIA_ROOT/images`.
- [ ] Image-reference count equals unique-reference count unless intentional duplication is documented.
- [ ] `bun run astro check` exits successfully with zero errors.
- [ ] `bun run media:validate` reports no errors.
- [ ] The local page is opened beside the source page for a final visual comparison.

Useful checks:

```sh
bun run astro check
rg -n '^## |^### |^#### |^<figure>|/media/images/' src/content/artifacts/essays/black-souls-ii-*.md
```

The Cheshire Cat page is the reference implementation for this workflow: `/artifacts/black-souls-ii-cheshire-cat`.
