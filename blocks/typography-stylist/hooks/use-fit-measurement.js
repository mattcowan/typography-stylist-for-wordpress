/**
 * Typography Stylist Block - fit-to-width measurement.
 *
 * Moved out of edit.js unchanged (#356).
 */

import { isRTL } from '@wordpress/i18n';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { useRef, useEffect } from '@wordpress/element';
import { dispatch } from '@wordpress/data';
import { debounce, splitContentIntoLines, resolveBlockFontFamilyStyle, resolveFitLineHang, initialHangApplies, computeHungFitRatio, computeFitWordRatio, buildFitProbeClassName, caseDeclarations } from '../utils';

/**
 * Measure a fit-to-width block's lines and store their ratios in
 * fitLineSizes (and fitWordSizes for a rem block), again whenever anything
 * that changes a line's width changes, and when fonts finish loading.
 *
 * Does nothing unless fontSize is 'fit'. The measurement is debounced and
 * reads the latest values through a ref, so it never runs on stale ones.
 *
 * @param {Object} block Block attributes the measurement reads, plus
 *                       setAttributes, clientId and blockFontSizeUnit.
 */
export default function useFitMeasurement({
	fontSize,
	content,
	fontId,
	fontFamily,
	fontWeight,
	fontStyle,
	letterSpacing,
	features,
	fontVariationSettings,
	fitLineSizes,
	fitWordSizes,
	setAttributes,
	initialHang,
	fitLineHangs,
	textAlign,
	blockFontSizeUnit,
	clientId,
	textCase,
	fakeSmallCaps
}) {
	// ===== Fit-to-width measurement (fontSize: "fit") =====
	// Measures each visual line's natural width at a 100px reference inside
	// the editor canvas document — appending to the iframe body makes
	// var(--font-N) and @font-face resolve — and stores per-line ratios in
	// fitLineSizes (R = 100 / width, so font-size: calc(R * 100cqi) fills
	// the container). Rem blocks also store fitWordSizes, the same ratio for
	// the line's widest word (its min-content width), which caps the zoom
	// floor so a wrapped line never breaks a word (#235, buildFitFontSize).
	// Px blocks never use it, so it is not written there: opening an older
	// post must not change its attributes. Reads through a ref so the
	// debounced closure never goes stale.
	const measureFitPropsRef = useRef({});
	measureFitPropsRef.current = {
		content, fontId, fontFamily, fontWeight, fontStyle, letterSpacing,
		features, fontVariationSettings, fitLineSizes, fitWordSizes, setAttributes,
		initialHang, fitLineHangs, textAlign, unit: blockFontSizeUnit, clientId, textCase, fakeSmallCaps
	};

	const measureFitLines = () => {
		const p = measureFitPropsRef.current;
		if (!p.content) return;

		const canvasIframe = document.querySelector('iframe[name="editor-canvas"]');
		const targetDoc = (canvasIframe && canvasIframe.contentDocument) || document;
		if (!targetDoc.body) return;

		// The probe must inherit what the rendered line inherits. One on the
		// canvas body took the body font, so in a theme whose headings use
		// another font, a fit block with no font of its own was measured in
		// the wrong font and overflowed (review of #250: 4.1%, 31px). So copy
		// the visual heading's tag, classes and inline style, and append the
		// probe to the block wrapper — never into the editable heading,
		// where RichText would see it. Body probe only as a fallback.
		const blockEl = targetDoc.querySelector(`[data-block="${p.clientId}"]`);
		const heading = blockEl && blockEl.querySelector('.typost-block-content');
		const host = heading ? blockEl : targetDoc.body;
		const node = targetDoc.createElement(heading ? heading.tagName : 'div');
		if (heading) {
			node.className = buildFitProbeClassName(heading.getAttribute('class'));
			const inlineStyle = heading.getAttribute('style');
			if (inlineStyle) {
				node.setAttribute('style', inlineStyle);
			}
		}
		// Absolutely-positioned + nowrap = shrink-to-fit natural line width.
		// The resets undo heading layout that is not part of the line width.
		node.style.margin = '0';
		node.style.padding = '0';
		node.style.border = '0';
		node.style.width = 'auto';
		node.style.minWidth = '0';
		node.style.maxWidth = 'none';
		node.style.textIndent = '0';
		// As on the fit lines (style.css): a style's hyphenation must not give
		// the min-content word measurement below extra break points (#208).
		node.style.webkitHyphens = 'manual';
		node.style.hyphens = 'manual';
		node.style.position = 'absolute';
		node.style.left = '-9999px';
		node.style.top = '0';
		node.style.visibility = 'hidden';
		node.style.whiteSpace = 'nowrap';
		node.style.fontSize = '100px';
		// Match the .typost-line rendering rule: automatic optical sizing
		// varies glyph width with font size, which breaks the linear
		// width-per-font-size assumption the stored ratio depends on.
		node.style.fontOpticalSizing = 'none';
		// fontId alone must resolve (save.js parity) — gating on the fontFamily
		// string would measure the theme's inherited font instead.
		const measureFontFamily = resolveBlockFontFamilyStyle(p.fontId, p.fontFamily);
		if (measureFontFamily) {
			node.style.fontFamily = measureFontFamily;
		}
		if (p.fontWeight) node.style.fontWeight = p.fontWeight;
		if (p.fontStyle) node.style.fontStyle = p.fontStyle;
		if (p.letterSpacing !== 0) node.style.letterSpacing = `${p.letterSpacing / 1000}em`;
		if (p.features.length > 0) {
			node.style.fontFeatureSettings = p.features.map(f => `"${f}" 1`).join(', ');
		}
		if (p.fontVariationSettings) node.style.fontVariationSettings = p.fontVariationSettings;
		// Case changes glyph widths (capitals, small caps), so it is measured too (#214)
		caseDeclarations(p.textCase, p.fakeSmallCaps).forEach(([property, value]) => node.style.setProperty(property, value));

		host.appendChild(node);

		try {
			const lines = splitContentIntoLines(p.content);
			const measureWords = p.unit === 'rem';
			const wordRatios = [];
			const ratios = lines.map((lineHtml, i) => {
				node.innerHTML = lineHtml;
				// Inline font sizes are ignored in fit mode — mirror the
				// frontend neutralization rule so measured widths match.
				// Inline spans otherwise ride along: their own fonts, weights,
				// features and variation settings all affect the width.
				node.querySelectorAll('[data-fontsize]').forEach(s => { s.style.fontSize = ''; });
				// As on the frontend: a span's own style does not hyphenate here (#208)
				node.querySelectorAll('*').forEach((s) => {
					s.style.setProperty('-webkit-hyphens', 'manual', 'important');
					s.style.setProperty('hyphens', 'manual', 'important');
				});
				const width = node.getBoundingClientRect().width;
				// A hung line starts left of the edge, so it must fill the
				// width plus its hang (#242). Same alignment test as the CSS.
				const hang = resolveFitLineHang(i, p.initialHang, p.fitLineHangs, initialHangApplies(p.textAlign, isRTL()));
				if (measureWords) {
					// min-content = the widest run the browser cannot break
					node.style.whiteSpace = 'normal';
					node.style.width = 'min-content';
					wordRatios.push(computeFitWordRatio(100, node.getBoundingClientRect().width, hang));
					node.style.whiteSpace = 'nowrap';
					node.style.width = '';
				}
				return computeHungFitRatio(100, width, hang);
			});

			// Skip-when-equal: prevents effect loops and undo churn
			const differs = (next, current) => next.length !== current.length ||
				next.some((r, i) => r !== current[i]);
			const changed = differs(ratios, measureFitPropsRef.current.fitLineSizes || []) ||
				(measureWords && differs(wordRatios, measureFitPropsRef.current.fitWordSizes || []));
			if (changed) {
				// Derived state, not a user edit: without this, the ratio
				// write forms its own undo step and the first Ctrl+Z after
				// typing snaps line sizes back instead of undoing the text.
				// Undone content re-triggers this effect, so ratios always
				// recompute to match whatever content undo lands on.
				if (typeof dispatch(blockEditorStore).__unstableMarkNextChangeAsNotPersistent === 'function') {
					dispatch(blockEditorStore).__unstableMarkNextChangeAsNotPersistent();
				}
				measureFitPropsRef.current.setAttributes(measureWords
					? { fitLineSizes: ratios, fitWordSizes: wordRatios }
					: { fitLineSizes: ratios });
			}
		} finally {
			host.removeChild(node);
		}
	};

	const measureFitRef = useRef(null);
	measureFitRef.current = measureFitLines;

	const debouncedMeasureFit = useRef(
		debounce(() => {
			if (measureFitRef.current) {
				measureFitRef.current();
			}
		}, 300)
	).current;

	// Re-measure (debounced) whenever anything width-affecting changes.
	// fitMaxSize is intentionally absent — the cap doesn't change ratios.
	useEffect(() => {
		if (fontSize !== 'fit') return;
		debouncedMeasureFit();
	}, [fontSize, content, fontId, fontFamily, fontWeight, fontStyle, letterSpacing, features, fontVariationSettings, initialHang, fitLineHangs, textAlign, blockFontSizeUnit, textCase, fakeSmallCaps]); // eslint-disable-line react-hooks/exhaustive-deps -- debouncedMeasureFit is a stable ref

	// Measure after fonts are ready, and re-measure on late font loads
	useEffect(() => {
		if (fontSize !== 'fit') return;
		const canvasIframe = document.querySelector('iframe[name="editor-canvas"]');
		const targetDoc = (canvasIframe && canvasIframe.contentDocument) || document;
		const fontSet = targetDoc.fonts;
		if (!fontSet) return;
		let cancelled = false;
		if (fontSet.ready && typeof fontSet.ready.then === 'function') {
			fontSet.ready.then(() => {
				if (!cancelled) debouncedMeasureFit();
			}).catch(() => {});
		}
		const onLoadingDone = () => debouncedMeasureFit();
		fontSet.addEventListener('loadingdone', onLoadingDone);
		return () => {
			cancelled = true;
			fontSet.removeEventListener('loadingdone', onLoadingDone);
		};
	}, [fontSize]); // eslint-disable-line react-hooks/exhaustive-deps -- debouncedMeasureFit is a stable ref

	// Cleanup fit measurement debounce on unmount
	useEffect(() => {
		return () => {
			if (debouncedMeasureFit && typeof debouncedMeasureFit.cancel === 'function') {
				debouncedMeasureFit.cancel();
			}
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps
}
