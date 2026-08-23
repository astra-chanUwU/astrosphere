// @ts-check
import { createReadStream } from 'node:fs';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

import { siteConfig } from './src/config/site.ts';
import { planMediaResponse } from './src/lib/media/server.ts';

/** @param {string | undefined} root */
const mediaDevServer = (root) => ({
	name: 'astrosphere-media',
	hooks: {
		/** @param {{ server: import('vite').ViteDevServer }} options */
		'astro:server:setup'(options) {
		const { server } = options;
		if (!root) return;

		/**
		 * @param {import('node:http').IncomingMessage} request
		 * @param {import('node:http').ServerResponse} response
		 * @param {(error?: unknown) => void} next
		 */
		const serveMedia = async (request, response, next) => {
			const plan = await planMediaResponse({
				method: request.method ?? 'GET',
				pathname: new URL(request.url ?? '/', 'http://localhost').pathname,
				root,
			});
			if (plan.kind === 'next') return next();
			if (plan.kind === 'error') {
				response.statusCode = plan.status;
				return response.end(plan.message);
			}

			Object.entries(plan.headers).forEach(([name, value]) => response.setHeader(name, value));
			if (request.method === 'HEAD') return response.end();
			return createReadStream(plan.filePath).pipe(response);
		};
		server.middlewares.use(serveMedia);
		},
	},
});

const env = loadEnv('development', process.cwd(), '');

// https://astro.build/config
export default defineConfig({
	site: siteConfig.siteUrl,
	integrations: [mdx(), sitemap(), mediaDevServer(env.MEDIA_ROOT)],
});
