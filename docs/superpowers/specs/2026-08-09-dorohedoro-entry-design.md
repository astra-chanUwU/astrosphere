# Dorohedoro Manga Entry Design

## Goal

Publish Dorohedoro as a completed manga series with its supplied artwork and Chapter 001, using the existing Astro content model and image sanitization workflow.

## Content

- Series slug: `dorohedoro`
- Title: `Dorohedoro`
- Author and artist: Hayashida Q
- Publication year: 2000
- Status: completed
- Rating: explicit, with suggestive and gore tags included
- Format/origin: manga/original
- Tags: action, comedy, demons, drama, fantasy, gore, horror, magic, mystery, philosophical, post-apocalyptic, psychological, sci-fi, suggestive, zombies, seinen
- Cover: supplied banner image
- Gallery: all 23 supplied art images
- Chapter: `dorohedoro-chapter-001`, 29 pages, RTL reading direction

## Asset pipeline

Copy source assets into `public/manga/dorohedoro/`, convert the cover and gallery images to WebP with the repository's available image tooling, and run `bun run manga:sanitize` on the chapter directory at quality 85. The chapter metadata will reference numbered WebP pages at `/manga/dorohedoro/chapter-001`.

## Validation and publishing

The existing publishing guard must confirm every local cover, gallery, and chapter page exists. The production Astro build must succeed, followed by the configured Sites publishing flow using the existing project manifest.
