import { expect, test } from "bun:test";
import { closeSync, openSync } from "node:fs";
import { basename, join } from "node:path";
import { createImageCommand, detectImageFormat, detectImageFormatFromBytes, verifyWebp } from "../src/lib/media/image-format";
import { requireTool, runCommand } from "../src/lib/media/process";

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

const isoBmff = (...brands: string[]): Uint8Array => {
  const content = new TextEncoder().encode(`ftyp${brands.join("")}`);
  return bytes(0, 0, 0, content.length + 4, ...content);
};

const extendedIsoBmff = (compatibleBrand: string): Uint8Array =>
  bytes(
    0, 0, 0, 1,
    ...new TextEncoder().encode("ftyp"),
    0, 0, 0, 0, 0, 0, 0, 28,
    ...new TextEncoder().encode("mif1"),
    0, 0, 0, 0,
    ...new TextEncoder().encode(compatibleBrand),
  );

test("detects formats from bytes instead of extensions", () => {
  expect(detectImageFormatFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
  expect(detectImageFormatFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
  expect(detectImageFormatFromBytes(new TextEncoder().encode("GIF89a"))).toBe("gif");
  expect(detectImageFormatFromBytes(new TextEncoder().encode("RIFF1234WEBP"))).toBe("webp");
  expect(detectImageFormatFromBytes(bytes(1, 2, 3))).toBe("unknown");
});

test("detects AVIF and animated AVIF compatible brands in ISO-BMFF bytes", () => {
  expect(detectImageFormatFromBytes(isoBmff("mif1", "0000", "avif"))).toBe("avif");
  expect(detectImageFormatFromBytes(isoBmff("mif1", "0000", "avis"))).toBe("avif");
  expect(detectImageFormatFromBytes(isoBmff("mif1", "0000", "heic"))).toBe("unknown");
});

test("detects AVIF and AVIS brands in extended-size ISO-BMFF boxes", () => {
  expect(detectImageFormatFromBytes(extendedIsoBmff("avif"))).toBe("avif");
  expect(detectImageFormatFromBytes(extendedIsoBmff("avis"))).toBe("avif");
});

test("detects a file by its bytes rather than its extension", async () => {
  const path = join(import.meta.dir, ".format-mismatch.not-an-image");
  await Bun.write(path, bytes(0xff, 0xd8, 0xff, 0xe0));

  try {
    expect(await detectImageFormat(path)).toBe("jpeg");
  } finally {
    await Bun.file(path).delete();
  }
});

test("routes stills and GIFs to different libwebp tools", () => {
  expect(createImageCommand({ format: "jpeg", source: "/in/a.jpg", destination: "/out/a.webp", quality: 85 }))
    .toEqual(["cwebp", "-quiet", "-q", "85", "/in/a.jpg", "-o", "/out/a.webp"]);
  expect(createImageCommand({ format: "gif", source: "/in/a.gif", destination: "/out/a.webp", quality: 85 }))
    .toEqual(["gif2webp", "-quiet", "-mixed", "-q", "85", "/in/a.gif", "-o", "/out/a.webp"]);
  expect(createImageCommand({ format: "webp", source: "/in/a.webp", destination: "/out/a.webp", quality: 85 })).toBeUndefined();
  expect(() => createImageCommand({ format: "avif", source: "/in/a.avif", destination: "/out/a.webp", quality: 85 }))
    .toThrow("recognized but unsupported");
});

test("runs commands without a shell and captures their output", async () => {
  const result = await runCommand([process.execPath, "-e", "process.stdout.write('ok'); process.stderr.write('note')"]);

  expect(new TextDecoder().decode(result.stdout)).toBe("ok");
  expect(result.stderr).toBe("note");
  expect(result.exitCode).toBe(0);
});

test("passes retained input descriptors to commands without reopening a path", async () => {
  const path = join(import.meta.dir, ".retained-command-input");
  await Bun.write(path, "retained bytes");
  const descriptor = openSync(path, "r");
  try {
    const result = await runCommand(
      [
        process.execPath,
        "-e",
        "process.stdout.write(require('node:fs').readFileSync('/dev/fd/3'))",
      ],
      { readableDescriptors: [descriptor] },
    );
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toBe("retained bytes");
  } finally {
    closeSync(descriptor);
    await Bun.file(path).delete();
  }
});

test("reports a missing required tool", () => {
  expect(() => requireTool("missing-tool", () => null)).toThrow('Required media tool "missing-tool" is not installed.');
  expect(requireTool("present-tool", (name) => `/tools/${name}`)).toBe("/tools/present-tool");
});

test("verifies WebP files with webpinfo and names an invalid file", async () => {
  const validPath = "/media/valid.webp";
  const invalidPath = "/media/not-valid.webp";
  const calls: string[][] = [];
  const runner = async (argv: string[]) => {
    calls.push(argv);
    return { exitCode: argv[2] === validPath ? 0 : 1, stdout: new Uint8Array(), stderr: "bad data" };
  };

  await verifyWebp(validPath, runner);
  let invalidError: unknown;
  try {
    await verifyWebp(invalidPath, runner);
  } catch (error) {
    invalidError = error;
  }
  expect((invalidError as Error).message).toContain(basename(invalidPath));
  expect(calls).toEqual([
    ["webpinfo", "-quiet", validPath],
    ["webpinfo", "-quiet", invalidPath],
  ]);
});
