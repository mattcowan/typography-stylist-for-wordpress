/**
 * Typography Stylist Block - the reset control of a setting that the block
 * changes on top of its paragraph style (#451).
 *
 * A render function, not a component, like the panels that call it: it must
 * not call hooks (__tests__/render-functions-no-hooks.test.js).
 */

import { Button } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Move focus to the setting's own control once the reset control is gone.
 *
 * The reset removes the button that has focus (the setting is no longer an
 * override), which would drop keyboard focus to the page. The first form
 * control of the same sidebar panel gets it, and it now shows the style's
 * value; the panel's title button when the panel has no control.
 *
 * @param {Element} button The reset button that was clicked.
 */
function focusSettingAfterReset(button) {
	const panel = button && button.closest ? button.closest('.components-panel__body') : null;
	const win = panel && panel.ownerDocument ? panel.ownerDocument.defaultView : null;
	if (!panel || !win) {
		return;
	}
	win.setTimeout(() => {
		const target = panel.querySelector('select, input, textarea, [role="combobox"]')
			|| panel.querySelector('.components-panel__body-toggle');
		if (target && typeof target.focus === 'function') {
			target.focus();
		}
	}, 0);
}

/**
 * The help line under a setting whose empty option ("Theme default",
 * "(Default)", "Inherit") shows the paragraph style's value, not the
 * theme's, while the block has a style (#451 review): the empty value is
 * not an override, so the style's class still sets the property. Detaching
 * the style is the way to the theme's value. Nothing without an active
 * style.
 *
 * @param {?Object} overrideControls { styleOverrides } from Edit; null
 *                                   styleOverrides means no active style.
 * @param {string}  optionLabel      The empty option's label, as the control shows it.
 * @return {?Element} The help line.
 */
export function renderStyleDefaultHelp(overrideControls, optionLabel) {
	const { styleOverrides } = overrideControls || {};
	if (!styleOverrides) {
		return null;
	}
	return (
		<p className="typost-style-default-help" style={{ fontSize: '12px', color: '#757575', marginTop: '8px', marginBottom: '8px' }}>
			{sprintf(
				/* translators: %s: the label of a setting's empty option in the block sidebar, for example "Theme default" */
				__('With a paragraph style, “%s” shows the style’s value. To use the theme’s value, detach the style.', 'typography-stylist'),
				optionLabel
			)}
		</p>
	);
}

/**
 * The note and the "Reset to style" button for one override key, or nothing
 * when the block has no active paragraph style or does not override the key.
 *
 * @param {?Object} overrideControls { styleOverrides, resetStyleOverride } from Edit.
 *                                   styleOverrides is the block's override keys
 *                                   as a map, null without an active style.
 * @param {string}  key              The override key (STYLE_OVERRIDE_KEYS in utils.js).
 * @param {string}  settingName      The setting's name, as the panel shows it.
 * @return {?Element} The control.
 */
export default function renderOverrideReset(overrideControls, key, settingName) {
	const { styleOverrides, resetStyleOverride } = overrideControls || {};
	if (!styleOverrides || !styleOverrides[key] || typeof resetStyleOverride !== 'function') {
		return null;
	}
	return (
		<div className="typost-override-reset" style={{ marginTop: '12px' }}>
			<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '8px' }}>
				{__('This block has its own value for this setting. The paragraph style does not change it.', 'typography-stylist')}
			</p>
			<Button
				variant="secondary"
				onClick={(event) => {
					const button = event.currentTarget;
					resetStyleOverride(key);
					focusSettingAfterReset(button);
				}}
				aria-label={sprintf(
					/* translators: %s: the name of a setting in the block sidebar, for example "Font Weight" */
					__('Reset to style: %s', 'typography-stylist'),
					settingName
				)}
			>
				{__('Reset to style', 'typography-stylist')}
			</Button>
		</div>
	);
}
