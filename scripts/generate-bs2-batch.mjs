import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const allBatch = JSON.parse(await fs.readFile('/tmp/bs2-batch-data.json', 'utf8'));
const bundles = JSON.parse(await fs.readFile('/tmp/bs2-bundles.json', 'utf8'));
// Grand Guignol may be handled by the neighboring batch; this worker owns Griffin through Queen.
const batch = allBatch.filter((x) => x.slug !== 'grand-guignol');
const mediaRoot = '/Users/astrochan/Documents/Workstation/astrosphere-media/images';
const essayRoot = '/Users/astrochan/Documents/Workstation/astrosphere/src/content/artifacts/essays';
const indexPath = '/Users/astrochan/Documents/Workstation/astrosphere/src/content/artifacts/essays/blacksouls-ii-characters.md';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cleanText = (s) => s.replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/"/g, '\\"');

for (const item of batch) {
  const pageSlug = `black-souls-ii-${item.slug}`;
  const dir = path.join(mediaRoot, pageSlug);
  await fs.mkdir(dir, { recursive: true });
  const imgs = [];
  const bundle = bundles.find((x) => x.slug === item.slug);
  const manifest = bundle?.bun?.manifestPath ? JSON.parse(await fs.readFile(bundle.bun.manifestPath, 'utf8')) : { assets: [] };
  const seen = new Set();
  for (const img of item.d.imgs || []) {
    if (!img.src || /gravatar|dlsite\.jp/i.test(img.src) || seen.has(img.src)) continue;
    seen.add(img.src);
    const ext = '.webp';
    let base = slugify(img.alt || path.basename(new URL(img.src).pathname, path.extname(new URL(img.src).pathname))) || 'image';
    let name = `${base}${ext}`;
    let n = 2;
    while (imgs.some((x) => x.name === name)) name = `${base}-${n++}${ext}`;
    const asset = manifest.assets.find((a) => a.url === img.src);
    const out = path.join(dir, name);
    try {
      if (!asset) continue;
      await fs.copyFile(asset.path, out);
      const tmp = `${out}.tmp.webp`;
      await run('cwebp', ['-quiet', '-metadata', 'none', out, '-o', tmp], { timeout: 60000 });
      await fs.rename(tmp, out);
      imgs.push({ name, alt: img.alt || item.d.title });
    } catch (e) {
      await fs.rm(out, { force: true });
      await fs.rm(`${out}.tmp.webp`, { force: true });
    }
  }
  const hero = imgs[0];
  const body = [];
  let imageIndex = 0;
  for (const el of item.d.text || []) {
    const text = cleanText(el.text || '');
    if (el.tag === 'h1') continue;
    if (/^(Contents|Resources \|)/i.test(text)) continue;
    if (/^h[234]$/.test(el.tag) && text) {
      const level = Number(el.tag.slice(1));
      body.push(`${'#'.repeat(level)} ${text}`);
      continue;
    }
    if (el.tag === 'li' && text && !/^\d+(\.\d+)?\s/.test(text)) {
      body.push(`- ${text}`);
      continue;
    }
    if (el.tag === 'p' && text) body.push(text);
    if (el.imgs?.length) {
      for (let imageOffset = 0; imageOffset < el.imgs.length; imageOffset += 1) {
        const local = imgs[imageIndex++];
        if (!local || local === hero) continue;
        body.push(`<figure><img src="/media/images/${pageSlug}/${local.name}" alt="${esc(local.alt)}" loading="lazy" decoding="async" /><figcaption>${local.alt}</figcaption></figure>`);
      }
    }
  }
  // Any images not encountered in the element stream still belong in the gallery.
  while (imageIndex < imgs.length) {
    const local = imgs[imageIndex++];
    if (local === hero) continue;
    body.push(`<figure><img src="/media/images/${pageSlug}/${local.name}" alt="${esc(local.alt)}" loading="lazy" decoding="async" /><figcaption>${local.alt}</figcaption></figure>`);
  }
  const front = `---\nslug: ${pageSlug}\ntitle: "${esc(item.d.title)} | BLACKSOULS II"\ntype: essay\nstatus: published\nsummary: "A source-faithful BLACKSOULS II character dossier covering route events, covenant choices, battles, endings, H-scenes, personality, design, and gallery material."\npublishedAt: "2026-08-13"\nspheres: [games]\ntags: [black-souls, black-souls-ii, character, nsfw]\nlayout: gallery\n${hero ? `hero:\n  kind: image\n  src: /media/images/${pageSlug}/${hero.name}\n  alt: "${esc(hero.alt)}"\n  credit: "BLACKSOULS II artwork; rights reserved. Used for identification and critical commentary."\n` : ''}related: [black-souls-ii-characters, black-souls-ii]\nsourceUrl: https://fgguides.com/blacksouls/${item.slug}/\ncredits:\n  - "Route facts and images referenced from FGGuides, ${item.d.title}."\nnotes: "Contains major route, ending, and adult-content spoilers for BLACKSOULS II."\n---\n\n# ${item.d.title}\n\n`;
  const tail = `\n\nSource: [FGGuides — ${item.d.title}](https://fgguides.com/blacksouls/${item.slug}/).\n`;
  await fs.writeFile(path.join(essayRoot, `${pageSlug}.md`), front + body.join('\n\n') + tail);
}

let index = await fs.readFile(indexPath, 'utf8');
for (const item of batch) {
  const source = `https://fgguides.com/blacksouls/${item.slug}/`;
  index = index.replaceAll(`href="${source}"`, `href="/artifacts/black-souls-ii-${item.slug}"`);
}
await fs.writeFile(indexPath, index);
console.log(JSON.stringify(batch.map((x) => ({ slug: x.slug, file: `black-souls-ii-${x.slug}.md` }))));
