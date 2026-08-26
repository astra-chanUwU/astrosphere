import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { getMediaLayout } from "./config";
import { contentTypeForMediaFile, resolveMediaRequestPath } from "./paths";

export type MediaResponsePlan =
  | { kind: "next" }
  | { kind: "error"; status: 400 | 404 | 405 | 416; message: string; headers?: Record<string, string> }
  | {
      kind: "file";
      status: 200 | 206;
      filePath: string;
      contentType: string;
      headers: Record<string, string>;
      start: number;
      end: number;
    };

export const parseSingleByteRange = (
  header: string | undefined,
  size: number,
): { start: number; end: number } | undefined => {
  if (header === undefined) return undefined;
  if (!Number.isSafeInteger(size) || size <= 0) throw new RangeError("Unsatisfiable byte range");
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (match[1] === "" && match[2] === "")) {
    throw new RangeError("Unsupported byte range");
  }

  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new RangeError("Unsatisfiable byte range");
    }
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const suppliedEnd = match[2] === "" ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(suppliedEnd) ||
    start < 0 ||
    start >= size ||
    suppliedEnd < start
  ) {
    throw new RangeError("Unsatisfiable byte range");
  }
  return { start, end: Math.min(suppliedEnd, size - 1) };
};

const isWithinDirectory = (root: string, candidate: string): boolean => {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
};

export const planMediaResponse = async (options: {
  method: string;
  pathname: string;
  root: string;
  rangeHeader?: string;
  statFile?: typeof stat;
  realpathFile?: typeof realpath;
}): Promise<MediaResponsePlan> => {
  let resolved;
  try {
    resolved = resolveMediaRequestPath(options.pathname, options.root);
  } catch {
    return { kind: "error", status: 400, message: "Invalid media path" };
  }

  if (!resolved) return { kind: "next" };
  if (options.method !== "GET" && options.method !== "HEAD") {
    return { kind: "error", status: 405, message: "Method not allowed" };
  }

  try {
    const layout = getMediaLayout(options.root);
    const realpathFile = options.realpathFile ?? realpath;
    const canonicalRoot = await realpathFile(layout.root);
    const canonicalFilePath = await realpathFile(resolved.filePath);
    const canonicalNamespaceRoot = await realpathFile(layout[resolved.namespace]);
    const canonicalOperationsRoot = await realpathFile(layout.operations)
      .catch(() => resolve(canonicalRoot, ".astrosphere"));

    if (!isWithinDirectory(canonicalNamespaceRoot, canonicalFilePath) || isWithinDirectory(canonicalOperationsRoot, canonicalFilePath)) {
      return { kind: "error", status: 404, message: "Media not found" };
    }

    const fileInfo = await (options.statFile ?? stat)(canonicalFilePath);
    if (!fileInfo.isFile()) {
      return { kind: "error", status: 404, message: "Media not found" };
    }

    const contentType = contentTypeForMediaFile(canonicalFilePath);
    const size = fileInfo.size;
    let range: { start: number; end: number } | undefined;
    try {
      range = parseSingleByteRange(options.rangeHeader, size);
    } catch {
      return {
        kind: "error",
        status: 416,
        message: "Range not satisfiable",
        headers: { "Content-Range": `bytes */${size}` },
      };
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? Math.max(0, size - 1);
    const status = range ? 206 : 200;
    return {
      kind: "file",
      status,
      filePath: canonicalFilePath,
      contentType,
      start,
      end,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=60",
        "Content-Length": String(Math.max(0, end - start + 1)),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
        "Content-Type": contentType,
      },
    };
  } catch {
    return { kind: "error", status: 404, message: "Media not found" };
  }
};

export const createBunMediaFetch = (root: string) => async (request: Request): Promise<Response> => {
  const plan = await planMediaResponse({
    method: request.method,
    pathname: new URL(request.url).pathname,
    root,
    rangeHeader: request.headers.get("range") ?? undefined,
  });

  if (plan.kind === "next") return new Response("Media not found", { status: 404 });
  if (plan.kind === "error") {
    return new Response(plan.message, {
      status: plan.status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...plan.headers,
      },
    });
  }

  const file = Bun.file(plan.filePath);
  const body = request.method === "HEAD" ? null : file.slice(plan.start, plan.end + 1);
  return new Response(body, {
    status: plan.status,
    headers: plan.headers,
  });
};

export type MediaDevMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next?: (error?: unknown) => void,
) => Promise<void>;

export const createMediaDevMiddleware = (root: string): MediaDevMiddleware => async (
  request,
  response,
  next,
) => {
  const plan = await planMediaResponse({
    method: request.method ?? "GET",
    pathname: new URL(request.url ?? "/", "http://localhost").pathname,
    root,
    rangeHeader: request.headers.range,
  });

  if (plan.kind === "next") {
    if (next) return next();
    response.statusCode = 404;
    response.end("Media not found");
    return;
  }
  if (plan.kind === "error") {
    response.statusCode = plan.status;
    Object.entries(plan.headers ?? {}).forEach(([name, value]) => response.setHeader(name, value));
    response.end(plan.message);
    return;
  }

  response.statusCode = plan.status;
  Object.entries(plan.headers).forEach(([name, value]) => response.setHeader(name, value));
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(plan.filePath, { start: plan.start, end: plan.end }).pipe(response);
};
