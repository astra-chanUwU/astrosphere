# AstroSphere

> A curated digital universe of media, ideas, tools, and underground internet culture.

---

# Vision

AstroSphere is a discovery-first publishing platform built with AstroJS.

The project combines:

- editorial writing
- manga/media libraries
- coding knowledge
- movie reviews
- curated internet resources
- top lists
- underground web culture
- regional/cultural spheres like IranSphere

The goal is to create:

```txt
A fast, static-first ecosystem for exploration and discovery.
```

AstroSphere is NOT intended to feel like:

- a simple blog
- a traditional CMS website
- a social feed
- a generic media database

Instead, it should feel like:

```txt
A living digital universe.
```

---

# Core Philosophy

## Discovery First

AstroSphere prioritizes:

```txt
Discovery > Chronology
```

The homepage and navigation should encourage:

- exploration
- rabbit holes
- interconnected content
- taxonomy-driven browsing
- curated recommendations

The experience should feel:

- editorial
- archival
- interconnected
- personal
- atmospheric

---

# Technical Stack

## Core Stack

- Astro
- TypeScript
- Content Collections
- TailwindCSS
- Markdown
- Selective MDX
- Minimal SolidJS islands

## Philosophy

- static-first
- markdown-native
- minimal JavaScript
- desktop-first UX
- scalable filesystem architecture
- low-maintenance publishing

Avoid initially:

- databases
- SSR
- React-heavy SPA architecture
- complex CMS systems

---

# Content Philosophy

## Markdown First

Primary content format:

```txt
.md
```

Use MDX only when necessary.

Recommended split:

```txt
90% Markdown
10% MDX
```

Use MDX for:

- interactive components
- manga-specific layouts
- spoilers
- galleries
- embedded media
- advanced formatting

---

# Project Structure

Recommended architecture:

```txt
astrosphere/
├── public/
│   ├── media/
│   │   ├── manga/
│   │   ├── covers/
│   │   ├── banners/
│   │   └── avatars/
│   │
│   ├── fonts/
│   └── icons/
│
├── content/
│   ├── blog/
│   ├── coding/
│   ├── manga/
│   ├── reviews/
│   ├── top/
│   └── resources/
│
├── src/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── styles/
│   ├── lib/
│   └── content.config.ts
│
├── scripts/
├── docs/
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

---

# Naming Conventions

## URLs

Use:

```txt
kebab-case
```

Examples:

```txt
/top/torrent-sites
/manga/bloom-into-you
```

Avoid:

- camelCase
- snake_case

---

## Files & Folders

Use:

```txt
kebab-case
```

Examples:

```txt
content/top/torrent-sites.md
content/resources/iranian-tech-links.md
```

---

## Components

Use:

```txt
PascalCase
```

Examples:

```txt
MangaCard.astro
FeaturedHero.astro
TopListCard.astro
```

---

## Variables

Use:

```txt
camelCase
```

---

# Content Collections

## Planned Collections

```txt
content/
  blog/
  coding/
  manga/
  reviews/
  top/
  resources/
```

Potential future:

```txt
novels/
guides/
bookmarks/
notes/
```

---

# Manga Architecture

## Recommended Structure

```txt
content/manga/
  bloom-into-you/
    meta.md
    chapters/
      001.mdx
      002.mdx
```

## Manga URLs

Recommended format:

```txt
/manga/bloom-into-you/001
```

---

# Manga Media Structure

```txt
public/media/manga/
  bloom-into-you/
    chapter-001/
      001.webp
      002.webp
```

## Important Rule

Always zero-pad numbers:

```txt
001
002
003
```

NOT:

```txt
1
2
3
```

Reason:

- proper filesystem sorting
- scalable organization
- predictable automation

---

# Top Lists

Preferred route structure:

```txt
/top
```

Examples:

```txt
/top/torrent-sites
/top/yuri-manga
/top/vpn-services
```

Top lists are intended to become:

- evergreen discovery content
- editorial anchors
- rabbit-hole entry points
- curated recommendation hubs

---

# IranSphere

## Concept

IranSphere is a cultural/regional sphere inside AstroSphere.

Route:

```txt
/iransphere
```

Potential content:

- Persian tech resources
- internet/privacy guides
- VPN resources
- Persian software mirrors
- regional recommendations
- underground internet culture

## Frontmatter Example

```yaml
sphere:
  - iran
```

---

# Homepage Philosophy

The homepage should function as:

- portal
- discovery engine
- editorial front page
- ecosystem map
- media dashboard

NOT:

```txt
Just a chronological blog feed
```

---

# Homepage Inspirations

## Primary Inspiration

### The Verge

Use as inspiration for:

- editorial hierarchy
- homepage rhythm
- section grouping
- discovery pacing

NOT for direct visual copying.

---

## Additional Inspirations

### AniList

- metadata density
- discovery systems

### MangaDex

- manga update flows
- chapter organization

### Letterboxd

- media recommendation atmosphere

### Old Internet Portals / Hacker News

- efficient information density
- rabbit-hole navigation
- internet culture feeling

---

# Homepage Direction

Recommended homepage sections:

```txt
Featured
Explore the Spheres
Latest Across the Sphere
Top Lists
Trending Tags
Recent Manga Chapters
Internet Corner
```

The homepage should communicate:

```txt
“This site contains a universe worth exploring.”
```

---

# Image Strategy

## Critical Decision

Avoid runtime image processing.

Prefer:

```txt
Static pre-optimized assets
```

Use Astro Image only for:

- logos
- covers
- banners
- thumbnails

Do NOT aggressively process manga pages through Astro.

Serve manga pages as static optimized assets.

---

# Hosting Philosophy

## Recommended Hosting

```txt
Cloudflare Pages
```

Reasons:

- static-first friendly
- global CDN
- low cost
- scalable
- ideal for Astro

Workflow:

```txt
Edit markdown
Git push
Auto deploy
```

---

# Current Project Direction

AstroSphere is evolving into:

```txt
A discovery-first editorial media ecosystem.
```

Combining:

- magazine structure
- archive systems
- portal-style exploration
- strong taxonomy
- cultural internet atmosphere
- minimal-JS architecture
- static-first scalability

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `pnpm install`             | Installs dependencies                            |
| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
| `pnpm build`           | Build your production site to `./dist/`          |
| `pnpm preview`         | Preview your build locally, before deploying     |
| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro -- --help` | Get help using the Astro CLI                     |