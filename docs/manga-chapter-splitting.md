# Splitting a large manga volume into chapters

Use this guide when an existing manga entry contains one very large ordered image set, such as a 600-page omnibus, and the reader should expose the story as separate chapters.

## Choose the right workflow

- If the source is one or more chapter-labelled CBZ/ZIP volumes, use the existing importer:

  ```sh
  bun run media:add manga-volume <source...> --series <series-slug>
  ```

- Use this split workflow only when the pages are already managed as one volume and need to be divided without changing their order.

Do not split by equal page counts. Manga chapters have uneven lengths, and front matter, end matter, advertisements, interviews, and bonus pages may surround the story.

## Establish the boundaries

1. Read the existing chapter frontmatter and locate the exact external media directory under `MEDIA_ROOT/manga/<series-slug>/`.
2. Confirm the intended chapter count and names from reliable internet sources when available. Internet sources are useful for chapter names and count, but they are not reliable enough to determine local image offsets.
3. Inspect the actual ordered images and record each chapter's first page. Prefer the printed title page (`CHAPTER N`) and verify the previous chapter's end page where present.
4. Include every source image exactly once. If pages precede Chapter 1, keep them with Chapter 1 unless the project has an explicit extras model. Keep trailing bonus material with the final chapter for the same reason.
5. Write a boundary table before changing files:

   | Chapter | Source start | Source end | New page count |
   | ---: | ---: | ---: | ---: |
   | 1 | 1 | 51 | 51 |

   Replace the example row with the real boundaries. The final end must equal the original page count, and each next start must be the previous end plus one.

## Rebuild the managed media

Create one directory per chapter beside the old volume directory:

```text
MEDIA_ROOT/manga/<series-slug>/chapter-001/001.webp
MEDIA_ROOT/manga/<series-slug>/chapter-001/002.webp
...
MEDIA_ROOT/manga/<series-slug>/chapter-002/001.webp
```

Renumber pages locally from `001` in every chapter. Preserve the original extension and dimensions. Copy pages first, then verify every copied page against its source (checksum or byte comparison). Do not remove the original volume until the comparison succeeds.

After the new content files exist and validation passes, move the obsolete volume directory out of `MEDIA_ROOT` to a precisely named temporary backup. This keeps rollback possible while preventing orphan warnings. Delete that exact backup only after the user confirms it is no longer needed; never delete a broad media root or namespace.

## Create the chapter entries

Create one Markdown file per chapter in `src/content/manga/chapters/`. Use:

```yaml
slug: <series-slug>-chapter-001
series: <series-slug>
number: 1
title: <chapter title>
publishedAt: "YYYY-MM-DD"
pagePath: /manga/<series-slug>/chapter-001
pageExtension: webp
pageCount: <local count>
pageWidth: <source width>
pageHeight: <source height>
readingDirection: rtl
status: published
```

Keep the chapter slug, page path, directory name, and zero-padded number aligned. Use the actual chapter title, not a guessed title or a volume label. Preserve the series' reading direction and publication status.

## Verify before handoff

Check all of the following once, after the final mutation:

```sh
bun run media:validate
bun run astro check
```

The media validator must report zero errors and zero orphans. Also confirm that:

- the sum of chapter `pageCount` values equals the original page count;
- every chapter directory contains exactly its declared number of pages;
- the first and last source pages are represented;
- the old volume entry and old media path are no longer referenced;
- chapter navigation uses the new `/chapter-###` routes.

## Common mistakes

- Dividing a volume into equal-sized chunks.
- Trusting a publisher's printed page numbers as local image filenames.
- Dropping the first few contents/title pages or the final bonus pages.
- Leaving the old volume directory in `MEDIA_ROOT`, which creates orphan warnings.
- Keeping global source filenames inside each chapter instead of renumbering locally.
- Manually changing reader code when the existing manga reader already supports separate chapters.
