/** Réservé : pas un thème en base — jeu sur toutes les questions approuvées mélangées. */
export const MIX_THEME_ID = '__mix__';

/** Thème « actualité » : id **fixe** en base ; le bouton 📰 sur la carte crée un Geobattle sur la dernière question publiée de ce thème uniquement. */
export const ACTU_THEME_ID = 'actu';

/**
 * Geobattle « personnalisée » : la question (texte, lieu, médias) est embarquée dans l’enregistrement
 * du duel — pas une entrée du catalogue `questions`.
 */
export const CUSTOM_GEO_BATTLE_THEME_ID = '__custom_geo__';

/** ID logique de la manche pour une Geobattle personnalisée (une seule manche). */
export const CUSTOM_GEO_BATTLE_QUESTION_ID = '__custom_q__';

/** Thème par défaut sur la page quiz lorsqu’aucun `?theme=` valide n’est fourni — si ce thème n’existe pas en base, repli sur le mix. */
export const DEFAULT_QUIZ_THEME_ID = 'pays';

/** Thème effectif sans paramètre d’URL : `pays` s’il est présent, sinon mode mixte. */
export function resolvedDefaultQuizThemeId(themes: readonly { id: string }[]): string {
	return themes.some((t) => t.id === DEFAULT_QUIZ_THEME_ID) ? DEFAULT_QUIZ_THEME_ID : MIX_THEME_ID;
}
