import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

const component = await Bun.file(new URL("../src/components/SiteSidebar.astro", import.meta.url)).text();
const script = new Bun.Transpiler({ loader: "ts" }).transformSync(component.match(/<script>([\s\S]*?)<\/script>/)![1]);

test("sidebar follows breakpoint crossings and route changes without overriding manual toggles", () => {
  let disclosure = { open: true };
  const events = new Map<string, () => void>();
  const media = {
    matches: true,
    addEventListener: (name: string, callback: () => void) => events.set(name, callback),
  };
  runInNewContext(script, {
    window: { matchMedia: () => media },
    document: {
      querySelector: () => disclosure,
      addEventListener: (name: string, callback: () => void) => events.set(name, callback),
    },
  });
  events.get("astro:page-load")!();
  expect(disclosure.open).toBe(false);
  disclosure.open = true; // A reader can open navigation in a narrow window.
  expect(events.has("resize")).toBe(false); // Resizing within a mode must not close it.
  media.matches = false;
  events.get("change")!();
  expect(disclosure.open).toBe(true);
  media.matches = true;
  events.get("change")!();
  expect(disclosure.open).toBe(false);
  disclosure = { open: true }; // Client-side navigation replaces the element.
  events.get("astro:page-load")!();
  expect(disclosure.open).toBe(false);
  media.matches = false;
  events.get("change")!();
  expect(disclosure.open).toBe(true);
});
