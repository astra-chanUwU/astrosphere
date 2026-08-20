import { stat } from "node:fs/promises";
import { requireMangaMediaRoot } from "../src/lib/manga-media-root";
import { contentTypeForMangaFile, resolveMangaMediaRequestPath } from "../src/lib/manga-media-server";

const root = requireMangaMediaRoot(Bun.env.MANGA_MEDIA_ROOT);
const port = Number(Bun.env.MANGA_MEDIA_PORT ?? "4322");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("MANGA_MEDIA_PORT must be an integer from 1 to 65535.");
}

const response = (status: number, message: string) => new Response(message, {
  status,
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return response(405, "Method not allowed");
    }

    let path: string | undefined;
    try {
      path = resolveMangaMediaRequestPath(new URL(request.url).pathname, root);
    } catch {
      return response(400, "Invalid manga media path");
    }

    if (!path) return response(404, "Manga media not found");

    try {
      if (!(await stat(path)).isFile()) return response(404, "Manga media not found");
    } catch {
      return response(404, "Manga media not found");
    }

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
      "Content-Type": contentTypeForMangaFile(path),
    };

    return new Response(request.method === "HEAD" ? null : Bun.file(path), { headers });
  },
});

console.log(`Manga media: http://${server.hostname}:${server.port}/manga/`);
