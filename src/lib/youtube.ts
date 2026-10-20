/** Utilitaires YouTube partagés client / serveur (pas d’import Node-only). */

export function extractYoutubeVideoId(raw: string): string | null {
	const s = raw.trim();
	if (!s) return null;
	try {
		const u = new URL(s, 'https://www.youtube.com');
		const host = u.hostname.replace(/^www\./, '');
		if (host === 'youtu.be') {
			const id = u.pathname.replace(/^\//, '').split('/')[0];
			return id && /^[\w-]{6,32}$/.test(id) ? id : null;
		}
		if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
			if (u.pathname.startsWith('/embed/')) {
				const id = u.pathname.slice(7).split('/')[0];
				return id && /^[\w-]{6,32}$/.test(id) ? id : null;
			}
			if (u.pathname.startsWith('/shorts/')) {
				const id = u.pathname.slice(8).split('/')[0];
				return id && /^[\w-]{6,32}$/.test(id) ? id : null;
			}
			const v = u.searchParams.get('v');
			if (v && /^[\w-]{6,32}$/.test(v)) return v;
		}
	} catch {
		return null;
	}
	return null;
}

export function toYoutubeWatchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}

export function toYoutubeEmbedUrl(videoId: string): string {
	return `https://www.youtube.com/embed/${videoId}`;
}

/** Accepte une URL YouTube (watch, embed, shorts, youtu.be) et renvoie l’URL `watch` canonique. */
export function normalizeYoutubeUrl(input: unknown): string | undefined {
	const s = String(input ?? '').trim();
	if (!s) return undefined;
	const id = extractYoutubeVideoId(s);
	return id ? toYoutubeWatchUrl(id) : undefined;
}

export function youtubeThumbnailUrl(videoId: string, quality: 'default' | 'mq' | 'hq' = 'mq'): string {
	const q = quality === 'default' ? 'default' : quality === 'hq' ? 'hqdefault' : 'mqdefault';
	return `https://i.ytimg.com/vi/${videoId}/${q}.jpg`;
}
