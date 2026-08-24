# Weeb Central chapter migration playbook

This guide records the reliable workflow learned while importing *Yuri no Hajimari wa Dorei Kara*. It is for agents performing an authorized migration into AstroSphere. Do not bypass login, bot protection, rate limits, robots rules, copyright restrictions, or access controls. Stop and ask for supplied files or permission when direct retrieval is not authorized.

## The main lesson

Treat Weeb Central as a source of chapter metadata and image URLs, not as a page-turning interface. The reader uses lazy loading, so a browser screenshot or visual scroll is not a complete download. Discover the complete chapter list first, then request the chapter’s image fragment directly and download the returned URLs.

## Discovery

The series page may show only a recent subset of chapters plus a “Show All Chapters” control. Never assume the visible HTML is the complete list.

Use the chapter-select request associated with the series:

```text
/series/{series-id}/chapter-select?current_chapter={chapter-id}
```

Extract every chapter URL and display name from that response. Record the result before downloading anything. The manifest should preserve decimal chapters exactly:

```json
{
  "number": "11.3",
  "chapterUrl": "https://weebcentral.com/chapters/{id}"
}
```

The chapter-select response is the source of truth for hidden middle chapters. For the example migration, the missing range was chapters 3.1 through 13, including 22 separate decimal or whole-number chapters.

## Extracting lazy-loaded pages

A chapter’s initial HTML may contain only the first image or no reader images at all. Request its image fragment:

```text
/chapters/{chapter-id}/images?is_prev=False&reading_style=long_strip&current_page=1
```

The returned HTML contains the complete ordered `<img src="…">` list for the long-strip reader. Parse the direct image URLs from that response. Do not infer page URLs from screenshots, viewport state, or the browser’s loaded-image cache.

Capture the expected page count before downloading. Then verify that the number of successfully downloaded files equals the number of discovered URLs.

## Download behavior

Use one staging directory per chapter and a small bounded concurrency limit. Sequential downloads are safest; a low limit such as 2–4 may be acceptable when the source permits it.

Every request should check:

- successful HTTP status;
- image content type;
- non-zero, plausible file size;
- retry with backoff for transient failures;
- successful image decoding before packaging.

Write temporary files first and rename them only after the response passes validation. Never let multiple agents write to the same final chapter directory. If one page fails, fail that chapter rather than silently producing a partial CBZ.

## CBZ naming rules

The repository importer recognizes chapter labels in archive entry names. Use these forms:

```text
Series Name - c3#1 (v1) - p001.png
Series Name - c3#2 (v1) - p001.png
Series Name - c11#3 (v1) - p001.png
Series Name - c12 (v1) - p001.png
```

The `#1`, `#2`, and `#3` suffixes represent decimal chapters 3.1, 3.2, and 3.3. Do not name them `chapter-3.1` inside the archive; the existing importer maps `c3#1` to `chapter-003-1`.

Page filenames must sort naturally and start at one with no gaps:

```text
p001.png
p002.png
p003.png
```

Keep one CBZ per chapter when importing a web reader. This makes retries, collision checks, and later removal straightforward.

## Importing into AstroSphere

First confirm the target series exists:

```sh
rg -n '^slug: yuri-no-hajimari-wa-dorei-kara$' src/content/manga/series
```

Import a directory containing only new, validated CBZs:

```sh
MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media \
  bun run media:add manga-volume /path/to/cbz-directory \
  --series yuri-no-hajimari-wa-dorei-kara
```

The importer refuses existing chapter media and chapter content. Use that collision failure as a safety signal. Do not delete or overwrite existing chapters to make a retry pass.

## Verification checklist

Before handoff, verify all of the following:

1. Chapter manifest count equals archive count.
2. Every archive passes `unzip -t`.
3. Every archive’s page count equals its source image URL count.
4. No page sequence has missing or duplicate numbers.
5. Generated chapter numbers preserve decimal ordering.
6. The target series media tree contains no temporary staging directory.
7. `bun run astro check` passes.
8. Run `MEDIA_ROOT=… bun run media:validate`; if it reports unrelated existing errors, separate those from errors in the newly imported series and report both clearly.

Do not declare success based only on the number of chapter Markdown files. A chapter entry with missing media is still a failed migration.

## Recovery and reruns

Keep the downloaded CBZs in a clearly named Downloads folder until validation and review are complete. For a failed chapter, delete only that chapter’s unimported staging/archive material and rerun it. For chapters already imported, inspect the exact collision before taking any replacement action. Replacement requires an explicit user request and the repository’s replacement workflow; it is not part of an ordinary migration retry.

## Agent handoff format

Report:

- source series and retrieval date;
- chapter numbers imported;
- archive count and total page count;
- Downloads archive path;
- generated content/media locations;
- verification commands and results;
- any unrelated pre-existing validation failures.

This keeps the next agent from confusing “the chapter list was visible” with “the complete source was discovered and verified.”
