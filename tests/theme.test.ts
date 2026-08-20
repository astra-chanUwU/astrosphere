import { describe, expect, test } from "bun:test";
import { resolveTheme } from "../src/lib/theme";

describe("resolveTheme", () => {
  test("uses a saved valid preference before the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("uses the system preference when no valid preference is saved", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("invalid", false)).toBe("light");
  });
});
