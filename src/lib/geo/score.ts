/**
 * Calcul de score par manche (distance + bonus zone de tolérance).
 * L’XP est persistée côté serveur via `addPlayerXp` ; voir `docs/XP_ET_CLASSEMENTS.md`.
 */

import type { QuestionAnswerArea } from '$lib/types';
import { isPointInAnswerArea } from '$lib/geo/polygon';

const EARTH_R_M = 6371000;
/** Plafond XP par manche (base + bonus tolérance) — identique au max distance + buffer. */
const XP_ROUND_MAX = 1150;

/** Longitude dans ]-180, 180] (copies du monde Leaflet : ex. -190° ≡ 170°). */
function normalizeLngDeg(lng: number): number {
	const x = ((lng + 180) % 360 + 360) % 360 - 180;
	return x === -180 ? 180 : x;
}

function clampLatDeg(lat: number): number {
	return Math.max(-90, Math.min(90, lat));
}

/**
 * Plus petit écart en longitude (degrés) pour le chemin le plus court sur la sphère
 * (évite de traverser toute la carte près de l’antiméridien).
 */
function shortestLngDeltaDeg(lngA: number, lngB: number): number {
	const a = normalizeLngDeg(lngA);
	const b = normalizeLngDeg(lngB);
	let d = b - a;
	if (d > 180) d -= 360;
	if (d < -180) d += 360;
	return d;
}

/** Distance orthodromique (haversine, WGS84), arc **minimal** en longitude. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const φ1 = (clampLatDeg(a.lat) * Math.PI) / 180;
	const φ2 = (clampLatDeg(b.lat) * Math.PI) / 180;
	const Δφ = ((clampLatDeg(b.lat) - clampLatDeg(a.lat)) * Math.PI) / 180;
	const Δλ = (shortestLngDeltaDeg(a.lng, b.lng) * Math.PI) / 180;
	const s =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = Math.min(1, Math.max(0, s));
	return 2 * EARTH_R_M * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

/**
 * XP: 0–1000 base from distance, full bonus if within tolerance buffer (m).
 * Curve: linear decay to ~0 near `maxKm`.
 * Si `answerArea` (polygone pays / région) : hors zone → **0 XP** ; **dans la zone → XP max** (`XP_ROUND_MAX`, pas de gradation à la distance).
 */
export function computeXp(
	guess: { lat: number; lng: number },
	target: { lat: number; lng: number },
	toleranceM: number,
	opts?: { maxKm?: number; answerArea?: QuestionAnswerArea }
): { distanceM: number; xp: number; inBuffer: boolean; insideAnswerArea?: boolean } {
	const answerArea = opts?.answerArea;
	const d = distanceMeters(guess, target);
	if (answerArea) {
		const inside = isPointInAnswerArea(guess.lat, guess.lng, answerArea);
		if (!inside) {
			return { distanceM: Math.round(d), xp: 0, inBuffer: false, insideAnswerArea: false };
		}
		return {
			distanceM: Math.round(d),
			xp: XP_ROUND_MAX,
			inBuffer: true,
			insideAnswerArea: true
		};
	}
	const maxKm = opts?.maxKm ?? 2500;
	const inBuffer = d <= Math.max(0, toleranceM);
	let base: number;
	if (d <= 0) base = 1000;
	else if (d >= maxKm * 1000) base = 0;
	else {
		base = Math.round(1000 * (1 - d / (maxKm * 1000)));
	}
	const bonus = inBuffer ? Math.round(150 * (1 - Math.min(1, d / Math.max(toleranceM, 1)))) : 0;
	const xp = Math.min(XP_ROUND_MAX, base + bonus);
	return {
		distanceM: Math.round(d),
		xp,
		inBuffer,
		...(answerArea ? { insideAnswerArea: true } : {})
	};
}

/** Rayon de tolérance (m → km), libellé court pour l’énoncé (fr-FR). */
export function formatToleranceRadiusKm(toleranceM: number): string {
	const km = Math.max(0, Number(toleranceM)) / 1000;
	if (!Number.isFinite(km)) return '—';
	const maximumFractionDigits = km < 10 ? 2 : km < 100 ? 1 : 0;
	return km.toLocaleString('fr-FR', { maximumFractionDigits });
}
