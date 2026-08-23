# Unified Media Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the single media root, safe URL mapping, shared development server core, and unified Bun CLI shell used by every later media command.

**Architecture:** A small `src/lib/media/` package owns configuration, public-path resolution, MIME policy, and framework-neutral response planning. Thin adapters connect that core to Astro/Vite and `Bun.serve`; `scripts/media.ts` owns only command dispatch and presentation.

**Tech Stack:** Bun 1.2.20+, TypeScript 5.9, Astro 7, Node filesystem/path APIs, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`

## Global Constraints

- Use `MEDIA_ROOT=/absolute/path/to/astrosphere-media`; map `/manga/*` to `MEDIA_ROOT/manga/*` and `/media/images/*` to `MEDIA_ROOT/images/*`.
- Never serve, synchronize, or count `MEDIA_ROOT/.astrosphere/` as website media.
- Manga and doujinshi remain in the manga content domain and `/manga/*` URL namespace.
- Add no CLI framework.
- Standalone serving binds to `127.0.0.1`; only `GET` and `HEAD` are accepted.
- Keep all heavy binaries outside the repository; tests use temporary directories and tiny text fixtures only.
- Do not remove old scripts until their unified replacements are complete and verified in the final cleanup plan.

---

### Task 1: Unified configuration and layout

**Files:**
- Create: `src/lib/media/config.ts`
- Create: `src/lib/media/errors.ts`
- Create: `src/lib/media/types.ts`
- Test: `tests/media-config.test.ts`

**Interfaces:**
- Produces: `MediaLayout`, `MediaError`, `mediaExitCodes`, `exitCodeForMediaError(error)`, `requireMediaRoot(value?: string): string`, `getMediaLayout(value?: string): MediaLayout`, `requireMediaPort(value?: string): number`, and `requireMediaSyncTarget(value?: string): string`.
- Consumes: only Node path utilities and environment strings; no filesystem mutation.

- [ ] **Step 1: Write failing configuration tests**

```ts
import { expect, test } from "bun:test";
import { getMediaLayout, requireMediaPort, requireMediaRoot, requireMediaSyncTarget } from "../src/lib/media/config";
import { exitCodeForMediaError, MediaError } from "../src/lib/media/errors";

test("requires one absolute media root and derives private and public trees", () => {
  expect(() => requireMediaRoot("")).toThrow("Set MEDIA_ROOT");
  expect(() => requireMediaRoot("relative/media")).toThrow("absolute path");
  expect(getMediaLayout("/srv/astrosphere/media/")).toEqual({
    root: "/srv/astrosphere/media",
    manga: "/srv/astrosphere/media/manga",
    images: "/srv/astrosphere/media/images",
    operations: "/srv/astrosphere/media/.astrosphere",
  });
});

test("validates the optional standalone port", () => {
  expect(requireMediaPort(undefined)).toBe(4322);
  expect(requireMediaPort("8080")).toBe(8080);
  expect(() => requireMediaPort("0")).toThrow("1 to 65535");
});

test("requires a restricted rsync-style synchronization target", () => {
  expect(requireMediaSyncTarget("astro@example.test:/srv/astrosphere/media"))
    .toBe("astro@example.test:/srv/astrosphere/media");
  expect(() => requireMediaSyncTarget("example.test:relative")).toThrow("user@host:/absolute/path");
});

test("uses stable nonzero exit codes by failure category", () => {
  expect(exitCodeForMediaError(new MediaError("usage", "bad arguments"))).toBe(2);
  expect(exitCodeForMediaError(new MediaError("configuration", "bad root"))).toBe(3);
  expect(exitCodeForMediaError(new MediaError("validation", "missing file"))).toBe(4);
  expect(exitCodeForMediaError(new MediaError("optimization", "conversion failed"))).toBe(5);
  expect(exitCodeForMediaError(new MediaError("synchronization", "rsync failed"))).toBe(6);
  expect(exitCodeForMediaError(new Error("unexpected"))).toBe(1);
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `bun test tests/media-config.test.ts`

Expected: FAIL because `src/lib/media/config.ts` does not exist.

- [ ] **Step 3: Implement the exact configuration boundary**

```ts
// src/lib/media/errors.ts
export type MediaErrorKind = "usage" | "configuration" | "validation" | "optimization" | "synchronization";
export const mediaExitCodes = { usage: 2, configuration: 3, validation: 4, optimization: 5, synchronization: 6 } as const;
export class MediaError extends Error {
  constructor(public readonly kind: MediaErrorKind, message: string) {
    super(message);
    this.name = "MediaError";
  }
}
export const exitCodeForMediaError = (error: unknown): number => error instanceof MediaError ? mediaExitCodes[error.kind] : 1;

// src/lib/media/types.ts
export type MediaLayout = {
  root: string;
  manga: string;
  images: string;
  operations: string;
};

// src/lib/media/config.ts
export const requireMediaRoot = (value = Bun.env.MEDIA_ROOT): string => {
  const supplied = value?.trim();
  if (!supplied) throw new MediaError("configuration", "Set MEDIA_ROOT to the absolute path of the external media directory.");
  if (!isAbsolute(supplied)) throw new MediaError("configuration", "MEDIA_ROOT must be an absolute path.");
  return resolve(supplied);
};
export const getMediaLayout = (value = Bun.env.MEDIA_ROOT): MediaLayout => {
  const root = requireMediaRoot(value);
  return { root, manga: resolve(root, "manga"), images: resolve(root, "images"), operations: resolve(root, ".astrosphere") };
};
export const requireMediaPort = (value = Bun.env.MEDIA_PORT): number => {
  const port = value === undefined ? 4322 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new MediaError("configuration", "MEDIA_PORT must be an integer from 1 to 65535.");
  return port;
};
export const requireMediaSyncTarget = (value = Bun.env.MEDIA_SYNC_TARGET): string => {
  const supplied = value?.trim();
  if (!supplied || !/^[^@\s]+@[^:\s]+:\/[A-Za-z0-9._/-]*$/.test(supplied)) {
    throw new MediaError("configuration", "MEDIA_SYNC_TARGET must use user@host:/absolute/path format.");
  }
  return supplied.endsWith(":/") ? supplied : supplied.replace(/\/+$/, "");
};
```

Implement each comment literally with `node:path` helpers. Normalize trailing slashes through `resolve()`. The sync target regex must reject missing user, host, colon, absolute remote path, and whitespace.

- [ ] **Step 4: Run the focused test**

Run: `bun test tests/media-config.test.ts`

Expected: 4 tests pass.

- [ ] **Step 5: Commit the configuration unit**

```bash
git add src/lib/media/config.ts src/lib/media/errors.ts src/lib/media/types.ts tests/media-config.test.ts
git commit -m "feat: add unified media configuration"
```

---

### Task 2: Safe public media path resolution

**Files:**
- Create: `src/lib/media/paths.ts`
- Test: `tests/media-paths.test.ts`

**Interfaces:**
- Consumes: `MediaLayout` and `getMediaLayout()` from Task 1.
- Produces: `MediaNamespace`, `ResolvedMediaPath`, `resolveMediaUrl(source, root): ResolvedMediaPath`, `resolveMediaRequestPath(pathname, root): ResolvedMediaPath | undefined`, `contentTypeForMediaFile(pathname): string`, and `isManagedMediaUrl(source): boolean`.

- [ ] **Step 1: Write failing path and MIME tests**

```ts
import { expect, test } from "bun:test";
import { contentTypeForMediaFile, resolveMediaRequestPath, resolveMediaUrl } from "../src/lib/media/paths";

test("maps both public namespaces through one root", () => {
  expect(resolveMediaUrl("/manga/example/chapter-001/001.webp", "/srv/astrosphere/media")).toMatchObject({
    namespace: "manga",
    filePath: "/srv/astrosphere/media/manga/example/chapter-001/001.webp",
  });
  expect(resolveMediaUrl("/media/images/example/loop.gif", "/srv/astrosphere/media")).toMatchObject({
    namespace: "images",
    filePath: "/srv/astrosphere/media/images/example/loop.gif",
  });
});

test("passes unrelated requests and rejects traversal or private operations", () => {
  expect(resolveMediaRequestPath("/favicon.svg", "/srv/astrosphere/media")).toBeUndefined();
  expect(() => resolveMediaRequestPath("/manga/%2e%2e/secret.txt", "/srv/astrosphere/media")).toThrow("escapes MEDIA_ROOT");
  expect(() => resolveMediaRequestPath("/media/images/%2e%2e/.astrosphere/log", "/srv/astrosphere/media")).toThrow("escapes MEDIA_ROOT");
});

test("returns one MIME policy for all media", () => {
  expect(contentTypeForMediaFile("loop.GIF")).toBe("image/gif");
  expect(contentTypeForMediaFile("loop.webp")).toBe("image/webp");
  expect(contentTypeForMediaFile("still.avif")).toBe("image/avif");
  expect(contentTypeForMediaFile("notes.txt")).toBe("application/octet-stream");
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/media-paths.test.ts`

Expected: FAIL because `src/lib/media/paths.ts` does not exist.

- [ ] **Step 3: Implement prefix selection and containment checks**

```ts
export type MediaNamespace = "manga" | "images";
export type ResolvedMediaPath = { namespace: MediaNamespace; publicPath: string; filePath: string };

const routes = [
  { prefix: "/manga/", namespace: "manga" as const },
  { prefix: "/media/images/", namespace: "images" as const },
];

export const isManagedMediaUrl = (source: string) => routes.some(({ prefix }) => source.startsWith(prefix));
export const resolveMediaUrl = (source: string, root: string): ResolvedMediaPath => {
  const route = routes.find(({ prefix }) => source.startsWith(prefix));
  if (!route) throw new MediaError("validation", `Expected a managed media URL, received "${source}".`);
  const layout = getMediaLayout(root);
  const namespaceRoot = layout[route.namespace];
  const filePath = resolve(namespaceRoot, source.slice(route.prefix.length));
  const relation = relative(namespaceRoot, filePath);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new MediaError("validation", `Media path "${source}" escapes MEDIA_ROOT.`);
  }
  return { namespace: route.namespace, publicPath: source, filePath };
};
export const resolveMediaRequestPath = (pathname: string, root: string): ResolvedMediaPath | undefined => {
  const decoded = decodeURIComponent(pathname);
  return isManagedMediaUrl(decoded) ? resolveMediaUrl(decoded, root) : undefined;
};
export const contentTypeForMediaFile = (pathname: string): string => {
  switch (extname(pathname).toLowerCase()) {
    case ".avif": return "image/avif";
    case ".gif": return "image/gif";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
};
```

Containment must use `relative()` plus checks for `..`, `../`, platform separators, and absolute relative results. Do not normalize the URL before the containment check in a way that hides traversal. Explicitly reject any resolved candidate inside `layout.operations`.

- [ ] **Step 4: Run configuration and path tests together**

Run: `bun test tests/media-config.test.ts tests/media-paths.test.ts`

Expected: 6 tests pass.

- [ ] **Step 5: Commit the path resolver**

```bash
git add src/lib/media/paths.ts tests/media-paths.test.ts
git commit -m "feat: unify external media paths"
```

---

### Task 3: Shared response policy with Astro and Bun adapters

**Files:**
- Create: `src/lib/media/server.ts`
- Create: `tests/media-server.test.ts`
- Modify: `astro.config.mjs`
- Test: `tests/media-server.test.ts`

**Interfaces:**
- Consumes: `resolveMediaRequestPath()` and `contentTypeForMediaFile()` from Task 2.
- Produces: `MediaResponsePlan`, `planMediaResponse(options): Promise<MediaResponsePlan>`, and `createBunMediaFetch(root): (request: Request) => Promise<Response>`.
- Astro consumes `planMediaResponse()` through a thin Vite middleware adapter; no Bun-specific object crosses into Astro configuration.

- [ ] **Step 1: Write failing response-policy tests**

```ts
import { expect, test } from "bun:test";
import { planMediaResponse } from "../src/lib/media/server";

const regularFile = async () => ({ isFile: () => true });

test("plans files for both managed namespaces", async () => {
  const plan = await planMediaResponse({
    method: "GET",
    pathname: "/media/images/example/loop.gif",
    root: "/srv/astrosphere/media",
    statFile: regularFile,
  });
  expect(plan).toMatchObject({ kind: "file", status: 200, contentType: "image/gif" });
});

test("passes unrelated routes and handles media errors", async () => {
  expect(await planMediaResponse({ method: "GET", pathname: "/about", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toEqual({ kind: "next" });
  expect(await planMediaResponse({ method: "POST", pathname: "/manga/example/001.webp", root: "/srv/astrosphere/media", statFile: regularFile }))
    .toMatchObject({ kind: "error", status: 405 });
  expect(await planMediaResponse({ method: "GET", pathname: "/manga/example/missing.webp", root: "/srv/astrosphere/media", statFile: async () => { throw new Error("missing"); } }))
    .toMatchObject({ kind: "error", status: 404 });
});
```

- [ ] **Step 2: Run the test and confirm the missing server module failure**

Run: `bun test tests/media-server.test.ts`

Expected: FAIL because the shared server module does not exist.

- [ ] **Step 3: Implement the framework-neutral response plan and Bun adapter**

```ts
export type MediaResponsePlan =
  | { kind: "next" }
  | { kind: "error"; status: 400 | 404 | 405; message: string }
  | { kind: "file"; status: 200; filePath: string; contentType: string; headers: Record<string, string> };

export async function planMediaResponse(options: {
  method: string;
  pathname: string;
  root: string;
  statFile?: typeof import("node:fs/promises").stat;
}): Promise<MediaResponsePlan> {
  let resolved;
  try { resolved = resolveMediaRequestPath(options.pathname, options.root); }
  catch { return { kind: "error", status: 400, message: "Invalid media path" }; }
  if (!resolved) return { kind: "next" };
  if (options.method !== "GET" && options.method !== "HEAD") return { kind: "error", status: 405, message: "Method not allowed" };
  try {
    const info = await (options.statFile ?? stat)(resolved.filePath);
    if (!info.isFile()) return { kind: "error", status: 404, message: "Media not found" };
  } catch { return { kind: "error", status: 404, message: "Media not found" }; }
  return { kind: "file", status: 200, filePath: resolved.filePath, contentType: contentTypeForMediaFile(resolved.filePath), headers: {
    "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60", "Content-Type": contentTypeForMediaFile(resolved.filePath),
  } };
}

export const createBunMediaFetch = (root: string) => async (request: Request): Promise<Response> => {
  const plan = await planMediaResponse({ method: request.method, pathname: new URL(request.url).pathname, root });
  if (plan.kind === "next") return new Response("Media not found", { status: 404 });
  if (plan.kind === "error") return new Response(plan.message, { status: plan.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(request.method === "HEAD" ? null : Bun.file(plan.filePath), { status: 200, headers: plan.headers });
};
```

Return `next` before method validation for unrelated routes. Managed non-GET/HEAD requests return `405`. Resolver exceptions return `400`. Missing or non-regular files return `404`. File plans include `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=60`, and the shared MIME type.

- [ ] **Step 4: Replace the image-set-only Astro middleware with one shared adapter**

In `astro.config.mjs`, import `planMediaResponse`, load `env.MEDIA_ROOT`, and mount one integration named `astrosphere-media`. Its middleware must:

```js
const plan = await planMediaResponse({ method: request.method ?? 'GET', pathname: new URL(request.url, 'http://localhost').pathname, root });
if (plan.kind === 'next') return next();
if (plan.kind === 'error') { response.statusCode = plan.status; return response.end(plan.message); }
Object.entries(plan.headers).forEach(([name, value]) => response.setHeader(name, value));
if (request.method === 'HEAD') return response.end();
return createReadStream(plan.filePath).pipe(response);
```

If `MEDIA_ROOT` is absent, do not mount the file-serving middleware; Astro must still start for content-only work.

- [ ] **Step 5: Add a source-level Astro integration assertion and run tests**

Extend `tests/media-server.test.ts` to read `astro.config.mjs` and assert it contains `env.MEDIA_ROOT`, `planMediaResponse`, `/manga/` coverage through the shared resolver, and no `IMAGE_SET_MEDIA_ROOT`.

Run: `bun test tests/media-server.test.ts tests/media-paths.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit the shared server core**

```bash
git add src/lib/media/server.ts astro.config.mjs tests/media-server.test.ts
git commit -m "feat: serve all external media in development"
```

---

### Task 4: Unified CLI shell and standalone serve command

**Files:**
- Create: `scripts/media.ts`
- Create: `src/lib/media/cli.ts`
- Create: `tests/media-cli.test.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `requireMediaRoot()`, `requireMediaPort()`, and `createBunMediaFetch()`.
- Produces: `MediaCommand = "serve" | "optimize" | "validate" | "sync"`, `parseMediaCommand(argv)`, `mediaHelp`, and the `media:serve` package command. Later plans add handlers without changing dispatch semantics.

- [ ] **Step 1: Write failing CLI parsing and package-script tests**

```ts
import { expect, test } from "bun:test";
import { mediaHelp, parseMediaCommand } from "../src/lib/media/cli";

test("parses the shared command vocabulary", () => {
  expect(parseMediaCommand(["serve"])).toEqual({ command: "serve", args: [] });
  expect(parseMediaCommand(["optimize", "book.cbz"])).toEqual({ command: "optimize", args: ["book.cbz"] });
  expect(() => parseMediaCommand(["manga:serve"])).toThrow("Unknown media command");
  expect(mediaHelp).toContain("media:serve");
});

test("exposes the standalone serve alias", async () => {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(pkg.scripts["media:serve"]).toBe("bun scripts/media.ts serve");
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because the CLI module and package alias do not exist.

- [ ] **Step 3: Implement strict dispatch and serve execution**

```ts
export type MediaCommand = "serve" | "optimize" | "validate" | "sync";
export const mediaHelp = `Usage:\n  bun run media:serve\n  bun run media:optimize ...\n  bun run media:validate\n  bun run media:sync ...`;
export const parseMediaCommand = (argv: string[]): { command: MediaCommand; args: string[] } => {
  const [supplied, ...args] = argv;
  const commands: MediaCommand[] = ["serve", "optimize", "validate", "sync"];
  if (!supplied || !commands.includes(supplied as MediaCommand)) throw new MediaError("usage", supplied ? `Unknown media command: ${supplied}` : mediaHelp);
  return { command: supplied as MediaCommand, args };
};
```

In `scripts/media.ts`, handle `serve` now. Require zero serve arguments, resolve root and port, create the Bun fetch adapter, bind `127.0.0.1`, and print both public route prefixes. For the three planned commands, print a clear “not available until its implementation plan is complete” error and exit nonzero; do not create fake success paths.

Argument parsers throw `MediaError("usage", message)`. The top-level catch prints `Media command failed: <message>` and exits through `exitCodeForMediaError(error)`; unexpected errors use `1`. Help exits `0`.

- [ ] **Step 4: Add unified configuration examples without deleting legacy values yet**

Add `MEDIA_ROOT`, `MEDIA_PORT`, and `MEDIA_SYNC_TARGET` to `.env.example`. Keep old variables temporarily because legacy scripts still exist until the final cleanup plan. Add comments marking the old block temporary and superseded by the unified block.

- [ ] **Step 5: Run CLI tests and help smoke test**

Run: `bun test tests/media-config.test.ts tests/media-paths.test.ts tests/media-server.test.ts tests/media-cli.test.ts`

Expected: all focused tests pass.

Run: `bun scripts/media.ts --help`

Expected: exit `0` and list all four unified commands.

- [ ] **Step 6: Commit the CLI foundation**

```bash
git add scripts/media.ts src/lib/media/cli.ts tests/media-cli.test.ts package.json .env.example
git commit -m "feat: add unified media CLI shell"
```

---

### Task 5: Same-origin manga rendering

**Files:**
- Modify: `src/lib/manga-reader.ts`
- Modify: `src/components/MangaReader.astro`
- Modify: `src/components/MangaSeriesCard.astro`
- Modify: `src/components/MangaArtGallery.astro`
- Modify: `src/pages/manga/[slug].astro`
- Modify: `tests/manga-reader.test.ts`
- Modify: `tests/manga-asset-rendering.test.ts`
- Modify: `.env.example`
- Remove: `src/lib/manga-assets.ts`
- Remove: `tests/manga-assets.test.ts`

**Interfaces:**
- Consumes: the same-origin Astro media middleware from Task 3.
- Produces: root-relative manga covers, artwork, and reader pages without a browser-visible media-origin override.

- [ ] **Step 1: Rewrite the rendering contract as a failing test**

```ts
import { expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

test("manga media stays root-relative and same-origin", async () => {
  const sources = await Promise.all([
    read("src/components/MangaReader.astro"),
    read("src/components/MangaSeriesCard.astro"),
    read("src/components/MangaArtGallery.astro"),
    read("src/pages/manga/[slug].astro"),
  ]);
  for (const source of sources) {
    expect(source).not.toContain("PUBLIC_MANGA_ASSET_BASE_URL");
    expect(source).not.toContain("resolveMangaAssetUrl");
  }
  expect(sources.join("\n")).toContain("series.data.cover.src");
  expect(sources.join("\n")).toContain("piece.src");
});
```

- [ ] **Step 2: Run rendering tests and confirm they fail on the old override**

Run: `bun test tests/manga-reader.test.ts tests/manga-asset-rendering.test.ts tests/manga-assets.test.ts`

Expected: FAIL because components and reader helpers still use the public base URL.

- [ ] **Step 3: Simplify manga rendering to root-relative paths**

Change `createMangaPageSrc(pagePath, page, extension = "jpg")` to validate `pagePath` starts with `/manga/` and return `${pagePath}/${paddedPage}.${extension}` directly. Remove its `baseUrl` parameter. Render covers from `series.data.cover.src` and artwork from `piece.src`; use the same `piece.src` for full-size links. Remove all `PUBLIC_MANGA_ASSET_BASE_URL` reads and `resolveMangaAssetUrl` imports.

- [ ] **Step 4: Remove the obsolete origin helper and tests**

Delete `src/lib/manga-assets.ts` and `tests/manga-assets.test.ts`. Update `tests/manga-reader.test.ts` to assert root-relative output and rejection of a page path outside `/manga/`. Remove `PUBLIC_MANGA_ASSET_BASE_URL` from `.env.example` while retaining the temporarily marked legacy root/port/sync variables until final cleanup.

- [ ] **Step 5: Run the same-origin test set**

Run: `bun test tests/manga-reader.test.ts tests/manga-asset-rendering.test.ts tests/media-server.test.ts`

Expected: all tests pass and no rendering source contains the obsolete variable/helper.

- [ ] **Step 6: Commit same-origin rendering**

```bash
git add src/lib/manga-reader.ts src/components/MangaReader.astro src/components/MangaSeriesCard.astro src/components/MangaArtGallery.astro src/pages/manga/'[slug].astro' tests/manga-reader.test.ts tests/manga-asset-rendering.test.ts .env.example
git add -u src/lib/manga-assets.ts tests/manga-assets.test.ts
git commit -m "refactor: render manga media from same origin"
```

---

### Task 6: Foundation regression gate

**Files:**
- Modify only if a foundation regression is found in files already listed above.

**Interfaces:**
- Produces a passing baseline for the optimizer plan.

- [ ] **Step 1: Run the complete unit suite**

Run: `bun test`

Expected: all tests pass; old legacy tests may still pass because final removal has not occurred.

- [ ] **Step 2: Run Astro type/content checks**

Run: `bun run astro check`

Expected: zero errors, warnings, and hints.

- [ ] **Step 3: Confirm the branch contains only intentional foundation commits**

Run: `git status --short --branch`

Expected: clean `codex/unified-media-workflow` checkout.
