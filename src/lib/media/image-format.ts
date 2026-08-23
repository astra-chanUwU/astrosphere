import { basename } from "node:path";
import { type CommandRunner, runCommand } from "./process";

export type ImageFormat = "jpeg" | "png" | "gif" | "webp" | "avif" | "unknown";

export type ImageCommandItem = {
  format: ImageFormat;
  source: string;
  destination: string;
  quality: number;
};

const textAt = (bytes: Uint8Array, offset: number, length: number): string =>
  new TextDecoder().decode(bytes.subarray(offset, offset + length));

const hasPrefix = (bytes: Uint8Array, prefix: number[]): boolean =>
  prefix.every((value, index) => bytes[index] === value);

const isAvif = (bytes: Uint8Array): boolean => {
  if (bytes.length < 20 || textAt(bytes, 4, 4) !== "ftyp") return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxSize = view.getUint32(0);
  const compatibleBrandStart = boxSize === 1 ? 24 : 16;
  if (bytes.length < compatibleBrandStart) return false;

  const declaredSize = boxSize === 1 ? view.getBigUint64(8) : BigInt(boxSize);
  const end = boxSize === 0 ? bytes.length : Number(declaredSize > BigInt(bytes.length) ? BigInt(bytes.length) : declaredSize);
  for (let offset = compatibleBrandStart; offset + 4 <= end; offset += 4) {
    const brand = textAt(bytes, offset, 4);
    if (brand === "avif" || brand === "avis") return true;
  }
  return false;
};

export const detectImageFormatFromBytes = (bytes: Uint8Array): ImageFormat => {
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (textAt(bytes, 0, 3) === "GIF" && (textAt(bytes, 3, 3) === "87a" || textAt(bytes, 3, 3) === "89a")) return "gif";
  if (textAt(bytes, 0, 4) === "RIFF" && textAt(bytes, 8, 4) === "WEBP") return "webp";
  if (isAvif(bytes)) return "avif";
  return "unknown";
};

export const detectImageFormat = async (path: string): Promise<ImageFormat> => {
  const bytes = new Uint8Array(await Bun.file(path).slice(0, 32).arrayBuffer());
  return detectImageFormatFromBytes(bytes);
};

export const createImageCommand = (item: ImageCommandItem): string[] | undefined => {
  if (item.format === "webp") return undefined;
  if (item.format === "gif") {
    return ["gif2webp", "-quiet", "-mixed", "-q", String(item.quality), item.source, "-o", item.destination];
  }
  if (item.format === "jpeg" || item.format === "png") {
    return ["cwebp", "-quiet", "-q", String(item.quality), item.source, "-o", item.destination];
  }
  if (item.format === "avif") throw new Error("AVIF is recognized but unsupported for WebP conversion.");
  throw new Error("Unknown image format is unsupported for WebP conversion.");
};

export const verifyWebp = async (path: string, runner: CommandRunner = runCommand): Promise<void> => {
  const result = await runner(["webpinfo", "-quiet", path]);
  if (result.exitCode !== 0) {
    throw new Error(`WebP verification failed for ${basename(path)}: ${result.stderr}`);
  }
};
