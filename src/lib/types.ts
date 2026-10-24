/** Polygone / multi-polygone GeoJSON (coordonnées [lng, lat]) pour une question « pays ». */
export type QuestionAnswerArea =
	| { type: 'Polygon'; coordinates: number[][][] }
	| { type: 'MultiPolygon'; coordinates: number[][][][] };

export type Theme = {
	id: string;
	name: string;
	emoji: string;
	description?: string;
	createdAt: string;
	authorPseudo?: string;
	/** Ordre des onglets thème dans l’en-tête du quiz (0 = en premier). Géré par l’admin. */
	sortOrder?: number;
	/** Image de couverture (URL https) — grilles « thèmes » et fiches. */
	coverImageUrl?: string;
	/**
	 * Slugs de regroupement (page /themes), ex. `europe` — gérés par l’admin.
	 * Caractères autorisés côté serveur : `a-z`, `0-9`, tirets.
	 */
	tags?: string[];
};

/** Stats affichées (grilles, listes) — calculées côté serveur. */
export type ThemeStat = {
	questionCount: number;
	/** Moyenne 1–5, ou null si aucune note. */
	ratingAvg: number | null;
	ratingCount: number;
	/** Note laissée par l’appareil courant (1–5), ou null. */
	myStars: number | null;
};

/** Note utilisateur (un avis par couple thème + appareil). */
export type ThemeRatingRow = {
	themeId: string;
	deviceId: string;
	/** 1–5 */
	stars: number;
};

export type Question = {
	id: string;
	themeId: string;
	text: string;
	lat: number;
	lng: number;
	toleranceM: number;
	/**
	 * Zone correcte (pays, région…). Clic **dans** la zone → XP max de la manche ; **hors** zone → 0 XP
	 * (pas de gradation à la distance à l’intérieur du polygone).
	 */
	answerArea?: QuestionAnswerArea;
	/**
	 * Liste quiz allégée (`GET /api/questions?play=1`) : la zone existe en base mais n’est pas envoyée ;
	 * récupération via `GET /api/questions/[id]?play=1` au moment du jeu.
	 */
	hasAnswerArea?: boolean;
	upVotes: number;
	downVotes: number;
	approved: boolean;
	createdAt: string;
	authorPseudo?: string;
	/** Affichés en popup sur la carte pendant la correction (si renseignés). */
	imgUrl?: string;
	/** Lien YouTube (watch / embed / youtu.be) — lecteur intégré dans le popup de correction. */
	youtubeUrl?: string;
	description?: string;
	/** Renseigné quand la description a été complétée automatiquement (Gemini). */
	aiEnrichedAt?: string;
	/** Ordre d’affichage dans le jeu pour ce thème (0 = en premier). Géré par l’admin. */
	sortOrder?: number;
};

export type PlayerRow = {
	pseudo: string;
	xpTotal: number;
	xpByTheme: Record<string, number>;
	updatedAt: string;
	/** Normalisation pour unicité (Mongo). */
	pseudoNorm?: string;
	/** Compte choisi (inscription) vs session visiteur. */
	isGuest?: boolean;
	/** Jour UTC (YYYY-MM-DD) de la session visiteur ; autre jour → fiche supprimée au prochain chargement. */
	guestDay?: string;
	/** Jour UTC des compteurs journaliers ci-dessous (inscrits uniquement ; reset au changement de jour). */
	xpDayUtc?: string;
	/** XP gagnée ce jour UTC par thème (inscrits — utilisé pour le classement « visiteurs » journalier). */
	xpByThemeDay?: Record<string, number>;
	/** XP totale gagnée ce jour UTC (inscrits — scope global journalier). */
	xpTotalDay?: number;
	/** Manches avec point validé — pour précision moyenne (distance au lieu, en m). */
	guessRoundsTotal?: number;
	guessSumDistanceM?: number;
	guessRoundsByTheme?: Record<string, number>;
	guessSumDistanceMByTheme?: Record<string, number>;
	/**
	 * Série quiz : nombre de manches consécutives « sans faute » (dans la tolérance ou dans le polygone pays — aligné sur la pastille « zone bonus »).
	 */
	quizFlawlessStreak?: number;
	/** Record personnel de série sans faute. */
	quizFlawlessBest?: number;
	/** XP des flashcards, séparée du classement carte. */
	flashXpTotal?: number;
	flashStreak?: number;
	flashBest?: number;
};

/** Ligne renvoyée par `/api/leaderboard`. */
export type LeaderboardEntry = {
	pseudo: string;
	xp: number;
	/** Distance moyenne au lieu (m) ; plus bas = plus précis ; null si pas encore de manche enregistrée. */
	avgDistanceM: number | null;
};

export type AdminPlayerRow = {
	deviceId: string;
	pseudo: string;
	isGuest: boolean;
	xpTotal: number;
	guestDay?: string;
	createdHint?: string;
};

export type AdminQuestionRow = Question & { themeName?: string };

/** Inscrit vs visiteur pour les classements (voir `docs/XP_ET_CLASSEMENTS.md`). */
export type LeaderboardSegment = 'registered' | 'guest';

/** Entrées persistantes pour transfert d’appareil (mode fichier JSON). */
export type DeviceLinkCodeFileRow = {
	codeHash: string;
	sourceDeviceId: string;
	expiresAt: string;
	usedAt: string | null;
};

/** Proposition de correction (texte, lieu, description) sur une question déjà publiée — soumise au vote sur Contribuer. */
export type QuestionEditProposal = {
	id: string;
	questionId: string;
	text?: string;
	lat?: number;
	lng?: number;
	description?: string;
	upVotes: number;
	downVotes: number;
	approved: boolean;
	/** Autres propositions du même lot annulées quand une est acceptée. */
	superseded?: boolean;
	createdAt: string;
	authorPseudo?: string;
};

export type QuestionEditProposalRow = QuestionEditProposal & {
	questionText?: string;
	themeId?: string;
	questionLat?: number;
	questionLng?: number;
	questionToleranceM?: number;
	/** Zone « pays » de la question actuelle (carte modération). */
	questionAnswerArea?: QuestionAnswerArea;
};

export type DbFile = {
	version: 1;
	themes: Theme[];
	questions: Question[];
	/** Aventures « À la trace de l’histoire » (mode fichier). */
	historyAdventures?: unknown[];
	players: Record<string, PlayerRow>;
	/** questionId → deviceId → dernier vote */
	questionVoteByDevice: Record<string, Record<string, 'up' | 'down'>>;
	/** Seuils communautaires (admin). */
	appSettings?: {
		communityMinNetVotes: number;
		/** douteux − utile ≥ N → suppression auto (questions en attente + corrections) ; 0 = désactivé. */
		communityEditProposalRemoveMinNetDown?: number;
	};
	questionEditProposals?: QuestionEditProposal[];
	/** proposalId → deviceId → dernier vote */
	questionEditVoteByProposal?: Record<string, Record<string, 'up' | 'down'>>;
	/** Codes à usage unique (transfert), si stockage fichier. */
	deviceLinkCodes?: DeviceLinkCodeFileRow[];
	/** Partages Geobattle (mode fichier). */
	geoBattles?: GeoBattle[];
	geoBattleScores?: GeoBattleScore[];
	geoBattleSessions?: GeoBattleSessionRow[];
	geoBattleUserProgress?: GeoBattleUserProgressRow[];
	/** Notes thème (mode fichier) : un enregistrement par couple themeId + deviceId. */
	themeRatings?: ThemeRatingRow[];
	flashThemes?: FlashTheme[];
	flashDecks?: FlashDeck[];
	flashCards?: FlashCard[];
};

/** Thème de flashcards, distinct des thèmes du quiz carte. */
export type FlashTheme = {
	id: string;
	name: string;
	emoji: string;
	description?: string;
	coverImageUrl?: string;
	approved: boolean;
	sortOrder?: number;
	createdAt: string;
	deckCount?: number;
};

/** Recto d’une flashcard : un seul média à la fois. */
export type FlashPrompt =
	| { kind: 'text'; text: string }
	| { kind: 'image'; url: string; alt?: string }
	| { kind: 'video'; url: string }
	| { kind: 'audio'; url: string };

export type FlashChoice = { id: string; label: string };

export type FlashDeck = {
	id: string;
	themeId: string;
	name: string;
	emoji: string;
	description?: string;
	coverImageUrl?: string;
	approved: boolean;
	sortOrder?: number;
	createdAt: string;
	cardCount?: number;
};

export type FlashCard = {
	id: string;
	deckId: string;
	prompt: FlashPrompt;
	choices: FlashChoice[];
	correctChoiceId: string;
	backText: string;
	approved: boolean;
	sortOrder?: number;
	createdAt: string;
};

/** Carte de jeu : la solution et le verso arrivent seulement après la réponse. */
export type FlashCardPlay = {
	id: string;
	deckId: string;
	prompt: FlashPrompt;
	choices: FlashChoice[];
	sortOrder: number;
};

export type FlashAnswerResult = {
	correct: boolean;
	correctChoiceId: string;
	backText: string;
	xp: number;
	flashXpTotal: number;
	flashStreak: number;
	flashBest: number;
};

/**
 * Geobattle : une question tirée au sort dans un thème, lien à partager.
 * `questionIds` : ordre des manches (si absent : `[questionId]`).
 * `maxPlayers` : `null` / abs = illimité ; ≥2 = salle (lobby, 30 s, révélation commune).
 */
/** Question embarquée (Geobattle personnalisée, non publiée dans `questions`). */
export type GeoBattleCustomQuestion = {
	/** Aligné sur `GeoBattle.questionId` / `questionIds[0]` — typ. `CUSTOM_GEO_BATTLE_QUESTION_ID`. */
	id: string;
	text: string;
	lat: number;
	lng: number;
	toleranceM: number;
	imgUrl?: string;
	youtubeUrl?: string;
	description?: string;
};

export type GeoBattle = {
	id: string;
	themeId: string;
	questionId: string;
	questionIds?: string[];
	maxPlayers?: number | null;
	createdAt: string;
	creatorDeviceId: string;
	/** Si défini : énoncé + réponse stockés dans le duel (thème `CUSTOM_GEO_BATTLE_THEME_ID`). */
	customQuestion?: GeoBattleCustomQuestion;
};

export type GeoBattleSessionRow = {
	battleId: string;
	phase: 'lobby' | 'round' | 'reveal' | 'finished';
	currentRound: number;
	joinedOrder: string[];
	submittedThisRound: string[];
	roundStartedAt: string | null;
	readyForNext: string[];
	updatedAt: string;
};

export type GeoBattleUserProgressRow = {
	battleId: string;
	deviceId: string;
	currentRound: number;
	updatedAt: string;
};

/** Meilleure tentative enregistrée par appareil pour une Geobattle (classement). */
export type GeoBattleScore = {
	battleId: string;
	deviceId: string;
	pseudo: string;
	isGuest: boolean;
	guessLat: number;
	guessLng: number;
	distanceM: number;
	timeSec: number;
	submittedAt: string;
	roundIndex?: number;
	forfeit?: boolean;
};

/** Question exposée au client pendant une Geobattle (sans coordonnées de la réponse). */
export type GeoBattleQuestionPublic = {
	id: string;
	themeId: string;
	text: string;
	toleranceM: number;
	imgUrl?: string;
	youtubeUrl?: string;
	description?: string;
	/**
	 * Présent uniquement quand la correction est visible (même payload que `answer`) :
	 * tracé pays / région sur la carte Geobattle.
	 */
	answerArea?: QuestionAnswerArea;
};

/** Ligne de classement Geobattle (API / UI). */
export type GeoBattleLeaderboardRow = {
	rank: number;
	pseudo: string;
	isGuest: boolean;
	distanceM: number;
	timeSec: number;
	deviceId: string;
	/** Emplacement proposé sur la carte (pour affichage Geobattle). */
	guessLat: number;
	guessLng: number;
	/** Même session que celle du joueur (API leaderboard / score). */
	isCurrentPlayer?: boolean;
};
