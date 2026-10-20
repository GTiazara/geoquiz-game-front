/**
 * Copie synchrone (préservant le geste utilisateur) — HTTP, Safari, etc.
 */
function copyWithExecCommand(value: string): boolean {
	try {
		const ta = document.createElement('textarea');
		ta.value = value;
		ta.setAttribute('readonly', '');
		ta.setAttribute('aria-hidden', 'true');
		ta.tabIndex = -1;
		ta.style.cssText =
			'position:fixed;left:0;top:0;width:2px;height:2px;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0.01';
		document.body.appendChild(ta);
		ta.focus();
		ta.select();
		ta.setSelectionRange(0, value.length);
		const ok = document.execCommand('copy');
		ta.remove();
		return ok;
	} catch {
		return false;
	}
}

/**
 * Copie du texte dans le presse-papiers.
 * En contexte **non sécurisé** (ex. HTTP hors localhost), n’utilise pas l’API Clipboard
 * (souvent indispo. ou rejetée) : `execCommand` tout de suite, encore dans le geste du clic.
 * Sinon `writeText`, puis repli `execCommand` si échec.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (typeof document === 'undefined') return false;
	const value = String(text ?? '').trim();
	if (!value) return false;

	const secure =
		typeof window !== 'undefined' &&
		window.isSecureContext &&
		typeof navigator !== 'undefined' &&
		Boolean(navigator.clipboard?.writeText);

	if (!secure) {
		return copyWithExecCommand(value);
	}

	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return copyWithExecCommand(value);
	}
}
