/**
 * Size readout and zoom notice of the inline editor's responsive sliders.
 *
 * Moved out of block-editor.js unchanged (#357). Strings here are part of
 * the inline editor bundle; see languages/README.md for how they reach the
 * catalog.
 *
 * @since 2.4.0
 */
const { pxToRem, getResponsiveZoomNotice } = require('../font-size-units.js');

/**
 * Slider readout: sizes are entered in px. The caller passes the unit the
 * size is written in (getZoomNoticeUnit(): the new-content unit once the
 * author changes the size, else the span's own unit), the same unit the
 * zoom notice and the full rebuild use. In rem show both ("24px
 * (1.5rem)"), in px show px only.
 *
 * @param {number} px   Size in px
 * @param {string} unit 'rem' or 'px'
 * @return {string} Readout
 */
function formatRemReadout(px, unit) {
    const { __, sprintf } = wp.i18n;
    return (unit === 'rem'
        ? sprintf(
            /* translators: 1: font size in pixels, 2: the same size in rem (pixels divided by 16) */
            __('%1$spx (%2$srem)', 'typography-stylist'),
            px,
            pxToRem(px)
        )
        : `${px}px`);
}

/**
 * Zoom notice for responsive sizes (#234), the inline editor's copy of
 * ZoomNotice in the block's edit.js (separate build pipeline). A size the
 * author sets is written in the site's new-content unit (#248): in rem
 * buildResponsiveClamp() limits the slope ('slower'), in px the slope is
 * kept and may not double ('fails'). A size the author has not changed
 * keeps the unit the span has.
 *
 * The Notice itself speaks nothing: its text carries the live slider
 * values, and core would speak it again on every slider step. A
 * value-free sentence is spoken only when the notice appears or changes
 * kind after mount — never on mount, which is the tick the modal takes
 * focus, when a notice would be read before the dialog's name.
 */
function ZoomNotice({ min, preferred, max, unit }) {
    const { useRef, useEffect } = wp.element;
    const { Notice } = wp.components;
    const { __, sprintf } = wp.i18n;
    const notice = getResponsiveZoomNotice(min, preferred, max, unit);
    const kind = notice ? notice.kind : null;
    const previousKind = useRef(kind);
    useEffect(() => {
        if (kind && kind !== previousKind.current && wp.a11y && typeof wp.a11y.speak === 'function') {
            wp.a11y.speak(kind === 'slower'
                ? __('To stay readable when a reader zooms in, this size grows more slowly than set.', 'typography-stylist')
                : __('This size does not double when a reader zooms to 500%.', 'typography-stylist'), 'polite');
        }
        previousKind.current = kind;
    }, [kind]);
    if (!notice) {
        return null;
    }
    return (
        <Notice status="warning" isDismissible={false} spokenMessage="" className="typost-size-zoom-notice">
            {notice.kind === 'slower'
                ? sprintf(
                    /* translators: 1: font size in px that the text reaches, 2: the Maximum font size in px, 3: the smallest Preferred size in px that reaches the Maximum size */
                    __('To stay readable when a reader zooms in, this size grows more slowly than set: %1$spx in a 1920px window instead of %2$spx. To reach %2$spx, set Preferred to at least %3$spx.', 'typography-stylist'),
                    notice.reach,
                    notice.max,
                    notice.minPreferred
                )
                : sprintf(
                    /* translators: 1: the largest Maximum font size in px that doubles with zoom, 2: the smallest Preferred size in px that doubles with zoom */
                    __('This size does not double when a reader zooms to 500%%. Set Maximum to %1$spx or less, or Preferred to at least %2$spx.', 'typography-stylist'),
                    notice.reach,
                    notice.minPreferred
                )}
        </Notice>
    );
}

module.exports = {
    formatRemReadout: formatRemReadout,
    ZoomNotice: ZoomNotice
};
