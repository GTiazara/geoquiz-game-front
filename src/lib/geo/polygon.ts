import type { QuestionAnswerArea } from '$lib/types';

function normGeoType(t: unknown): string {
	return String(t ?? '')
		.trim()
		.toLowerCase();
}

/** Rayonnement horizontal : ignore les arêtes horizontales (évite division par zéro). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
	if (!Array.isArray(ring) || ring.length < 3) return false;
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const pi = ring[i];
		const pj = ring[j];
		if (!Array.isArray(pi) || !Array.isArray(pj) || pi.length < 2 || pj.length < 2) continue;
		const xi = Number(pi[0]);
		const yi = Number(pi[1]);
		const xj = Number(pj[0]);
		const yj = Number(pj[1]);
		if (![xi, yi, xj, yj].every((n) => Number.isFinite(n))) continue;
		if (yi === yj) continue;
		const intersect =
			(yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function pointInPolygonCoords(lng: number, lat: number, rings: number[][][]): boolean {
	if (!Array.isArray(rings) || rings.length === 0) return false;
	if (!pointInRing(lng, lat, rings[0])) return false;
	for (let h = 1; h < rings.length; h++) {
		if (pointInRing(lng, lat, rings[h])) return false;
	}
	return true;
}

/** Point dans le polygone / multi-polygone GeoJSON (coordonnées [lng, lat]). */
export function isPointInAnswerArea(
	lat: number,
	lng: number,
	area: QuestionAnswerArea
): boolean {
	if (area.type === 'Polygon') {
		return pointInPolygonCoords(lng, lat, area.coordinates);
	}
	/* MultiPolygon : le point est valide s’il est dans **au moins un** polygone composant. */
	if (area.type === 'MultiPolygon') {
		for (const poly of area.coordinates) {
			if (pointInPolygonCoords(lng, lat, poly)) return true;
		}
		return false;
	}
	return false;
}

function isFiniteRing(ring: unknown): ring is number[][] {
	if (!Array.isArray(ring) || ring.length < 3) return false;
	for (const p of ring) {
		if (!Array.isArray(p) || p.length < 2) return false;
		if (!Number.isFinite(Number(p[0])) || !Number.isFinite(Number(p[1]))) return false;
	}
	return true;
}

function isValidPolygonCoordinates(coords: unknown): coords is number[][][] {
	if (!Array.isArray(coords) || coords.length === 0) return false;
	return coords.every((ring) => isFiniteRing(ring));
}

function isValidMultiPolygonCoordinates(coords: unknown): coords is number[][][][] {
	if (!Array.isArray(coords) || coords.length === 0) return false;
	for (const poly of coords) {
		if (!isValidPolygonCoordinates(poly)) return false;
	}
	return true;
}

/**
 * GeoJSON : un `Polygon` devient un `MultiPolygon` à une composante `[coordinates]`.
 * Les `MultiPolygon` inchangés — même logique que l’usage « pays » dans le jeu.
 */
export function ensureAnswerAreaMultiPolygon(area: QuestionAnswerArea): QuestionAnswerArea {
	if (area.type === 'MultiPolygon') return area;
	return { type: 'MultiPolygon', coordinates: [area.coordinates] };
}

/** Lit une zone de réponse depuis la base (objet ou JSON string). */
export function parseQuestionAnswerArea(raw: unknown): QuestionAnswerArea | undefined {
	if (raw == null) return undefined;
	let v: unknown = raw;
	if (typeof raw === 'string') {
		const t = raw.trim();
		if (!t) return undefined;
		try {
			v = JSON.parse(t) as unknown;
		} catch {
			return undefined;
		}
	}
	if (!v || typeof v !== 'object') return undefined;
	const o = v as { type?: string; coordinates?: unknown; geometry?: unknown };
	if (normGeoType(o.type) === 'feature' && o.geometry != null) {
		const g = parseGeometryLike(o.geometry);
		return g ? ensureAnswerAreaMultiPolygon(g) : undefined;
	}
	const g = parseGeometryLike(o);
	return g ? ensureAnswerAreaMultiPolygon(g) : undefined;
}

/**
 * Interprète une geometry GeoJSON : Polygon, MultiPolygon, ou GeometryCollection
 * (sous-éléments Polygon / MultiPolygon uniquement, aplatis en une ou plusieurs surfaces).
 */
export function parseGeometryLike(geom: unknown): QuestionAnswerArea | undefined {
	if (!geom || typeof geom !== 'object') return undefined;
	const g = geom as { type?: string; coordinates?: unknown; geometries?: unknown[] };
	const t = normGeoType(g.type);
	if (t === 'polygon' && isValidPolygonCoordinates(g.coordinates)) {
		return ensureAnswerAreaMultiPolygon({ type: 'Polygon', coordinates: g.coordinates });
	}
	if (t === 'multipolygon' && isValidMultiPolygonCoordinates(g.coordinates)) {
		return { type: 'MultiPolygon', coordinates: g.coordinates };
	}
	if (t === 'geometrycollection' && Array.isArray(g.geometries)) {
		const parts: number[][][][] = [];
		for (const sub of g.geometries) {
			const inner = parseGeometryLike(sub);
			if (!inner) continue;
			if (inner.type === 'Polygon') {
				parts.push(inner.coordinates);
			} else {
				for (const poly of inner.coordinates) {
					parts.push(poly);
				}
			}
		}
		if (parts.length === 0) return undefined;
		if (parts.length === 1) {
			return ensureAnswerAreaMultiPolygon({ type: 'Polygon', coordinates: parts[0] });
		}
		return { type: 'MultiPolygon', coordinates: parts };
	}
	return undefined;
}

export function countVerticesInAnswerArea(area: QuestionAnswerArea): number {
	let n = 0;
	if (area.type === 'Polygon') {
		for (const ring of area.coordinates) n += ring.length;
	} else {
		for (const poly of area.coordinates) {
			for (const ring of poly) n += ring.length;
		}
	}
	return n;
}

/** Centre approximatif (bbox) pour marqueur / distance de référence. */
export function centroidLngLatFromAnswerArea(area: QuestionAnswerArea): { lng: number; lat: number } {
	let minLng = 180;
	let maxLng = -180;
	let minLat = 90;
	let maxLat = -90;

	function consumeRing(ring: number[][]) {
		for (const p of ring) {
			const lo = Number(p[0]);
			const la = Number(p[1]);
			if (!Number.isFinite(lo) || !Number.isFinite(la)) continue;
			minLng = Math.min(minLng, lo);
			maxLng = Math.max(maxLng, lo);
			minLat = Math.min(minLat, la);
			maxLat = Math.max(maxLat, la);
		}
	}

	if (area.type === 'Polygon') {
		for (const ring of area.coordinates) consumeRing(ring);
	} else {
		for (const poly of area.coordinates) {
			for (const ring of poly) consumeRing(ring);
		}
	}

	if (minLng > maxLng || minLat > maxLat) return { lng: 0, lat: 0 };
	return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
}

export const CHALLENGE_ANSWER_AREA_MAX_VERTICES = 20_000;

function polygonPartsFromAnswerArea(area: QuestionAnswerArea): number[][][][] {
	if (area.type === 'MultiPolygon') return area.coordinates;
	return [area.coordinates];
}

function mergeAnswerAreas(areas: QuestionAnswerArea[]): QuestionAnswerArea | undefined {
	const parts: number[][][][] = [];
	for (const area of areas) {
		parts.push(...polygonPartsFromAnswerArea(area));
	}
	if (!parts.length) return undefined;
	if (parts.length === 1) {
		return ensureAnswerAreaMultiPolygon({ type: 'Polygon', coordinates: parts[0] });
	}
	return { type: 'MultiPolygon', coordinates: parts };
}

function propsFromFeature(raw: unknown): Record<string, unknown> | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const props = (raw as { properties?: unknown }).properties;
	return props && typeof props === 'object' ? (props as Record<string, unknown>) : undefined;
}

function challengeMetaFromProps(
	props: Record<string, unknown> | undefined
): { question?: string; toleranceM?: number } {
	if (!props) return {};
	const questionRaw = props.question ?? props.text ?? props.quiz ?? props.defi;
	const question =
		typeof questionRaw === 'string' && questionRaw.trim()
			? questionRaw.trim().slice(0, 500)
			: undefined;
	const tm = props.toleranceM ?? props.tolerance ?? props.bufferM;
	const toleranceM =
		tm != null && Number.isFinite(Number(tm))
			? Math.max(10_000, Math.min(2_000_000, Math.round(Number(tm))))
			: undefined;
	return { question, toleranceM };
}

/**
 * Zone de défi histoire : FeatureCollection (fichiers pays / régions), ou Feature / Polygon / MultiPolygon.
 * Plusieurs features surfaces sont fusionnées en un MultiPolygon.
 */
export function parseChallengeAnswerAreaFromGeoJson(raw: unknown):
	| { ok: true; area: QuestionAnswerArea; question?: string; toleranceM?: number }
	| { ok: false; error: string } {
	let v: unknown = raw;
	if (typeof raw === 'string') {
		const t = raw.trim();
		if (!t) return { ok: false, error: 'GeoJSON vide.' };
		try {
			v = JSON.parse(t) as unknown;
		} catch {
			return { ok: false, error: 'JSON invalide (guillemets, virgules, parenthèses).' };
		}
	}
	if (!v || typeof v !== 'object') {
		return { ok: false, error: 'GeoJSON invalide.' };
	}

	const root = v as { type?: string; features?: unknown[]; properties?: unknown };
	const rootType = normGeoType(root.type);

	if (rootType === 'featurecollection') {
		if (!Array.isArray(root.features) || !root.features.length) {
			return { ok: false, error: 'FeatureCollection vide : ajoute au moins une Feature.' };
		}
		const areas: QuestionAnswerArea[] = [];
		let meta: { question?: string; toleranceM?: number } = {};
		for (let i = 0; i < root.features.length; i++) {
			const f = root.features[i];
			if (!f || typeof f !== 'object') continue;
			const fType = normGeoType((f as { type?: string }).type);
			if (fType !== 'feature') {
				return {
					ok: false,
					error: `Entrée ${i + 1} : type « Feature » attendu dans la collection.`
				};
			}
			const geom = (f as { geometry?: unknown }).geometry;
			const parsed = parseGeometryLike(geom);
			if (!parsed) {
				return {
					ok: false,
					error: `Feature ${i + 1} : Polygon / MultiPolygon attendu (pas de Point pour la zone de défi).`
				};
			}
			areas.push(parsed);
			if (!meta.question && !meta.toleranceM) {
				meta = challengeMetaFromProps(propsFromFeature(f));
			}
		}
		if (!areas.length) {
			return { ok: false, error: 'Aucune feature avec une surface valide.' };
		}
		const merged = mergeAnswerAreas(areas);
		if (!merged) return { ok: false, error: 'Fusion des polygones impossible.' };
		const nv = countVerticesInAnswerArea(merged);
		if (nv > CHALLENGE_ANSWER_AREA_MAX_VERTICES) {
			return {
				ok: false,
				error: `Trop de sommets (${nv} > ${CHALLENGE_ANSWER_AREA_MAX_VERTICES}) — simplifie le polygone.`
			};
		}
		return { ok: true, area: merged, ...meta };
	}

	const area = parseQuestionAnswerArea(v);
	if (!area) {
		return {
			ok: false,
			error:
				'Attendu : FeatureCollection, Feature, Polygon, MultiPolygon ou GeometryCollection de surfaces.'
		};
	}
	const nv = countVerticesInAnswerArea(area);
	if (nv > CHALLENGE_ANSWER_AREA_MAX_VERTICES) {
		return {
			ok: false,
			error: `Trop de sommets (${nv} > ${CHALLENGE_ANSWER_AREA_MAX_VERTICES}) — simplifie le polygone.`
		};
	}
	const meta =
		rootType === 'feature'
			? challengeMetaFromProps(propsFromFeature(v))
			: challengeMetaFromProps(
					root.properties && typeof root.properties === 'object'
						? (root.properties as Record<string, unknown>)
						: undefined
				);
	return { ok: true, area, ...meta };
}
