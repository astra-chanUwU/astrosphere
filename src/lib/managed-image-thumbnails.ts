import { isManagedMediaUrl } from "./media/paths";

const managedImagePrefix = "/media/images/";
const htmlTagPattern = /<[^>]+>/g;
const sourceAttributePattern = /\bsrc\s*=\s*(["'])([^"']+)\1/i;
const classAttributePattern = /\bclass\s*=\s*(["'])([^"']+)\1/i;

type DenseGalleryState = {
  divDepth: number;
  anchorDepth: number;
};

type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
};

const isDenseGalleryClass = (value: string): boolean =>
  value
    .split(/\s+/)
    .some((name) => name === "character-grid" || name === "gallery" || name.endsWith("-gallery"));

const isOpeningTag = (tag: string, name: string): boolean =>
  new RegExp(`^<${name}\\b`, "i").test(tag) && !/\/>$/.test(tag);

const isClosingTag = (tag: string, name: string): boolean =>
  new RegExp(`^<\\/${name}\\s*>$`, "i").test(tag);

const opensDenseGallery = (tag: string): boolean => {
  if (!isOpeningTag(tag, "div")) return false;
  const classes = tag.match(classAttributePattern)?.[2];
  return classes !== undefined && isDenseGalleryClass(classes);
};

export const createManagedImageThumbnailSrc = (source: string): string => {
  if (!source.startsWith(managedImagePrefix) || !isManagedMediaUrl(source)) return source;
  const relative = source.slice(managedImagePrefix.length);
  const parts = relative.split("/");
  if (parts.length > 1 && parts[1] === "thumbnails") return source;

  const owner = parts.length > 1 ? parts.shift()! : undefined;
  const remainder = parts.join("/");
  const output = (owner ? remainder : relative).replace(/\.[^./]+$/, ".webp");
  return owner
    ? `${managedImagePrefix}${owner}/thumbnails/${output}`
    : `${managedImagePrefix}thumbnails/${output}`;
};

const processDenseGalleryFragment = (
  value: string,
  state: DenseGalleryState,
  onImage: (source: string) => void,
  rewrite: boolean,
): string => {
  let output = "";
  let cursor = 0;

  for (const match of value.matchAll(htmlTagPattern)) {
    const tag = match[0];
    const index = match.index ?? 0;
    output += value.slice(cursor, index);

    if (state.divDepth === 0 && opensDenseGallery(tag)) {
      state.divDepth = 1;
      state.anchorDepth = 0;
      output += tag;
    } else if (state.divDepth > 0 && isOpeningTag(tag, "div")) {
      state.divDepth += 1;
      output += tag;
    } else if (state.divDepth > 0 && isClosingTag(tag, "div")) {
      state.divDepth -= 1;
      if (state.divDepth === 0) state.anchorDepth = 0;
      output += tag;
    } else if (state.divDepth > 0 && isOpeningTag(tag, "a")) {
      state.anchorDepth += 1;
      output += tag;
    } else if (state.divDepth > 0 && isClosingTag(tag, "a")) {
      state.anchorDepth = Math.max(0, state.anchorDepth - 1);
      output += tag;
    } else if (state.divDepth > 0 && /^<img\b/i.test(tag)) {
      const sourceMatch = tag.match(sourceAttributePattern);
      const source = sourceMatch?.[2];
      if (!source || !isManagedMediaUrl(source) || !source.startsWith(managedImagePrefix)) {
        output += tag;
      } else {
        onImage(source);
        const preview = createManagedImageThumbnailSrc(source);
        const image = rewrite
          ? tag.replace(sourceAttributePattern, `src=${sourceMatch[1]}${preview}${sourceMatch[1]}`)
          : tag;
        output += rewrite && state.anchorDepth === 0
          ? `<a class="dense-gallery-full-size" href="${source}" target="_blank" rel="noopener noreferrer" aria-label="Open image full size">${image}</a>`
          : image;
      }
    } else {
      output += tag;
    }
    cursor = index + tag.length;
  }

  return output + value.slice(cursor);
};

export const collectDenseGalleryImageSources = (body: string): string[] => {
  const sources: string[] = [];
  processDenseGalleryFragment(body, { divDepth: 0, anchorDepth: 0 }, (source) => {
    if (!sources.includes(source)) sources.push(source);
  }, false);
  return sources;
};

const rewriteHtmlChildren = (children: MarkdownNode[]): void => {
  const state: DenseGalleryState = { divDepth: 0, anchorDepth: 0 };
  for (const child of children) {
    if (child.type === "html" && typeof child.value === "string") {
      child.value = processDenseGalleryFragment(child.value, state, () => undefined, true);
    }
    if (child.children) rewriteHtmlChildren(child.children);
  }
};

export const managedImageThumbnailRemarkPlugin = () => (tree: MarkdownNode): void => {
  if (tree.children) rewriteHtmlChildren(tree.children);
};
