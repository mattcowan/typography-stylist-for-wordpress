/**
 * Typography Stylist Block - the Quick Feature Toggles modal.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { Button, Modal, Notice, PanelBody, RangeControl, SelectControl, ToggleControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import { adoptWpFont, isWpLibraryValue, wpSlugFromValue } from '../../../assets/js/font-options.js';
import { FontPicker } from '../../../assets/js/font-picker.js';
import ZoomNotice from './zoom-notice';
import { caseStyleObject, isSmallCapsCase, isValidFontSizeRange, normalizeTextCase, resolveBlockFontFamilyStyle } from '../utils';

/**
 * The QFT modal: font, weight, style, case, size, spacing and OpenType
 * features for the selected text, or for the whole block when nothing is
 * selected. Rendered by Edit only while the modal is open.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The modal.
 */
export default function renderQuickFeatureToggles(props) {
	const {
		applyFeatureToSelection, applyInlineCase, applyInlineFontSize, applyInlineFontStyle,
		availableFeatures, capturedSelection, clearFitScale, clearFitShift, clearInlineFormatting,
		clearLetterSpacing, clearLineHeight, clientId, computedFont, content, debouncedApplyFitScale,
		debouncedApplyFitShift, debouncedApplyFontFamily, debouncedApplyFontSize,
		debouncedApplyFontWeight, debouncedApplyLetterSpacing, debouncedApplyLineHeight, dismissTips,
		fakeSmallCaps, features, fontFamily, fontId, fontIdMap, fontOptions, fontSize, fontSizeMax,
		fontSizeMin, fontSizePreferred, fontStyle, fontVariationSettings, fontWeight, getCategoryTitle,
		getClosestWeight, getFilteredWeightOptions, groupedFeatures, handleDragStart, handleHeaderKeyDown,
		handlePopoverClose, handleResizeStart, inlineApplyNotice, inlineCaseFromStyle,
		inlineDisabledFeaturesAtSelection, inlineFakeSmallCaps, inlineFeaturesAtSelection, inlineFitScale,
		inlineFitShift, inlineFixedSizePx, inlineFontFamily, inlineFontFamilyAtSelection, inlineFontSize,
		inlineFontSizeMax, inlineFontSizeMin, inlineFontSizePreferred, inlineFontSizeUnit,
		inlineFontStyle, inlineFontWeight, inlineLetterSpacing, inlineLineHeight, inlineStylesAtSelection,
		inlineTextCase, isDragging, isResizing, letterSpacing, lineHeight, modalHeight, modalWidth,
		modalX, modalY, previewText, qftTitleId, resetFontFamily, resetFontSize, resetFontStyle,
		resetFontWeight, resetInlineCase, resolvedApplyRange, revertInlineControl, setInlineApplyNotice,
		setInlineFakeSmallCaps, setInlineFitScale, setInlineFitShift, setInlineFontFamily,
		setInlineFontSize, setInlineFontSizeMax, setInlineFontSizeMin, setInlineFontSizePreferred,
		setInlineFontStyle, setInlineFontWeight, setInlineLetterSpacing, setInlineLineHeight,
		setInlineTextCase, textCase, tipsDismissed, toggleFeature
	} = props;

	return (
		<Modal
			// The header is drawn by hand below (it has to be
			// draggable). Two props get core out of the way,
			// and they do different jobs:
			//   __experimentalHideHeader (further down this
			//     list) drops core's header element entirely —
			//     core renders it behind `!__experimentalHideHeader`.
			//   title="" empties the heading text, which is
			//     what routes the dialog's name elsewhere:
			//     core uses `aria.labelledby` precisely when
			//     `title` is falsy.
			// So the name has to be supplied here, or a screen
			// reader announces an anonymous dialog while
			// everyone else sees a titled panel.
			title=""
			aria={{ labelledby: qftTitleId }}
			onRequestClose={handlePopoverClose}
			className={`typost-modal typost-block-modal ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
			isDismissible={true}
			shouldCloseOnClickOutside={false}
			shouldCloseOnEsc={true}
			__experimentalHideHeader={true}
			onMouseDown={(e) => {
				// Only trigger drag if clicking on header, not content
				if (e.target.classList.contains('typost-modal-header') ||
					e.target.closest('.typost-modal-header')) {
					handleDragStart(e);
				}
			}}
			style={{
				position: 'fixed',
				top: `${modalY}px`,
				left: `${modalX}px`,
				width: `${modalWidth}px`,
				height: `${modalHeight}px`,
				maxWidth: 'none',
				maxHeight: 'none',
				transform: 'none'
			}}
		>
			{/* Custom draggable header */}
			{/* Mouse drag surface only; keyboard repositioning is the
			    named "Move panel" button (QA finding SR-4, same as the
			    inline modal). */}
			<div
				className="typost-modal-header"
				onMouseDown={handleDragStart}
				style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
			>
				<h3 id={qftTitleId}>{__('Quick Feature Toggles', 'typography-stylist')}</h3>
				<Button
					icon="move"
					label={__('Move panel, use arrow keys', 'typography-stylist')}
					onKeyDown={handleHeaderKeyDown}
					className="typost-modal-move-button"
				/>
				<Button
					icon="no-alt"
					label={__('Close', 'typography-stylist')}
					onClick={handlePopoverClose}
					className="typost-modal-close-button"
				/>
			</div>

			{/* Modal content wrapper with scroll. tabIndex -1: a scroll
			    container is otherwise a Tab stop that a screen reader
			    reads in full (QA finding SR-3); its controls remain
			    reachable and scroll it into view. */}
			<div className="typost-modal-content" tabIndex={-1} style={{
				height: `calc(${modalHeight}px - 60px)`,
				overflowY: 'auto'
			}}>
				{/* Usage tips notice — same strings, dismissal flag, and
				    sticky wrapper (spacing lives in block-editor.css) as the
				    inline format modal's notice. Notice does not forward a
				    style prop, so an inline margin here never rendered.
				    spokenMessage '' keeps the tip out of the live region on
				    mount (it was read before the dialog's name); the own
				    dismiss button replaces Notice's "Close" so there are not
				    two differently-acting "Close" stops (QA finding SR-4). */}
				{!tipsDismissed && (
					<div className="typost-sticky-notice-wrapper">
						<Notice
							status="info"
							isDismissible={false}
							spokenMessage=""
							className="typost-drag-notice"
						>
							<div className="typost-tip-text">
								<p style={{ margin: 0 }}>
									{'💡 ' + __('Tip: Drag the title bar to reposition this panel.', 'typography-stylist')}
								</p>
								<p style={{ margin: '4px 0 0' }}>
									{__('Changes apply instantly. Press Ctrl+Z (Cmd+Z on Mac) to undo.', 'typography-stylist')}
								</p>
							</div>
							<Button
								icon="no-alt"
								label={__('Dismiss tip', 'typography-stylist')}
								onClick={dismissTips}
								className="typost-tip-dismiss"
								size="small"
							/>
						</Notice>
					</div>
				)}

				<div style={{ padding: '0 16px 16px 16px' }}>

				{/* An inline apply both strategies refused (usually the nesting
				    limit). spokenMessage '' because reportInlineApplyFailure()
				    already announced it assertively; Notice's own polite
				    announcement would read it a second time (QA finding E-5). */}
				{inlineApplyNotice && (
					<Notice
						status="warning"
						isDismissible={true}
						spokenMessage=""
						onRemove={() => setInlineApplyNotice(null)}
					>
						{inlineApplyNotice}
					</Notice>
				)}

				{/* Extension hook point: top of QFT modal (e.g., Paragraph Styles dropdown) */}
				<div className="typost-hook-point" data-hook="typost_qft_modal_top" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_qft_modal_top', el, {
							fontId, fontWeight, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax,
							letterSpacing, lineHeight, features, content, capturedSelection,
							inlineFontFamily, inlineFontWeight
						});
					}
				}} />

				{/* Font Family Control */}
				<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
					<FontPicker
						label={__('Font Family (for selected text)', 'typography-stylist')}
						placeholder={__('Select a font…', 'typography-stylist')}
						value={inlineFontFamily}
						options={fontOptions}
						onChange={(value) => {
							if (isWpLibraryValue(value)) {
								// Unadopted WP Font Library font — adopt first
								// (idempotently allocates a font_id), then apply
								adoptWpFont(wpSlugFromValue(value)).then((font) => {
									fontIdMap[font.font_id] = {
										family: font.font_family,
										fallbacks: font.fallbacks || '',
										availableWeights: []
									};
									setInlineFontFamily(String(font.font_id));
									debouncedApplyFontFamily();
								}).catch(() => {});
								return;
							}
							if (!value) {
								// Clearing has to take the font off the selection, not
								// just empty the field. resetFontFamily() removes it from
								// the content and clears the state itself — and it reads
								// inlineFontFamily to decide there is anything to do, so it
								// has to run before that state is cleared, not after.
								resetFontFamily();
								return;
							}
							setInlineFontFamily(value);
							debouncedApplyFontFamily();
							// Validate inline weight against new font
							const newFontId = parseInt(value, 10);
							if (!isNaN(newFontId) && fontIdMap[newFontId]) {
								const available = fontIdMap[newFontId].availableWeights;
								if (available && available.length > 0 && inlineFontWeight !== 'inherit') {
									if (!available.includes(inlineFontWeight)) {
										setInlineFontWeight(getClosestWeight(inlineFontWeight, available));
									}
									if (available.length === 1) {
										setInlineFontWeight(available[0]);
										debouncedApplyFontWeight();
									}
								}
							}
						}}
					/>
					{inlineFontFamily && (
						<Button
							variant="secondary"
							onClick={resetFontFamily}
							isDestructive
							style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
							icon="undo"
						>
							{__('Reset Font Family', 'typography-stylist')}
						</Button>
					)}
				</div>

				{/* Font Weight Control - replaceable via typost_weight_control filter */}
				{(() => {
					const activeFontId = inlineFontFamilyAtSelection || fontId;
					const weightControlType = window.typostHooks
						? window.typostHooks.applyFilters('typost_weight_control', 'default', activeFontId)
						: 'default';

					// 'hidden': suppress the weight control entirely (no wrapper, no hook)
					if (weightControlType === 'hidden') return null;

					if (weightControlType !== 'default') {
						return (
							<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
								{/* key: remount (and re-fire the action) when the active font changes */}
								<div key={`typost-weight-${activeFontId || 'none'}`} className="typost-hook-point" data-hook="typost_weight_control" ref={(el) => {
									if (el && !el._hooked) {
										el._hooked = true;
										window.typostHooks.doAction('typost_weight_control', el, {
											fontId, fontWeight, inlineFontFamily, inlineFontWeight, inlineFontFamilyAtSelection,
											fontVariationSettings: inlineStylesAtSelection?.fontVariationSettings || fontVariationSettings || ''
										});
									}
								}} />
							</div>
						);
					}

					const inlineWeightOptions = getFilteredWeightOptions(activeFontId, true);
					// Hide if only "Inherit" + 1 weight (or fewer) — means the font has a single weight
					const weightOnlyOptions = inlineWeightOptions.filter(o => o.value !== 'inherit');
					if (weightOnlyOptions.length <= 1) return null;
					return (
						<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
							<SelectControl
								label={__('Font Weight (for selected text)', 'typography-stylist')}
								value={inlineFontWeight}
								onChange={(value) => {
									setInlineFontWeight(value);
									if (value !== 'inherit') {
										debouncedApplyFontWeight();
									}
								}}
								options={inlineWeightOptions}
							/>
							{inlineFontWeight !== 'inherit' && (
								<Button
									variant="secondary"
									onClick={resetFontWeight}
									isDestructive
									style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
									icon="undo"
								>
									{__('Reset Font Weight', 'typography-stylist')}
								</Button>
							)}
						</div>
					);
				})()}

				{/* Extension hook point: after font controls (e.g., Variable Font axes).
				    Sits directly below the weight control so a variable font's
				    axis sliders stay grouped with the weight they extend.
				    key: remount (and re-fire the action) when any active font changes */}
				<div key={`typost-afc-${fontId || 'none'}-${inlineFontFamily || 'none'}-${inlineFontFamilyAtSelection || 'none'}`} className="typost-hook-point" data-hook="typost_qft_after_font_controls" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_qft_after_font_controls', el, {
							fontId, fontWeight, inlineFontFamily, inlineFontWeight, inlineFontFamilyAtSelection,
							fontVariationSettings: inlineStylesAtSelection?.fontVariationSettings || fontVariationSettings || ''
						});
					}
				}} />

				{/* Font Style Control (visual italic — semantic emphasis stays <em>) */}
				<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
					<SelectControl
						label={__('Font Style (for selected text)', 'typography-stylist')}
						value={inlineFontStyle}
						options={[
							{ label: __('Inherit', 'typography-stylist'), value: '' },
							{ label: __('Normal (upright)', 'typography-stylist'), value: 'normal' },
							{ label: __('Italic', 'typography-stylist'), value: 'italic' }
						]}
						onChange={(value) => {
							setInlineFontStyle(value);
							if (value) {
								applyInlineFontStyle(value);
							} else {
								resetFontStyle();
							}
						}}
						help={__('Visual style only. This uses the font’s italic face and does not add emphasis. To add semantic emphasis that screen readers can announce, use the editor’s Italic button instead.', 'typography-stylist')}
					/>
					{inlineFontStyle && (
						<Button
							variant="secondary"
							onClick={resetFontStyle}
							isDestructive
							style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
							icon="undo"
						>
							{__('Reset Font Style', 'typography-stylist')}
						</Button>
					)}
				</div>

				{/* Case Control (#309): the selected text only. The block's
				    case stays in the sidebar. Screen readers read the
				    hidden heading, so a span's case changes only the look */}
				<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
					<SelectControl
						label={__('Case (for selected text)', 'typography-stylist')}
						value={normalizeTextCase(inlineTextCase)}
						options={[
							{ label: __('Default', 'typography-stylist'), value: '' },
							{ label: __('Normal', 'typography-stylist'), value: 'none' },
							{ label: __('All Caps', 'typography-stylist'), value: 'uppercase' },
							{ label: __('Lowercase', 'typography-stylist'), value: 'lowercase' },
							{ label: __('Title Case', 'typography-stylist'), value: 'capitalize' },
							{ label: __('Small Caps', 'typography-stylist'), value: 'small-caps' },
							{ label: __('All Small Caps', 'typography-stylist'), value: 'all-small-caps' }
						]}
						onChange={(value) => {
							const next = normalizeTextCase(value);
							if (next) {
								setInlineTextCase(next);
								applyInlineCase(next, inlineFakeSmallCaps);
							} else if (inlineCaseFromStyle) {
								// The style's class sets the case: there is
								// nothing on the text to remove, so the control
								// keeps showing the case that renders
								revertInlineControl('textCase');
							} else {
								resetInlineCase();
							}
						}}
						help={
							inlineCaseFromStyle
							? __('The paragraph style sets this case. To change it for the selected text, choose another case. To make it the text’s own case, click “Detach Style” first.', 'typography-stylist')
							: normalizeTextCase(inlineTextCase) === 'capitalize'
							? __('Capitalizes the first letter of every word, including short words such as “of” and “the”, and the letter after a hyphen.', 'typography-stylist')
							: (normalizeTextCase(inlineTextCase) === 'uppercase'
								? __('All caps are harder to read in long text, so keep them for short labels. Screen readers read this block’s original text, but when All Caps is applied to text in other blocks, some screen readers spell out short all-caps words letter by letter, as abbreviations.', 'typography-stylist')
								: __('Changes how the text looks only. The text keeps the case you typed. Default keeps the case the theme sets; Normal removes it.', 'typography-stylist'))}
					/>
					{isSmallCapsCase(inlineTextCase) && (
						<ToggleControl
							label={__('Allow fake small caps', 'typography-stylist')}
							checked={inlineFakeSmallCaps !== false}
							onChange={(value) => {
								setInlineFakeSmallCaps(value);
								applyInlineCase(inlineTextCase, value);
							}}
							help={inlineFakeSmallCaps !== false
								? __('When the font has no small caps, the browser makes them by shrinking capitals.', 'typography-stylist')
								: __('When the font has no small caps, the text stays in normal case.', 'typography-stylist')}
						/>
					)}
					{inlineTextCase && !inlineCaseFromStyle && (
						<Button
							variant="secondary"
							onClick={resetInlineCase}
							isDestructive
							style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
							icon="undo"
						>
							{__('Reset Case', 'typography-stylist')}
						</Button>
					)}
				</div>

				{/* Font Size Control */}
				<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
					<SelectControl
						label={__('Font Size (for selected text)', 'typography-stylist')}
						value={inlineFontSize}
						onChange={(value) => {
							setInlineFontSize(value);
							if (value === 'inherit') {
								// Take the size off the selection, not just the
								// control (a slider apply may still be pending).
								// resetFontSize() reads inlineFontSize to decide
								// there is anything to remove; in this closure
								// that is still the old value, as intended.
								debouncedApplyFontSize.cancel();
								resetFontSize();
								return;
							}
							// Apply now with the sliders' current values. The
							// sliders only render once this state lands, so
							// waiting for one to move left the selection
							// unstyled (QA finding E-6). The value goes in
							// explicitly: state has not updated here yet.
							applyInlineFontSize(value);
						}}
						options={[
							{ label: __('Inherit from block', 'typography-stylist'), value: 'inherit' },
							{ label: __('Responsive (fluid)', 'typography-stylist'), value: 'responsive' },
							// A fixed size on the selection (64, from a paragraph
							// style) has no control here; shown disabled so the
							// menu does not say Inherit (#255)
							...(inlineFixedSizePx !== null ? [{
								/* translators: %s: font size in px */
								label: sprintf(__('Fixed (%spx)', 'typography-stylist'), inlineFixedSizePx),
								value: String(inlineFontSize),
								disabled: true
							}] : [])
						]}
						disabled={fontSize === 'fit'}
						help={fontSize === 'fit'
							? __('Inline font sizes are ignored while this block uses Fit to width sizing. Use Relative size below to scale selected text against its fitted line.', 'typography-stylist')
							: (inlineFixedSizePx !== null
								? __('This text has a fixed size. To change it, choose a responsive size.', 'typography-stylist')
								: undefined)}
					/>
					{fontSize === 'fit' && (
						<>
							{/* Fit-relative scale: data-fitscale → font-size: Nem.
							    Em-relative sizes scale linearly with the fitted line,
							    so the stored width ratio stays valid (unlike absolute
							    data-fontsize values, which fit mode neutralizes). */}
							<RangeControl
								label={__('Relative size (for selected text)', 'typography-stylist')}
								value={inlineFitScale}
								onChange={(value) => {
									setInlineFitScale(value);
									if (value === 100) {
										// 100% = no attribute: cancel any pending
										// apply and remove it from the selection
										debouncedApplyFitScale.cancel();
										clearFitScale();
									} else {
										debouncedApplyFitScale();
									}
								}}
								min={10}
								max={100}
								step={5}
								help={inlineFitScale === 100 ? __('Full line size', 'typography-stylist') : `${inlineFitScale}%`}
								allowReset
								resetFallbackValue={100}
							/>
							{inlineFitScale !== 100 && (
								<Button
									variant="secondary"
									onClick={clearFitScale}
									isDestructive
									style={{ marginBottom: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
									icon="undo"
								>
									{__('Reset Relative Size', 'typography-stylist')}
								</Button>
							)}
							{/* Fit-relative vertical shift: data-fitshift →
							    vertical-align: Nem. Moves the inline box without
							    changing its advance — no measurement impact. */}
							<RangeControl
								label={__('Vertical shift (for selected text)', 'typography-stylist')}
								value={inlineFitShift}
								onChange={(value) => {
									setInlineFitShift(value);
									if (value === 0) {
										// 0 = no attribute: cancel any pending
										// apply and remove it from the selection
										debouncedApplyFitShift.cancel();
										clearFitShift();
									} else {
										debouncedApplyFitShift();
									}
								}}
								min={-1}
								max={1}
								step={0.05}
								help={inlineFitShift === 0 ? __('On the baseline', 'typography-stylist') : `${inlineFitShift}em`}
								allowReset
								resetFallbackValue={0}
							/>
							{inlineFitShift !== 0 && (
								<Button
									variant="secondary"
									onClick={clearFitShift}
									isDestructive
									style={{ fontSize: '11px', padding: '2px 8px', height: 'auto' }}
									icon="undo"
								>
									{__('Reset Vertical Shift', 'typography-stylist')}
								</Button>
							)}
						</>
					)}
					{fontSize !== 'fit' && inlineFontSize === 'responsive' && (
						<>
							<RangeControl
								label={__('Mobile (320px+)', 'typography-stylist')}
								value={inlineFontSizeMin}
								onChange={(value) => {
									setInlineFontSizeMin(value);
									debouncedApplyFontSize();
								}}
								min={8}
								max={200}
								step={1}
							/>
							<RangeControl
								label={__('Intermediate', 'typography-stylist')}
								value={inlineFontSizePreferred}
								onChange={(value) => {
									setInlineFontSizePreferred(value);
									debouncedApplyFontSize();
								}}
								min={8}
								max={400}
								step={1}
							/>
							<RangeControl
								label={__('Large (1920px)', 'typography-stylist')}
								value={inlineFontSizeMax}
								onChange={(value) => {
									setInlineFontSizeMax(value);
									debouncedApplyFontSize();
								}}
								min={8}
								max={400}
								step={1}
							/>
							{!isValidFontSizeRange(inlineFontSizeMin, inlineFontSizePreferred, inlineFontSizeMax) && (
								<Notice status="warning" isDismissible={false}>
									{__('Note: Font sizes are out of order. Mobile should be ≤ Intermediate ≤ Large for expected behavior.', 'typography-stylist')}
								</Notice>
							)}
							{/* The unit the selection's size is written in now; a size set here is written in the site's new-content unit (buildInlineFontSizeSpan) and re-detected after the apply */}
							<ZoomNotice min={inlineFontSizeMin} preferred={inlineFontSizePreferred} max={inlineFontSizeMax} unit={inlineFontSizeUnit} />
							<Button
								variant="secondary"
								onClick={resetFontSize}
								isDestructive
								style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
								icon="undo"
							>
								{__('Reset Font Size', 'typography-stylist')}
							</Button>
						</>
					)}
				</div>

				{/* Line Height Control */}
				<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
					<RangeControl
						label={__('Line Height (for selected text)', 'typography-stylist')}
						value={inlineLineHeight === 0 ? 1.5 : inlineLineHeight}
						onChange={(value) => {
							setInlineLineHeight(value);
							if (value !== 0) {
								debouncedApplyLineHeight();
							}
						}}
						min={0.5}
						max={3}
						step={0.1}
						help={inlineLineHeight === 0 ? __('Currently using browser default', 'typography-stylist') : inlineLineHeight}
						allowReset
						resetFallbackValue={0}
						marks={[
							{ value: 1.5, label: '1.5' }
						]}
						renderTooltipContent={(value) => inlineLineHeight === 0 ? __('Browser default', 'typography-stylist') : value}
					/>
					{inlineLineHeight !== 0 && (
						<Button
							variant="secondary"
							onClick={clearLineHeight}
							isDestructive
							style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
							icon="undo"
						>
							{__('Clear', 'typography-stylist')}
						</Button>
					)}
				</div>

				{/* Letter Spacing Control */}
				<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
					<RangeControl
						label={__('Letter Spacing (for selected text)', 'typography-stylist')}
						value={inlineLetterSpacing}
						onChange={(value) => {
							setInlineLetterSpacing(value);
							if (value !== 0) {
								debouncedApplyLetterSpacing();
							}
						}}
						min={-200}
						max={200}
						step={1}
						help={inlineLetterSpacing === 0 ? __('Normal', 'typography-stylist') : `${inlineLetterSpacing / 1000}em`}
						allowReset
						resetFallbackValue={0}
					/>
					{inlineLetterSpacing !== 0 && (
						<Button
							variant="secondary"
							onClick={clearLetterSpacing}
							isDestructive
							style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
							icon="undo"
							isSmall
						>
							{__('Clear', 'typography-stylist')}
						</Button>
					)}
				</div>

				{/* Extension hook point: before features (e.g., Glyphs panel) */}
				<div className="typost-hook-point" data-hook="typost_qft_before_features" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_qft_before_features', el, {
							fontId, features, inlineFontFamily, capturedSelection, content, clientId
						});
					}
				}} />

				{/* Active Features Summary */}
				{inlineFeaturesAtSelection.length > 0 && (
					<div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f6fc', borderRadius: '4px', border: '1px solid #0783be' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
							<h5 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0783be' }}>
								{__('Active Features:', 'typography-stylist')}
							</h5>
							<Button
								variant="secondary"
								isDestructive
								onClick={clearInlineFormatting}
								style={{ fontSize: '11px', padding: '2px 8px', height: 'auto' }}
							>
								{__('Clear All', 'typography-stylist')}
							</Button>
						</div>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
							{inlineFeaturesAtSelection.map(featureId => {
								const featureName = availableFeatures.find(f => f.id === featureId)?.name || featureId;
								return (
									<code key={featureId} style={{
										fontSize: '11px',
										padding: '4px 8px',
										backgroundColor: '#fff',
										border: '1px solid #0783be',
										borderRadius: '3px',
										color: '#0783be',
										fontWeight: 500
									}}>
										{featureName} ({featureId})
									</code>
								);
							})}
						</div>
					</div>
				)}

				{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => {
					// Check if any features in this category are active
					const hasActiveFeatures = categoryFeatures.some(feature =>
						features.includes(feature.id) || inlineFeaturesAtSelection.includes(feature.id)
					);

					return (
						<PanelBody
							key={category}
							title={getCategoryTitle(category)}
							initialOpen={hasActiveFeatures}
							className={`typost-feature-category-panel ${hasActiveFeatures ? 'has-active-features' : ''}`}
						>
						{categoryFeatures.map(feature => {
							const sampleText = previewText || 'ffi ffl Th AE';
							// Check both block-level features and inline features at cursor.
							// A span that turns the tag OFF ("swsh" 0 from the Glyphs Panel
							// base cell) overrides the block-level state for its text — but
							// only while there is a selection: a collapsed caret makes the
							// click toggle the BLOCK-level feature (toggleFeature), so the
							// checkbox must report that state or it would announce "not
							// checked" and then strip the feature from the whole block.
							const hasInlineSelection = !!resolvedApplyRange && resolvedApplyRange.start !== resolvedApplyRange.end;
							const isActive = inlineFeaturesAtSelection.includes(feature.id) ||
								(features.includes(feature.id) && !(hasInlineSelection && inlineDisabledFeaturesAtSelection.includes(feature.id)));
							return (
								<div key={feature.id} style={{ marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '8px' }}>
									<div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
										<label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}>
											<input
												type="checkbox"
												checked={isActive}
												onChange={() => toggleFeature(feature.id)}
												style={{ marginRight: '8px' }}
											/>
											<span style={{ fontSize: '13px', fontWeight: 500 }}>{feature.name}</span>
											<code style={{ fontSize: '11px', marginLeft: '8px', color: '#666' }}>{feature.id}</code>
										</label>
									</div>
									<div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', marginLeft: '24px' }}>
										{feature.description}
									</div>
									<div className="typost-feature-preview" style={{ marginLeft: '24px' }}>
										<Button
											className="typost-feature-preview-on typost-feature-apply-btn"
											onClick={() => applyFeatureToSelection(feature.id)}
											style={{
												fontFeatureSettings: [...new Set([feature.id, ...features, ...inlineFeaturesAtSelection])].map(f => `"${f}" 1`).join(', '),
												fontFamily: inlineFontFamilyAtSelection
													? `var(--font-${inlineFontFamilyAtSelection})`
													// Block font must resolve from fontId too (save.js parity):
													// computedFont is only detected while fontFamily is unset,
													// so gating on the string rendered fontId-only blocks'
													// feature previews in the theme's inherited font.
													: (resolveBlockFontFamilyStyle(fontId, fontFamily) || computedFont || 'inherit'),
												// Render the italic face when the selection is italic
												// (data-fontstyle span, <em>/<i>, or the block setting) —
												// italic faces carry their own glyphs and features
												fontStyle: (inlineStylesAtSelection && inlineStylesAtSelection.fontStyle) || inlineFontStyle || fontStyle || undefined,
												// The case of the selected text (#309),
												// else the block's (#214): smcp, c2sc and
												// case look different on capitals
												...(inlineTextCase
													? caseStyleObject(inlineTextCase, inlineFakeSmallCaps)
													: caseStyleObject(textCase, fakeSmallCaps))
											}}
										>
											{sampleText}
										</Button>
									</div>
								</div>
							);
						})}
					</PanelBody>
					);
				})}
				</div>

				{/* Extension hook point: after features */}
				<div className="typost-hook-point" data-hook="typost_qft_after_features" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_qft_after_features', el, {
							fontId, features, content
						});
					}
				}} />
			</div>

			{/* Resize handles */}
			<div className="typost-resize-handles">
				<div className="typost-resize-handle typost-resize-handle-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
				<div className="typost-resize-handle typost-resize-handle-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
				<div className="typost-resize-handle typost-resize-handle-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
				<div className="typost-resize-handle typost-resize-handle-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
				<div className="typost-resize-handle typost-resize-handle-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
				<div className="typost-resize-handle typost-resize-handle-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
				<div className="typost-resize-handle typost-resize-handle-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
				<div className="typost-resize-handle typost-resize-handle-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
			</div>
		</Modal>
	);
}
