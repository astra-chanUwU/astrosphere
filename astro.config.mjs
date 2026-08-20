// @ts-check
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

import { siteConfig } from './src/config/site.ts';
import { contentTypeForImageSetFile, resolveImageSetMediaRequestPath } from './src/lib/image-set-media-server.ts';

/** @param {string | undefined} root */
const imageSetDevServer = (root) => ({
	name: 'astrosphere-image-set-media',
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
		const serveImageSet = async (request, response, next) => {
			if (!request.url?.startsWith('/media/images/')) return next();
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				response.statusCode = 405;
				response.setHeader('Content-Type', 'text/plain; charset=utf-8');
				return response.end('Method not allowed');
			}

			let filePath;
			try {
				filePath = resolveImageSetMediaRequestPath(new URL(request.url, 'http://localhost').pathname, root);
			} catch {
				response.statusCode = 400;
				response.setHeader('Content-Type', 'text/plain; charset=utf-8');
				return response.end('Invalid image-set media path');
			}

			if (!filePath) return next();
			try {
				if (!(await stat(filePath)).isFile()) return next();
			} catch {
				return next();
			}

			response.statusCode = 200;
			response.setHeader('Access-Control-Allow-Origin', '*');
			response.setHeader('Cache-Control', 'public, max-age=60');
			response.setHeader('Content-Type', contentTypeForImageSetFile(filePath));
			if (request.method === 'HEAD') return response.end();
			return createReadStream(filePath).pipe(response);
		};
		server.middlewares.use(serveImageSet);
		},
	},
});

const env = loadEnv('development', process.cwd(), '');

// https://astro.build/config
export default defineConfig({
	site: siteConfig.siteUrl,
	integrations: [mdx(), sitemap(), imageSetDevServer(env.IMAGE_SET_MEDIA_ROOT)],
});
