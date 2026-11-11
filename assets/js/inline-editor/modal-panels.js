/**
 * The sections of the inline editor's modal, one function component each.
 *
 * Split out of TypographyFeaturesControl.render() in block-editor.js (#357).
 * Defined at module scope so React keeps their DOM (and focus) between
 * renders. They hold no state: the component passes its state and its
 * handlers as props. Strings here are part of the inline editor bundle; see
 * languages/README.md for how they reach the catalog.
 *
 * @since 2.4.0
 */
const { isValidFontSizeRange } = require('../inline-apply-rules.js');
const { normalizeTextCase, isSmallCapsCase } = require('../text-case.js');
const { FontPicker } = require('../font-picker.js');
const { formatRemReadout, ZoomNotice } = require('./zoom-notice.js');
const { HookPoint } = require('./modal-chrome.js');
const { getCategoryTitle, buildFeaturePreviewStyle } = require('./feature-options.js');

/**
 * Accessibility Warning — Non-blocking Notice (v2.0.0). Sits at the top of
 * the panel: it reports a problem with the selection the author just made
 * and offers the fix, so burying it under every feature control meant
 * scrolling past all of them to find out anything was wrong.
 *
 * spokenMessage '': Notice would otherwise push the whole warning into the
 * live region on mount, ahead of the dialog's own announcement (QA finding
 * SR-1). It is announced instead by togglePopover once the title has been
 * read, and travels with the Convert button through aria-describedby.
 */
function WordBoundaryNotice({ warning, noticeId, canConvert, blockedMessage, onConvert, settingsUrl }) {
    const { Button, Notice } = wp.components;
    const { __ } = wp.i18n;
    if (!warning) {
        return null;
    }
    return (
        <Notice status="warning" isDismissible={false} spokenMessage="" className="typost-word-boundary-notice">
            <strong>{__('Accessibility Notice', 'typography-stylist')}</strong>
            <p id={noticeId}>{warning}</p>
            {canConvert && (
                <Button variant="secondary" onClick={onConvert} className="typost-convert-button" aria-describedby={noticeId}>
                    {__('Convert to Typography Stylist Block', 'typography-stylist')}
                </Button>
            )}
            {!canConvert && blockedMessage && (
                <p className="typost-convert-blocked">{blockedMessage}</p>
            )}
            <p className="typost-warning-settings-link">
                <a href={settingsUrl + '&tab=accessibility'} target="_blank" rel="noopener noreferrer">
                    {__('Manage accessibility settings', 'typography-stylist')}
                </a>
            </p>
        </Notice>
    );
}

/**
 * Font Detection Warning
 */
function FontDetectionNotice({ failed, selectedFont }) {
    const { Notice } = wp.components;
    const { __ } = wp.i18n;
    if (!(failed && !selectedFont)) {
        return null;
    }
    return wp.element.createElement(Notice, {
        status: 'warning',
        isDismissible: false,
        className: 'typost-font-detection-notice'
    },
        wp.element.createElement('p', { style: { margin: 0 } },
            __('Font could not be detected for this block type.', 'typography-stylist')
        ),
        wp.element.createElement('p', { style: { margin: '8px 0 0 0', fontSize: '12px' } },
            __('For the best experience with OpenType features, consider using the Typography Stylist block instead of the inline toolbar.', 'typography-stylist')
        )
    );
}

/**
 * Font Selector
 */
function FontFamilyPanel({ fontOptions, selectedFontId, onChange, adoptError, onDismissAdoptError }) {
    const { Notice } = wp.components;
    const { __ } = wp.i18n;
    if (!(fontOptions.length > 0)) {
        return null;
    }
    return (
        <div className="typost-modal-section typost-font-section">
            <h4>{__('Font Family', 'typography-stylist')}</h4>
            <FontPicker
                /* The h4 above is the visible heading; the
                   control still needs its own accessible name. */
                label={__('Font Family', 'typography-stylist')}
                hideLabelFromVision
                placeholder={__('(Default)', 'typography-stylist')}
                value={selectedFontId ? String(selectedFontId) : ''}
                options={fontOptions}
                onChange={onChange}
            />
            {adoptError && (
                wp.element.createElement(Notice, {
                    status: 'error',
                    isDismissible: true,
                    onRemove: onDismissAdoptError
                },
                    __('This WordPress Font Library font could not be added. Please try again.', 'typography-stylist')
                )
            )}
        </div>
    );
}

/**
 * Font Weight Control - replaceable via typost_weight_control filter.
 *
 * The component's render() applies the filter and reads the options
 * (controlType, weightOptions), so the extension's filter runs at the same
 * point of the render pass as before #357.
 */
function FontWeightPanel({ state, fontWeight, controlType, weightOptions, onChange }) {
    const { SelectControl } = wp.components;
    const { __ } = wp.i18n;
    const weightControlType = controlType;

    // 'hidden': suppress the weight control entirely (no wrapper, no hook)
    if (weightControlType === 'hidden') return null;

    if (weightControlType !== 'default') {
        return (
            <div className="typost-modal-section typost-fontweight-section">
                {/* key: remount (and re-fire the action) when the font changes */}
                <HookPoint key={`typost-weight-${state.selectedFontId || 'none'}`} hook="typost_weight_control" state={state} />
            </div>
        );
    }

    if (weightOptions.length <= 1) return null;
    return (
        <div className="typost-modal-section typost-fontweight-section">
            <h4>{__('Font Weight', 'typography-stylist')}</h4>
            {/* The h4 is not associated with the control; the hidden
                label is what gives the select its accessible name
                (NVDA read it as "combo box, 400 - Normal" — QA SR-2). */}
            <SelectControl
                label={__('Font Weight', 'typography-stylist')}
                hideLabelFromVision
                value={fontWeight}
                options={weightOptions}
                onChange={onChange}
            />
        </div>
    );
}

/**
 * Font Style Control (visual italic — semantic emphasis stays <em>)
 */
function FontStylePanel({ fontStyle, onChange }) {
    const { SelectControl } = wp.components;
    const { __ } = wp.i18n;
    return (
        <div className="typost-modal-section typost-fontstyle-section">
            <h4>{__('Font Style', 'typography-stylist')}</h4>
            <SelectControl
                label={__('Font Style', 'typography-stylist')}
                hideLabelFromVision
                value={fontStyle}
                options={[
                    { label: __('Inherit', 'typography-stylist'), value: '' },
                    { label: __('Normal (upright)', 'typography-stylist'), value: 'normal' },
                    { label: __('Italic', 'typography-stylist'), value: 'italic' }
                ]}
                onChange={onChange}
                help={__('Visual style only. This uses the font’s italic face and does not add emphasis. To add semantic emphasis that screen readers can announce, use the editor’s Italic button instead.', 'typography-stylist')}
            />
        </div>
    );
}

/**
 * Case (#214) — how the letters look; the text keeps its case
 */
function CasePanel({ textCase, fakeSmallCaps, paragraphStyleId, onChange, onFakeSmallCapsChange }) {
    const { SelectControl, ToggleControl } = wp.components;
    const { __ } = wp.i18n;
    return (
        <div className="typost-modal-section typost-textcase-section">
            <h4>{__('Case', 'typography-stylist')}</h4>
            <SelectControl
                label={__('Case', 'typography-stylist')}
                hideLabelFromVision
                value={normalizeTextCase(textCase)}
                options={[
                    { label: __('Default', 'typography-stylist'), value: '' },
                    { label: __('Normal', 'typography-stylist'), value: 'none' },
                    { label: __('All Caps', 'typography-stylist'), value: 'uppercase' },
                    { label: __('Lowercase', 'typography-stylist'), value: 'lowercase' },
                    { label: __('Title Case', 'typography-stylist'), value: 'capitalize' },
                    { label: __('Small Caps', 'typography-stylist'), value: 'small-caps' },
                    { label: __('All Small Caps', 'typography-stylist'), value: 'all-small-caps' }
                ]}
                onChange={onChange}
                help={paragraphStyleId
                    // Under a style the span writes no inline case,
                    // as with the size (#255)
                    ? __('The paragraph style sets the case. To change the case of this text only, click Detach Style first.', 'typography-stylist')
                    : (normalizeTextCase(textCase) === 'capitalize'
                        ? __('Capitalizes the first letter of every word, including short words such as “of” and “the”, and the letter after a hyphen.', 'typography-stylist')
                        : (normalizeTextCase(textCase) === 'uppercase'
                            // No hidden copy here: screen readers read the transformed text
                            ? __('All caps are harder to read in long text, so keep them for short labels. Some screen readers spell out short all-caps words letter by letter, as abbreviations.', 'typography-stylist')
                            : __('Changes how the text looks only. The text keeps the case you typed. Default keeps the case the theme sets; Normal removes it.', 'typography-stylist')))}
            />
            {isSmallCapsCase(textCase) && (
                <ToggleControl
                    label={__('Allow fake small caps', 'typography-stylist')}
                    checked={fakeSmallCaps !== false}
                    onChange={onFakeSmallCapsChange}
                    help={fakeSmallCaps !== false
                        ? __('When the font has no small caps, the browser makes them by shrinking capitals.', 'typography-stylist')
                        : __('When the font has no small caps, the text stays in normal case.', 'typography-stylist')}
                />
            )}
        </div>
    );
}

/**
 * Font Size Controls
 *
 * fixedSizePx: a fixed size (64, from a paragraph style) has no control in
 * the Font Size menu; it is shown as a disabled option (#255). sizeUnit:
 * the unit the size is written in (getZoomNoticeUnit()), for the slider
 * readouts and the zoom notice.
 */
function FontSizePanel({ fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fixedSizePx, paragraphStyleId, sizeUnit, onSizeChange, onMinChange, onPreferredChange, onMaxChange }) {
    const { SelectControl, RangeControl, Notice } = wp.components;
    const { __, sprintf } = wp.i18n;
    return (
        <div className="typost-modal-section typost-fontsize-section">
            <h4>{__('Font Size', 'typography-stylist')}</h4>
            <SelectControl
                label={__('Font Size', 'typography-stylist')}
                hideLabelFromVision
                value={fontSize}
                options={[
                    { label: __('Inherit', 'typography-stylist'), value: 'inherit' },
                    { label: __('Responsive (Fluid)', 'typography-stylist'), value: 'responsive' },
                    // Fit to Width only exists on Typography Stylist blocks;
                    // the value can still appear here via a fit-mode paragraph
                    // style. Shown disabled (and only while active) so the
                    // dropdown reflects the truth instead of a wrong option.
                    ...(fontSize === 'fit' ? [{ label: __('Fit to Width (blocks only)', 'typography-stylist'), value: 'fit', disabled: true }] : []),
                    // A fixed size (64, from a paragraph style) has no
                    // control here either; shown the same way so the
                    // menu does not say Inherit (#255)
                    ...(fixedSizePx !== null ? [{
                        /* translators: %s: font size in px */
                        label: sprintf(__('Fixed (%spx)', 'typography-stylist'), fixedSizePx),
                        value: String(fontSize),
                        disabled: true
                    }] : [])
                ]}
                onChange={onSizeChange}
                help={fontSize === 'responsive'
                    ? __('Responsive mode uses CSS clamp() for fluid sizing across viewports.', 'typography-stylist')
                    : (fontSize === 'fit'
                        ? __('This paragraph style fits text to the block width. Inline text uses the style’s fluid fallback size instead.', 'typography-stylist')
                        : (fixedSizePx !== null
                            // Under a style the span writes no inline size, so a
                            // new size shows only after Detach (#255, review)
                            ? (paragraphStyleId
                                ? __('The paragraph style sets this size. To change the size of this text only, click Detach Style first.', 'typography-stylist')
                                : __('This text has a fixed size. To change it, choose a responsive size.', 'typography-stylist'))
                            : undefined))}
            />

            {fontSize === 'responsive' && (
                <div className="typost-fontsize-controls">
                    <RangeControl
                        label={__('Minimum Size (mobile)', 'typography-stylist')}
                        value={fontSizeMin}
                        onChange={onMinChange}
                        min={8}
                        max={120}
                        step={1}
                        help={formatRemReadout(fontSizeMin, sizeUnit)}
                    />
                    <RangeControl
                        label={__('Preferred Size (tablet)', 'typography-stylist')}
                        value={fontSizePreferred}
                        onChange={onPreferredChange}
                        min={8}
                        max={120}
                        step={1}
                        help={formatRemReadout(fontSizePreferred, sizeUnit)}
                    />
                    <RangeControl
                        label={__('Maximum Size (desktop)', 'typography-stylist')}
                        value={fontSizeMax}
                        onChange={onMaxChange}
                        min={8}
                        max={120}
                        step={1}
                        help={formatRemReadout(fontSizeMax, sizeUnit)}
                    />
                    {/* Same soft validation as the block (QA E-1): the
                        clamp() is still written as typed, so the author
                        is told instead of silently corrected. Core's
                        Notice speaks its text on mount. */}
                    {!isValidFontSizeRange(fontSizeMin, fontSizePreferred, fontSizeMax) && (
                        <Notice status="warning" isDismissible={false} className="typost-size-order-notice">
                            {__('Note: Font sizes are out of order. Minimum should be ≤ Preferred ≤ Maximum for expected behavior.', 'typography-stylist')}
                        </Notice>
                    )}
                    {/* Zoom notice (#234), worded for the unit the
                        span will be written in */}
                    <ZoomNotice min={fontSizeMin} preferred={fontSizePreferred} max={fontSizeMax} unit={sizeUnit} />
                </div>
            )}
        </div>
    );
}

/**
 * Line Height Control
 */
function LineHeightPanel({ lineHeight, onChange }) {
    const { RangeControl } = wp.components;
    const { __ } = wp.i18n;
    return (
        <div className="typost-modal-section typost-lineheight-section">
            <h4>{__('Line Height', 'typography-stylist')}</h4>
            <RangeControl
                label={__('Line Height', 'typography-stylist')}
                hideLabelFromVision
                value={lineHeight === 0 ? 1.5 : lineHeight}
                onChange={onChange}
                min={0.5}
                max={3}
                step={0.1}
                help={lineHeight === 0 ? __('Currently using browser default', 'typography-stylist') : lineHeight}
                allowReset
                resetFallbackValue={0}
                marks={[
                    { value: 1.5, label: '1.5' }
                ]}
                renderTooltipContent={(value) => lineHeight === 0 ? __('Browser default', 'typography-stylist') : value}
            />
        </div>
    );
}

/**
 * Letter Spacing Control
 */
function LetterSpacingPanel({ letterSpacing, onChange }) {
    const { RangeControl } = wp.components;
    const { __ } = wp.i18n;
    return (
        <div className="typost-modal-section typost-letterspacing-section">
            <h4>{__('Letter Spacing', 'typography-stylist')}</h4>
            <RangeControl
                label={__('Letter Spacing', 'typography-stylist')}
                hideLabelFromVision
                value={letterSpacing}
                onChange={onChange}
                min={-200}
                max={200}
                step={1}
                help={letterSpacing === 0 ? __('Normal', 'typography-stylist') : `${letterSpacing / 1000}em`}
                allowReset
                resetFallbackValue={0}
            />
        </div>
    );
}

/**
 * Presets Section
 */
function PresetsPanel({ presets, activePreset, onApply }) {
    const { Button } = wp.components;
    const { __ } = wp.i18n;
    if (!(presets.length > 0)) {
        return null;
    }
    return (
        <div className="typost-presets-section">
            <h4>{__('Quick Presets', 'typography-stylist')}</h4>
            <div className="typost-presets-grid">
                {presets.map(preset => {
                    const isActive = activePreset === preset.id;
                    return (
                        <Button
                            key={preset.id}
                            isSecondary={!isActive}
                            isPrimary={isActive}
                            onClick={() => onApply(preset)}
                            className="typost-preset-button"
                        >
                            <div className="typost-preset-name">{preset.name}</div>
                            <div className="typost-preset-features-list">{preset.features.join(', ')}</div>
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Features Section: one panel per category, one toggle and one preview
 * button per feature. The preview uses the selected text or a default
 * sample, with this feature and every selected one.
 */
function FeaturesPanel({ groupedFeatures, selectedFeatures, previewText, fontToUse, renderedStyle, textCase, fakeSmallCaps, onToggle, onApply }) {
    const { PanelBody, ToggleControl, Button } = wp.components;
    const { __, sprintf } = wp.i18n;
    return (
        <div className="typost-features-section">
            <h4>{__('Individual Features', 'typography-stylist')}</h4>

            {Object.entries(groupedFeatures).map(([category, features]) => (
                <PanelBody
                    key={category}
                    title={getCategoryTitle(category)}
                    initialOpen={category === 'ligatures'}
                    className="typost-feature-category"
                >
                    {features.map(feature => (
                        <div key={feature.id} className="typost-feature-toggle">
                            <ToggleControl
                                label={feature.name}
                                help={feature.description}
                                checked={selectedFeatures.includes(feature.id)}
                                onChange={() => onToggle(feature.id)}
                            />
                            <code className="typost-feature-code">{feature.id}</code>
                            <div className="typost-feature-preview">
                                <Button
                                    className="typost-feature-preview-on typost-feature-apply-btn"
                                    onClick={() => onApply(feature.id)}
                                    style={buildFeaturePreviewStyle(feature.id, selectedFeatures, fontToUse, renderedStyle, textCase, fakeSmallCaps)}
                                    aria-label={sprintf(/* translators: %s: OpenType feature name. */ __('Apply the %s feature', 'typography-stylist'), feature.name)}
                                    title={sprintf(/* translators: %s: OpenType feature name. */ __('Click to apply %s', 'typography-stylist'), feature.name)}
                                >
                                    {previewText}
                                </Button>
                            </div>
                        </div>
                    ))}
                </PanelBody>
            ))}
        </div>
    );
}

/**
 * Convert to block — always reachable for convertible blocks, not only
 * when the accessibility notice fires. When the conversion is impossible
 * the reason is stated instead of rendering nothing, which previously read
 * as a missing feature. The word-boundary notice at the top of the panel
 * carries its own copy, so this is suppressed while it shows.
 */
function ConvertSection({ wordBoundaryWarning, canConvert, blockedMessage, onConvert }) {
    const { Button } = wp.components;
    const { __ } = wp.i18n;
    if (!(!wordBoundaryWarning && (canConvert || blockedMessage))) {
        return null;
    }
    return (
        <div className="typost-convert-section">
            {canConvert ? (
                <>
                    <Button variant="secondary" onClick={onConvert} className="typost-convert-button">
                        {__('Convert to Typography Stylist Block', 'typography-stylist')}
                    </Button>
                    <p className="typost-convert-description">
                        {__('Converts this heading or paragraph into a Typography Stylist block, which adds screen reader text and block-level typography controls.', 'typography-stylist')}
                    </p>
                </>
            ) : (
                <p className="typost-convert-blocked">{blockedMessage}</p>
            )}
        </div>
    );
}

/**
 * Clear Confirmation - Inline
 */
function ClearConfirmation({ show, dontShowAgain, onDontShowAgainChange, onConfirm, onCancel }) {
    const { Button, ButtonGroup, CheckboxControl, Notice } = wp.components;
    const { __ } = wp.i18n;
    if (!show) {
        return null;
    }
    return (
        <div className="typost-clear-confirmation-inline">
            {wp.element.createElement(Notice, {
                status: 'warning',
                isDismissible: false,
                className: 'typost-clear-warning'
            },
                wp.element.createElement('p', { style: { margin: '0 0 12px 0', fontWeight: '600' } },
                    __('Clear All Typography Settings?', 'typography-stylist')
                ),
                wp.element.createElement('p', { style: { margin: '0 0 12px 0', fontSize: '13px' } },
                    __('This will remove all typography features, font selections, and styling.', 'typography-stylist')
                ),
                wp.element.createElement(CheckboxControl, {
                    label: __('Do not show this warning again (this session)', 'typography-stylist'),
                    checked: dontShowAgain,
                    onChange: onDontShowAgainChange
                }),
                wp.element.createElement(ButtonGroup, { style: { marginTop: '12px' } },
                    wp.element.createElement(Button, {
                        isPrimary: true,
                        onClick: onConfirm
                    }, __('Clear All Settings', 'typography-stylist')),
                    wp.element.createElement(Button, {
                        isSecondary: true,
                        onClick: onCancel
                    }, __('Cancel', 'typography-stylist'))
                )
            )}
        </div>
    );
}

/**
 * Action Buttons (v2.0.0 - live preview, no Apply button)
 */
function ModalActions({ hidden, onClear, onClose }) {
    const { Button, ButtonGroup } = wp.components;
    const { __ } = wp.i18n;
    if (hidden) {
        return null;
    }
    return (
        <div className="typost-popover-actions">
            <ButtonGroup>
                <Button
                    isSecondary
                    onClick={onClear}
                >
                    {__('Clear', 'typography-stylist')}
                </Button>
                <Button
                    isTertiary
                    onClick={onClose}
                >
                    {__('Close', 'typography-stylist')}
                </Button>
            </ButtonGroup>
        </div>
    );
}

module.exports = {
    WordBoundaryNotice: WordBoundaryNotice,
    FontDetectionNotice: FontDetectionNotice,
    FontFamilyPanel: FontFamilyPanel,
    FontWeightPanel: FontWeightPanel,
    FontStylePanel: FontStylePanel,
    CasePanel: CasePanel,
    FontSizePanel: FontSizePanel,
    LineHeightPanel: LineHeightPanel,
    LetterSpacingPanel: LetterSpacingPanel,
    PresetsPanel: PresetsPanel,
    FeaturesPanel: FeaturesPanel,
    ConvertSection: ConvertSection,
    ClearConfirmation: ClearConfirmation,
    ModalActions: ModalActions
};
