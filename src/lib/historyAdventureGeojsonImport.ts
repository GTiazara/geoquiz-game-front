import type { StoryAdventure, StoryStep } from '$lib/historyAdventures';
import {
	centroidLngLatFromAnswerArea,
	countVerticesInAnswerArea,
	parseGeometryLike,
	parseQuestionAnswerArea
} from '$lib/geo/polygon';
import type { QuestionAnswerArea } from '$lib/types';

const GEOJSON_IMPORT_MAX_VERTICES = 20_000;

type GeoJsonFeature = {
	type?: string;
	properties?: Record<string, unknown>;
	geometry?: { type?: string; coordinates?: unknown };
};

type GeoJsonCollection = {
	type?: string;
	properties?: Record<string, unknown>;
	features?: GeoJsonFeature[];
};

function makeId(source: string, fallback: string): string {
	const id = source
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return (id || fallback).slice(0, 60);
}

function asStr(v: unknown, max: number, fallback = ''): string {
	const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : fallback;
	return s.slice(0, max);
}

function asFiniteNum(v: unknown): number | undefined {
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

function clampLat(lat: number): number {
	return Math.max(-90, Math.min(90, lat));
}

function clampLng(lng: number): number {
	return Math.max(-180, Math.min(180, lng));
}

function pointFromCoords(c: unknown): { lng: number; lat: number } | null {
	if (!Array.isArray(c) || c.length < 2) return null;
	const lng = Number(c[0]);
	const lat = Number(c[1]);
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
	return { lng, lat };
}

function oneStepFromProps(
	props: Record<string, unknown>,
	plat: number,
	plng: number,
	fallbackId: string,
	fallbackOrder: number
): StoryStep {
	const title = asStr(
		props.title ?? props.stepTitle ?? props.name ?? props.label,
		120,
		`Étape ${fallbackOrder + 1}`
	);
	const year = asStr(props.year ?? props.date, 40);
	const narration = asStr(
		props.narration ?? props.story ?? props.description ?? props.desc,
		1200
	);
	const question = asStr(
		props.question ?? props.miniQuestion ?? props.quiz ?? props.text ?? props.defi,
		500
	);
	const toleranceRaw = asFiniteNum(props.toleranceM ?? props.tolerance ?? props.bufferM);
	const toleranceM = Math.max(
		10_000,
		Math.min(2_000_000, Math.round(toleranceRaw ?? 250_000))
	);
	const cLat = asFiniteNum(props.challengeLat);
	const cLng = asFiniteNum(props.challengeLng);
	const challengeAnswerArea = parseQuestionAnswerArea(props.challengeAnswerArea);
	const idRaw = asStr(props.id ?? props.stepId, 60);
	const id = makeId(idRaw, fallbackId);
	const base: StoryStep = {
		id,
		title,
		year,
		lat: clampLat(plat),
		lng: clampLng(plng),
		narration,
		miniChallenge: { question, toleranceM },
		...(challengeAnswerArea ? { challengeAnswerArea } : {})
	};
	if (cLat != null && cLng != null) {
		return {
			...base,
			challengeLat: clampLat(cLat),
			challengeLng: clampLng(cLng)
		};
	}
	return base;
}

function orderFromProps(props: Record<string, unknown>, fallback: number): number {
	const o = asFiniteNum(props.order ?? props.sortOrder ?? props.index);
	if (o != null && Number.isInteger(o)) return o;
	if (o != null) return Math.round(o);
	return fallback;
}

/**
 * Importe une aventure « À la trace de l’histoire » depuis un GeoJSON FeatureCollection,
 * sur le modèle de l’import admin des questions : une ou plusieurs entités, propriétés libres.
 *
 * Métadonnées d’aventure (optionnel) : `FeatureCollection.properties` : title, period, description, id.
 * Dépôt géolocalisé uniquement : `question` = consigne ; réponse = point
 * `challengeLat`/`challengeLng` (ou la géométrie pour la position d’étape). Pas d’options / QCM.
 * Chaque entité (sauf `skip: true` ou `role: "adventure"`) génère une ou plusieurs étapes :
 * - Point : 1 étape
 * - LineString / MultiPoint : 1 étape par sommet
 * - Polygon / MultiPolygon : 1 étape (centre du polygone) + zone de défi = le polygone
 */
export function importHistoryAdventureFromGeoJson(
	raw: unknown,
	opts: { existingAdventureId: string }
):
	| { ok: true; adventure: StoryAdventure; warnings: string[] }
	| { ok: false; error: string; warnings: string[] } {
	const warnings: string[] = [];
	const obj = raw as GeoJsonCollection;
	if (obj.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
		return {
			ok: false,
			error: 'Attendu : GeoJSON de type FeatureCollection avec un tableau « features ».',
			warnings
		};
	}

	const collProps = obj.properties ?? {};
	const advTitle = asStr(
		collProps.adventureTitle ?? collProps.title ?? collProps.histoireTitle,
		120,
		'Aventure importée'
	);
	const advPeriod = asStr(collProps.period, 80);
	const advDescription = asStr(
		collProps.description ?? collProps.summary ?? collProps.histoireDescription,
		420
	);
	const advIdRaw = asStr(collProps.id ?? collProps.adventureId, 60);
	const advId = makeId(advIdRaw, opts.existingAdventureId);
	const advEmoji = asStr(collProps.emoji, 8);
	const advCover = asStr(collProps.coverImageUrl ?? collProps.cover_image_url, 2048);

	type Row = { order: number; step: StoryStep };
	const rows: Row[] = [];
	let flat = 0;

	for (let fi = 0; fi < obj.features.length; fi++) {
		const f = obj.features[fi] as GeoJsonFeature;
		const props = f.properties ?? {};
		if (props.skip === true) continue;
		if (asStr(props.role, 20) === 'adventure') continue;
		const g = f.geometry;
		const t = String(g?.type ?? '')
			.trim()
			.toLowerCase();

		if (t === 'point' && g && Array.isArray((g as GeoJsonFeature['geometry'] & { coordinates?: unknown }).coordinates)) {
			const p = pointFromCoords((g as { coordinates: unknown }).coordinates);
			if (!p) {
				warnings.push(`Entrée ${fi + 1} (Point) : coordonnées invalides — ignorée.`);
				continue;
			}
			const st = oneStepFromProps(
				props,
				p.lat,
				p.lng,
				`${advId}-step-${flat + 1}`,
				flat
			);
			rows.push({ order: orderFromProps(props, fi) * 1_000_000 + fi, step: st });
			flat++;
			continue;
		}

		if (t === 'linestring' && g && Array.isArray((g as { coordinates?: unknown }).coordinates)) {
			const line = (g as { coordinates: number[][] }).coordinates;
			if (!line.length) {
				warnings.push(`Entrée ${fi + 1} (LineString) : ligne vide — ignorée.`);
				continue;
			}
			const featureOrder = orderFromProps(props, fi);
			for (let vi = 0; vi < line.length; vi++) {
				const p = pointFromCoords(line[vi]);
				if (!p) {
					warnings.push(`Entrée ${fi + 1} (LineString) sommet ${vi + 1} : coordonnée invalide.`);
					continue;
				}
				const st = oneStepFromProps(
					props,
					p.lat,
					p.lng,
					`${advId}-line${fi + 1}-p${vi + 1}`,
					flat
				);
				if (line.length > 1) {
					const base = asStr(props.title, 120);
					st.title = base ? `${base} (${vi + 1})` : `Étape ${vi + 1}`;
				}
				rows.push({ order: featureOrder * 1_000_000 + fi * 1000 + vi, step: st });
				flat++;
			}
			continue;
		}

		if (t === 'multipoint' && g && Array.isArray((g as { coordinates?: unknown }).coordinates)) {
			const pts = (g as { coordinates: number[][] }).coordinates;
			const featureOrder = orderFromProps(props, fi);
			for (let vi = 0; vi < pts.length; vi++) {
				const p = pointFromCoords(pts[vi]);
				if (!p) {
					warnings.push(`Entrée ${fi + 1} (MultiPoint) point ${vi + 1} : coordonnée invalide.`);
					continue;
				}
				const st = oneStepFromProps(props, p.lat, p.lng, `${advId}-mp${fi + 1}-${vi + 1}`, flat);
				if (pts.length > 1) {
					const base = asStr(props.title, 120);
					st.title = base ? `${base} (${vi + 1})` : `Étape ${vi + 1}`;
				}
				rows.push({ order: featureOrder * 1_000_000 + fi * 1000 + vi, step: st });
				flat++;
			}
			continue;
		}

		if (t === 'polygon' || t === 'multipolygon' || t === 'geometrycollection') {
			const parsed = parseGeometryLike(g) as QuestionAnswerArea | undefined;
			if (!parsed) {
				warnings.push(
					`Entrée ${fi + 1} : geometry surface invalide (Polygon / MultiPolygon attendu).`
				);
				continue;
			}
			const nv = countVerticesInAnswerArea(parsed);
			if (nv > GEOJSON_IMPORT_MAX_VERTICES) {
				warnings.push(
					`Entrée ${fi + 1} : trop de sommets (${nv} > ${GEOJSON_IMPORT_MAX_VERTICES}) — ignorée.`
				);
				continue;
			}
			const c = centroidLngLatFromAnswerArea(parsed);
			const stepLat = asFiniteNum(props.stepLat ?? props.lat);
			const stepLng = asFiniteNum(props.stepLng ?? props.lng);
			const st = oneStepFromProps(
				props,
				stepLat ?? c.lat,
				stepLng ?? c.lng,
				`${advId}-poly-${fi + 1}`,
				flat
			);
			st.challengeAnswerArea = parsed;
			rows.push({ order: orderFromProps(props, fi) * 1_000_000 + fi, step: st });
			flat++;
			continue;
		}

		warnings.push(
			`Entrée ${fi + 1} : type de géométrie « ${t || '?'} » non géré (Point, LineString, MultiPoint, Polygon, MultiPolygon).`
		);
	}

	if (!rows.length) {
		return {
			ok: false,
			error: 'Aucune étape valide : ajoute des Points (ou LineString, polygones…) avec des coordonnées valides.',
			warnings
		};
	}

	rows.sort((a, b) => a.order - b.order);
	const steps = rows.map((r) => r.step);

	return {
		ok: true,
		adventure: {
			id: advId,
			title: advTitle,
			period: advPeriod,
			description: advDescription,
			...(advEmoji ? { emoji: advEmoji } : {}),
			...(advCover.startsWith('http') ? { coverImageUrl: advCover } : {}),
			steps
		},
		warnings
	};
}

/** Exporte une aventure en FeatureCollection GeoJSON (compatible avec `importHistoryAdventureFromGeoJson`). */
export function exportHistoryAdventureToGeoJson(adventure: StoryAdventure): GeoJsonCollection {
	const features = adventure.steps.map((step, idx) => {
		const props: Record<string, unknown> = {
			order: idx + 1,
			id: step.id,
			title: step.title,
			year: step.year,
			narration: step.narration,
			question: step.miniChallenge.question,
			toleranceM: step.miniChallenge.toleranceM ?? 250_000
		};
		if (
			step.challengeLat != null &&
			step.challengeLng != null &&
			(step.challengeLat !== step.lat || step.challengeLng !== step.lng)
		) {
			props.challengeLat = step.challengeLat;
			props.challengeLng = step.challengeLng;
		}

		let geometry: GeoJsonFeature['geometry'];
		if (step.challengeAnswerArea) {
			props.stepLat = step.lat;
			props.stepLng = step.lng;
			if (step.challengeAnswerArea.type === 'Polygon') {
				geometry = {
					type: 'Polygon',
					coordinates: step.challengeAnswerArea.coordinates
				};
			} else {
				geometry = {
					type: 'MultiPolygon',
					coordinates: step.challengeAnswerArea.coordinates
				};
			}
		} else {
			geometry = { type: 'Point', coordinates: [step.lng, step.lat] };
		}

		return {
			type: 'Feature',
			properties: props,
			geometry
		};
	});

	return {
		type: 'FeatureCollection',
		properties: {
			id: adventure.id,
			title: adventure.title,
			period: adventure.period,
			description: adventure.description,
			...(adventure.emoji ? { emoji: adventure.emoji } : {}),
			...(adventure.coverImageUrl ? { coverImageUrl: adventure.coverImageUrl } : {})
		},
		features
	};
}
