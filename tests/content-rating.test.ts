import { expect, test } from "bun:test";
import { isVisibleWithSfwFilter, shouldRequireContentWarning } from "../src/lib/content-rating";

test("SFW filtering hides explicit manga but keeps safe and suggestive entries", () => {
  expect(isVisibleWithSfwFilter("safe", true)).toBe(true);
  expect(isVisibleWithSfwFilter("suggestive", true)).toBe(true);
  expect(isVisibleWithSfwFilter("explicit", true)).toBe(false);
  expect(isVisibleWithSfwFilter("explicit", false)).toBe(true);
});

test("requires an explicit-content warning only when SFW is on and unconfirmed", () => {
  expect(shouldRequireContentWarning("explicit", true, false)).toBe(true);
  expect(shouldRequireContentWarning("explicit", false, false)).toBe(false);
  expect(shouldRequireContentWarning("explicit", true, true)).toBe(false);
});
