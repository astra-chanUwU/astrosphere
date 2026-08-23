import { stat } from "node:fs/promises";
import { contentTypeForMediaFile, resolveMediaRequestPath } from "./paths";

export type MediaResponsePlan =
  | { kind: "next" }
  | { kind: "error"; status: 400 | 404 | 405; message: string }
  | { kind: "file"; status: 200; filePath: string; contentType: string; headers: Record<string, string> };

export const planMediaResponse = async (options: {
  method: string;
  pathname: string;
  root: string;
  statFile?: typeof stat;
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
    if (!(await (options.statFile ?? stat)(resolved.filePath)).isFile()) {
      return { kind: "error", status: 404, message: "Media not found" };
    }
  } catch {
    return { kind: "error", status: 404, message: "Media not found" };
  }

  const contentType = contentTypeForMediaFile(resolved.filePath);
  return {
    kind: "file",
    status: 200,
    filePath: resolved.filePath,
    contentType,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
      "Content-Type": contentType,
    },
  };
};

export const createBunMediaFetch = (root: string) => async (request: Request): Promise<Response> => {
  const plan = await planMediaResponse({
    method: request.method,
    pathname: new URL(request.url).pathname,
    root,
  });

  if (plan.kind === "next") return new Response("Media not found", { status: 404 });
  if (plan.kind === "error") {
    return new Response(plan.message, {
      status: plan.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(request.method === "HEAD" ? null : Bun.file(plan.filePath), {
    status: plan.status,
    headers: plan.headers,
  });
};
