import { isAbsolute, relative, resolve, sep } from "node:path";

const IMAGE_SET_PREFIX = "/media/images/";

export const requireImageSetMediaRoot = (value = process.env.IMAGE_SET_MEDIA_ROOT) => {
  if (!value?.trim()) throw new Error("Set IMAGE_SET_MEDIA_ROOT to the absolute path of the external image-set directory.");

  const supplied = value.trim();
  if (!isAbsolute(supplied)) throw new Error("IMAGE_SET_MEDIA_ROOT must be an absolute path.");

  return resolve(supplied);
};

export const resolveImageSetMediaFile = (source: string, root: string) => {
  if (!source.startsWith(IMAGE_SET_PREFIX)) throw new Error(`Expected a /media/images asset path, received "${source}".`);

  const normalizedRoot = requireImageSetMediaRoot(root);
  const candidate = resolve(normalizedRoot, source.slice(IMAGE_SET_PREFIX.length));
  const relativePath = relative(normalizedRoot, candidate);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Image-set asset path "${source}" escapes IMAGE_SET_MEDIA_ROOT.`);
  }

  return candidate;
};
