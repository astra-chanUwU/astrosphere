import { expect, test } from "bun:test";

test("Caddy serves manga images externally without intercepting manga pages", async () => {
  const caddyfile = await Bun.file(
    new URL("../ops/Caddyfile", import.meta.url),
  ).text();
  const lines = caddyfile.split("\n").map((line) => line.trim());
  const mangaMatcher = lines.indexOf(
    "@mangaMedia path_regexp ^/manga/.+\\.(?:avif|gif|jpe?g|png|webp)$",
  );
  const mangaHandler = lines.indexOf("handle @mangaMedia {");
  const imageHandler = lines.indexOf("handle_path /media/images/* {");
  const animeHandler = lines.indexOf("handle_path /media/anime/* {");
  const siteHandler = lines.indexOf("handle {");

  expect(mangaMatcher).toBeGreaterThanOrEqual(0);
  expect(mangaHandler).toBeGreaterThan(mangaMatcher);
  expect(imageHandler).toBeGreaterThan(mangaHandler);
  expect(animeHandler).toBeGreaterThan(imageHandler);
  expect(siteHandler).toBeGreaterThan(animeHandler);
  expect(caddyfile).toContain("root * /srv/astrosphere/media/manga");
  expect(caddyfile).toContain("uri strip_prefix /manga");
  expect(caddyfile).toContain("root * /srv/astrosphere/media/images");
  expect(caddyfile).toContain("root * /srv/astrosphere/media/anime");
  expect(caddyfile.match(/max-age=31536000, immutable/g)).toHaveLength(3);
});
