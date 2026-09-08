import { expect, test } from "bun:test";

const trailProgress = await Bun.file(new URL("../src/components/TrailProgress.astro", import.meta.url)).text();

test("colors only connectors before the current trail step", () => {
  expect(trailProgress).toContain("connectorComplete: index < currentIndex");
  expect(trailProgress).toContain('step.connectorComplete ? "connector-complete" : ""');
  expect(trailProgress).toContain("li.connector-complete::after");
  expect(trailProgress).not.toContain("li.list-complete::after");
});
