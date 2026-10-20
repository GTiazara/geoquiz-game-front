<script setup lang="ts">
	import { ref, watchEffect, onMounted, onBeforeUnmount } from 'vue';
	import L from 'leaflet';
	import './map/map.css';
	import type { Control, Layer } from 'leaflet';
	import type { AdminQuestionRow } from '$lib/types';
	import {
		extractYoutubeVideoId,
		normalizeYoutubeUrl,
		toYoutubeEmbedUrl,
		toYoutubeWatchUrl
	} from '$lib/youtube';

	const { questions = [] as AdminQuestionRow[] } = defineProps<{ questions: AdminQuestionRow[] }>();

	const BASE_MAX_Z = 20;

	const root = ref<HTMLDivElement | null>(null);
	const ready = ref(false);
	let map: import('leaflet').Map | null = null;
	let Lref: typeof import('leaflet') | null = null;
	let group: import('leaflet').LayerGroup | null = null;
	let basemapControl: Control.Layers | null = null;
	let scaleControl: Control.Scale | null = null;
	let resizeObs: ResizeObserver | null = null;

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function popupFromQuestion(q: AdminQuestionRow): string | null {
		const title = q.text?.trim() || 'Question';
		let img: string | undefined;
		let youtube: string | undefined;
		const ytExplicit = q.youtubeUrl ? normalizeYoutubeUrl(q.youtubeUrl) : undefined;
		if (q.imgUrl?.trim()) {
			const vid = extractYoutubeVideoId(q.imgUrl.trim());
			if (vid && !ytExplicit) youtube = toYoutubeWatchUrl(vid);
			else if (!vid) img = q.imgUrl.trim();
		}
		if (ytExplicit) youtube = ytExplicit;
		const desc = q.description?.trim();

		const ytId = youtube ? extractYoutubeVideoId(youtube) : null;
		const embed = ytId ? toYoutubeEmbedUrl(ytId) : null;
		if (!img && !embed && !desc) {
			const bits = [
				'<div class="gp-correction-popup">',
				`<p class="gp-correction-popup__title">${escapeHtml(title)}</p>`,
				`<p class="gp-correction-popup__meta">${escapeHtml(q.approved ? 'Publié' : 'Brouillon')} · tol. ${Math.round(q.toleranceM)} m</p>`,
				'</div>'
			];
			return bits.join('');
		}
		const bits: string[] = [
			'<div class="gp-correction-popup">',
			`<p class="gp-correction-popup__title">${escapeHtml(title)}</p>`,
			`<p class="gp-correction-popup__meta">${escapeHtml(q.approved ? 'Publié' : 'Brouillon')} · tol. ${Math.round(q.toleranceM)} m</p>`
		];
		if (img) {
			bits.push(
				`<div class="gp-correction-popup__imgwrap"><img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async" /></div>`
			);
		}
		if (embed) {
			bits.push(
				`<div class="gp-correction-popup__video"><iframe src="${escapeHtml(`${embed}?rel=0`)}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`
			);
		}
		if (desc) {
			bits.push(`<p class="gp-correction-popup__desc">${escapeHtml(desc).replace(/\n/g, '<br />')}</p>`);
		}
		bits.push('</div>');
		return bits.join('');
	}

	function redraw() {
		if (!map || !Lref) return;
		const L = Lref;
		if (group) {
			map.removeLayer(group);
			group = null;
		}
		if (!questions.length) {
			map.setView([24, 15], 2);
			return;
		}

		group = L.layerGroup();
		const bounds = L.latLngBounds([]);

		for (const q of questions) {
			if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng)) continue;
			const latlng = L.latLng(q.lat, q.lng);
			bounds.extend(latlng);
			const tol = Math.max(1000, Number(q.toleranceM) || 50_000);
			const zone = L.circle(latlng, {
				radius: tol,
				color: '#4ade80',
				fillColor: '#4ade80',
				fillOpacity: 0.12,
				weight: 1,
				dashArray: '6 6'
			});
			const km = (tol / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
			zone.bindTooltip(`Tolérance : ${km} km`, { sticky: true, direction: 'center' });
			group.addLayer(zone);
		}

		for (const q of questions) {
			if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng)) continue;
			const latlng = L.latLng(q.lat, q.lng);
			const cm = L.circleMarker(latlng, {
				radius: 8,
				color: '#fbbf24',
				fillColor: '#f59e0b',
				fillOpacity: 0.95,
				weight: 2
			});
			const label = (q.text ?? '').trim().slice(0, 120);
			if (label) cm.bindTooltip(label, { sticky: true, direction: 'top' });
			const html = popupFromQuestion(q);
			if (html) {
				cm.bindPopup(html, {
					maxWidth: 560,
					minWidth: 260,
					className: 'gp-leaflet-correction',
					autoPanPadding: [24, 24]
				});
			}
			group.addLayer(cm);
		}

		group.addTo(map);
		if (bounds.isValid()) {
			map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
		}
	}

	watchEffect(() => {
		void ready.value;
		void questions;
		void map;
		void Lref;
		redraw();
		if (map) requestAnimationFrame(() => map?.invalidateSize({ animate: false }));
	});

	onMounted(() => {
		if (!root.value) return;
		
		Lref = L;
		map = L.map(root.value, { zoomControl: true, worldCopyJump: true }).setView([24, 15], 2);

		map.createPane('gpSatellite');
		const satPane = map.getPane('gpSatellite');
		if (satPane) satPane.style.zIndex = '200';

		const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: BASE_MAX_Z,
			attribution: '&copy; OpenStreetMap'
		});
		const ign = L.tileLayer(
			'https://data.geopf.fr/wmts?layer=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&style=normal&tilematrixset=PM&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix={z}&TileCol={x}&TileRow={y}',
			{
				attribution: '&copy; IGN',
				tileSize: 256,
				minZoom: 0,
				maxZoom: 18,
				noWrap: true
			}
		);
		const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
			maxZoom: BASE_MAX_Z,
			attribution: '&copy; Google',
			subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
			pane: 'gpSatellite'
		});
		const cartoVoyager = L.tileLayer(
			'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
			{
				maxZoom: BASE_MAX_Z,
				subdomains: 'abcd',
				attribution: '&copy; OpenStreetMap &copy; CARTO',
				pane: 'gpSatellite'
			}
		);
		const satelliteHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
			maxZoom: BASE_MAX_Z,
			attribution: '&copy; Google',
			subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
			pane: 'gpSatellite'
		});
		const opentopomap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
			maxZoom: 17,
			attribution: '&copy; OpenTopoMap'
		});
		const esri = L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
			{
				maxZoom: BASE_MAX_Z,
				attribution: '&copy; Esri',
				pane: 'gpSatellite',
				opacity: 1
			}
		);

		const basemapLayers: Record<string, Layer> = {
			OpenStreetMap: street,
			'Imagerie Esri': esri,
			'Google satellite': googleSatellite,
			'Google sat + routes': satelliteHybrid,
			'Carto Voyager': cartoVoyager,
			OpenTopoMap: opentopomap,
			IGN: ign
		};

		esri.addTo(map);
		basemapControl = L.control.layers(basemapLayers, {}, {
			collapsed: true,
			position: 'bottomright'
		}).addTo(map);

		scaleControl = L.control.scale({
			position: 'bottomleft',
			maxWidth: 140,
			metric: true,
			imperial: false,
			updateWhenIdle: true
		});
		scaleControl.addTo(map);

		const bump = () => requestAnimationFrame(() => map?.invalidateSize({ animate: false }));
		bump();
		resizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(bump) : null;
		resizeObs?.observe(root.value);
		redraw();
		ready.value = true;
		bump();
	});

	onBeforeUnmount(() => {
		resizeObs?.disconnect();
		resizeObs = null;
		if (map && group) {
			map.removeLayer(group);
			group = null;
		}
		if (map && basemapControl) {
			map.removeControl(basemapControl);
			basemapControl = null;
		}
		if (map && scaleControl) {
			map.removeControl(scaleControl);
			scaleControl = null;
		}
		map?.remove();
		map = null;
		Lref = null;
	});

</script>
<template><div class="stack-sm"><div class="between subtle"><span>Emplacements et zones de tolérance</span><span>{{ questions.length }} point{{ questions.length === 1 ? '' : 's' }}</span></div><div ref="root" class="admin-theme-q-map"></div></div></template>
<style scoped>
	.admin-theme-q-map :deep(.leaflet-container) {
		height: 100%;
		width: 100%;
		border-radius: 0.75rem;
		background: #ffffff;
	}
	.admin-theme-q-map :deep(.leaflet-control-attribution) {
		background: #ffffff;
		color: #64748b;
		font-size: 10px;
		max-width: 55%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.admin-theme-q-map :deep(.leaflet-control-attribution a) {
		color: #0f766e;
	}
	.admin-theme-q-map :deep(.leaflet-control-scale) {
		margin: 0 0 10px 10px !important;
		padding: 2px 5px;
		border-radius: 0.35rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #ffffff;
		line-height: 1.2;
	}
	.admin-theme-q-map :deep(.leaflet-control-scale-line) {
		border-color: #e2e8f0 !important;
		border-top: none;
		color: #ffffff;
		font-size: 11px;
		font-weight: 600;
	}
	.admin-theme-q-map :deep(.leaflet-control-layers) {
		border-radius: 0.5rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #334155;
	}
	.admin-theme-q-map :deep(.leaflet-control-layers-toggle) {
		width: 36px;
		height: 36px;
		background-size: 24px 24px;
	}
	.admin-theme-q-map :deep(.leaflet-control-layers-expanded) {
		padding: 0.35rem 0.5rem;
		font-size: 12px;
	}
	.admin-theme-q-map :deep(.leaflet-control-layers-list label) {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0.2rem 0;
		cursor: pointer;
	}
	.admin-theme-q-map :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-content-wrapper) {
		background: #ffffff;
		color: #334155;
		border-radius: 0.75rem;
		border: 1px solid #e2e8f0;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
		padding: 0;
	}
	.admin-theme-q-map :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-tip) {
		background: #ffffff;
		border: 1px solid #e2e8f0;
	}
	.admin-theme-q-map :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-content) {
		margin: 0.75rem 0.85rem;
		min-width: 0;
		width: min(92vw, 520px) !important;
	}
	.admin-theme-q-map :deep(.gp-correction-popup__title) {
		margin: 0 0 0.35rem;
		font-size: 0.8rem;
		font-weight: 700;
		line-height: 1.3;
		color: #334155;
	}
	.admin-theme-q-map :deep(.gp-correction-popup__meta) {
		margin: 0 0 0.5rem;
		font-size: 0.65rem;
		color: #64748b;
	}
	.admin-theme-q-map :deep(.gp-correction-popup__imgwrap) {
		margin: 0 0 0.55rem;
		border-radius: 0.55rem;
		overflow: hidden;
		max-height: min(42vh, 340px);
		background: #ffffff;
	}
	.admin-theme-q-map :deep(.gp-correction-popup__imgwrap img) {
		display: block;
		width: 100%;
		height: auto;
		max-height: min(42vh, 340px);
		object-fit: contain;
	}
	.admin-theme-q-map :deep(.gp-correction-popup__video) {
		margin: 0 0 0.55rem;
		position: relative;
		padding-bottom: 56.25%;
		height: 0;
		border-radius: 0.55rem;
		overflow: hidden;
		background: #ffffff;
	}
	.admin-theme-q-map :deep(.gp-correction-popup__video iframe) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}
	.admin-theme-q-map :deep(.gp-correction-popup__desc) {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.45;
		color: #334155;
	}

</style>
