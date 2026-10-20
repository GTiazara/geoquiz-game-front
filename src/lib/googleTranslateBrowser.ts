/**
 * Intégration du script officiel `https://translate.google.com/translate_a/element.js`
 * (`new google.translate.TranslateElement({ pageLanguage, includedLanguages, layout }, id)`).
 *
 * **Doc côté Google (widget gratuit, pas Cloud Translation API)** — le couple habituel :
 * - Lien / URL initiale : `#googtrans(source|target)` (ex. `#googtrans(fr|en)`) pour forcer
 *   une paire au chargement ; le fragment seul après coup ne suffit souvent pas → reload.
 * - Cookie **googtrans** : valeur `/source/target` (ex. `/fr/en`), relu à l’init du widget.
 *   Beaucoup d’intégrations réappliquent ce cookie **juste avant** `new TranslateElement`
 *   avec une date/max-age longs, car le script peut sinon le remplacer par un cookie de session.
 *
 * Ici : cookie + `reload()` pour le choix utilisateur ; le `<select>` sert de secours après
 * navigation client (SPA).
 *
 * @see Aide (fragment #googtrans) — référencé notamment sur support.google.com / translate (webmaster)
 * @see https://translate.google.com/intl/en/about/website/ (orientation Cloud / produits, pas le snippet)
 */

/** Langue du contenu du site — doit correspondre à `pageLanguage` dans `app.html`. */
/** Vrai quand le routeur utilise le fragment d’URL (`VITE_ROUTER_MODE=hash`, ex. GitHub Pages). */
const HASH_ROUTING = import.meta.env.VITE_ROUTER_MODE === 'hash';

export const GOOGLE_TRANSLATE_PAGE_LANG = 'fr';

/** Même liste que `includedLanguages` dans `app.html` (codes Google Translate). */
const INCLUDED = ['en', 'fr', 'es', 'de', 'zh-CN', 'ja', 'ar'];

const FALLBACK_TARGET_WHEN_NOT_FRENCH = 'en';
const UI_LANG_STORAGE_KEY = 'gp_translate_ui_lang';

const GOOG_TRANS_MAX_AGE_SEC = 60 * 60 * 24 * 400;

function getPersistedUiLangChoice(): string | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(UI_LANG_STORAGE_KEY);
		if (!raw) return null;
		return String(raw).trim().toLowerCase() || null;
	} catch {
		return null;
	}
}

function persistUiLangChoice(langCode: string): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(UI_LANG_STORAGE_KEY, String(langCode).trim().toLowerCase());
	} catch {
		// ignore storage failures (private mode, blocked storage, etc.)
	}
}

/** Cookie avec `domain=` uniquement pour `www.example.com` → `.example.com` (évite `.vercel.app`, etc.). */
function googTransCookieDomainSuffix(): string {
	if (typeof location === 'undefined') return '';
	const host = location.hostname;
	if (!host || host === 'localhost' || host === '127.0.0.1') return '';
	if (!host.startsWith('www.') || host.length <= 4) return '';
	const rest = host.slice(4);
	if (!rest.includes('.')) return '';
	return `;domain=.${rest}`;
}

function primaryLangCode(raw: string): string {
	return String(raw).toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * Langue cible pour Google Translate à partir des préférences navigateur.
 */
export function normalizeBrowserLangForGoogleTranslate(): string {
	const candidates = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
	if (candidates.length === 0) return GOOGLE_TRANSLATE_PAGE_LANG;

	const firstPrimary = primaryLangCode(String(candidates[0]));
	if (firstPrimary === 'fr') return GOOGLE_TRANSLATE_PAGE_LANG;

	for (const raw of candidates) {
		const lower = String(raw).toLowerCase();
		const primary = lower.split(/[-_]/)[0] ?? '';
		if (INCLUDED.includes(lower)) return lower;
		if (lower.startsWith('zh')) return 'zh-CN';
		if (INCLUDED.includes(primary)) return primary;
	}
	return FALLBACK_TARGET_WHEN_NOT_FRENCH;
}

/** Code cible attendu dans le cookie `googtrans` (segment après `/fr/`). */
function mapUiLangToGoogTransTarget(want: string): string | null {
	const w = want.toLowerCase();
	if (w === 'fr') return null;
	if (w === 'zh-cn' || w.startsWith('zh')) return 'zh-CN';
	if (['en', 'es', 'de', 'ja', 'ar'].includes(w)) return w;
	return null;
}

/**
 * Supprime le cookie `googtrans` (plusieurs variantes path/domain pour navigateurs différents).
 */
export function clearGoogTransCookies(): void {
	if (typeof document === 'undefined') return;
	const expired = 'Thu, 01 Jan 1970 00:00:01 GMT';
	const host = typeof location !== 'undefined' ? location.hostname : '';
	const secure =
		typeof location !== 'undefined' && location.protocol === 'https:' ? ';Secure' : '';
	const base = `googtrans=;path=/;expires=${expired};Max-Age=0;SameSite=Lax${secure}`;
	const toTry = [base];
	const wwwDomain = googTransCookieDomainSuffix();
	if (wwwDomain) {
		toTry.push(`googtrans=;path=/;expires=${expired};Max-Age=0;SameSite=Lax${secure}${wwwDomain}`);
	}
	if (host) {
		toTry.push(`googtrans=;path=/;domain=${host};expires=${expired};Max-Age=0;SameSite=Lax${secure}`);
		const bits = host.split('.');
		if (bits.length > 1) {
			toTry.push(
				`googtrans=;path=/;domain=.${bits.slice(-2).join('.')};expires=${expired};Max-Age=0;SameSite=Lax${secure}`
			);
		}
	}
	for (const c of toTry) {
		document.cookie = c;
	}
}

function writeGoogTransCookie(googleTargetCode: string): void {
	const secure =
		typeof location !== 'undefined' && location.protocol === 'https:' ? ';Secure' : '';
	const value = `/fr/${googleTargetCode}`;
	const tail = `path=/;max-age=${GOOG_TRANS_MAX_AGE_SEC};SameSite=Lax${secure}`;
	document.cookie = `googtrans=${value};${tail}`;
	const wwwDomain = googTransCookieDomainSuffix();
	if (wwwDomain) {
		document.cookie = `googtrans=${value};${tail}${wwwDomain}`;
	}
}

/**
 * Langue cible stockée par Google dans le cookie `googtrans` (ex. `/fr/en` → `en`).
 */
export function getGoogleTranslateCookieTarget(): string | null {
	if (typeof document === 'undefined') return null;
	const m = document.cookie.match(/(?:^|; )googtrans=([^;]+)/);
	if (!m) return null;
	const raw = decodeURIComponent(m[1].trim());
	const pathPart = (raw.split('|')[0] ?? raw).trim();
	const segs = pathPart.split('/').filter(Boolean);
	if (segs.length < 2) return null;
	const target = segs[segs.length - 1].toLowerCase();
	if (target === 'fr' || target === 'auto') return null;
	if (target.startsWith('zh')) return 'zh-CN';
	if (['en', 'es', 'de', 'ja', 'ar'].includes(target)) return target;
	return target;
}

/* -------------------------------------------------------------------------- */
/* Combo (widget natif) — FAB + secours après navigation client               */
/* -------------------------------------------------------------------------- */

function getGoogleTranslateCombo(): HTMLSelectElement | null {
	const root = document.getElementById('google_translate_element');
	const inRoot = root?.querySelector('.goog-te-combo') as HTMLSelectElement | null;
	return inRoot ?? (document.querySelector('.goog-te-combo') as HTMLSelectElement | null);
}

/**
 * Le widget reste **hors écran** (voir `layout.css` sur `#google_translate_element`) :
 * l’ouvrir avec `visibility: visible` provoquait l’icône / bandeau Google gênants,
 * sans être nécessaire pour piloter le combo en JS.
 */
function ensureGoogleTranslateShellVisible(): void {
	/* volontairement vide — ne pas forcer la visibilité */
}

function optionTargetSegment(optionValue: string): string {
	return optionValue.split('|')[0].trim().toLowerCase();
}

function fireSelectTranslationEvents(combo: HTMLSelectElement): void {
	combo.dispatchEvent(new Event('input', { bubbles: true }));
	combo.dispatchEvent(new Event('change', { bubbles: true }));
}

export type ApplyGoogleTranslateOptions = { force?: boolean };

export function applyGoogleTranslateTargetLang(
	langCode: string,
	options?: ApplyGoogleTranslateOptions
): boolean {
	ensureGoogleTranslateShellVisible();
	const combo = getGoogleTranslateCombo();
	if (!combo?.options?.length) return false;

	const wanted = String(langCode).toLowerCase();
	const wantPrim = wanted.split(/[-_]/)[0];
	const wantZh = wanted === 'zh-cn' || wantPrim === 'zh';

	const opts = Array.from(combo.options);
	let match: HTMLOptionElement | undefined;

	for (const o of opts) {
		if (!o.value) continue;
		const head = optionTargetSegment(o.value);
		if (wantZh) {
			if (head.startsWith('zh')) {
				match = o;
				break;
			}
			continue;
		}
		const headPrim = head.split(/[-_]/)[0];
		if (head === wanted || headPrim === wantPrim) {
			match = o;
			break;
		}
	}

	if (!match?.value) return false;

	if (combo.value === match.value) {
		if (options?.force) fireSelectTranslationEvents(combo);
		return true;
	}

	combo.value = match.value;
	fireSelectTranslationEvents(combo);
	return true;
}

export function applyGoogleTranslateOriginal(): boolean {
	ensureGoogleTranslateShellVisible();
	const combo = getGoogleTranslateCombo();
	if (!combo?.options?.length) return false;

	const opts = Array.from(combo.options);
	const emptyVal = opts.find((o) => o.value === '');
	if (emptyVal) {
		if (combo.value !== '') {
			combo.value = '';
			fireSelectTranslationEvents(combo);
		} else {
			fireSelectTranslationEvents(combo);
		}
		return true;
	}

	const first = opts[0];
	if (first && !first.value) {
		combo.selectedIndex = 0;
		fireSelectTranslationEvents(combo);
		return true;
	}

	return false;
}

export function getCurrentGoogleTranslateTarget(): string | null {
	const combo = getGoogleTranslateCombo();
	if (!combo) return null;
	const v = combo.value?.trim() ?? '';
	if (v === '') return 'fr';
	const segment = (v.split('|')[0] ?? '').toLowerCase();
	if (segment.startsWith('fr')) return 'fr';
	if (segment.startsWith('zh')) return 'zh-CN';
	const primary = segment.split(/[-_]/)[0] ?? '';
	const known = new Set(['en', 'es', 'de', 'ja', 'ar', 'zh-cn']);
	if (known.has(segment)) return segment === 'zh-cn' ? 'zh-CN' : segment;
	if (known.has(primary)) return primary;
	return segment || 'fr';
}

const UI_TRANSLATE_HIDE_MS = 500;

const FLOAT_UI_HIDE: Array<[string, string]> = [
	['display', 'none'],
	['visibility', 'hidden'],
	['opacity', '0'],
	['width', '0'],
	['height', '0'],
	['max-width', '0'],
	['max-height', '0'],
	['overflow', 'hidden'],
	['pointer-events', 'none']
];

/**
 * Masque l’UI flottante (bulle, SVG G, iframes du widget) que le script Google réinjecte
 * parfois avec des styles inline — le CSS seul ne suffit pas toujours.
 */
/**
 * Annule le décalage vertical laissé par Google Translate au retour en français
 * (`body { position: relative; top: 40px }`, barre `.skiptranslate`, classes `translated-*`).
 */
const GP_BODY_KEEP_IDS = new Set(['gp-app-root', 'google_translate_element']);

/** Nœuds Google injectés directement sous `<body>` (hors `#google_translate_element`) qui forcent le scroll. */
function pruneGoogleTranslateBodyArtifacts(): void {
	if (typeof document === 'undefined') return;
	for (const child of Array.from(document.body.children)) {
		if (!(child instanceof HTMLElement)) continue;
		if (GP_BODY_KEEP_IDS.has(child.id)) continue;
		const id = child.id ?? '';
		const cls = child.className?.toString() ?? '';
		const isGt =
			id.startsWith('goog-') ||
			/\bskiptranslate\b/.test(cls) ||
			child.matches('iframe.skiptranslate, .goog-te-banner-frame');
		if (!isGt) continue;
		child.remove();
	}
}

function hideGoogleTranslateBannerNodes(): void {
	if (typeof document === 'undefined') return;
	const layoutHide = (el: HTMLElement) => {
		el.style.setProperty('display', 'none', 'important');
		el.style.setProperty('height', '0', 'important');
		el.style.setProperty('max-height', '0', 'important');
		el.style.setProperty('visibility', 'hidden', 'important');
		el.style.setProperty('pointer-events', 'none', 'important');
	};
	for (const el of document.querySelectorAll<HTMLElement>(
		'iframe.skiptranslate, .goog-te-banner-frame, .skiptranslate.goog-te-banner-frame, body > .skiptranslate'
	)) {
		layoutHide(el);
	}
}

function isActiveGoogleTranslation(): boolean {
	return !!getGoogleTranslateCookieTarget();
}

/**
 * Corrige le décalage body/html (barre Google) sans retirer les classes `translated-*`
 * ni purger le DOM traduit — safe à appeler souvent (intervalle, MutationObserver).
 */
export function fixGoogleTranslateScrollLayout(): void {
	if (typeof document === 'undefined') return;
	const { documentElement: html, body } = document;

	html.style.setProperty('margin-top', '0', 'important');
	html.style.setProperty('top', '0', 'important');
	body.style.setProperty('top', '0', 'important');
	body.style.setProperty('position', 'static', 'important');
	body.style.setProperty('margin-top', '0', 'important');
	body.style.setProperty('padding-top', '0', 'important');
	body.style.setProperty('min-height', '0', 'important');

	hideGoogleTranslateBannerNodes();

	/* Scroll document : verrou quiz/histoire joueur uniquement (pas admin ni pages longues). */
	const quizLock = html.classList.contains('gp-quiz-viewport-lock');
	if (quizLock) {
		html.style.setProperty('overflow', 'hidden', 'important');
		body.style.setProperty('overflow', 'hidden', 'important');
		html.style.setProperty('height', '100%', 'important');
		body.style.setProperty('height', '100%', 'important');
	} else {
		for (const el of [html, body]) {
			el.style.removeProperty('overflow');
			el.style.removeProperty('height');
		}
	}
}

/** Retour au français : enlève les artefacts Google et les classes de traduction. */
export function resetGoogleTranslateDocumentLayout(): void {
	if (typeof document === 'undefined') return;
	const { documentElement: html, body } = document;

	if (isActiveGoogleTranslation()) {
		fixGoogleTranslateScrollLayout();
		return;
	}

	for (const cls of ['translated-ltr', 'translated-rtl']) {
		html.classList.remove(cls);
		body.classList.remove(cls);
	}

	fixGoogleTranslateScrollLayout();
	pruneGoogleTranslateBodyArtifacts();
}

/** Verrouille la page quiz sur le viewport (pas de scroll document quand Google Translate décale le body). */
export function lockQuizViewportScroll(): () => void {
	if (typeof document === 'undefined') return () => {};
	const html = document.documentElement;
	html.classList.add('gp-quiz-viewport-lock');
	fixGoogleTranslateScrollLayout();
	return () => {
		html.classList.remove('gp-quiz-viewport-lock');
		fixGoogleTranslateScrollLayout();
	};
}

function isGoogleTranslateFloatingUiNode(el: HTMLElement): boolean {
	if (el.id === 'google_translate_element') return false;
	if (el.closest('#google_translate_element')) return false;
	const id = el.id ?? '';
	const cls = el.className?.toString() ?? '';
	return (
		id.startsWith('goog-') ||
		/\bVIpgJd-|\bgoog-te-|\bskiptranslate\b/.test(cls) ||
		el.matches(
			'iframe.skiptranslate, .goog-te-banner-frame, .VIpgJd-ZVi9od-aZ2wEe-wOHMyf, [class*="ZVi9od-aZ2wEe"]'
		)
	);
}

export function suppressGoogleTranslateFloatingUI(): void {
	if (typeof document === 'undefined') return;
	const hide = (el: HTMLElement) => {
		for (const [k, v] of FLOAT_UI_HIDE) {
			el.style.setProperty(k, v, 'important');
		}
	};

	const tt = document.getElementById('goog-gt-tt');
	if (tt) hide(tt);

	for (const el of document.querySelectorAll<HTMLElement>('[id^="goog-"]')) {
		if (el.id === 'google_translate_element') continue;
		hide(el);
	}

	for (const el of document.querySelectorAll<HTMLElement>(
		'iframe[title="Language Translate Widget"], iframe[title^="Language Translate"]'
	)) {
		hide(el);
	}

	for (const el of document.querySelectorAll<HTMLElement>(
		'svg.VIpgJd-ZVi9od-aZ2wEe, svg[class*="ZVi9od-aZ2wEe"], svg[class*="Zvi9od-aZ2wEe"]'
	)) {
		hide(el);
	}

	fixGoogleTranslateScrollLayout();
}

let floatUiCleanup: (() => void) | null = null;

/** Au chargement : intervalle + MutationObserver pour contrer la réinjection des nœuds + styles inline. */
export function installGoogleTranslateFloatUiSuppression(): () => void {
	if (typeof document === 'undefined') return () => {};
	floatUiCleanup?.();
	suppressGoogleTranslateFloatingUI();
	const id = window.setInterval(suppressGoogleTranslateFloatingUI, 400);
	let mutTimer: ReturnType<typeof setTimeout> | null = null;
	const obs = new MutationObserver((records) => {
		if (mutTimer) return;
		if (isActiveGoogleTranslation()) {
			const gtUiTouched = records.some((r) => {
				if (r.target instanceof HTMLElement && isGoogleTranslateFloatingUiNode(r.target)) return true;
				for (const node of r.addedNodes) {
					if (node instanceof HTMLElement && isGoogleTranslateFloatingUiNode(node)) return true;
				}
				return false;
			});
			if (!gtUiTouched) return;
		}
		mutTimer = setTimeout(() => {
			mutTimer = null;
			suppressGoogleTranslateFloatingUI();
		}, 80);
	});
	obs.observe(document.body, { childList: true, subtree: true });
	const cleanup = () => {
		clearInterval(id);
		if (mutTimer) clearTimeout(mutTimer);
		obs.disconnect();
		floatUiCleanup = null;
	};
	floatUiCleanup = cleanup;
	return cleanup;
}

/**
 * Google Translate ne rescane pas le DOM seul après navigation SPA ou contenu dynamique.
 */
export function scheduleTranslateRefresh(): void {
	if (typeof window === 'undefined') return;
	const run = () => refreshActiveGoogleTranslation();
	queueMicrotask(() => {
		run();
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				run();
				for (const ms of [160, 420, 900, 1800]) {
					window.setTimeout(run, ms);
				}
			});
		});
	});
}

/**
 * Après navigation SvelteKit : réessaie la traduction sur le nouveau DOM (cookie déjà posé).
 */
export function refreshActiveGoogleTranslation(): void {
	if (typeof document === 'undefined') return;

	const cookieTarget = getGoogleTranslateCookieTarget();
	const comboTargetRaw = getCurrentGoogleTranslateTarget();
	let target: string | null = cookieTarget;
	if (!target && comboTargetRaw && comboTargetRaw !== 'fr') {
		target = comboTargetRaw === 'zh-cn' ? 'zh-CN' : comboTargetRaw;
	}
	if (!target || target === 'fr') {
		resetGoogleTranslateDocumentLayout();
		hideGoogleTranslateWidget();
		return;
	}

	ensureGoogleTranslateShellVisible();
	const ok = applyGoogleTranslateTargetLang(target, { force: true });
	const finishRefresh = () => {
		window.setTimeout(() => {
			fixGoogleTranslateScrollLayout();
			suppressGoogleTranslateFloatingUI();
		}, UI_TRANSLATE_HIDE_MS);
		for (const ms of [220, 480, 900]) {
			window.setTimeout(() => applyGoogleTranslateTargetLang(target, { force: true }), ms);
		}
	};
	if (!ok) {
		let n = 0;
		const id = window.setInterval(() => {
			n++;
			if (applyGoogleTranslateTargetLang(target, { force: true }) || n >= 60) {
				clearInterval(id);
				finishRefresh();
			}
		}, 120);
		return;
	}
	finishRefresh();
}

/**
 * Choix depuis la barre de langues : cookie `googtrans` + rechargement (comportement attendu du widget).
 */
export function applyTranslateUiChoice(langCode: string): boolean {
	if (typeof window === 'undefined') return false;
	const want = String(langCode).toLowerCase();
	persistUiLangChoice(want);

	if (want === 'fr') {
		clearGoogTransCookies();
		if (HASH_ROUTING) {
			/* Routage par hash : conserver la route, retirer seulement un éventuel fragment googtrans. */
			if (window.location.hash.startsWith('#googtrans')) window.location.replace(`${window.location.pathname}${window.location.search}#/`);
			else window.location.reload();
			return true;
		}
		const clean = `${window.location.origin}${window.location.pathname}${window.location.search}`;
		/* Sans fragment : sinon #googtrans(...) peut laisser le widget en mode traduction au reload. */
		if (window.location.hash) {
			window.location.replace(clean);
		} else {
			window.location.reload();
		}
		return true;
	}

	const goog = mapUiLangToGoogTransTarget(want);
	if (!goog) return false;

	clearGoogTransCookies();
	writeGoogTransCookie(goog);
	/* Fragment documenté par Google : #googtrans(source|target) — renforce le 1er chargement après reload. */
	const hash = `#googtrans(${GOOGLE_TRANSLATE_PAGE_LANG}|${goog})`;
	/* En routage par hash, le fragment est la route : le cookie googtrans suffit. */
	if (!HASH_ROUTING && window.location.hash !== hash) {
		window.location.hash = hash;
	}
	window.location.reload();
	return true;
}

export function applyTranslateUiChoiceWithRetry(
	langCode: string,
	_options?: { maxAttempts?: number; intervalMs?: number }
): void {
	applyTranslateUiChoice(langCode);
}

export function hideGoogleTranslateWidget(): void {
	suppressGoogleTranslateFloatingUI();
}

let autoTranslateReloadScheduled = false;

/**
 * Si le navigateur n’est pas en français et qu’aucun `googtrans` n’est encore défini,
 * pose le cookie et recharge une fois pour que **element.js** traduise tout le document.
 */
export function scheduleApplyBrowserTranslateLanguage(_options?: {
	maxAttempts?: number;
	intervalMs?: number;
}): void {
	if (typeof window === 'undefined') return;
	if (autoTranslateReloadScheduled) return;
	const savedChoice = getPersistedUiLangChoice();
	if (savedChoice === 'fr') return;
	if (getGoogleTranslateCookieTarget()) return;

	const target = normalizeBrowserLangForGoogleTranslate();
	if (target === GOOGLE_TRANSLATE_PAGE_LANG) return;

	const goog = mapUiLangToGoogTransTarget(target);
	if (!goog) return;

	autoTranslateReloadScheduled = true;
	writeGoogTransCookie(goog);
	const hash = `#googtrans(${GOOGLE_TRANSLATE_PAGE_LANG}|${goog})`;
	/* En routage par hash, le fragment est la route : le cookie googtrans suffit. */
	if (!HASH_ROUTING && window.location.hash !== hash) {
		window.location.hash = hash;
	}
	window.location.reload();
}
