# Witch Hat Atelier Chapter Reorganization Implementation Plan

> **For agentic workers:** Execute this plan inline with bounded checkpoints; do not delegate or modify optimizer code.

**Goal:** Split the managed Witch Hat Atelier volumes 1–14 into their 81 official story chapters, while preserving every page, the existing RTL reader behavior, and the later chapters 82–95.

**Architecture:** Rebuild the managed media as one directory per chapter with locally renumbered WebP pages. Rename the existing volume frontmatter entries to chapter entries, move the existing chapter 82–95 routes to their canonical chapter-numbered paths, and remove the obsolete volume-based paths only after checksum/count verification.

**Tech Stack:** Astro content collections, Bun media tooling, WebP files under `MEDIA_ROOT/manga/tongari-boushi-no-atelier`, shell/Python standard-library migration helpers, `bun run media:validate`, and `bun run astro check`.

**Spec:** `docs/manga-chapter-splitting.md` plus the locally inspected contents pages and the researched official volume/chapter mapping.

## Global Constraints

- Use official chapter membership and local printed contents-page offsets; never split by equal page counts.
- Preserve every source image exactly once; preserve WebP format, page order, RTL direction, and published status.
- Keep front matter before Chapter 1 with that volume’s first chapter and trailing bonus/special pages with that volume’s final chapter.
- Do not modify optimizer code or any other manga.
- Do not delete the old media until new media has passed exact count/checksum verification; move obsolete media to a precisely named temporary backup first.
- Finish with `bun run media:validate` reporting zero errors and zero orphans, then one `bun run astro check`.

## Boundary Table

Source page starts are 1-based local filenames read from each volume’s contents page. The first listed chapter absorbs pages 001–002; the final listed chapter absorbs the volume remainder, including any bonus/special pages.

| Volume | Chapters and source starts |
| ---: | :--- |
| 1 | 1: 1, 2: 67, 3: 105, 4: 137, 5: 173; source ends 211 |
| 2 | 6: 1, 7: 37, 8: 73, 9: 101, 10: 131, 11: 165; source ends 192 |
| 3 | 12: 1, 13: 35, 14: 65, 15: 95, 16: 129, 17: 157; source ends 190 |
| 4 | 18: 1, 19: 29, 20: 61, 21: 91, 22: 123, 23: 153; source ends 188 |
| 5 | 24: 1, 25: 37, 26: 67, 27: 87, 28: 121, 29: 155; source ends 188 |
| 6 | 30: 1, 31: 33, 32: 51, 33: 85, 34: 119, 35: 153; source ends 173 |
| 7 | 36: 1, 37: 41, 38: 77, 39: 111, 40: 145; source ends 173 |
| 8 | 41: 1, 42: 29, 43: 55, 44: 87, 45: 113; source ends 157 |
| 9 | 46: 1, 47: 27, 48: 55, 49: 89, 50: 121, 51: 149; source ends 172 |
| 10 | 52: 1, 53: 21, 54: 49, 55: 77, 56: 105, 57: 131; source ends 159 |
| 11 | 58: 1, 59: 31, 60: 59, 61: 87, 62: 115; source ends 155 |
| 12 | 63: 1, 64: 29, 65: 55, 66: 81, 67: 103, 68: 129; source ends 187 |
| 13 | 69: 1, 70: 35, 71: 67, 72: 87, 73: 115, 74: 141, 75: 155; source ends 187 |
| 14 | 76: 1, 77: 25, 78: 51, 79: 85, 80: 103, 81: 149; source ends 169 |

## Tasks

### Task 1: Freeze and verify source inventory

**Files:** Read-only inspection of the 14 managed volume directories and their 14 volume Markdown entries.

- [ ] Confirm each source directory contains the page count in the boundary table.
- [ ] Confirm each source filename is a three-digit WebP from `001.webp` through the declared final page.
- [ ] Confirm existing chapter 82–95 directories and Markdown entries are complete before route migration.

### Task 2: Prepare chapter media

**Files:** Create temporary chapter directories under `/Users/astrochan/Documents/Workstation/astrosphere-media/manga/tongari-boushi-no-atelier/.chapter-rebuild/`; do not modify repository source files yet.

- [ ] Copy each source page into its assigned chapter directory, renumbering from `001.webp` for every chapter.
- [ ] Include each source page exactly once according to the boundary table.
- [ ] Verify each copied page byte-for-byte against its source assignment and verify chapter page counts sum to each original volume count.

### Task 3: Stage content and route metadata

**Files:** `src/content/manga/chapters/tongari-boushi-no-atelier-volume-001.md` through `...-volume-014.md`; `src/content/manga/chapters/tongari-boushi-no-atelier-chapter-082.md` through `...-chapter-095.md`.

- [ ] Convert the 14 volume entries into chapter 1–81 entries with `slug`, `number`, `title`, `pagePath`, and page metadata aligned to the new chapter directories.
- [ ] Preserve `readingDirection: rtl` and `status: published`; use `Chapter N` titles because the supplied contents pages identify chapters numerically but do not provide separate prose titles.
- [ ] Update existing chapter 82–95 entries so their numbers, filenames, and page paths are canonical (`chapter-082` through `chapter-095`) without changing their page content.
- [ ] Ensure no two entries claim the same `number` or `pagePath`.

### Task 4: Atomically switch managed media

**Files:** Only `/Users/astrochan/Documents/Workstation/astrosphere-media/manga/tongari-boushi-no-atelier`.

- [ ] Move the verified rebuilt chapter directories into the managed series directory.
- [ ] Move the old volume directories to `/Users/astrochan/Documents/Workstation/astrosphere-media/.temporary-witch-hat-atelier-volume-backup/` as a precise rollback backup.
- [ ] Move existing chapters 82–95 to their canonical chapter-numbered directories.
- [ ] Confirm all 95 canonical chapter directories exist and old volume routes are absent before deleting the temporary rebuild workspace.

### Task 5: Validate and finish

- [ ] Run `bun run media:validate`; require zero errors and zero orphan warnings.
- [ ] Run `bun run astro check` once.
- [ ] Verify the sum of chapter page counts is unchanged at 2,847 pages and report the 81-chapter reorganization plus any preserved rollback backup.
