/**
 * Static Astro asset handler used by the Sites deployment package.
 * The local Astro build remains a static site; this Worker only maps requests
 * to the emitted asset directory in the hosted environment.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const candidates = [];

    if (url.pathname.endsWith("/")) {
      candidates.push(`${url.pathname}index.html`);
    } else {
      candidates.push(url.pathname);
      if (!url.pathname.includes(".")) candidates.push(`${url.pathname}/index.html`);
    }

    for (const path of candidates) {
      const response = await env.ASSETS.fetch(new Request(new URL(path, request.url), request));
      if (response.status !== 404) return response;
    }

    return env.ASSETS.fetch(new Request(new URL("/404.html", request.url), request));
  },
};
