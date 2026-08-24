# Doujinshi grouping guide

Use this guide when several one-shot doujinshi entries appear to belong to one numbered family or named collection.

## Find grouping candidates

Start with `rg` across `src/content/manga/series`, `src/content/manga/chapters`, manifests, and `MEDIA_ROOT/manga`. Compare:

- normalized title roots, including `Vol.`, `Volume`, `Part`, `FINAL`, `Zenpen`, and `Kouhen` variants;
- authors and artists, including spelling and slug differences;
- fandom/origin and meaningful shared tags;
- page counts and chapter media directories;
- cover/banner assets and existing gallery art.

Treat matching names alone as a candidate, not proof. A shared creator or character can still indicate separate one-shots. Do not merge suspected duplicates until page-level comparison or authoritative source metadata resolves the ambiguity.

## Group safely

When the works are clearly one family:

1. Choose one existing series slug as the canonical page, preferably the shortest stable slug with a useful existing route.
2. Keep every work as its own chapter with a unique positive `number`.
3. Change only each chapter's `series` and ordering metadata unless a route migration is explicitly requested.
4. Preserve each chapter's existing `pagePath`, page count, reading direction, and managed media directory. This avoids moving or recompressing large binaries.
5. Remove former standalone series records only after confirming every chapter now points to the canonical series and no content references the removed slugs.
6. Use the collection title for the series page, but retain the exact work title in each chapter's `title`.

For example, FetiColle is represented as one `FetiColle Vol. 1–7` series with seven chapters, while `Zenpen` and `Kouhen` remain in their chapter titles.

## Chapter names must remain specific

Never let a grouped doujinshi page display the parent series title for every chapter. The chapter list must render `chapter.data.title`, not `series.data.title`.

Avoid generic generated labels such as `Doujinshi` after metadata review. Replace them with the supplied or verified work title, for example `Omankoformers Spotlight Soundwave`.

Standardize punctuation and zero-padding only when it improves consistency without changing identity. `FetiColle VOL. 02` can become `FetiColle Vol. 2`; meaningful labels such as `Vol. 6 Zenpen` and `Vol. 7 Kouhen` should stay.

## Cover/banner art

The series `cover` is the primary banner/cover. If the owner wants a cleaner gallery, it may also be repeated as the first `art` entry even though that duplicates the cover. Use the existing managed path, meaningful alt text, and the same root-relative `/manga/...` namespace:

```yaml
cover:
  src: /manga/example/cover.webp
  alt: Cover art for Example
art:
  - src: /manga/example/cover.webp
    alt: Cover art for Example
```

Add the remaining work covers after it in chapter order. Do not copy these binaries into `public/`.

## Verification

Before handoff:

- confirm every regrouped chapter points to an existing canonical series slug;
- confirm chapter numbers are unique and ordered;
- confirm every cover/art reference exists;
- run `bun run astro check`;
- run `bun run media:validate` when managed media references changed, and distinguish pre-existing warnings from new errors.
