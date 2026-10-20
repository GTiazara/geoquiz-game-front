<!--
Public API (same names/defaults as the Svelte map):
  interactive=true; guess=null (v-model:guess); answer=null; showResult=false;
  toleranceM=50000; answerArea=null; borders=true; showBasemapSelector=true;
  correctionPopup=null; participantGuessMarkers=null; resultFitAutoBounds=true;
  storyEnabled=false; storySteps=[]; storyActiveStepIndex=-1;
  allowOverlayTranslation=false; storyLayerWithResult=false;
  storyRevealOnResolve=false; storyResolvedStepIds=[].
Callback props: onCorrectionMediaSaved(question), onCommunityEditProposalSubmitted(),
  onAdminMapClick({lat,lng}). Emits: update:guess({lat,lng}|null).
Exposed methods: none (the original exports no instance methods).
-->
<script setup lang="ts">
	import { ref, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue';
	import L from 'leaflet';
	import './map/map.css';
	import { apiFetch } from '$lib/api';
	import { asset } from '$lib/appUrl';
	import markerIcon from 'leaflet/dist/images/marker-icon.png';
	import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
	import markerShadow from 'leaflet/dist/images/marker-shadow.png';
 L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIconRetina, shadowUrl: markerShadow });
	import type { Control, Layer, Map as LeafletMap, LayerGroup, TileLayer } from 'leaflet';
	import type { Question, QuestionAnswerArea } from '$lib/types';
	import type { Geometry } from 'geojson';
	import { extractYoutubeVideoId, toYoutubeEmbedUrl } from '$lib/youtube';
	import { scheduleTranslateRefresh } from '$lib/googleTranslateBrowser';

	const ready = ref(false);

	type LngLat = { lat: number; lng: number };
	type StoryStepPoint = {
		id?: string;
		lat: number;
		lng: number;
		title?: string;
		year?: string;
		narration?: string;
		miniChallenge?: { question?: string };
	};

	const BASE_MAX_Z = 20;
	/** Fond sans libellés : Esri à faible zoom, Google satellite à partir du seuil. */
	const PLAY_BASEMAP_ZOOM_THRESHOLD = 15;
	const {
		interactive = true,
		guess: guessProp = null,
		answer = null as LngLat | null,
		showResult = false,
		toleranceM = 50_000,
		answerArea = null as QuestionAnswerArea | null,
		borders = true,
		/** Faux pendant la manche (ex. jeu) pour cacher le sélecteur de fonds. */
		showBasemapSelector = true,
		correctionPopup = null as {
			questionId?: string;
			/** Joueur inscrit uniquement : affiche le bloc média modifiable. */
			mediaEditable?: boolean;
			/** Cas admin : bloc en lecture seule avec ce texte (échappement HTML). */
			mediaReadonlyHint?: string;
			title: string;
			imgUrl?: string;
			youtubeUrl?: string;
			description?: string;
			/** Proposition texte / lieu / description — soumise au vote (Contribuer). */
			contentProposalEditable?: boolean;
			proposalBaseline?: { text: string; lat: number; lng: number; description?: string };
		} | null,
		/** Après PATCH médias réussi (évite de lier `redraw` à une fonction non stable du parent). */
		onCorrectionMediaSaved,
		/** Après envoi réussi d’une proposition de correction communautaire. */
		onCommunityEditProposalSubmitted,
		/**
		 * Résultat Geobattle : un marqueur par participant avec libellé (ex. pseudo).
		 * Quand non vide, remplace le seul disque vert « ma proposition ».
		 */
		participantGuessMarkers = null as
			| { label: string; lat: number; lng: number; isSelf?: boolean }[]
			| null,
		/**
		 * Après correction : cadrer la vue sur la zone de réponse / toutes les propositions (défaut : oui).
		 * Mettre à `false` pour garder le zoom / centre actuels du joueur (ex. duels Geobattle).
		 */
		resultFitAutoBounds = true,
		/** Mode aventure : affiche trajet + mascotte sur la carte. */
		storyEnabled = false,
		storySteps = [] as StoryStepPoint[],
		storyActiveStepIndex = -1,
		/** Autorise la traduction du contenu texte injecté dans la carte (popup aventure). */
		allowOverlayTranslation = false,
		/**
		 * Avec `showResult` (correction) : afficher quand même le tracé / pastilles / pingouin des `storySteps`
		 * (ex. admin /histoire pour voir étape + cible du défi en même temps).
		 */
		storyLayerWithResult = false,
		/** Mode joueur /histoire : pastilles et tracé uniquement après résolution des défis. */
		storyRevealOnResolve = false,
		storyResolvedStepIds = [] as string[],
		/** Admin (ex. histoire) : appelé à chaque clic valide, avant la mise à jour de `guess`. */
		onAdminMapClick
	} = defineProps<{
		interactive?: boolean;
		guess?: LngLat | null;
		answer?: LngLat | null;
		showResult?: boolean;
		toleranceM?: number;
		answerArea?: QuestionAnswerArea | null;
		borders?: boolean;
		showBasemapSelector?: boolean;
		participantGuessMarkers?: { label: string; lat: number; lng: number; isSelf?: boolean }[] | null;
		resultFitAutoBounds?: boolean;
		storyEnabled?: boolean;
		storySteps?: StoryStepPoint[];
		storyActiveStepIndex?: number;
		allowOverlayTranslation?: boolean;
		storyLayerWithResult?: boolean;
		storyRevealOnResolve?: boolean;
		storyResolvedStepIds?: string[];
		correctionPopup?: {
			questionId?: string;
			mediaEditable?: boolean;
			mediaReadonlyHint?: string;
			title: string;
			imgUrl?: string;
			youtubeUrl?: string;
			description?: string;
			contentProposalEditable?: boolean;
			proposalBaseline?: { text: string; lat: number; lng: number; description?: string };
		} | null;
		onCorrectionMediaSaved?: (question: Question) => void;
		onCommunityEditProposalSubmitted?: () => void;
		onAdminMapClick?: (pos: { lat: number; lng: number }) => void;
	}>();

	const emit = defineEmits<{ 'update:guess': [value: LngLat | null] }>();
	let guess: LngLat | null = guessProp;
	watch(() => guessProp, (value) => { guess = value; if (ready.value) redraw(); }, { deep: true });

	/** Dernière callback parent (lue au clic, pas au bind du popup). */
	let correctionMediaSavedRef: ((question: Question) => void) | undefined;
	let communityEditProposalSubmittedRef: (() => void) | undefined;
	let onAdminMapClickRef: ((pos: { lat: number; lng: number }) => void) | undefined;
	watchEffect(() => {
		void ready.value;
		correctionMediaSavedRef = onCorrectionMediaSaved;
		communityEditProposalSubmittedRef = onCommunityEditProposalSubmitted;
		onAdminMapClickRef = onAdminMapClick;
	});

	const root = ref<HTMLDivElement | null>(null);

	let map: LeafletMap | null = null;
	let Lref: typeof import('leaflet') | null = null;
	let layerGroup: LayerGroup | null = null;
	let clickOff: (() => void) | null = null;
	/** Fonds carte : rempli dans onMounted. */
	let basemapLayers: Record<string, Layer> | null = null;
	let basemapControl: Control.Layers | null = null;
	let scaleControl: Control.Scale | null = null;
	/** Tuiles prêtes (onMounted) : bascule auto fond question Esri ↔ Google hybrid. */
	const basemapTilesReady = ref(false);
	/** Zoom faible en manche : World Imagery Esri (réutilise la même tuile que le sélecteur « Imagerie Esri »). */
	let playNeutralLayer: TileLayer | null = null;
	let playHybridLayer: TileLayer | null = null;
	let cartoVoyager_opacity: TileLayer | null = null;
	let playAutoActive: Layer | null = null;
	/** Bouton surcouche Carto (pendant la question, au-dessus de l’échelle). */
	let voyagerOverlayControl: Control | null = null;
	let voyagerToggleButton: HTMLButtonElement | null = null;
	/** Surcouche semi-transparente demandée par l’utilisateur (manche seulement, `showBasemapSelector` faux). */
	const voyagerOverlayDesired = ref(false);
	/** `interactive` = autoriser le clic pour placer le guess uniquement. Pan / zoom restent toujours actifs (écran résultat + bouton « Question suivante »). */
	
	let storyLayer: LayerGroup | null = null;
	let storyMarker: import('leaflet').Marker | null = null;
	let storyAnimationFrame: number | null = null;
	let storyAnimatedPoint: LngLat | null = null;
	let storyLastStepIndex = -1;
	let storyLastKey = '';
	const storyLastUserClick = ref<LngLat | null>(null);

	

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function samePoint(a: LngLat, b: LngLat): boolean {
		return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
	}

	/**
	 * Ramène une longitude sur la même « copie » du monde qu’une longitude de référence (±360 k),
	 * pour que segment + marqueurs suivent le plus court chemin (évite de traverser tout le globe
	 * quand un clic tombe sur un exemplaire décalé du planisphère, ex. méridien 180°).
	 */
	function unwrapLngToward(lng: number, ref: number): number {
		let x = lng;
		while (x - ref > 180) x -= 360;
		while (x - ref < -180) x += 360;
		return x;
	}

	/** Popup correction : image, vidéo YouTube et/ou texte (échappement HTML ; iframe src = URL embed dérivée). */
	function correctionPopupHtml(pop: {
		questionId?: string;
		mediaEditable?: boolean;
		mediaReadonlyHint?: string;
		title: string;
		imgUrl?: string;
		youtubeUrl?: string;
		description?: string;
		contentProposalEditable?: boolean;
		proposalBaseline?: { text: string; lat: number; lng: number; description?: string };
	}): string | null {
		const img = pop.imgUrl?.trim();
		const desc = pop.description?.trim();
		const ytId = pop.youtubeUrl ? extractYoutubeVideoId(pop.youtubeUrl) : null;
		const embed = ytId ? toYoutubeEmbedUrl(ytId) : null;
		const qidRaw = pop.questionId?.trim();
		const showMediaEditor = Boolean(
			qidRaw && (pop.mediaEditable === true || Boolean(pop.mediaReadonlyHint?.trim()))
		);
		const showContentProposal = Boolean(
			qidRaw && pop.contentProposalEditable === true && pop.proposalBaseline
		);
		if (!embed && !img && !desc && !showMediaEditor && !showContentProposal) return null;
		const bits: string[] = ['<div class="gp-correction-popup">'];
		// Correction: vidéo prioritaire, sinon image (pas les deux).
		if (embed) {
			bits.push(
				'<div class="gp-correction-popup__head">',
				`<p class="gp-correction-popup__title">${escapeHtml(pop.title)}</p>`,
				'</div>'
			);
			const src = `${embed}?rel=0`;
			bits.push(
				`<div class="gp-correction-popup__video"><iframe src="${escapeHtml(src)}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`
			);
		} else if (img) {
			bits.push(
				'<div class="gp-correction-popup__head">',
				`<p class="gp-correction-popup__title">${escapeHtml(pop.title)}</p>`,
				`<div class="gp-correction-popup__thumb"><img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async" /></div>`,
				'</div>'
			);
		} else {
			bits.push(`<p class="gp-correction-popup__title gp-correction-popup__title--solo">${escapeHtml(pop.title)}</p>`);
		}
		if (desc) {
			bits.push(`<p class="gp-correction-popup__desc">${escapeHtml(desc).replace(/\n/g, '<br />')}</p>`);
		}
		if (showMediaEditor && qidRaw) {
			const qid = escapeHtml(qidRaw);
			const canEdit = pop.mediaEditable === true;
			const vImg = escapeHtml(pop.imgUrl ?? '');
			const vYt = escapeHtml(pop.youtubeUrl ?? '');
			const roAttr = canEdit ? '' : ' disabled';
			let hintBlock = '';
			if (!canEdit) {
				const custom = pop.mediaReadonlyHint?.trim();
				if (custom) {
					hintBlock = `<p class="gp-correction-popup__media-readonly-hint">${escapeHtml(custom)}</p>`;
				}
			}
			bits.push(
				`<div class="gp-correction-popup__media" data-qid="${qid}" data-media-editable="${canEdit ? '1' : '0'}">`,
				hintBlock,
				'<button type="button" class="gp-correction-popup__media-toggle" aria-expanded="false">Image ou vidéo</button>',
				'<div class="gp-correction-popup__media-panel" hidden>',
				`<label class="gp-correction-popup__lbl">Image <input type="url" class="gp-correction-popup__in-img" value="${vImg}" placeholder="https://…" autocomplete="off" spellcheck="false"${roAttr} /></label>`,
				`<label class="gp-correction-popup__lbl">YouTube <input type="url" class="gp-correction-popup__in-yt" value="${vYt}" placeholder="https://…" autocomplete="off" spellcheck="false"${roAttr} /></label>`,
				`<button type="button" class="gp-correction-popup__media-update"${canEdit ? '' : ' disabled'}>Enregistrer</button>`,
				'<p class="gp-correction-popup__media-status" hidden></p>',
				'</div></div>'
			);
		}
		if (showContentProposal && qidRaw && pop.proposalBaseline) {
			const qid = escapeHtml(qidRaw);
			const b = pop.proposalBaseline;
			const vText = escapeHtml(b.text);
			const vLat = escapeHtml(String(Number(b.lat.toFixed(6))));
			const vLng = escapeHtml(String(Number(b.lng.toFixed(6))));
			const vDesc = escapeHtml(b.description ?? '');
			bits.push(
				`<div class="gp-correction-popup__proposal" data-qid="${qid}">`,
				'<button type="button" class="gp-correction-popup__proposal-toggle" aria-expanded="false">Texte, lieu, description (vote communautaire)</button>',
				'<div class="gp-correction-popup__proposal-panel" hidden>',
				'<p class="gp-correction-popup__proposal-hint">Les changements ne sont pas immédiats : ils sont soumis sur la page Contribuer pour vote, comme les nouvelles questions.</p>',
				`<label class="gp-correction-popup__lbl">Question <input type="text" class="gp-correction-popup__in-qtext" maxlength="200" value="${vText}" autocomplete="off" /></label>`,
				'<p class="gp-correction-popup__pickmap-hint">Emplacement : clique sur la carte ou déplace le marqueur — même choix de fonds que la grande carte (icône des calques en bas à droite).</p>',
				'<div class="gp-correction-popup__pickmap" tabindex="-1"></div>',
				`<label class="gp-correction-popup__lbl">Latitude <input type="text" class="gp-correction-popup__in-qlat" inputmode="decimal" value="${vLat}" autocomplete="off" spellcheck="false" /></label>`,
				`<label class="gp-correction-popup__lbl">Longitude <input type="text" class="gp-correction-popup__in-qlng" inputmode="decimal" value="${vLng}" autocomplete="off" spellcheck="false" /></label>`,
				'<label class="gp-correction-popup__lbl">Description',
				`<textarea class="gp-correction-popup__in-qdesc" rows="3" maxlength="4000" autocomplete="off">${vDesc}</textarea></label>`,
				'<button type="button" class="gp-correction-popup__proposal-send">Proposer pour validation</button>',
				'<p class="gp-correction-popup__proposal-status" hidden></p>',
				'</div></div>'
			);
		}
		bits.push(
			'<button type="button" class="gp-correction-popup__close">Fermer</button>',
			'</div>'
		);
		return bits.join('');
	}

	function clearDraw() {
		if (map && layerGroup) {
			map.removeLayer(layerGroup);
			layerGroup = null;
		}
	}

	function schedulePopupTranslateRefresh() {
		if (typeof window === 'undefined') return;
		scheduleTranslateRefresh();
	}

	function stopStoryAnimation() {
		if (storyAnimationFrame != null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(storyAnimationFrame);
		}
		storyAnimationFrame = null;
	}

	function clearStoryLayer() {
		stopStoryAnimation();
		if (map && storyLayer) map.removeLayer(storyLayer);
		storyLayer = null;
		storyMarker = null;
		storyAnimatedPoint = null;
		storyLastUserClick.value = null;
	}

	function storyPopupHtml(
		step: StoryStepPoint,
		stepIndex: number,
		totalSteps: number,
		options?: { includeChallenge?: boolean }
	): string {
		const includeChallenge = options?.includeChallenge ?? true;
		const title = escapeHtml(step.title?.trim() || 'Étape');
		const closeBtn =
			'<button type="button" class="gp-story-popup__close" aria-label="Fermer le popup">Fermer</button>';
		const year = step.year?.trim() ? `<p class="gp-story-popup__year">${escapeHtml(step.year)}</p>` : '';
		const narration = step.narration?.trim()
			? `<p class="gp-story-popup__narration">${escapeHtml(step.narration).replace(/\n/g, '<br />')}</p>`
			: '';
		const miniQ = step.miniChallenge?.question?.trim();
		const challenge =
			includeChallenge && miniQ
				? `<div class="gp-story-popup__challenge">
				<p class="gp-story-popup__challenge-kicker">Défi géo</p>
				<p class="gp-story-popup__challenge-q">${escapeHtml(miniQ)}</p>
				<p class="gp-story-popup__challenge-hint">Clique sur la carte pour placer ton point (réponse géolocalisée).</p>
			</div>`
				: '';
		const clickInfo = storyLastUserClick.value
			? `<p class="gp-story-popup__click">Dernier clic: ${storyLastUserClick.value.lat.toFixed(3)}, ${storyLastUserClick.value.lng.toFixed(3)}</p>`
			: '';
		return `<div class="gp-story-popup">
			<div class="gp-story-popup__top">${closeBtn}</div>
			<p class="gp-story-popup__step">Étape ${stepIndex + 1} / ${totalSteps}</p>
			<p class="gp-story-popup__title">${title}</p>
			${year}
			${narration}
			${challenge}
			${clickInfo}
		</div>`;
	}

	function isStoryStepResolved(idx: number): boolean {
		const step = storySteps[idx];
		if (!step) return false;
		if (storyRevealOnResolve) {
			return !!step.id && storyResolvedStepIds.includes(step.id);
		}
		return idx <= Math.max(0, Math.min(storyActiveStepIndex, storySteps.length - 1));
	}

	function storyMarkerIcon(L: typeof import('leaflet')) {
		return L.divIcon({
			className: 'gp-story-penguin-icon',
			iconSize: [44, 44],
			iconAnchor: [22, 34],
			popupAnchor: [0, -22],
			html:
				'<div class="gp-story-penguin-wrap">' +
				`<img src="${asset('mascot/mascot.jpg')}" alt="" />` +
				'</div>'
		});
	}

	function ensureStoryLayer() {
		if (!map || !Lref) return null;
		if (!storyLayer) storyLayer = Lref.layerGroup().addTo(map);
		return storyLayer;
	}

	function animateStoryMarker(from: LngLat, to: LngLat) {
		if (!Lref || !storyMarker) return;
		stopStoryAnimation();
		const duration = 1050;
		const start = performance.now();
		const lngFrom = from.lng;
		const lngTo = unwrapLngToward(to.lng, lngFrom);
		const tickAnim = (t: number) => {
			const raw = Math.min((t - start) / duration, 1);
			const eased = 1 - Math.pow(1 - raw, 3);
			const lat = from.lat + (to.lat - from.lat) * eased;
			const lng = lngFrom + (lngTo - lngFrom) * eased;
			storyMarker?.setLatLng([lat, lng]);
			if (map) map.panTo([lat, lng], { animate: false });
			if (raw < 1) storyAnimationFrame = requestAnimationFrame(tickAnim);
			else storyAnimationFrame = null;
		};
		storyAnimationFrame = requestAnimationFrame(tickAnim);
	}

	function redrawStoryAdventure() {
		if (!map || !Lref) return;
		const quietStoryPreview = storyEnabled && showResult && storyLayerWithResult && !storyRevealOnResolve;
		const adventureActive =
			storyEnabled && (!showResult || storyLayerWithResult) && storySteps.length > 0;
		if (!adventureActive) {
			clearStoryLayer();
			storyLastStepIndex = -1;
			storyLastKey = '';
			return;
		}
		const L = Lref;
		const layer = ensureStoryLayer();
		if (!layer) return;
		layer.clearLayers();
		const normalizedStep = Math.max(0, Math.min(storyActiveStepIndex, storySteps.length - 1));
		const storyKey = storySteps.map((s) => `${s.lat.toFixed(4)}:${s.lng.toFixed(4)}`).join('|');

		if (storyRevealOnResolve) {
			for (let i = 0; i < storySteps.length - 1; i++) {
				if (!isStoryStepResolved(i) || !isStoryStepResolved(i + 1)) continue;
				const a = storySteps[i];
				const b = storySteps[i + 1];
				L.polyline([L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng)], {
					color: '#22d3ee',
					weight: 3,
					opacity: 0.85,
					dashArray: '8 8'
				}).addTo(layer);
			}

			storySteps.forEach((step, idx) => {
				if (!isStoryStepResolved(idx)) return;
				L.circleMarker([step.lat, step.lng], {
					radius: 6.5,
					color: '#99f6e4',
					fillColor: '#14b8a6',
					fillOpacity: 0.95,
					weight: 2
				})
					.addTo(layer)
					.bindTooltip(
						`${idx + 1}. ${escapeHtml(step.title?.trim() || 'Étape')}${step.year ? ` (${escapeHtml(step.year)})` : ''}`,
						{ className: 'gp-story-step-tt', direction: 'top', offset: [0, -6] }
					);
			});

			const showPenguin = showResult && isStoryStepResolved(normalizedStep);
			if (!showPenguin) {
				stopStoryAnimation();
				if (storyMarker) {
					storyMarker.closePopup();
					layer.removeLayer(storyMarker);
					storyMarker = null;
				}
				storyAnimatedPoint = null;
				storyLastStepIndex = normalizedStep;
				storyLastKey = storyKey;
				return;
			}

			const target = storySteps[normalizedStep];
			if (!target) return;
			const targetPoint: LngLat = { lat: target.lat, lng: target.lng };
			if (!storyMarker) {
				storyMarker = L.marker([targetPoint.lat, targetPoint.lng], {
					icon: storyMarkerIcon(L),
					zIndexOffset: 890
				});
			}
			storyMarker.addTo(layer);
			stopStoryAnimation();
			storyMarker.setLatLng([targetPoint.lat, targetPoint.lng]);
			map.flyTo([targetPoint.lat, targetPoint.lng], Math.max(map.getZoom(), 4), {
				animate: true,
				duration: 0.9
			});
			storyMarker.bindPopup(
				storyPopupHtml(target, normalizedStep, storySteps.length, { includeChallenge: false }),
				{
					maxWidth: 340,
					minWidth: 250,
					className: 'gp-story-popup-wrap',
					autoPanPadding: [20, 20],
					closeButton: false,
					offset: [0, -8]
				}
			);
			storyMarker.off('popupopen');
			storyMarker.on('popupopen', () => {
				schedulePopupTranslateRefresh();
				const rootEl = storyMarker?.getPopup()?.getElement();
				const closeBtn = rootEl?.querySelector('.gp-story-popup__close');
				if (!(closeBtn instanceof HTMLButtonElement)) return;
				const onClose = (e: Event) => {
					e.preventDefault();
					e.stopPropagation();
					storyMarker?.closePopup();
				};
				closeBtn.addEventListener('click', onClose, { once: true });
			});
			queueMicrotask(() => storyMarker?.openPopup());
			storyAnimatedPoint = targetPoint;
			storyLastStepIndex = normalizedStep;
			storyLastKey = storyKey;
			return;
		}

		/** Jeu : tracé jusqu'à l'étape courante ; après correction du défi : aperçu des étapes futures. */
		const visibleSteps = quietStoryPreview
			? storySteps
			: storySteps.slice(0, normalizedStep + 1);
		const pathLatLngs = visibleSteps.map((step) => L.latLng(step.lat, step.lng));
		if (pathLatLngs.length >= 2) {
			L.polyline(pathLatLngs, {
				color: '#22d3ee',
				weight: 3,
				opacity: 0.85,
				dashArray: '8 8'
			}).addTo(layer);
		}

		visibleSteps.forEach((step, idx) => {
			const visited = idx <= normalizedStep;
			L.circleMarker([step.lat, step.lng], {
				radius: visited ? 6.5 : 4.5,
				color: visited ? '#99f6e4' : '#94a3b8',
				fillColor: visited ? '#14b8a6' : '#334155',
				fillOpacity: visited ? 0.95 : 0.7,
				weight: 2
			})
				.addTo(layer)
				.bindTooltip(
					`${idx + 1}. ${escapeHtml(step.title?.trim() || 'Étape')}${step.year ? ` (${escapeHtml(step.year)})` : ''}`,
					{ className: 'gp-story-step-tt', direction: 'top', offset: [0, -6] }
				);
		});

		const target = storySteps[normalizedStep];
		if (!target) return;
		const targetPoint: LngLat = { lat: target.lat, lng: target.lng };
		let fromPoint = storyAnimatedPoint ?? targetPoint;
		const shouldAnimate =
			!quietStoryPreview &&
			storyLastStepIndex >= 0 &&
			normalizedStep !== storyLastStepIndex &&
			storyKey === storyLastKey &&
			storyAnimatedPoint != null;
		if (!storyMarker) {
			storyMarker = L.marker([targetPoint.lat, targetPoint.lng], {
				icon: storyMarkerIcon(L),
				zIndexOffset: 890
			});
		}
		storyMarker.addTo(layer);
		if (shouldAnimate) {
			animateStoryMarker(fromPoint, targetPoint);
		} else {
			stopStoryAnimation();
			storyMarker.setLatLng([targetPoint.lat, targetPoint.lng]);
			if (!quietStoryPreview) {
				map.flyTo([targetPoint.lat, targetPoint.lng], Math.max(map.getZoom(), 4), {
					animate: true,
					duration: 0.9
				});
			}
		}
		storyMarker.bindPopup(storyPopupHtml(target, normalizedStep, storySteps.length), {
			maxWidth: 340,
			minWidth: 250,
			className: 'gp-story-popup-wrap',
			autoPanPadding: [20, 20],
			closeButton: false,
			offset: [0, -8]
		});
		storyMarker.off('popupopen');
		storyMarker.on('popupopen', () => {
			schedulePopupTranslateRefresh();
			const rootEl = storyMarker?.getPopup()?.getElement();
			const closeBtn = rootEl?.querySelector('.gp-story-popup__close');
			if (!(closeBtn instanceof HTMLButtonElement)) return;
			const onClose = (e: Event) => {
				e.preventDefault();
				e.stopPropagation();
				storyMarker?.closePopup();
			};
			closeBtn.addEventListener('click', onClose, { once: true });
		});
		if (!quietStoryPreview) {
			queueMicrotask(() => storyMarker?.openPopup());
		} else {
			storyMarker.closePopup();
		}
		storyAnimatedPoint = targetPoint;
		storyLastStepIndex = normalizedStep;
		storyLastKey = storyKey;
	}

	function redraw() {
		if (!map || !Lref) return;
		clearDraw();
		const L = Lref;
		layerGroup = L.layerGroup().addTo(map);

		const guessSameAsAnswer = !!(guess && answer && showResult && samePoint(guess, answer));
		let guessLngDraw = guess?.lng ?? 0;
		if (guess && answer && showResult && !guessSameAsAnswer) {
			guessLngDraw = unwrapLngToward(guess.lng, answer.lng);
		}
		const useParticipantGuesses = Boolean(
			showResult &&
				answer &&
				participantGuessMarkers &&
				participantGuessMarkers.length > 0
		);
		if (guess && !guessSameAsAnswer && !useParticipantGuesses) {
			L.circleMarker([guess.lat, guessLngDraw], {
				radius: 10,
				color: '#4ade80',
				fillColor: '#22c55e',
				fillOpacity: 0.9,
				weight: 2
			}).addTo(layerGroup);
		}

		let answerZone: import('leaflet').Circle | import('leaflet').GeoJSON | null = null;
		if (showResult && answer) {
			const truthIcon = L.divIcon({
				className: 'gp-truth-marker-icon',
				html:
					'<svg class="gp-truth-pin-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="26" height="35" aria-hidden="true">' +
					'<defs>' +
					'<linearGradient id="gp-truth-pin-grad" x1="12" y1="0" x2="12" y2="32" gradientUnits="userSpaceOnUse">' +
					'<stop offset="0" stop-color="#5eead4"/>' +
					'<stop offset="0.55" stop-color="#14b8a6"/>' +
					'<stop offset="1" stop-color="#0f766e"/>' +
					'</linearGradient>' +
					'</defs>' +
					'<path fill="url(#gp-truth-pin-grad)" stroke="rgba(15,23,42,0.22)" stroke-width="0.35" stroke-linejoin="round" d="M12 0C5.4 0 0 5.4 0 12c0 8.5 12 20 12 20s12-11.5 12-20C24 5.4 18.6 0 12 0z"/>' +
					'<circle cx="12" cy="11" r="3.6" fill="rgba(255,255,255,0.93)"/>' +
					'</svg>',
				iconSize: [26, 35],
				iconAnchor: [13, 35],
				popupAnchor: [0, -32]
			});

			const answerMarker = L.marker([answer.lat, answer.lng], {
				icon: truthIcon,
				zIndexOffset: 550
			}).addTo(layerGroup);

			const popHtml = correctionPopup ? correctionPopupHtml(correctionPopup) : null;
			if (popHtml) {
				answerMarker.bindPopup(popHtml, {
					/** La largeur réelle vient du CSS (`85vw`) ; valeur élevée pour ne pas plafonner avant le CSS. */
					maxWidth: 2000,
					minWidth: 200,
					className: 'gp-leaflet-correction',
					autoPanPadding: [16, 16]
				});
				answerMarker.bindTooltip('Fun fact? : cliquez !', {
					permanent: true,
					direction: 'top',
					offset: [0, -36],
					className: 'gp-truth-marker-hint',
					interactive: false,
					opacity: 1
				});
				answerMarker.on('popupopen', () => {
					answerMarker.closeTooltip();
					schedulePopupTranslateRefresh();
					const rootEl = answerMarker.getPopup()?.getElement();
					if (!rootEl) return;
					const cleanups: (() => void)[] = [];
     const controller = new AbortController();
     let popupActive = true;
     const popupTimers = new Set<number>();
     const later = (callback: () => void, delay: number) => {
      const id = window.setTimeout(() => { popupTimers.delete(id); if (popupActive) callback(); }, delay);
      popupTimers.add(id);
     };
     cleanups.push(() => { popupActive = false; controller.abort(); popupTimers.forEach((id) => window.clearTimeout(id)); });

					const closeBtn = rootEl.querySelector('.gp-correction-popup__close');
					if (closeBtn instanceof HTMLButtonElement) {
						const onClose = (e: Event) => {
							e.preventDefault();
							e.stopPropagation();
							answerMarker.closePopup();
						};
						closeBtn.addEventListener('click', onClose);
						cleanups.push(() => closeBtn.removeEventListener('click', onClose));
					}

					const mediaRoot = rootEl.querySelector('.gp-correction-popup__media');
					const toggle = mediaRoot?.querySelector('.gp-correction-popup__media-toggle');
					const panel = mediaRoot?.querySelector('.gp-correction-popup__media-panel');
					const btnSave = mediaRoot?.querySelector('.gp-correction-popup__media-update');
					const status = mediaRoot?.querySelector('.gp-correction-popup__media-status');
					const inImg = mediaRoot?.querySelector('.gp-correction-popup__in-img');
					const inYt = mediaRoot?.querySelector('.gp-correction-popup__in-yt');
					const qid = mediaRoot instanceof HTMLElement ? mediaRoot.dataset.qid : undefined;
					const canEditMedia =
						mediaRoot instanceof HTMLElement && mediaRoot.dataset.mediaEditable === '1';
					if (
						toggle instanceof HTMLButtonElement &&
						panel instanceof HTMLElement &&
						btnSave instanceof HTMLButtonElement &&
						status instanceof HTMLElement &&
						inImg instanceof HTMLInputElement &&
						inYt instanceof HTMLInputElement &&
						qid
					) {
						const onToggle = (e: Event) => {
							e.preventDefault();
							const open = panel.hasAttribute('hidden');
							if (open) panel.removeAttribute('hidden');
							else panel.setAttribute('hidden', '');
							toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
						};
						toggle.addEventListener('click', onToggle);
						cleanups.push(() => toggle.removeEventListener('click', onToggle));

						if (canEditMedia) {
							const onSave = async (e: Event) => {
								e.preventDefault();
								status.removeAttribute('hidden');
								status.textContent = '…';
								btnSave.disabled = true;
								try {
									const res = await apiFetch(`/questions/${encodeURIComponent(qid)}/media`, {
										method: 'PATCH',
          signal: controller.signal,
										
										rawBody: JSON.stringify({ imgUrl: inImg.value, youtubeUrl: inYt.value })
									});
									const j = (await res.json().catch(() => ({}))) as {
										question?: Question;
										message?: string;
									};
									if (!popupActive) return;
         if (!res.ok) {
										status.textContent =
											typeof j.message === 'string' ? j.message : 'Échec de l’enregistrement';
										return;
									}
									if (j.question) correctionMediaSavedRef?.(j.question);
									status.textContent = 'Enregistré';
									later(() => status.setAttribute('hidden', ''), 1800);
								} catch {
									status.textContent = 'Erreur réseau';
								} finally {
									btnSave.disabled = false;
								}
							};
							btnSave.addEventListener('click', onSave);
							cleanups.push(() => btnSave.removeEventListener('click', onSave));
						}
					}

					const proposalRoot = rootEl.querySelector('.gp-correction-popup__proposal');
					const propToggle = proposalRoot?.querySelector('.gp-correction-popup__proposal-toggle');
					const propPanel = proposalRoot?.querySelector('.gp-correction-popup__proposal-panel');
					const pickMapEl = proposalRoot?.querySelector('.gp-correction-popup__pickmap');
					const btnProp = proposalRoot?.querySelector('.gp-correction-popup__proposal-send');
					const propStatus = proposalRoot?.querySelector('.gp-correction-popup__proposal-status');
					const inQtext = proposalRoot?.querySelector('.gp-correction-popup__in-qtext');
					const inQlat = proposalRoot?.querySelector('.gp-correction-popup__in-qlat');
					const inQlng = proposalRoot?.querySelector('.gp-correction-popup__in-qlng');
					const inQdesc = proposalRoot?.querySelector('.gp-correction-popup__in-qdesc');
					const qidProposal =
						proposalRoot instanceof HTMLElement ? proposalRoot.dataset.qid : undefined;
					if (
						propToggle instanceof HTMLButtonElement &&
						propPanel instanceof HTMLElement &&
						pickMapEl instanceof HTMLElement &&
						btnProp instanceof HTMLButtonElement &&
						propStatus instanceof HTMLElement &&
						inQtext instanceof HTMLInputElement &&
						inQlat instanceof HTMLInputElement &&
						inQlng instanceof HTMLInputElement &&
						inQdesc instanceof HTMLTextAreaElement &&
						qidProposal
					) {
						const propPickMapEl: HTMLElement = pickMapEl;
						const propLatInput: HTMLInputElement = inQlat;
						const propLngInput: HTMLInputElement = inQlng;
						const pickCtx: {
							map: LeafletMap | null;
							marker: import('leaflet').Marker | null;
							layerCtl: Control.Layers | null;
							off: (() => void)[];
						} = { map: null, marker: null, layerCtl: null, off: [] };

						function destroyProposalPickMap() {
							for (const fn of pickCtx.off) fn();
							pickCtx.off = [];
							if (pickCtx.layerCtl && pickCtx.map) {
								pickCtx.map.removeControl(pickCtx.layerCtl);
							}
							pickCtx.layerCtl = null;
							pickCtx.marker = null;
							if (pickCtx.map) {
								pickCtx.map.remove();
								pickCtx.map = null;
							}
						}

						function initProposalPickMap() {
							const L = Lref;
							if (!L || pickCtx.map) return;
							pickCtx.map = L.map(propPickMapEl, { zoomControl: true, worldCopyJump: true });
							L.DomEvent.disableClickPropagation(propPickMapEl);
							L.DomEvent.disableScrollPropagation(propPickMapEl);

							const built = buildBasemapTileLayers(L, pickCtx.map);
							built.esri.addTo(pickCtx.map);
							pickCtx.layerCtl = L.control.layers(built.layers, {}, {
								collapsed: true,
								position: 'bottomright'
							});
							pickCtx.layerCtl.addTo(pickCtx.map);

							const readLL = () => {
								const la = Number(String(propLatInput.value).trim().replace(',', '.'));
								const lo = Number(String(propLngInput.value).trim().replace(',', '.'));
								return { ok: Number.isFinite(la) && Number.isFinite(lo), la, lo };
							};
							let r = readLL();
							if (!r.ok) r = { ok: true, la: 0, lo: 0 };
							pickCtx.marker = L.marker([r.la, r.lo], { draggable: true }).addTo(pickCtx.map);
							pickCtx.map.setView([r.la, r.lo], 6);

							const syncInputs = (la: number, lo: number) => {
								propLatInput.value = String(Number(la.toFixed(6)));
								propLngInput.value = String(Number(lo.toFixed(6)));
							};

							const onDragEnd = () => {
								const ll = pickCtx.marker!.getLatLng();
								syncInputs(ll.lat, ll.lng);
							};
							pickCtx.marker.on('dragend', onDragEnd);
							pickCtx.off.push(() => pickCtx.marker?.off('dragend', onDragEnd));

							const onMapClick = (e: import('leaflet').LeafletMouseEvent) => {
								pickCtx.marker!.setLatLng(e.latlng);
								syncInputs(e.latlng.lat, e.latlng.lng);
							};
							pickCtx.map.on('click', onMapClick);
							pickCtx.off.push(() => pickCtx.map?.off('click', onMapClick));

							const onCoordInput = () => {
								const rr = readLL();
								if (!rr.ok || !pickCtx.marker || !pickCtx.map) return;
								pickCtx.marker.setLatLng([rr.la, rr.lo]);
								pickCtx.map.panTo([rr.la, rr.lo], { animate: false });
							};
							propLatInput.addEventListener('input', onCoordInput);
							propLngInput.addEventListener('input', onCoordInput);
							pickCtx.off.push(() => propLatInput.removeEventListener('input', onCoordInput));
							pickCtx.off.push(() => propLngInput.removeEventListener('input', onCoordInput));

							queueMicrotask(() => {
								pickCtx.map?.invalidateSize({ animate: false });
								requestAnimationFrame(() => pickCtx.map?.invalidateSize({ animate: false }));
							});
						}

						const onPropToggle = (e: Event) => {
							e.preventDefault();
							const wasHidden = propPanel.hasAttribute('hidden');
							if (wasHidden) {
								propPanel.removeAttribute('hidden');
								propToggle.setAttribute('aria-expanded', 'true');
								queueMicrotask(() => {
									initProposalPickMap();
									pickCtx.map?.invalidateSize({ animate: false });
									requestAnimationFrame(() => pickCtx.map?.invalidateSize({ animate: false }));
								});
							} else {
								destroyProposalPickMap();
								propPanel.setAttribute('hidden', '');
								propToggle.setAttribute('aria-expanded', 'false');
							}
						};
						propToggle.addEventListener('click', onPropToggle);
						cleanups.push(() => {
							destroyProposalPickMap();
							propToggle.removeEventListener('click', onPropToggle);
						});

						const onPropSend = async (e: Event) => {
							e.preventDefault();
							propStatus.removeAttribute('hidden');
							propStatus.textContent = '…';
							btnProp.disabled = true;
							const lat = Number(String(propLatInput.value).trim().replace(',', '.'));
							const lng = Number(String(propLngInput.value).trim().replace(',', '.'));
							if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
								propStatus.textContent = 'Latitude / longitude invalides';
								btnProp.disabled = false;
								return;
							}
							try {
								const res = await apiFetch(
									`/questions/${encodeURIComponent(qidProposal)}/edit-proposal`,
									{
										method: 'POST',
          signal: controller.signal,
										
										rawBody: JSON.stringify({
											text: inQtext.value,
											lat,
											lng,
											description: inQdesc.value
										})
									}
								);
								const j = (await res.json().catch(() => ({}))) as { message?: string };
								if (!popupActive) return;
         if (!res.ok) {
									propStatus.textContent =
										typeof j.message === 'string' ? j.message : 'Envoi impossible';
									return;
								}
								propStatus.textContent = 'Proposition enregistrée — vote sur Contribuer.';
								communityEditProposalSubmittedRef?.();
								later(() => propStatus.setAttribute('hidden', ''), 3200);
							} catch {
								propStatus.textContent = 'Erreur réseau';
							} finally {
								btnProp.disabled = false;
							}
						};
						btnProp.addEventListener('click', onPropSend);
						cleanups.push(() => btnProp.removeEventListener('click', onPropSend));
					}

					answerMarker.once('popupclose', () => cleanups.forEach((fn) => fn()));
				});
				answerMarker.on('popupclose', () => {
					answerMarker.openTooltip();
				});
			}

			if (answerArea) {
				const gj = L.geoJSON(answerArea as Geometry, {
					style: {
						color: '#4ade80',
						fillColor: '#4ade80',
						fillOpacity: 0.14,
						weight: 2,
						dashArray: '6 6'
					}
				});
				gj.addTo(layerGroup);
				answerZone = gj;
			} else {
				answerZone = L.circle([answer.lat, answer.lng], {
					radius: toleranceM,
					color: '#4ade80',
					fillColor: '#4ade80',
					fillOpacity: 0.12,
					weight: 1,
					dashArray: '6 6'
				});
				answerZone.addTo(layerGroup);
			}

			if (useParticipantGuesses && participantGuessMarkers) {
				for (const pg of participantGuessMarkers) {
					const lngD = unwrapLngToward(pg.lng, answer.lng);
					const m = L.circleMarker([pg.lat, lngD], {
						radius: pg.isSelf ? 10 : 8,
						color: pg.isSelf ? '#4ade80' : '#c4b5fd',
						fillColor: pg.isSelf ? '#22c55e' : '#7c3aed',
						fillOpacity: 0.92,
						weight: 2
					});
					m.addTo(layerGroup);
					m.bindTooltip(escapeHtml(pg.label), {
						permanent: true,
						direction: 'top',
						className: 'gp-participant-guess-tt',
						offset: [0, -4]
					});
				}
			}

			if (guess && !guessSameAsAnswer) {
				L.polyline(
					[
						[guess.lat, guessLngDraw],
						[answer.lat, answer.lng]
					],
					{ color: '#38bdf8', weight: 2, dashArray: '8 6', opacity: 0.85 }
				).addTo(layerGroup);
			}
		}

		/** Correction : cadrage auto sur la tolérance ; si clic ≠ réponse, englober proposition + réponse (+ disque). */
		if (showResult && answer && answerZone && resultFitAutoBounds) {
			queueMicrotask(() => {
				if (!map) return;
				map.invalidateSize({ animate: false });
				try {
					if (useParticipantGuesses && participantGuessMarkers) {
						const b = answerZone.getBounds();
						b.extend(L.latLng(answer.lat, answer.lng));
						for (const pg of participantGuessMarkers) {
							b.extend(
								L.latLng(pg.lat, unwrapLngToward(pg.lng, answer.lng))
							);
						}
						if (guess && !guessSameAsAnswer) {
							b.extend(L.latLng(guess.lat, guessLngDraw));
						}
						map.fitBounds(b, {
							padding: [52, 52],
							maxZoom: 14,
							animate: false
						});
					} else if (guess && !guessSameAsAnswer) {
						const b = answerZone.getBounds();
						b.extend(L.latLng(guess.lat, guessLngDraw));
						b.extend(L.latLng(answer.lat, answer.lng));
						map.fitBounds(b, {
							padding: [48, 48],
							maxZoom: 14,
							animate: false
						});
					} else {
						map.fitBounds(answerZone.getBounds(), {
							padding: [40, 40],
							maxZoom: 12,
							animate: false
						});
					}
				} catch {
					if (useParticipantGuesses && participantGuessMarkers) {
						const a = answer;
						let lat = a.lat;
						let lng = a.lng;
						if (guess && !guessSameAsAnswer) {
							lat = (guess.lat + a.lat) / 2;
							lng = (unwrapLngToward(guess.lng, a.lng) + a.lng) / 2;
						}
						map.setView([lat, lng], 5);
					} else if (guess && !guessSameAsAnswer) {
						map.setView(
							[(guess.lat + answer!.lat) / 2, (guessLngDraw + answer!.lng) / 2],
							5
						);
					} else {
						map.setView([answer!.lat, answer!.lng], 6);
					}
				}
			});
		}
	}

	watchEffect(() => {
		void ready.value;
		void guess;
		void answer;
		void showResult;
		void toleranceM;
		void answerArea;
		void correctionPopup;
		void participantGuessMarkers;
		void resultFitAutoBounds;
		void map;
		void Lref;
		redraw();
		if (map) requestAnimationFrame(() => map?.invalidateSize({ animate: false }));
	});

	watchEffect(() => {
		void ready.value;
		void map;
		void Lref;
		void storyEnabled;
		void showResult;
		void storyLayerWithResult;
		void storyRevealOnResolve;
		void storyResolvedStepIds;
		void storyActiveStepIndex;
		void storySteps;
		void storyLastUserClick.value;
		redrawStoryAdventure();
	});

	/** Sélecteur de fond : masqué pendant la question (jeu) si `showBasemapSelector` est faux. */
	watchEffect(() => {
		void ready.value;
		if (!map || !Lref || !basemapLayers) return;
		void showBasemapSelector;
		if (showBasemapSelector) {
			/* Le sélecteur change les tuiles sans mettre à jour `playAutoActive` : invalider pour que le retour jeu réapplique le fond auto. */
			playAutoActive = null;
			if (!basemapControl) {
				basemapControl = Lref.control.layers(basemapLayers, {}, {
					collapsed: true,
					position: 'bottomright'
				}).addTo(map);
			}
		} else if (basemapControl) {
			map.removeControl(basemapControl);
			basemapControl = null;
		}
	});

	function clearAllBasemapRasterLayers() {
		if (!map || !basemapLayers) return;
		for (const lyr of Object.values(basemapLayers)) {
			if (map.hasLayer(lyr)) map.removeLayer(lyr);
		}
		playAutoActive = null;
	}

	function applyPlayBasemapForZoom(z: number) {
		if (!map || !playNeutralLayer || !playHybridLayer) return;
		const next = z >= PLAY_BASEMAP_ZOOM_THRESHOLD ? playHybridLayer : playNeutralLayer;
		/* Ne pas court-circuiter si la carte ne montre pas `next` (ex. autre fond choisi pendant correction). */
		if (playAutoActive === next && map.hasLayer(next)) return;
		clearAllBasemapRasterLayers();
		next.addTo(map);
		playAutoActive = next;
	}

	function refreshVoyagerToggleButton() {
		if (!voyagerToggleButton) return;
		const inPlay = !showBasemapSelector;
		voyagerToggleButton.hidden = !inPlay;
		const pressed = inPlay && voyagerOverlayDesired.value;
		voyagerToggleButton.classList.toggle('gp-voyager-overlay-ctl__btn--active', pressed);
		voyagerToggleButton.setAttribute('aria-pressed', pressed ? 'true' : 'false');
	}

	/** Surcouche Carto Voyager (sans labels) au-dessus du fond auto jeu, volet tuiles > imagerie. */
	watchEffect(() => {
		void ready.value;
		void voyagerOverlayDesired.value;
		void showBasemapSelector;
		void basemapTilesReady.value;
		if (!map || !cartoVoyager_opacity) return;
		refreshVoyagerToggleButton();
		const eligible = !showBasemapSelector;
		if (voyagerOverlayDesired.value && eligible) {
			if (!map.hasLayer(cartoVoyager_opacity)) cartoVoyager_opacity.addTo(map);
		} else if (map.hasLayer(cartoVoyager_opacity)) {
			map.removeLayer(cartoVoyager_opacity);
		}
	});

	/**
	 * Manche quiz / duel : fond automatique sans libellés selon le zoom (Esri → Google satellite).
	 * Uniquement si le sélecteur de fond est masqué (`showBasemapSelector` faux), pour ne pas
	 * écraser le choix manuel sur Contribuer / admin.
	 */
	watchEffect((onCleanup) => {
		void ready.value;
		if (!map || !basemapTilesReady.value || !playNeutralLayer || !playHybridLayer) return;
		void showBasemapSelector;
		void showResult;
		if (showResult || showBasemapSelector) return;
		const m = map;
		const onZoomEnd = () => applyPlayBasemapForZoom(m.getZoom());
		m.on('zoomend', onZoomEnd);
		queueMicrotask(() => onZoomEnd());
		onCleanup(() => {
 m.off('zoomend', onZoomEnd);
 });
	});

	type LeafletNs = typeof import('leaflet');

	function ensureMapPanesForBasemaps(L: LeafletNs, targetMap: LeafletMap) {
		if (!targetMap.getPane('gpSatellite')) {
			targetMap.createPane('gpSatellite');
			const satPane = targetMap.getPane('gpSatellite');
			if (satPane) satPane.style.zIndex = '200';
		}
		if (!targetMap.getPane('gpVoyagerOverlay')) {
			targetMap.createPane('gpVoyagerOverlay');
			const voyPane = targetMap.getPane('gpVoyagerOverlay');
			if (voyPane) voyPane.style.zIndex = '250';
		}
	}

	/** Tuiles fonds carte (réutilisée par la carte principale et la mini-carte du popup correction). */
	function buildBasemapTileLayers(L: LeafletNs, targetMap: LeafletMap) {
		ensureMapPanesForBasemaps(L, targetMap);

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
		const cartoVoyagerOpacity = L.tileLayer(
			'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
			{
				maxZoom: BASE_MAX_Z,
				subdomains: 'abcd',
				attribution: '&copy; OpenStreetMap &copy; CARTO',
				pane: 'gpVoyagerOverlay',
				opacity: 0.9
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

		const layers: Record<string, Layer> = {
			IGN: ign,
			OpenStreetMap: street,
			Google: satelliteHybrid,
			OpenTopoMap: opentopomap,
			'Carto Voyager': cartoVoyager,
			'Imagerie Esri': esri,
			'Imagerie Google': googleSatellite
		};

		return { layers, esri, googleSatellite, cartoVoyagerOpacity };
	}

	watchEffect((onCleanup) => {
  if (!ready.value || !map || !borders) return;
  const targetMap = map;
  const controller = new AbortController();
  let layer: import('leaflet').GeoJSON | null = null;
  let active = true;
  const ne = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
  void fetch(`${ne}/ne_110m_admin_0_countries.geojson`, { signal: controller.signal })
   .then((response) => { if (!response.ok) throw new Error('Frontières indisponibles'); return response.json(); })
   .then((admin0) => {
    if (!active || map !== targetMap) return;
    layer = L.geoJSON(admin0, {
     interactive: false,
     style: { color: '#0f766e', weight: 0.85, opacity: 0.56, lineJoin: 'round', lineCap: 'round', fill: false }
    }).addTo(targetMap);
   }).catch(() => {});
  onCleanup(() => {
   active = false;
   controller.abort();
   if (layer && map === targetMap) targetMap.removeLayer(layer);
  });
 });

	onMounted(() => {
		if (!root.value) return;
		
		Lref = L;
		map = L.map(root.value, {
			zoomControl: true,
			worldCopyJump: true
		}).setView([24, 15], 2);

		const built = buildBasemapTileLayers(L, map);
		basemapLayers = built.layers;
		playNeutralLayer = built.esri;
		playHybridLayer = built.googleSatellite;
		cartoVoyager_opacity = built.cartoVoyagerOpacity;
		basemapTilesReady.value = true;
		built.esri.addTo(map);

		scaleControl = L.control.scale({
			position: 'bottomright',
			maxWidth: 140,
			metric: true,
			imperial: false,
			updateWhenIdle: true
		});
		scaleControl.addTo(map);

		const VoyagerOverlayToggle = L.Control.extend({
			options: { position: 'bottomright' },
			onAdd() {
				const wrap = L.DomUtil.create('div', 'leaflet-bar leaflet-control gp-voyager-overlay-ctl');
				const btn = L.DomUtil.create('button', 'gp-voyager-overlay-ctl__btn', wrap) as HTMLButtonElement;
				btn.type = 'button';
				btn.title =
					'Afficher des repères par-dessus la carte (routes / hydro, semi-transparent — Carto Voyager). Touchez à nouveau pour masquer.';
				btn.setAttribute('aria-label', btn.title);
				btn.innerHTML =
					'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
				L.DomEvent.disableClickPropagation(wrap);
				L.DomEvent.on(btn, 'click', L.DomEvent.stop)
					.on(btn, 'click', L.DomEvent.preventDefault)
					.on(btn, 'click', () => {
						voyagerOverlayDesired.value = !voyagerOverlayDesired.value;
					});
				voyagerToggleButton = btn;
				refreshVoyagerToggleButton();
				return wrap;
			},
			onRemove() {
				voyagerToggleButton = null;
			}
		});
		voyagerOverlayControl = new VoyagerOverlayToggle();
		voyagerOverlayControl.addTo(map);

		const bumpSize = () => {
			requestAnimationFrame(() => map?.invalidateSize({ animate: false }));
		};
		bumpSize();
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => bumpSize()) : null;
		ro?.observe(root.value);


		const onClick = (e: import('leaflet').LeafletMouseEvent) => {
			if (!interactive) return;
			const pos = { lat: e.latlng.lat, lng: e.latlng.lng };
			onAdminMapClickRef?.(pos);
			guess = pos;
 			emit('update:guess', pos);
			redraw();
			if (storyEnabled) {
				storyLastUserClick.value = pos;
			}
		};
		map.on('click', onClick);
		ready.value = true;
		clickOff = () => {
			ro?.disconnect();
			map?.off('click', onClick);
		};
	});

	onBeforeUnmount(() => {
		clickOff?.();
		clearStoryLayer();
		if (map && basemapControl) {
			map.removeControl(basemapControl);
			basemapControl = null;
		}
		if (map && scaleControl) {
			map.removeControl(scaleControl);
			scaleControl = null;
		}
		if (map && voyagerOverlayControl) {
			map.removeControl(voyagerOverlayControl);
			voyagerOverlayControl = null;
		}
		voyagerToggleButton = null;
		if (map && cartoVoyager_opacity && map.hasLayer(cartoVoyager_opacity)) {
			map.removeLayer(cartoVoyager_opacity);
		}
		cartoVoyager_opacity = null;
		map?.remove();
		map = null;
		basemapLayers = null;
		basemapTilesReady.value = false;
		playNeutralLayer = null;
		playHybridLayer = null;
		playAutoActive = null;
	});

</script>
<template><div ref="root" :translate="allowOverlayTranslation ? 'yes' : 'no'" :class="[{ notranslate: !allowOverlayTranslation }, 'geo-map']"></div></template>
<style scoped>
	.geo-map :deep(.leaflet-container) {
		height: 100%;
		width: 100%;
		border-radius: 0.75rem;
	}
	.geo-map :deep(.leaflet-control-attribution) {
		background: #ffffff;
		color: #64748b;
		font-size: 10px;
		max-width: 60%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.geo-map :deep(.leaflet-control-attribution a) {
		color: #0f766e;
	}
	.geo-map :deep(.leaflet-control-scale) {
		margin: 0 0 10px 10px !important;
		padding: 2px 5px;
		border-radius: 0.35rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #ffffff;
		line-height: 1.2;
	}
	.geo-map :deep(.leaflet-control-scale-line) {
		border-color: #e2e8f0 !important;
		border-top: none;
		color: rgb(0, 0, 0);
		font-size: 11px;
		font-weight: 600;
	}
	/* Surcouche Carto : au-dessus de l’échelle (contrôle ajouté après l’échelle en bas à droite). */
	.geo-map :deep(.gp-voyager-overlay-ctl) {
		margin-bottom: 8px;
		border-radius: 0.5rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
	}
	.geo-map :deep(.gp-voyager-overlay-ctl__btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 0;
		border-radius: 0.45rem;
		background: transparent;
		color: #64748b;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.geo-map :deep(.gp-voyager-overlay-ctl__btn:hover) {
		color: #334155;
		background: rgba(255, 255, 255, 0.06);
	}
	.geo-map :deep(.gp-voyager-overlay-ctl__btn--active) {
		color: #0f766e;
		background: #f0fdfa;
	}
	.geo-map :deep(.leaflet-control-layers) {
		border-radius: 0.5rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #334155;
	}
	.geo-map :deep(.leaflet-control-layers-toggle) {
		width: 36px;
		height: 36px;
		background-size: 24px 24px;
	}
	.geo-map :deep(.leaflet-control-layers-expanded) {
		padding: 0.35rem 0.5rem;
		font-size: 12px;
	}
	.geo-map :deep(.leaflet-control-layers-list label) {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0.2rem 0;
		cursor: pointer;
	}

	/* Marqueur « vérité » : épingle type Leaflet, teal moderne */
	.geo-map :deep(.gp-truth-marker-icon.leaflet-div-icon) {
		background: transparent !important;
		border: none !important;
	}
	.geo-map :deep(.gp-story-penguin-icon.leaflet-div-icon) {
		background: transparent !important;
		border: none !important;
	}
	.geo-map :deep(.gp-story-penguin-wrap) {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: radial-gradient(circle at 35% 35%, #ffffff, #ffffff);
		border: 1px solid rgba(45, 212, 191, 0.45);
		box-shadow:
			0 6px 18px #ffffff,
			0 0 0 2px rgba(45, 212, 191, 0.22);
	}
	.geo-map :deep(.gp-story-penguin-wrap img) {
		width: 35px;
		height: 35px;
		object-fit: cover;
		border-radius: 9999px;
	}
	.geo-map :deep(.gp-truth-pin-svg) {
		display: block;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.28)) drop-shadow(0 6px 14px #ffffff);
		pointer-events: none;
	}

	/* Infobulle proche du tooltip Leaflet par défaut, un peu épurée */
	.geo-map :deep(.leaflet-tooltip.gp-truth-marker-hint) {
		padding: 0.35rem 0.55rem;
		max-width: min(14rem, calc(100vw - 2rem));
		border-radius: 0.35rem;
		border: 1px solid rgba(0, 0, 0, 0.12);
		background: rgba(255, 255, 255, 0.96);
		color: #1e293b;
		font-size: 0.6875rem;
		font-weight: 500;
		line-height: 1.3;
		text-align: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
		white-space: nowrap;
	}
	/* Geobattle : pseudo (ou libellé) au-dessus de chaque proposition */
	.geo-map :deep(.leaflet-tooltip.gp-participant-guess-tt) {
		padding: 0.25rem 0.45rem;
		max-width: min(16rem, calc(100vw - 2rem));
		border-radius: 0.3rem;
		border: 1px solid rgba(167, 139, 250, 0.35);
		background: #ffffff;
		color: #334155;
		font-size: 0.6875rem;
		font-weight: 600;
		line-height: 1.25;
		text-align: center;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
		white-space: nowrap;
	}
	.geo-map :deep(.leaflet-tooltip.gp-participant-guess-tt::before) {
		border-top-color: #ffffff;
	}
	.geo-map :deep(.leaflet-tooltip.gp-story-step-tt) {
		padding: 0.24rem 0.45rem;
		border-radius: 0.35rem;
		border: 1px solid rgba(45, 212, 191, 0.38);
		background: #f8fafc;
		color: #0f766e;
		font-size: 0.64rem;
		font-weight: 600;
		line-height: 1.25;
		box-shadow: 0 2px 8px #ffffff;
		white-space: nowrap;
	}
	.geo-map :deep(.leaflet-tooltip.gp-story-step-tt::before) {
		border-top-color: #f8fafc;
	}
	.geo-map :deep(.leaflet-popup.gp-story-popup-wrap .leaflet-popup-content-wrapper) {
		background: #f8fafc;
		border: 1px solid rgba(45, 212, 191, 0.35);
		border-radius: 0.75rem;
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
	}
	.geo-map :deep(.leaflet-popup.gp-story-popup-wrap .leaflet-popup-content) {
		margin: 0;
		padding: 0.65rem 0.72rem;
	}
	.geo-map :deep(.leaflet-popup.gp-story-popup-wrap .leaflet-popup-tip) {
		background: #f8fafc;
		border: 1px solid rgba(45, 212, 191, 0.3);
	}
	.geo-map :deep(.gp-story-popup) {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__top) {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.05rem;
	}
	.geo-map :deep(.gp-story-popup__close) {
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #334155;
		font-size: 0.62rem;
		font-weight: 700;
		padding: 0.16rem 0.38rem;
		border-radius: 9999px;
		cursor: pointer;
	}
	.geo-map :deep(.gp-story-popup__close:hover) {
		background: #f8fafc;
	}
	.geo-map :deep(.gp-story-popup__step) {
		margin: 0;
		font-size: 0.66rem;
		font-weight: 700;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__title) {
		margin: 0;
		font-size: 0.84rem;
		font-weight: 800;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__year) {
		margin: 0;
		font-size: 0.68rem;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__narration) {
		margin: 0.1rem 0 0.15rem;
		font-size: 0.72rem;
		line-height: 1.45;
		color: #334155;
		max-height: min(18vh, 130px);
		overflow-y: auto;
		overflow-x: hidden;
		padding-right: 0.22rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(45, 212, 191, 0.45) transparent;
	}
	.geo-map :deep(.gp-story-popup__challenge) {
		padding: 0.38rem 0.45rem;
		border-radius: 0.55rem;
		border: 1px solid rgba(251, 191, 36, 0.32);
		background: rgba(251, 191, 36, 0.1);
	}
	.geo-map :deep(.gp-story-popup__challenge-kicker) {
		margin: 0;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__challenge-q) {
		margin: 0.12rem 0 0;
		font-size: 0.71rem;
		font-weight: 700;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__challenge-hint) {
		margin: 0.18rem 0 0;
		font-size: 0.66rem;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__challenge-a) {
		margin: 0.15rem 0 0;
		font-size: 0.64rem;
		color: #0f766e;
	}
	.geo-map :deep(.gp-story-popup__click) {
		margin: 0.1rem 0 0;
		font-size: 0.63rem;
		color: #0f766e;
	}
	.geo-map :deep(.leaflet-tooltip.gp-truth-marker-hint::before) {
		border-top-color: rgba(255, 255, 255, 0.96);
	}

	.geo-map :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-content-wrapper) {
		background: #ffffff;
		color: #334155;
		border-radius: 0.7rem;
		border: 1px solid #e2e8f0;
		box-shadow:
			0 12px 40px rgba(0, 0, 0, 0.48),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		padding: 0;
		overflow-x: visible;
		overflow-y: visible;
		max-width: 100% !important;
		width: 100% !important;
		box-sizing: border-box !important;
		max-height: none !important;
	}
	.geo-map :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-tip) {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 0.15rem;
	}
	/**
	 * Marge horizontale interdite avec width:100% (sinon 100% + marges > parent → coupe à droite).
	 * Décalage latéral = padding dans la boîte border-box.
	 */
	.geo-map :deep(.leaflet-popup.gp-leaflet-correction .leaflet-popup-content) {
		margin: 0.65rem 0 !important;
		padding-left: 0.75rem !important;
		padding-right: 0.75rem !important;
		min-width: 0 !important;
		width: 100% !important;
		max-width: 100% !important;
		box-sizing: border-box !important;
		max-height: none !important;
		overflow-x: visible;
		overflow-y: visible;
	}
	.geo-map :deep(.leaflet-popup.gp-leaflet-correction) {
		overflow-x: visible;
		overflow-y: visible;
		/* Même ressenti que mobile : colonne lisible ; pas toute la largeur sur grand écran */
		width: min(
			85vw,
			28rem,
			calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 16px)
		) !important;
		max-width: min(
			85vw,
			28rem,
			calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 16px)
		) !important;
		box-sizing: border-box;
	}
	.geo-map :deep(.gp-correction-popup) {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
		max-width: 100%;
	}
	.geo-map :deep(.gp-correction-popup__head) {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding-bottom: 0.45rem;
		margin: 0;
		border-bottom: 1px solid #e2e8f0;
		min-width: 0;
	}
	.geo-map :deep(.gp-correction-popup__head .gp-correction-popup__title) {
		flex: 1 1 0%;
		min-width: 0;
		margin: 0;
		padding-bottom: 0;
		border-bottom: none;
	}
	.geo-map :deep(.gp-correction-popup__thumb) {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.35rem;
		height: 2.6rem;
		max-width: 30%;
		border-radius: 0.4rem;
		overflow: hidden;
		background: #ffffff;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
	}
	.geo-map :deep(.gp-correction-popup__thumb img) {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.geo-map :deep(.gp-correction-popup__title) {
		margin: 0;
		padding-bottom: 0.45rem;
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.38;
		color: #334155;
		overflow-wrap: anywhere;
		word-break: break-word;
		min-width: 0;
	}
	.geo-map :deep(.gp-correction-popup__title--solo) {
		border-bottom: 1px solid #e2e8f0;
	}
	.geo-map :deep(.gp-correction-popup__video) {
		margin: 0;
		border-radius: 0.5rem;
		overflow: hidden;
		background: #ffffff;
		position: relative;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		aspect-ratio: 16 / 9;
		min-height: 118px;
		max-height: min(36vh, 248px);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
	}
	.geo-map :deep(.gp-correction-popup__video iframe) {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		max-width: 100%;
		height: 100%;
		border: 0;
	}
	.geo-map :deep(.gp-correction-popup__desc) {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.52;
		color: #334155;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		word-break: break-word;
		min-width: 0;
		max-width: 100%;
		max-height: min(14vh, 96px);
		overflow-x: visible;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scrollbar-color: #334155 transparent;
		scrollbar-gutter: stable;
		padding-right: 0.35rem;
	}
	.geo-map :deep(.gp-correction-popup__close) {
		display: block;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		margin-top: 0.15rem;
		padding: 0.5rem 0.75rem;
		min-height: 2.75rem;
		border-radius: 0.5rem;
		border: 1px solid #e2e8f0;
		background: linear-gradient(180deg, #334155 0%, #334155 100%);
		color: #ecfeff;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}
	.geo-map :deep(.gp-correction-popup__close:hover) {
		background: #f0fdfa;
	}
	.geo-map :deep(.gp-correction-popup__close:active) {
		background: #f0fdfa;
	}
	.geo-map :deep(.gp-correction-popup__close:focus-visible) {
		outline: 2px solid #0f766e;
		outline-offset: 2px;
	}
	.geo-map :deep(.gp-correction-popup__media) {
		margin: 0;
		padding-top: 0.5rem;
		border-top: 1px solid #e2e8f0;
		min-width: 0;
		max-width: 100%;
	}
	.geo-map :deep(.gp-correction-popup__media-readonly-hint) {
		margin: 0 0 0.4rem;
		font-size: 0.65rem;
		line-height: 1.45;
		color: #64748b;
	}
	.geo-map :deep(.gp-correction-popup__media-readonly-a) {
		color: #0f766e;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.geo-map :deep(.gp-correction-popup__media-readonly-a:hover) {
		color: #0f766e;
	}
	.geo-map :deep(.gp-correction-popup__media-toggle) {
		display: block;
		width: 100%;
		padding: 0.15rem 0;
		border: 0;
		background: none;
		color: #0f766e;
		font-size: 0.7rem;
		font-weight: 500;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
	}
	.geo-map :deep(.gp-correction-popup__media-toggle:hover) {
		color: #0f766e;
	}
	.geo-map :deep(.gp-correction-popup__media-panel) {
		margin-top: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
		max-width: 100%;
	}
	.geo-map :deep(.gp-correction-popup__lbl) {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		font-size: 0.68rem;
		font-weight: 600;
		color: #64748b;
		min-width: 0;
		max-width: 100%;
	}
	.geo-map :deep(.gp-correction-popup__lbl input) {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		padding: 0.4rem 0.5rem;
		border-radius: 0.45rem;
		border: 1px solid rgba(71, 85, 105, 0.85);
		background: #ffffff;
		color: #334155;
		font-size: 0.75rem;
	}
	.geo-map :deep(.gp-correction-popup__media-update) {
		align-self: flex-start;
		max-width: 100%;
		box-sizing: border-box;
		margin-top: 0.05rem;
		padding: 0.38rem 0.65rem;
		min-height: 2.35rem;
		border-radius: 0.45rem;
		border: 1px solid #e2e8f0;
		background: #f0fdfa;
		color: #0f766e;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}
	.geo-map :deep(.gp-correction-popup__media-update:hover:not(:disabled)) {
		background: #f0fdfa;
	}
	.geo-map :deep(.gp-correction-popup__media-update:disabled) {
		opacity: 0.55;
		cursor: wait;
	}
	.geo-map :deep(.gp-correction-popup__media-status) {
		margin: 0;
		font-size: 0.68rem;
		color: #0f766e;
	}

	.geo-map :deep(.gp-correction-popup__proposal) {
		margin: 0;
		padding-top: 0.5rem;
		border-top: 1px solid #e2e8f0;
		min-width: 0;
		max-width: 100%;
	}
	.geo-map :deep(.gp-correction-popup__proposal-toggle) {
		display: block;
		width: 100%;
		padding: 0.15rem 0;
		border: 0;
		background: none;
		color: #0f766e;
		font-size: 0.7rem;
		font-weight: 600;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
	}
	.geo-map :deep(.gp-correction-popup__proposal-toggle:hover) {
		color: #0f766e;
	}
	.geo-map :deep(.gp-correction-popup__proposal-panel) {
		margin-top: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		min-width: 0;
		max-width: 100%;
	}
	.geo-map :deep(.gp-correction-popup__proposal-hint) {
		margin: 0;
		font-size: 0.62rem;
		line-height: 1.45;
		color: #64748b;
	}
	.geo-map :deep(.gp-correction-popup__pickmap-hint) {
		margin: 0.35rem 0 0.25rem;
		font-size: 0.62rem;
		line-height: 1.45;
		color: #0f766e;
	}
	.geo-map :deep(.gp-correction-popup__pickmap) {
		position: relative;
		z-index: 0;
		height: min(38vh, 240px);
		min-height: 168px;
		width: 100%;
		max-width: 100%;
		border-radius: 0.5rem;
		overflow: hidden;
		border: 1px solid rgba(129, 140, 248, 0.35);
		background: #f1f5f9;
		box-sizing: border-box;
	}
	.geo-map :deep(.gp-correction-popup__pickmap .leaflet-container) {
		height: 100%;
		width: 100%;
		font: inherit;
		background: #f1f5f9;
	}
	.geo-map :deep(.gp-correction-popup__pickmap .leaflet-control-container) {
		font-size: 0.7rem;
	}
	.geo-map :deep(.gp-correction-popup__pickmap .leaflet-control-layers) {
		z-index: 10002 !important;
	}
	.geo-map :deep(.gp-correction-popup__pickmap .leaflet-control-layers-expanded) {
		max-height: min(50vh, 280px);
		overflow-y: auto;
	}
	.geo-map :deep(.gp-correction-popup__in-qdesc) {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		padding: 0.4rem 0.5rem;
		border-radius: 0.45rem;
		border: 1px solid rgba(71, 85, 105, 0.85);
		background: #ffffff;
		color: #334155;
		font-size: 0.72rem;
		resize: vertical;
		min-height: 3.2rem;
	}
	.geo-map :deep(.gp-correction-popup__proposal-send) {
		align-self: flex-start;
		max-width: 100%;
		box-sizing: border-box;
		margin-top: 0.05rem;
		padding: 0.38rem 0.65rem;
		min-height: 2.35rem;
		border-radius: 0.45rem;
		border: 1px solid rgba(251, 191, 36, 0.35);
		background: rgba(251, 191, 36, 0.12);
		color: #0f766e;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}
	.geo-map :deep(.gp-correction-popup__proposal-send:hover:not(:disabled)) {
		background: rgba(251, 191, 36, 0.18);
	}
	.geo-map :deep(.gp-correction-popup__proposal-send:disabled) {
		opacity: 0.55;
		cursor: wait;
	}
	.geo-map :deep(.gp-correction-popup__proposal-status) {
		margin: 0;
		font-size: 0.68rem;
		color: #0f766e;
	}

	/* Téléphone : tooltip marqueur un peu plus compact */
	@media (max-width: 640px) {
		.geo-map :deep(.leaflet-tooltip.gp-truth-marker-hint) {
			font-size: 0.625rem;
			padding: 0.32rem 0.5rem;
		}
	}

</style>
