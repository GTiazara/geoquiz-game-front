/**
 * Rasterise `public/icons/logo.png` (prioritaire) ou `logo.svg` → PNG pour PWA / favicon.
 * Exécuter après modification du logo : npm run icons
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pngPath = join(root, 'public', 'icons', 'logo.png');
const svgPath = join(root, 'public', 'icons', 'logo.svg');
const masterPath = existsSync(pngPath) ? pngPath : svgPath;
const inputBuf = readFileSync(masterPath);

const out = [
	[192, join(root, 'public', 'pwa-192x192.png')],
	[512, join(root, 'public', 'pwa-512x512.png')],
	[180, join(root, 'public', 'apple-touch-icon.png')],
	[32, join(root, 'public', 'favicon-32x32.png')]
];

for (const [size, file] of out) {
	await sharp(inputBuf).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
	console.log('wrote', file);
}
console.log('PWA icons OK');
