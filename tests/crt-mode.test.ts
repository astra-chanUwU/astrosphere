import { expect, test } from "bun:test";

const layout = await Bun.file(new URL("../src/layouts/BaseLayout.astro", import.meta.url)).text();
const header = await Bun.file(new URL("../src/components/SiteHeader.astro", import.meta.url)).text();
const shader = await Bun.file(new URL("../src/scripts/crt-shader.ts", import.meta.url)).text().catch(() => "");

test("restores and preserves the CRT preference across client navigation", () => {
  expect(layout).toContain('localStorage.getItem("astrosphere-crt")');
  expect(layout).toContain('document.documentElement.dataset.crt === "on"');
});

test("offers a CRT control beside the theme control", () => {
  expect(header).toContain('id="crt-toggle"');
  expect(header).toContain('localStorage.setItem("astrosphere-crt", enabled ? "on" : "off")');
});

test("renders CRT using a persistent WebGL canvas", () => {
  expect(layout).toContain('<canvas id="crt-shader" aria-hidden="true" transition:persist></canvas>');
  expect(layout).toContain('import "../scripts/crt-shader";');
  expect(shader).toContain('canvas.getContext("webgl", { alpha: true, antialias: false })');
  expect(shader).toContain("requestAnimationFrame");
  expect(shader).toContain('document.addEventListener("astrosphere:crt-change", render)');
});
