import { extractYoutubeVideoId, normalizeYoutubeUrl } from '$lib/youtube';

/**
 * Indique si la question a déjà une URL YouTube valide ou une image (URL http(s) exploitable pour la correction).
 * Sert à décider si l’enrichissement automatique (Gemini + recherche YouTube) est utile.
 */
export function questionHasCorrectionMedia(q: { imgUrl?: string; youtubeUrl?: string }): boolean {
	if (normalizeYoutubeUrl(q.youtubeUrl)) return true;
	const img = String(q.imgUrl ?? '').trim();
	if (!img) return false;
	if (extractYoutubeVideoId(img)) return true;
	try {
		const u = new URL(img);
		return u.protocol === 'https:' || u.protocol === 'http:';
	} catch {
		return false;
	}
}
