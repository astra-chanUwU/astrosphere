export type Theme = "light" | "dark";

export function resolveTheme(storedTheme: string | null, systemPrefersDark: boolean): Theme {
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return systemPrefersDark ? "dark" : "light";
}
