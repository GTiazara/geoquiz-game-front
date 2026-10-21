<script setup lang="ts">
	import { ref, watchEffect, onMounted, onBeforeUnmount } from 'vue';
	import L from 'leaflet';
	import './map/map.css';
	import type { Control, GeoJSON, Layer, Map as LeafletMap } from 'leaflet';
	import {
		extractYoutubeVideoId,
		normalizeYoutubeUrl,
		toYoutubeEmbedUrl,
		toYoutubeWatchUrl
	} from '$lib/youtube';

	const { text = '' } = defineProps<{ text: string }>();

	const BASE_MAX_Z = 20;

	const root = ref<HTMLDivElement | null>(null);
	const ready = ref(false);
	let map: LeafletMap | null = null;
	let Lref: typeof import('leaflet') | null = null;
	/** Leaflet objects stay outside Vue reactivity. */
	let overlay: GeoJSON | null = null;
	let basemapControl: Control.Layers | null = null;
	let scaleControl: Control.Scale | null = null;
	let resizeObs: ResizeObserver | null = null;
	const parseErr = ref<string | null>(null);
	const layerCount = ref(0);

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

		/** Mêmes clés que l’import serveur (`geopin_repo`). */
	function toleranceMFromProps(p: Record<string, unknown> | null | undefined): number {
		let toleranceM = 50_000;
		const tm = p?.toleranceM ?? p?.tolerance ?? p?.bufferM;
		if (tm != null && Number.isFinite(Number(tm))) toleranceM = Math.max(1000, Number(tm));
		return toleranceM;
	}

	/** Mêmes clés que l’import serveur (`geopin_repo`). */
	function propsMedia(
		p: Record<string, unknown> | null | undefined
	): { img?: string; youtube?: string; desc?: string } {
		const imgRaw = p?.imgUrl ?? p?.imageUrl ?? p?.image_url;
		const ytRaw = p?.youtubeUrl ?? p?.youtube_url;
		const descRaw = p?.description ?? p?.desc;
		let youtube = normalizeYoutubeUrl(ytRaw);
		const imgCand = String(imgRaw ?? '').trim();
		let img: string | undefined;
		if (imgCand) {
			const fromImg = extractYoutubeVideoId(imgCand);
			if (fromImg) {
				if (!youtube) youtube = toYoutubeWatchUrl(fromImg);
			} else {
				img = imgCand;
			}
		}
		const desc = String(descRaw ?? '').trim();
		const out: { img?: string; youtube?: string; desc?: string } = {};
		if (img) out.img = img;
		if (youtube) out.youtube = youtube;
		if (desc) out.desc = desc;
		return out;
	}

	function correctionPopupHtml(title: string, img?: string, youtube?: string, desc?: string): string | null {
		const ytId = youtube ? extractYoutubeVideoId(youtube) : null;
		const embed = ytId ? toYoutubeEmbedUrl(ytId) : null;
		if (!img && !embed && !desc) return null;
		const bits: string[] = [
			'<div class="gp-correction-popup">',
			`<p class="gp-correction-popup__title">${escapeHtml(title)}</p>`
		];
		if (img) {
			bits.push(
				`<div class="gp-correction-popup__imgwrap"><img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async" /></div>`
			);
		}
		if (embed) {
			bits.push(
				`<div class="gp-correction-popup__video"><iframe src="${escapeHtml(embed)}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`
			);
		}
		if (desc) {
			bits.push(`<p class="gp-correction-popup__desc">${escapeHtml(desc).replace(/\n/g, '<br />')}</p>`);
		}
		bits.push('</div>');
		return bits.join('');
	}

	function clearOverlay() {
		if (map && overlay) {
			map.removeLayer(overlay);
			overlay = null;
		}
	}

	/** Parse le GeoJSON fourni et reconstruit ses couches de prévisualisation sur la carte. */
	function applyGeojson() {
		if (!map || !Lref) return;
		const L = Lref;
		clearOverlay();
		parseErr.value = null;
		layerCount.value = 0;
		const raw = text.trim();
		if (!raw) {
			map.setView([24, 15], 2);
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			parseErr.value = 'JSON invalide';
			map.setView([24, 15], 2);
			return;
		}
		try {
			const gj = L.geoJSON(parsed as Parameters<typeof L.geoJSON>[0], {
				style: () => ({
					color: '#22d3ee',
					weight: 2,
					opacity: 0.85,
					fillColor: '#06b6d4',
					fillOpacity: 0.15
				}),
				pointToLayer(_feature, latlng) {
					return L.circleMarker(latlng, {
						radius: 8,
						color: '#fbbf24',
						fillColor: '#f59e0b',
						fillOpacity: 0.95,
						weight: 2
					});
				},
				onEachFeature(feature, layer) {
					const p = feature.properties as Record<string, unknown> | null | undefined;
					const label = String(p?.text ?? p?.question ?? p?.name ?? p?.title ?? '').trim();
					if (label) layer.bindTooltip(label.slice(0, 120), { sticky: true, direction: 'top' });
					const { img, youtube, desc } = propsMedia(p);
					const popHtml = correctionPopupHtml(label || 'Emplacement', img, youtube, desc);
					if (popHtml) {
						layer.bindPopup(popHtml, {
							maxWidth: 560,
							minWidth: 260,
							className: 'gp-leaflet-correction',
							autoPanPadding: [24, 24]
						});
					}
				}
			}) as GeoJSON;

			/** Cercles de tolérance (jeu) pour chaque Point — comme `GeoMap` en correction. */
			gj.eachLayer((child) => {
				const feat = (child as import('leaflet').Layer & { feature?: import('geojson').Feature }).feature;
				if (!feat || feat.geometry?.type !== 'Point') return;
				const coords = feat.geometry.coordinates as [number, number];
				const lng = coords[0];
				const lat = coords[1];
				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
				const p = feat.properties as Record<string, unknown> | null | undefined;
				const toleranceM = toleranceMFromProps(p);
				const zone = L.circle([lat, lng], {
					radius: toleranceM,
					color: '#4ade80',
					fillColor: '#4ade80',
					fillOpacity: 0.12,
					weight: 1,
					dashArray: '6 6'
				});
				gj.addLayer(zone);
				zone.bringToBack();
				const km = (toleranceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
				zone.bindTooltip(`Tolérance : ${km} km`, { sticky: true, direction: 'center' });
			});

			overlay = gj;
			overlay.addTo(map);
			layerCount.value = overlay.getLayers().length;
			const b = overlay.getBounds();
			if (b.isValid()) {
				map.fitBounds(b, { padding: [28, 28], maxZoom: 14 });
			} else {
				parseErr.value = 'Aucune géométrie à afficher';
			}
		} catch {
			parseErr.value = 'Structure GeoJSON illisible';
			map.setView([24, 15], 2);
		}
	}

	watchEffect(() => {
		void ready.value;
		void text;
		void map;
		void Lref;
		applyGeojson();
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
		applyGeojson();
		ready.value = true;
		bump();
	});

	onBeforeUnmount(() => {
		resizeObs?.disconnect();
		resizeObs = null;
		clearOverlay();
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
<template><div class="stack-sm"><div class="between subtle"><span>Aperçu des emplacements</span><span v-if="text.trim()" role="status"><span v-if="parseErr" class="preview-error">{{ parseErr }}</span><span v-else>{{ layerCount }} élément{{ layerCount === 1 ? '' : 's' }} géométrique{{ layerCount === 1 ? '' : 's' }}</span></span></div><div ref="root" class="admin-gj-preview"></div></div></template>
<style scoped>
	.admin-gj-preview :deep(.leaflet-container) {
		height: 100%;
		width: 100%;
		border-radius: 0.75rem;
		background: #ffffff;
	}
	.admin-gj-preview :deep(.leaflet-control-attribution) {
		background: #ffffff;
		color: #64748b;
		font-size: 10px;
		max-width: 55%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.admin-gj-preview :deep(.leaflet-control-attribution a) {
		color: #0f766e;
	}
	.admin-gj-preview :deep(.leaflet-control-scale) {
		margin: 0 0 10px 10px !important;
		padding: 2px 5px;
		border-radius: 0.35rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #ffffff;
		line-height: 1.2;
	}
	.admin-gj-preview :deep(.leaflet-control-scale-line) {
		border-color: #e2e8f0 !important;
		border-top: none;
		color: #020202;
		font-size: 11px;
		font-weight: 600;
	}
	.admin-gj-preview :deep(.leaflet-control-layers) {
		border-radius: 0.5rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #ffffff;
	}
	.admin-gj-preview :deep(.leaflet-control-layers-toggle) {
		width: 36px;
		height: 36px;
		background-size: 24px 24px;
	}
	.admin-gj-preview :deep(.leaflet-control-layers-expanded) {
		padding: 0.35rem 0.5rem;
		font-size: 12px;
	}
	.admin-gj-preview :deep(.leaflet-control-layers-list label) {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0.2rem 0;
		cursor: pointer;
	}
	.admin-gj-preview :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-content-wrapper) {
		background: #ffffff;
		color: #334155;
		border-radius: 0.75rem;
		border: 1px solid #e2e8f0;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
		padding: 0;
	}
	.admin-gj-preview :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-tip) {
		background: #ffffff;
		border: 1px solid #e2e8f0;
	}
	.admin-gj-preview :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-content) {
		margin: 0.75rem 0.85rem;
		min-width: 0;
		width: min(92vw, 520px) !important;
	}
	.admin-gj-preview :deep(.gp-correction-popup__title) {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		font-weight: 700;
		line-height: 1.3;
		color: #334155;
	}
	.admin-gj-preview :deep(.gp-correction-popup__imgwrap) {
		margin: 0 0 0.55rem;
		border-radius: 0.55rem;
		overflow: hidden;
		max-height: min(42vh, 340px);
		background: #ffffff;
	}
	.admin-gj-preview :deep(.gp-correction-popup__imgwrap img) {
		display: block;
		width: 100%;
		height: auto;
		max-height: min(42vh, 340px);
		object-fit: contain;
	}
	.admin-gj-preview :deep(.gp-correction-popup__video) {
		margin: 0 0 0.55rem;
		border-radius: 0.55rem;
		overflow: hidden;
		background: #ffffff;
		aspect-ratio: 16 / 9;
		max-height: min(48vh, 360px);
	}
	.admin-gj-preview :deep(.gp-correction-popup__video iframe) {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 200px;
		border: 0;
	}
	.admin-gj-preview :deep(.gp-correction-popup__desc) {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: #334155;
		white-space: pre-wrap;
	}

</style>
