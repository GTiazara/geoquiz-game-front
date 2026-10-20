import type { QuestionAnswerArea } from '$lib/types';

export type StoryStep = {
	id: string;
	title: string;
	year: string;
	lat: number;
	lng: number;
	narration: string;
	/** Position du défi (où le joueur doit cliquer). Si non défini, utilise lat/lng */
	challengeLat?: number;
	challengeLng?: number;
	/** Zone de réponse (pays, région…) — prioritaire sur le rayon de tolérance. */
	challengeAnswerArea?: QuestionAnswerArea;
	/** Défi uniquement géolocalisé : consigne + tolérance ; la réponse est le point challenge (ou étape). */
	miniChallenge: { question: string; toleranceM?: number };
};

export type StoryAdventure = {
	id: string;
	title: string;
	period: string;
	description: string;
	/** Icône affichée si pas d’image de couverture. */
	emoji?: string;
	/** Image de couverture (URL https) — modale aventures et intro. */
	coverImageUrl?: string;
	steps: StoryStep[];
};

export const historyAdventures: StoryAdventure[] = [
	{
		id: 'marco-polo',
		title: "L'aventure de Marco Polo",
		period: '1271-1295',
		emoji: '🐫',
		coverImageUrl:
			'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Polo%2C_Marco%2C_Hart%27s_%281850%29.jpg/480px-Polo%2C_Marco%2C_Hart%27s_%281850%29.jpg',
		description: 'Un grand voyage de Venise vers la Chine le long des routes caravanières.',
		steps: [
			{
				id: 'venise',
				title: 'Départ de Venise',
				year: '1271',
				lat: 45.4408,
				lng: 12.3155,
				narration: 'Marco Polo quitte Venise avec son père et son oncle pour partir vers l’Asie.',
				miniChallenge: {
					question: 'Localise sur la carte la mer qui borde directement Venise (côté sud de la lagune).',
					toleranceM: 250_000
				}
			},
			{
				id: 'samarcande',
				title: 'Carrefour de Samarcande',
				year: '1275',
				lat: 39.6542,
				lng: 66.9597,
				narration: 'La caravane traverse Samarcande, ville-cle des échanges entre Orient et Occident.',
				miniChallenge: {
					question: 'Place un point sur le territoire de l’Ouzbékistan actuel, proche de Samarcande.',
					toleranceM: 350_000
				}
			},
			{
				id: 'khanbaliq',
				title: 'Arrivée a Khanbalik',
				year: '1275',
				lat: 39.9042,
				lng: 116.4074,
				narration: 'Marco Polo atteint la cour de Kubilai Khan dans la région de Pékin.',
				miniChallenge: {
					question: 'Indique sur la carte la région de Pékin / Khanbalik à l’époque mongole.',
					toleranceM: 400_000
				}
			}
		]
	},
	{
		id: 'ww2',
		title: 'La Seconde Guerre mondiale',
		period: '1939-1945',
		emoji: '⚔️',
		coverImageUrl:
			'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/D-day_Normandy_LSTs.jpg/480px-D-day_Normandy_LSTs.jpg',
		description: 'Un parcours chronologique des lieux qui ont marqué le conflit mondial.',
		steps: [
			{
				id: 'warsaw',
				title: 'Invasion de la Pologne',
				year: '1939',
				lat: 52.2297,
				lng: 21.0122,
				narration: 'Le conflit éclate en Europe avec l’invasion de la Pologne.',
				miniChallenge: {
					question: 'Localise la capitale de la Pologne sur la carte.',
					toleranceM: 200_000
				}
			},
			{
				id: 'normandy',
				title: 'Débarquement en Normandie',
				year: '1944',
				lat: 49.3622,
				lng: -0.8049,
				narration: 'Les Alliés ouvrent un nouveau front en Europe de l’Ouest.',
				miniChallenge: {
					question: 'Indique une zone côtière du débarquement sur l’océan Atlantique (Normandie).',
					toleranceM: 250_000
				}
			},
			{
				id: 'berlin',
				title: 'Fin a Berlin',
				year: '1945',
				lat: 52.52,
				lng: 13.405,
				narration: 'La chute de Berlin symbolise la fin de la guerre en Europe.',
				miniChallenge: {
					question: 'Place Berlin sur la carte.',
					toleranceM: 150_000
				}
			}
		]
	},
	{
		id: 'lucy',
		title: 'Lucy, ancetre emblématique',
		period: '3,2 millions d’années',
		emoji: '🦴',
		coverImageUrl:
			'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Lucy_%28Australopithecus%29.jpg/480px-Lucy_%28Australopithecus%29.jpg',
		description: 'Sur les traces de Lucy et des grands sites de la préhistoire humaine.',
		steps: [
			{
				id: 'hadar',
				title: 'Découverte a Hadar',
				year: '1974',
				lat: 11.1575,
				lng: 40.5542,
				narration: 'Lucy est découverte en Ethiopie, un moment majeur pour la paléoanthropologie.',
				miniChallenge: {
					question: "Localise l'Éthiopie (région d'Hadar) sur la carte.",
					toleranceM: 500_000
				}
			},
			{
				id: 'olduvai',
				title: 'Les gorges d’Olduvai',
				year: 'Préhistoire',
				lat: -2.9899,
				lng: 35.3546,
				narration: 'Olduvai concentre des fossiles et outils essentiels pour comprendre nos origines.',
				miniChallenge: {
					question: "Indique la Tanzanie, où se trouvent les gorges d'Olduvai.",
					toleranceM: 450_000
				}
			},
			{
				id: 'koobi-fora',
				title: 'Koobi Fora',
				year: 'Préhistoire',
				lat: 3.9889,
				lng: 36.2833,
				narration: 'Le bassin du Turkana livre de nombreux fossiles d’hominines.',
				miniChallenge: {
					question: "Localise le lac Turkana (nord du Kenya) sur la carte.",
					toleranceM: 300_000
				}
			}
		]
	}
];

export function cloneHistoryAdventures(input: StoryAdventure[] = historyAdventures): StoryAdventure[] {
	return input.map((adventure) => ({
		...adventure,
		steps: adventure.steps.map((step) => ({
			...step,
			miniChallenge: { ...step.miniChallenge },
			...(step.challengeAnswerArea
				? { challengeAnswerArea: structuredClone(step.challengeAnswerArea) }
				: {})
		}))
	}));
}
