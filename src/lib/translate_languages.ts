/** Aligné sur `includedLanguages` dans `app.html` + français = page originale (sans traduction). */
export type TranslateUiLang = {
	code: string;
	label: string;
	flag: string;
};

export const TRANSLATE_UI_LANGS: TranslateUiLang[] = [
	{ code: 'fr', label: 'Français', flag: '\u{1F1EB}\u{1F1F7}' },
	{ code: 'en', label: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
	{ code: 'es', label: 'Español', flag: '\u{1F1EA}\u{1F1F8}' },
	{ code: 'de', label: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
	{ code: 'zh-CN', label: '中文', flag: '\u{1F1E8}\u{1F1F3}' },
	{ code: 'ja', label: '日本語', flag: '\u{1F1EF}\u{1F1F5}' },
	{ code: 'ar', label: 'العربية', flag: '\u{1F1F8}\u{1F1E6}' }
];

export function normalizeTranslateUiCode(code: string | null | undefined): string {
	if (code == null || code === '') return 'fr';
	const c = String(code).toLowerCase();
	if (c === 'fr' || c.startsWith('fr')) return 'fr';
	if (c.startsWith('zh')) return 'zh-CN';
	const prim = c.split(/[-_|]/)[0];
	if (['en', 'es', 'de', 'ja', 'ar'].includes(prim)) return prim;
	if (c === 'zh-cn') return 'zh-CN';
	return 'fr';
}
