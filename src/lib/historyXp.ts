/** Préfixe des clés `xpByTheme` pour le mode « À la trace de l’histoire » (distinct du thème quiz `histoire`). */
export const HISTORY_XP_PREFIX = 'gp-history:';

/** Clé XP globale (toutes aventures du mode histoire). */
export const HISTORY_XP_GLOBAL_THEME_ID = 'gp-history';

export function historyXpThemeId(adventureId: string): string {
	return `${HISTORY_XP_PREFIX}${adventureId}`;
}

export function isHistoryXpThemeId(themeId: string): boolean {
	return themeId === HISTORY_XP_GLOBAL_THEME_ID || themeId.startsWith(HISTORY_XP_PREFIX);
}
