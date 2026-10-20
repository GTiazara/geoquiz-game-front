/** Même règle que l’admin : identifiants de thème stockés en base. */
export const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/**
 * Déduit un identifiant technique stable à partir du nom affiché (accents supprimés, espaces → tirets).
 */
export function slugFromDisplayNameForThemeId(name: string): string {
	let s = String(name ?? '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 63);
	if (!s) s = 'theme';
	if (!/^[a-z0-9]/.test(s)) {
		s = `t-${s}`.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 63);
	}
	if (!s) s = 'theme';
	if (!THEME_ID_PATTERN.test(s)) s = 'theme';
	return s;
}
