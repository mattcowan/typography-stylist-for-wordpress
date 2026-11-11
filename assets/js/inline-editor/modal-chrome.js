/**
 * The frame of the inline editor: toolbar buttons, the modal's draggable
 * header, the tips notice, extension hook points and the resize handles.
 *
 * Function components split out of TypographyFeaturesControl.render() in
 * block-editor.js (#357). They are defined at module scope so React keeps
 * their DOM between renders; the component passes everything as props.
 *
 * @since 2.4.0
 */

/**
 * The format's block toolbar buttons: the Typography Stylist button and
 * the extension-registered buttons (v2.3.0), rendered as real
 * ToolbarButtons so they join the toolbar's roving tabindex.
 */
function InlineToolbar({ icon, isActive, onToggle, extensionButtons, onExtensionClick }) {
    const { BlockControls } = wp.blockEditor;
    const { ToolbarGroup, ToolbarButton } = wp.components;
    const { __ } = wp.i18n;
    return (
        <BlockControls>
            <ToolbarGroup>
                <ToolbarButton
                    icon={icon}
                    // Same string as the block's Quick Feature
                    // Toggle button in edit.js: one control,
                    // one name. "Typography Stylist" alone did
                    // not say what the button does.
                    label={__('Typography Stylist Features', 'typography-stylist')}
                    onClick={onToggle}
                    isActive={isActive}
                    className="typost-toolbar-button"
                />
                {extensionButtons.map((button) => (
                    <ToolbarButton
                        key={button.id}
                        icon={button.icon}
                        // `label`, matching the button beside
                        // it and the block editor's rendering
                        // of the same descriptors in edit.js.
                        // The descriptor field is named
                        // `label` too (see HOOKS.md), so this
                        // is the one-to-one mapping.
                        label={button.label}
                        isActive={!!button.isActive}
                        onClick={() => onExtensionClick(button)}
                        className={`typost-toolbar-button typost-ext-toolbar-button typost-ext-toolbar-button--${button.id}`}
                    />
                ))}
            </ToolbarGroup>
        </BlockControls>
    );
}

/**
 * Custom draggable header. The bar itself is a mouse drag surface only:
 * as a focusable role="toolbar" div it was a Tab stop NVDA read as
 * "document. Drag to reposition modal, tool bar" (QA finding SR-4).
 * Keyboard repositioning lives on the named "Move panel" button, so it is
 * discoverable rather than an accident of keydown bubbling from Close.
 */
function ModalHeader({ titleId, isDragging, onDragStart, onHeaderKeyDown, onClose }) {
    const { Button } = wp.components;
    const { __ } = wp.i18n;
    return (
        <div
            className="typost-modal-header"
            onMouseDown={onDragStart}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
            <h3 id={titleId}>{__('Typography Stylist', 'typography-stylist')}</h3>
            <Button
                icon="move"
                label={__('Move panel, use arrow keys', 'typography-stylist')}
                onKeyDown={onHeaderKeyDown}
                className="typost-modal-move-button"
            />
            <Button
                icon="no-alt"
                label={__('Close', 'typography-stylist')}
                onClick={onClose}
                className="typost-modal-close-button"
            />
        </div>
    );
}

/**
 * Usage tips notice - dismissible, dismissal remembered per browser.
 * spokenMessage '' keeps Notice from pushing the tip into the live region
 * on mount, where NVDA read it BEFORE the dialog's name. Own dismiss
 * button: Notice's is labelled "Close", which put two "Close, button"
 * stops in a row with different effects (QA finding SR-4).
 */
function TipsNotice({ isDismissed, onDismiss }) {
    const { Button, Notice } = wp.components;
    const { __ } = wp.i18n;
    if (isDismissed) {
        return null;
    }
    return (
        <div className="typost-sticky-notice-wrapper">
            {wp.element.createElement(Notice, {
                status: 'info',
                isDismissible: false,
                spokenMessage: '',
                className: 'typost-drag-notice'
            },
                wp.element.createElement('div', { className: 'typost-tip-text' },
                    wp.element.createElement('p', { style: { margin: 0 } },
                        '💡 ' + __('Tip: Drag the title bar to reposition this panel.', 'typography-stylist')
                    ),
                    wp.element.createElement('p', { style: { margin: '4px 0 0' } },
                        __('Changes apply instantly. Press Ctrl+Z (Cmd+Z on Mac) to undo.', 'typography-stylist')
                    )
                ),
                wp.element.createElement(Button, {
                    icon: 'no-alt',
                    label: __('Dismiss tip', 'typography-stylist'),
                    onClick: onDismiss,
                    className: 'typost-tip-dismiss',
                    size: 'small'
                })
            )}
        </div>
    );
}

/**
 * Extension hook point: an empty div an extension renders into. The
 * action fires once per element (el._hooked); a parent that wants it to
 * fire again (a new font) gives the hook point a new key.
 *
 * @param {Object} props
 * @param {string} props.hook  Action name, also the data-hook value
 * @param {Object} props.state The component state, passed to the action
 */
function HookPoint({ hook, state }) {
    return (
        <div className="typost-hook-point" data-hook={hook} ref={(el) => {
            if (el && !el._hooked) {
                el._hooked = true;
                window.typostHooks.doAction(hook, el, state);
            }
        }} />
    );
}

// The eight resize directions and their cursors, in DOM order
const RESIZE_HANDLES = [
    ['n', 'ns-resize'],
    ['ne', 'nesw-resize'],
    ['e', 'ew-resize'],
    ['se', 'nwse-resize'],
    ['s', 'ns-resize'],
    ['sw', 'nesw-resize'],
    ['w', 'ew-resize'],
    ['nw', 'nwse-resize']
];

/**
 * Resize handles - 8 directions. Mouse-only affordances: they had
 * role="slider" without a value (axe A11Y-1) and tabIndex 0 with no
 * keyboard handler, so they were eight dead Tab stops. Hidden from
 * assistive tech instead; the modal is usable unresized.
 */
function ResizeHandles({ onResizeStart }) {
    return (
        <div className="typost-resize-handles">
            {RESIZE_HANDLES.map(([direction, cursor]) => (
                <div
                    key={direction}
                    className={`typost-resize-handle typost-resize-handle-${direction}`}
                    onMouseDown={(e) => onResizeStart(e, direction)}
                    aria-hidden="true"
                    style={{ cursor: cursor }}
                />
            ))}
        </div>
    );
}

module.exports = {
    InlineToolbar: InlineToolbar,
    ModalHeader: ModalHeader,
    TipsNotice: TipsNotice,
    HookPoint: HookPoint,
    ResizeHandles: ResizeHandles
};
