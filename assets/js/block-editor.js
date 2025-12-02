/**
 * Block Editor Integration for OpenType Stylist
 * Adds custom format type for OpenType features
 */

(function(wp) {
    const { registerFormatType, toggleFormat, applyFormat, removeFormat, getActiveFormat, slice, getTextContent } = wp.richText;
    const { RichTextToolbarButton } = wp.blockEditor;
    const { Component, Fragment } = wp.element;
    const { Popover, Button, ButtonGroup, ToggleControl, TextControl, SelectControl, PanelBody, RangeControl } = wp.components;
    const { __ } = wp.i18n;
    const { compose } = wp.compose;

    // Define the format type name
    const FORMAT_TYPE = 'ots/typography-features';

    /**
     * Custom "O" icon for OpenType Stylist
     */
    const OTSIcon = () => (
        wp.element.createElement('svg', {
            width: 20,
            height: 20,
            viewBox: '0 0 20 20',
            xmlns: 'http://www.w3.org/2000/svg'
        },
            wp.element.createElement('circle', {
                cx: 10,
                cy: 10,
                r: 7,
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 2
            })
        )
    );

    /**
     * Typography Features Component
     */
    class TypographyFeaturesControl extends Component {
        constructor(props) {
            super(props);

            this.state = {
                isOpen: false,
                selectedFeatures: this.getActiveFeatures() || [],
                selectedFont: this.getActiveFont() || '',
                fontSize: this.getActiveFontSize() || 'inherit',
                fontSizeMin: this.getActiveFontSizeMin() || 16,
                fontSizePreferred: this.getActiveFontSizePreferred() || 24,
                fontSizeMax: this.getActiveFontSizeMax() || 32,
                fontWeight: this.getActiveFontWeight() || '400',
                letterSpacing: this.getActiveLetterSpacing() || 0,
                showPreview: true,
                activePreset: null,
                previewText: '',
                previewDevice: 'tablet',
                showAccessibilityWarning: false,
                warningMessage: ''
            };

            this.togglePopover = this.togglePopover.bind(this);
            this.toggleFeature = this.toggleFeature.bind(this);
            this.applyFeatures = this.applyFeatures.bind(this);
            this.applyPreset = this.applyPreset.bind(this);
            this.clearFeatures = this.clearFeatures.bind(this);
            this.setFont = this.setFont.bind(this);
            this.setFontSize = this.setFontSize.bind(this);
            this.setFontSizeMin = this.setFontSizeMin.bind(this);
            this.setFontSizePreferred = this.setFontSizePreferred.bind(this);
            this.setFontSizeMax = this.setFontSizeMax.bind(this);
            this.setFontWeight = this.setFontWeight.bind(this);
            this.setLetterSpacing = this.setLetterSpacing.bind(this);
            this.setPreviewDevice = this.setPreviewDevice.bind(this);
            this.validateSelection = this.validateSelection.bind(this);
            this.convertToBlock = this.convertToBlock.bind(this);
            this.applyFeaturesForce = this.applyFeaturesForce.bind(this);
        }

        /**
         * Get currently active features from format
         */
        getActiveFeatures() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-features']) {
                return activeFormat.attributes['data-features'].split(',');
            }

            return [];
        }

        /**
         * Get currently active font from format
         */
        getActiveFont() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-font']) {
                return activeFormat.attributes['data-font'];
            }

            return '';
        }

        /**
         * Get currently active font size mode from format
         */
        getActiveFontSize() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize']) {
                return activeFormat.attributes['data-fontsize'];
            }

            return 'inherit';
        }

        /**
         * Get currently active font size min from format
         */
        getActiveFontSizeMin() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize-min']) {
                return parseInt(activeFormat.attributes['data-fontsize-min'], 10);
            }

            return 16;
        }

        /**
         * Get currently active font size preferred from format
         */
        getActiveFontSizePreferred() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize-preferred']) {
                return parseInt(activeFormat.attributes['data-fontsize-preferred'], 10);
            }

            return 24;
        }

        /**
         * Get currently active font size max from format
         */
        getActiveFontSizeMax() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize-max']) {
                return parseInt(activeFormat.attributes['data-fontsize-max'], 10);
            }

            return 32;
        }

        /**
         * Get currently active font weight from format
         */
        getActiveFontWeight() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontweight']) {
                return activeFormat.attributes['data-fontweight'];
            }

            return '400';
        }

        /**
         * Get currently active letter spacing from format
         */
        getActiveLetterSpacing() {
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-letterspacing']) {
                return parseInt(activeFormat.attributes['data-letterspacing'], 10);
            }

            return 0;
        }

        /**
         * Toggle popover visibility
         */
        togglePopover() {
            const { value } = this.props;

            // Extract selected text when opening popover
            let extractedText = '';
            if (!this.state.isOpen && value) {
                if (value.start !== value.end) {
                    // There's a selection - extract it
                    const slicedValue = slice(value, value.start, value.end);
                    extractedText = getTextContent(slicedValue);
                } else {
                    // No selection - use entire text
                    extractedText = getTextContent(value);
                }
            }

            this.setState(state => ({
                isOpen: !state.isOpen,
                selectedFeatures: this.getActiveFeatures() || [],
                selectedFont: this.getActiveFont() || '',
                fontSize: this.getActiveFontSize() || 'inherit',
                fontSizeMin: this.getActiveFontSizeMin() || 16,
                fontSizePreferred: this.getActiveFontSizePreferred() || 24,
                fontSizeMax: this.getActiveFontSizeMax() || 32,
                fontWeight: this.getActiveFontWeight() || '400',
                letterSpacing: this.getActiveLetterSpacing() || 0,
                previewText: extractedText
            }));
        }

        /**
         * Set font family
         */
        setFont(fontFamily) {
            this.setState({
                selectedFont: fontFamily
            });
        }

        /**
         * Set font size mode
         */
        setFontSize(mode) {
            this.setState({
                fontSize: mode
            });
        }

        /**
         * Set font size min
         */
        setFontSizeMin(value) {
            this.setState({
                fontSizeMin: value
            });
        }

        /**
         * Set font size preferred
         */
        setFontSizePreferred(value) {
            this.setState({
                fontSizePreferred: value
            });
        }

        /**
         * Set font size max
         */
        setFontSizeMax(value) {
            this.setState({
                fontSizeMax: value
            });
        }

        /**
         * Set font weight
         */
        setFontWeight(value) {
            this.setState({
                fontWeight: value
            });
        }

        /**
         * Set letter spacing
         */
        setLetterSpacing(value) {
            this.setState({
                letterSpacing: value
            });
        }

        /**
         * Set preview device
         */
        setPreviewDevice(device) {
            this.setState({
                previewDevice: device
            });
        }

        /**
         * Toggle individual feature
         */
        toggleFeature(featureId) {
            this.setState(state => {
                const features = [...state.selectedFeatures];
                const index = features.indexOf(featureId);

                if (index > -1) {
                    features.splice(index, 1);
                } else {
                    features.push(featureId);
                }

                return {
                    selectedFeatures: features,
                    activePreset: null
                };
            });
        }

        /**
         * Validate selection to detect word boundary issues
         */
        validateSelection() {
            const { value } = this.props;

            if (!value || value.start === value.end) {
                return { valid: true };
            }

            // Check if we're inside an OpenType Stylist block
            const { select } = wp.data;
            const selectedBlock = select('core/block-editor').getSelectedBlock();
            if (selectedBlock && selectedBlock.name === 'opentype-stylist/block') {
                // Skip validation - OpenType Stylist block already has proper accessibility
                return { valid: true };
            }

            // Get the full text and selection
            const fullText = getTextContent(value);
            const { start, end } = value;

            // Check if selection breaks word boundaries
            const beforeChar = start > 0 ? fullText[start - 1] : ' ';
            const afterChar = end < fullText.length ? fullText[end] : ' ';
            const selectedText = fullText.substring(start, end);

            // Word boundary regex - letters/numbers are part of words
            const isWordChar = (char) => /[a-zA-Z0-9]/.test(char);

            // Check if we're breaking a word (selected text doesn't start/end at word boundaries)
            const breaksWordStart = isWordChar(beforeChar) && isWordChar(selectedText[0]);
            const breaksWordEnd = isWordChar(selectedText[selectedText.length - 1]) && isWordChar(afterChar);

            if (breaksWordStart || breaksWordEnd) {
                return {
                    valid: false,
                    message: __('For better accessibility, select complete words or phrases. Or convert to an OpenType Stylist block for accessible styling of partial words.', 'opentype-stylist')
                };
            }

            return { valid: true };
        }

        /**
         * Convert current heading to OpenType Stylist block
         */
        convertToBlock() {
            const { value } = this.props;
            const { dispatch, select } = wp.data;
            const { createBlock } = wp.blocks;

            // Get the currently selected block
            const selectedBlockClientId = select('core/block-editor').getSelectedBlockClientId();
            if (!selectedBlockClientId) {
                console.error('No block selected');
                return;
            }

            const currentBlock = select('core/block-editor').getBlock(selectedBlockClientId);
            if (!currentBlock) {
                console.error('Could not get current block');
                return;
            }

            // Extract text content
            const textContent = getTextContent(value);

            // Determine tag from block name (core/heading, core/paragraph)
            let tagName = 'h2';
            if (currentBlock.name === 'core/heading' && currentBlock.attributes.level) {
                tagName = `h${currentBlock.attributes.level}`;
            } else if (currentBlock.name === 'core/paragraph') {
                tagName = 'p';
            }

            // Create OpenType Stylist block
            const otsBlock = createBlock('opentype-stylist/block', {
                content: textContent,
                tagName: tagName,
                features: this.state.selectedFeatures,
                fontFamily: this.state.selectedFont,
                fontSize: this.state.fontSize,
                fontSizeMin: this.state.fontSizeMin,
                fontSizePreferred: this.state.fontSizePreferred,
                fontSizeMax: this.state.fontSizeMax,
                fontWeight: this.state.fontWeight,
                letterSpacing: this.state.letterSpacing
            });

            // Replace current block
            dispatch('core/block-editor').replaceBlocks(selectedBlockClientId, otsBlock);

            // Close popover
            this.setState({ isOpen: false });
        }

        /**
         * Apply selected features
         */
        applyFeatures() {
            const { value, onChange } = this.props;
            const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing } = this.state;

            // Validate selection
            const validation = this.validateSelection();
            if (!validation.valid) {
                // Show warning with options
                this.setState({
                    showAccessibilityWarning: true,
                    warningMessage: validation.message
                });
                return;
            }

            if (selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit' && fontWeight === '400' && letterSpacing === 0) {
                // Remove format if no features, font, font size, weight, or letter spacing selected
                onChange(removeFormat(value, FORMAT_TYPE));
            } else {
                // Build attributes
                const attributes = {};
                let styleString = '';

                // Add features
                if (selectedFeatures.length > 0) {
                    const cssValue = this.featuresToCSS(selectedFeatures);
                    attributes['data-features'] = selectedFeatures.join(',');
                    styleString += `font-feature-settings: ${cssValue}`;
                }

                // Add font family
                if (selectedFont) {
                    attributes['data-font'] = selectedFont;
                    if (styleString) styleString += '; ';
                    styleString += `font-family: ${selectedFont}`;
                }

                // Add font weight (always apply, default to normal)
                attributes['data-fontweight'] = fontWeight;
                if (styleString) styleString += '; ';
                styleString += `font-weight: ${fontWeight}`;

                // Add letter spacing
                if (letterSpacing !== 0) {
                    attributes['data-letterspacing'] = letterSpacing.toString();
                    if (styleString) styleString += '; ';
                    styleString += `letter-spacing: ${letterSpacing / 1000}em`;
                }

                // Add font size
                if (fontSize !== 'inherit') {
                    attributes['data-fontsize'] = fontSize;
                    attributes['data-fontsize-min'] = fontSizeMin.toString();
                    attributes['data-fontsize-preferred'] = fontSizePreferred.toString();
                    attributes['data-fontsize-max'] = fontSizeMax.toString();

                    if (styleString) styleString += '; ';
                    styleString += `font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (1920 - 320)) * 100}vw, ${fontSizeMax}px)`;
                }

                attributes['style'] = styleString;

                // Add aria-label if enabled for accessibility
                if (otsData.enableAriaLabels && value) {
                    const selectedText = value.start !== value.end
                        ? getTextContent(slice(value, value.start, value.end))
                        : getTextContent(value);
                    if (selectedText) {
                        attributes['aria-label'] = selectedText;
                    }
                }

                onChange(applyFormat(value, {
                    type: FORMAT_TYPE,
                    attributes: attributes
                }));
            }

            this.setState({ isOpen: false });
        }

        /**
         * Apply features without validation (force apply)
         */
        applyFeaturesForce() {
            const { value, onChange } = this.props;
            const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing } = this.state;

            if (selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit' && fontWeight === '400' && letterSpacing === 0) {
                onChange(removeFormat(value, FORMAT_TYPE));
            } else {
                const attributes = {};
                let styleString = '';

                if (selectedFeatures.length > 0) {
                    const cssValue = this.featuresToCSS(selectedFeatures);
                    attributes['data-features'] = selectedFeatures.join(',');
                    styleString += `font-feature-settings: ${cssValue}`;
                }

                if (selectedFont) {
                    attributes['data-font'] = selectedFont;
                    if (styleString) styleString += '; ';
                    styleString += `font-family: ${selectedFont}`;
                }

                attributes['data-fontweight'] = fontWeight;
                if (styleString) styleString += '; ';
                styleString += `font-weight: ${fontWeight}`;

                if (letterSpacing !== 0) {
                    attributes['data-letterspacing'] = letterSpacing.toString();
                    if (styleString) styleString += '; ';
                    styleString += `letter-spacing: ${letterSpacing / 1000}em`;
                }

                if (fontSize !== 'inherit') {
                    attributes['data-fontsize'] = fontSize;
                    attributes['data-fontsize-min'] = fontSizeMin.toString();
                    attributes['data-fontsize-preferred'] = fontSizePreferred.toString();
                    attributes['data-fontsize-max'] = fontSizeMax.toString();

                    if (styleString) styleString += '; ';
                    styleString += `font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (1920 - 320)) * 100}vw, ${fontSizeMax}px)`;
                }

                attributes['style'] = styleString;

                // Add aria-label if enabled for accessibility (in force apply)
                if (otsData.enableAriaLabels && value) {
                    const selectedText = value.start !== value.end
                        ? getTextContent(slice(value, value.start, value.end))
                        : getTextContent(value);
                    if (selectedText) {
                        attributes['aria-label'] = selectedText;
                    }
                }

                onChange(applyFormat(value, {
                    type: FORMAT_TYPE,
                    attributes: attributes
                }));
            }

            this.setState({ isOpen: false });
        }

        /**
         * Apply preset
         */
        applyPreset(preset) {
            this.setState({
                selectedFeatures: preset.features,
                selectedFont: preset.fontFamily || '',
                activePreset: preset.id
            });
        }

        /**
         * Clear all features
         */
        clearFeatures() {
            const { value, onChange } = this.props;
            onChange(removeFormat(value, FORMAT_TYPE));
            this.setState({
                selectedFeatures: [],
                selectedFont: '',
                fontSize: 'inherit',
                fontSizeMin: 16,
                fontSizePreferred: 24,
                fontSizeMax: 32,
                fontWeight: '400',
                letterSpacing: 0,
                activePreset: null,
                isOpen: false
            });
        }

        /**
         * Convert features array to CSS string
         */
        featuresToCSS(features) {
            return features.map(f => `"${f}" 1`).join(', ');
        }

        /**
         * Group features by category
         */
        groupFeatures() {
            const features = otsData.features || [];
            const grouped = {};

            features.forEach(feature => {
                const category = feature.category || 'other';
                if (!grouped[category]) {
                    grouped[category] = [];
                }
                grouped[category].push(feature);
            });

            return grouped;
        }

        /**
         * Get font options for select control
         */
        getFontOptions() {
            const fonts = otsData.fonts || [];
            const adobeFonts = otsData.adobeFonts || [];
            const manualFonts = otsData.manualFonts || [];
            const options = [];

            // Uploaded fonts (MyFonts, etc.)
            if (fonts.length > 0) {
                fonts.forEach(font => {
                    if (font.font_faces && font.font_faces.length > 0) {
                        // Get unique font families from this kit
                        const families = [...new Set(font.font_faces.map(face => face.family))];
                        families.forEach(family => {
                            const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
                            options.push({
                                label: `📁 ${family}`,
                                value: fontValue
                            });
                        });
                    }
                });
            }

            // Adobe Fonts
            if (adobeFonts.length > 0) {
                adobeFonts.forEach(font => {
                    if (font.font_families && font.font_families.length > 0) {
                        font.font_families.forEach(family => {
                            const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
                            options.push({
                                label: `🅰️ ${family}`,
                                value: fontValue
                            });
                        });
                    }
                });
            }

            // Manual fonts
            if (manualFonts.length > 0) {
                manualFonts.forEach(font => {
                    if (font.font_family) {
                        const fontValue = font.fallbacks ? `${font.font_family}, ${font.fallbacks}` : font.font_family;
                        options.push({
                            label: `⚙️ ${font.name}`,
                            value: fontValue
                        });
                    }
                });
            }

            return options;
        }

        /**
         * Render feature toggle
         */
        renderFeatureToggle(feature) {
            const { selectedFeatures, selectedFont, previewText } = this.state;
            const isActive = selectedFeatures.includes(feature.id);

            // Use preview text or default sample text
            const sampleText = previewText || 'ffi ffl Th AE';

            // Build preview styles - with this feature only
            const previewStyle = {
                fontFeatureSettings: `"${feature.id}" 1`
            };
            if (selectedFont) {
                previewStyle.fontFamily = selectedFont;
            }

            return (
                <div key={feature.id} className="ots-feature-toggle">
                    <ToggleControl
                        label={feature.name}
                        help={feature.description}
                        checked={isActive}
                        onChange={() => this.toggleFeature(feature.id)}
                    />
                    <code className="ots-feature-code">{feature.id}</code>
                    <div className="ots-feature-preview">
                        <span className="ots-feature-preview-on" style={previewStyle}>
                            {sampleText}
                        </span>
                    </div>
                </div>
            );
        }

        /**
         * Render preset button
         */
        renderPresetButton(preset) {
            const { activePreset } = this.state;
            const isActive = activePreset === preset.id;

            return (
                <Button
                    key={preset.id}
                    isSecondary={!isActive}
                    isPrimary={isActive}
                    onClick={() => this.applyPreset(preset)}
                    className="ots-preset-button"
                >
                    <div className="ots-preset-name">{preset.name}</div>
                    <div className="ots-preset-features-list">{preset.features.join(', ')}</div>
                </Button>
            );
        }

        render() {
            const { isActive } = this.props;
            const { isOpen, selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, showPreview, previewText, previewDevice, showAccessibilityWarning, warningMessage } = this.state;
            const groupedFeatures = this.groupFeatures();
            const presets = otsData.presets || [];
            const fontOptions = this.getFontOptions();
            const hasFonts = fontOptions.length > 0;

            // Use stored preview text or fallback
            const displayText = previewText || __('Elegant Typography & Flourish', 'opentype-stylist');

            // Build preview style
            const previewStyle = {
                fontFeatureSettings: this.featuresToCSS(selectedFeatures)
            };
            if (selectedFont) {
                previewStyle.fontFamily = selectedFont;
            }
            // Apply font weight to preview
            previewStyle.fontWeight = fontWeight;

            // Apply letter spacing to preview
            if (letterSpacing !== 0) {
                previewStyle.letterSpacing = `${letterSpacing / 1000}em`;
            }

            // Apply font size to preview based on device selection
            if (fontSize === 'responsive') {
                let previewSize = fontSizePreferred;
                if (previewDevice === 'mobile') {
                    previewSize = fontSizeMin;
                } else if (previewDevice === 'desktop') {
                    previewSize = fontSizeMax;
                }
                previewStyle.fontSize = `${previewSize}px`;
            }

            return (
                <Fragment>
                    <RichTextToolbarButton
                        icon={OTSIcon}
                        title={__('OpenType Stylist', 'opentype-stylist')}
                        onClick={this.togglePopover}
                        isActive={isActive}
                        className="ots-toolbar-button"
                    />

                    {isOpen && (
                        <Popover
                            position="bottom center"
                            onClose={this.togglePopover}
                            className="ots-popover"
                        >
                            <div className="ots-popover-content">
                                <div className="ots-popover-header">
                                    <h3>{__('OpenType Stylist', 'opentype-stylist')}</h3>
                                </div>

                                {/* Font Selector */}
                                {hasFonts && (
                                    <div className="ots-font-section">
                                        <h4>{__('Font Family', 'opentype-stylist')}</h4>
                                        <SelectControl
                                            value={selectedFont}
                                            options={[
                                                { label: __('(Default)', 'opentype-stylist'), value: '' },
                                                ...fontOptions
                                            ]}
                                            onChange={this.setFont}
                                        />
                                    </div>
                                )}

                                {/* Font Weight Control */}
                                <div className="ots-fontweight-section">
                                    <h4>{__('Font Weight', 'opentype-stylist')}</h4>
                                    <SelectControl
                                        value={fontWeight}
                                        options={[
                                            { label: __('100 - Thin', 'opentype-stylist'), value: '100' },
                                            { label: __('200 - Extra Light', 'opentype-stylist'), value: '200' },
                                            { label: __('300 - Light', 'opentype-stylist'), value: '300' },
                                            { label: __('400 - Normal', 'opentype-stylist'), value: '400' },
                                            { label: __('500 - Medium', 'opentype-stylist'), value: '500' },
                                            { label: __('600 - Semi Bold', 'opentype-stylist'), value: '600' },
                                            { label: __('700 - Bold', 'opentype-stylist'), value: '700' },
                                            { label: __('800 - Extra Bold', 'opentype-stylist'), value: '800' },
                                            { label: __('900 - Black', 'opentype-stylist'), value: '900' }
                                        ]}
                                        onChange={this.setFontWeight}
                                    />
                                </div>

                                {/* Letter Spacing Control */}
                                <div className="ots-letterspacing-section">
                                    <h4>{__('Letter Spacing', 'opentype-stylist')}</h4>
                                    <RangeControl
                                        value={letterSpacing}
                                        onChange={this.setLetterSpacing}
                                        min={-200}
                                        max={200}
                                        step={1}
                                        help={letterSpacing === 0 ? __('Normal', 'opentype-stylist') : `${letterSpacing / 1000}em`}
                                        allowReset
                                        resetFallbackValue={0}
                                    />
                                </div>

                                {/* Font Size Controls */}
                                <div className="ots-fontsize-section">
                                    <h4>{__('Font Size', 'opentype-stylist')}</h4>
                                    <SelectControl
                                        value={fontSize}
                                        options={[
                                            { label: __('Inherit', 'opentype-stylist'), value: 'inherit' },
                                            { label: __('Responsive (Fluid)', 'opentype-stylist'), value: 'responsive' }
                                        ]}
                                        onChange={this.setFontSize}
                                    />

                                    {fontSize === 'responsive' && (
                                        <div className="ots-fontsize-controls">
                                            <RangeControl
                                                label={__('Minimum Size (mobile)', 'opentype-stylist')}
                                                value={fontSizeMin}
                                                onChange={this.setFontSizeMin}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizeMin}px`}
                                            />
                                            <RangeControl
                                                label={__('Preferred Size (tablet)', 'opentype-stylist')}
                                                value={fontSizePreferred}
                                                onChange={this.setFontSizePreferred}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizePreferred}px`}
                                            />
                                            <RangeControl
                                                label={__('Maximum Size (desktop)', 'opentype-stylist')}
                                                value={fontSizeMax}
                                                onChange={this.setFontSizeMax}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizeMax}px`}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Presets Section */}
                                {presets.length > 0 && (
                                    <div className="ots-presets-section">
                                        <h4>{__('Quick Presets', 'opentype-stylist')}</h4>
                                        <div className="ots-presets-grid">
                                            {presets.map(preset => this.renderPresetButton(preset))}
                                        </div>
                                    </div>
                                )}

                                {/* Features Section */}
                                <div className="ots-features-section">
                                    <h4>{__('Individual Features', 'opentype-stylist')}</h4>

                                    {Object.entries(groupedFeatures).map(([category, features]) => (
                                        <PanelBody
                                            key={category}
                                            title={this.getCategoryTitle(category)}
                                            initialOpen={category === 'ligatures'}
                                            className="ots-feature-category"
                                        >
                                            {features.map(feature => this.renderFeatureToggle(feature))}
                                        </PanelBody>
                                    ))}
                                </div>

                                {/* Accessibility Warning */}
                                {showAccessibilityWarning && (
                                    <div className="ots-accessibility-warning">
                                        <p className="ots-warning-message">
                                            ⚠️ {warningMessage}
                                        </p>
                                        <ButtonGroup>
                                            <Button
                                                isPrimary
                                                onClick={this.convertToBlock}
                                            >
                                                {__('Convert to OpenType Stylist Block', 'opentype-stylist')}
                                            </Button>
                                            <Button
                                                isSecondary
                                                onClick={() => {
                                                    this.setState({ showAccessibilityWarning: false });
                                                    // Apply anyway - bypass validation
                                                    this.applyFeaturesForce();
                                                }}
                                            >
                                                {__('Apply Anyway', 'opentype-stylist')}
                                            </Button>
                                            <Button
                                                isTertiary
                                                onClick={() => this.setState({ showAccessibilityWarning: false })}
                                            >
                                                {__('Cancel', 'opentype-stylist')}
                                            </Button>
                                        </ButtonGroup>
                                    </div>
                                )}

                                {/* Preview Section */}
                                {showPreview && !showAccessibilityWarning && (
                                    <div className="ots-preview-section">
                                        <div className="ots-preview-header">
                                            <h4>{__('Preview', 'opentype-stylist')}</h4>
                                            {fontSize === 'responsive' && (
                                                <ButtonGroup className="ots-preview-device-toggle">
                                                    <Button
                                                        isSmall
                                                        isPrimary={previewDevice === 'mobile'}
                                                        isSecondary={previewDevice !== 'mobile'}
                                                        onClick={() => this.setPreviewDevice('mobile')}
                                                    >
                                                        {__('Mobile', 'opentype-stylist')}
                                                    </Button>
                                                    <Button
                                                        isSmall
                                                        isPrimary={previewDevice === 'tablet'}
                                                        isSecondary={previewDevice !== 'tablet'}
                                                        onClick={() => this.setPreviewDevice('tablet')}
                                                    >
                                                        {__('Tablet', 'opentype-stylist')}
                                                    </Button>
                                                    <Button
                                                        isSmall
                                                        isPrimary={previewDevice === 'desktop'}
                                                        isSecondary={previewDevice !== 'desktop'}
                                                        onClick={() => this.setPreviewDevice('desktop')}
                                                    >
                                                        {__('Desktop', 'opentype-stylist')}
                                                    </Button>
                                                </ButtonGroup>
                                            )}
                                        </div>
                                        <div
                                            className="ots-preview-text"
                                            style={previewStyle}
                                        >
                                            {displayText}
                                        </div>
                                        {selectedFeatures.length > 0 && (
                                            <div className="ots-preview-features">
                                                {__('Active: ', 'opentype-stylist')}
                                                <code>{selectedFeatures.join(', ')}</code>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="ots-popover-actions">
                                    <ButtonGroup>
                                        <Button
                                            isPrimary
                                            onClick={this.applyFeatures}
                                        >
                                            {__('Apply', 'opentype-stylist')}
                                        </Button>
                                        <Button
                                            isSecondary
                                            onClick={this.clearFeatures}
                                        >
                                            {__('Clear', 'opentype-stylist')}
                                        </Button>
                                        <Button
                                            isTertiary
                                            onClick={this.togglePopover}
                                        >
                                            {__('Cancel', 'opentype-stylist')}
                                        </Button>
                                    </ButtonGroup>
                                </div>
                            </div>
                        </Popover>
                    )}
                </Fragment>
            );
        }

        /**
         * Get category title
         */
        getCategoryTitle(category) {
            const titles = {
                'ligatures': __('Ligatures', 'opentype-stylist'),
                'stylistic-sets': __('Stylistic Sets', 'opentype-stylist'),
                'alternates': __('Swashes & Alternates', 'opentype-stylist'),
                'decorative': __('Decorative', 'opentype-stylist'),
                'other': __('Other Features', 'opentype-stylist')
            };

            return titles[category] || category;
        }
    }

    /**
     * Register the format type
     */
    registerFormatType(FORMAT_TYPE, {
        title: __('OpenType Stylist', 'opentype-stylist'),
        tagName: 'span',
        className: 'ots-styled',
        attributes: {
            'data-features': 'data-features',
            'data-font': 'data-font',
            'data-fontsize': 'data-fontsize',
            'data-fontsize-min': 'data-fontsize-min',
            'data-fontsize-preferred': 'data-fontsize-preferred',
            'data-fontsize-max': 'data-fontsize-max',
            'data-fontweight': 'data-fontweight',
            'data-letterspacing': 'data-letterspacing',
            'style': 'style',
            'aria-label': 'aria-label'
        },
        edit: compose()(function(props) {
            return (
                <TypographyFeaturesControl {...props} />
            );
        })
    });

})(window.wp);
