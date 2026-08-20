import { isAbsolute, resolve } from "node:path";
import { requireImageSetMediaRoot } from "./image-set-media-root";
import { requireMangaMediaRoot } from "./manga-media-root";

export type VpsLayout = {
  root: string;
  app: string;
  releases: string;
  site: string;
  media: string;
  imageSets: string;
};

export const getVpsLayout = (rootValue = "/srv/astrosphere"): VpsLayout => {
  if (!isAbsolute(rootValue)) throw new Error("ASTROSPHERE_ROOT must be an absolute path.");
  const root = resolve(rootValue);
  return {
    root,
    app: resolve(root, "app"),
    releases: resolve(root, "releases"),
    site: resolve(root, "site"),
    media: resolve(root, "media/manga"),
    imageSets: resolve(root, "media/images"),
  };
};

export const createMangaSyncCommand = ({
  source,
  target,
  dryRun,
}: {
  source: string;
  target: string;
  dryRun: boolean;
}) => {
  const normalizedSource = requireMangaMediaRoot(source);
  if (!/^[^@\s]+@[^:\s]+:\/[^\s]*$/.test(target)) {
    throw new Error("VPS_MEDIA_TARGET must use user@host:/absolute/path format.");
  }

  return [
    "rsync",
    "--archive",
    "--partial",
    "--human-readable",
    "--progress",
    ...(dryRun ? ["--dry-run"] : []),
    `${normalizedSource}/`,
    `${target.replace(/\/+$/, "")}/`,
  ];
};

export const createImageSetSyncCommand = ({ source, target, dryRun }: { source: string; target: string; dryRun: boolean }) => {
  const normalizedSource = requireImageSetMediaRoot(source);
  if (!/^[^@\s]+@[^:\s]+:\/[^\s]*$/.test(target)) throw new Error("VPS_IMAGE_SET_TARGET must use user@host:/absolute/path format.");

  return [
    "rsync",
    "--archive",
    "--partial",
    "--human-readable",
    "--progress",
    ...(dryRun ? ["--dry-run"] : []),
    `${normalizedSource}/`,
    `${target.replace(/\/+$/, "")}/`,
  ];
};

export const getDeploymentCommands = () => [
  ["git", "pull", "--ff-only"],
  ["bun", "install", "--frozen-lockfile"],
  ["bun", "test"],
  ["bun", "run", "build"],
];
