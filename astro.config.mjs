// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

import { siteConfig } from './src/config/site.ts';
import { createMediaDevMiddleware } from './src/lib/media/server.ts';
import { managedImageThumbnailRemarkPlugin } from './src/lib/managed-image-thumbnails.ts';

/** @param {string | undefined} root */
const mediaDevServer = (root) => ({
	name: 'astrosphere-media',
	hooks: {
		/** @param {{ server: import('vite').ViteDevServer }} options */
		'astro:server:setup'(options) {
			const { server } = options;
			if (!root) return;
			server.middlewares.use(createMediaDevMiddleware(root));
		},
	},
});

const env = loadEnv('development', process.cwd(), '');

// https://astro.build/config
export default defineConfig({
	site: siteConfig.siteUrl,
	integrations: [mdx(), sitemap(), mediaDevServer(env.MEDIA_ROOT)],
	markdown: {
		processor: unified({ remarkPlugins: [managedImageThumbnailRemarkPlugin] }),
	},
});
