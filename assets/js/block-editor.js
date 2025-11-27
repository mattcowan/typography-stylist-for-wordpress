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
                showPreview: true,
                activePreset: null,
                previewText: ''
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
         * Apply selected features
         */
        applyFeatures() {
            const { value, onChange } = this.props;
            const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax } = this.state;

            if (selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit') {
                // Remove format if no features, font, or font size selected
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
                const uploadedOptions = [];
                fonts.forEach(font => {
                    if (font.font_faces && font.font_faces.length > 0) {
                        // Get unique font families from this kit
                        const families = [...new Set(font.font_faces.map(face => face.family))];
                        families.forEach(family => {
                            const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
                            uploadedOptions.push({
                                label: family,
                                value: fontValue
                            });
                        });
                    }
                });
                if (uploadedOptions.length > 0) {
                    options.push({
                        label: __('Uploaded Fonts', 'opentype-stylist'),
                        options: uploadedOptions
                    });
                }
            }

            // Adobe Fonts
            if (adobeFonts.length > 0) {
                const adobeOptions = [];
                adobeFonts.forEach(font => {
                    if (font.font_families && font.font_families.length > 0) {
                        font.font_families.forEach(family => {
                            const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
                            adobeOptions.push({
                                label: family,
                                value: fontValue
                            });
                        });
                    }
                });
                if (adobeOptions.length > 0) {
                    options.push({
                        label: __('Adobe Fonts', 'opentype-stylist'),
                        options: adobeOptions
                    });
                }
            }

            // Manual fonts
            if (manualFonts.length > 0) {
                const manualOptions = [];
                manualFonts.forEach(font => {
                    if (font.font_family) {
                        const fontValue = font.fallbacks ? `${font.font_family}, ${font.fallbacks}` : font.font_family;
                        manualOptions.push({
                            label: font.name,
                            value: fontValue
                        });
                    }
                });
                if (manualOptions.length > 0) {
                    options.push({
                        label: __('Custom Fonts', 'opentype-stylist'),
                        options: manualOptions
                    });
                }
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
            const { isOpen, selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, showPreview, previewText } = this.state;
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

            return (
                <Fragment>
                    <RichTextToolbarButton
                        icon="editor-textcolor"
                        title={__('Typography Features', 'opentype-stylist')}
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
                                    <h3>{__('Typography Features', 'opentype-stylist')}</h3>
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

                                {/* Preview Section */}
                                {showPreview && (
                                    <div className="ots-preview-section">
                                        <h4>{__('Preview', 'opentype-stylist')}</h4>
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
        title: __('Typography Features', 'opentype-stylist'),
        tagName: 'span',
        className: 'ots-styled',
        attributes: {
            'data-features': 'data-features',
            'data-font': 'data-font',
            'data-fontsize': 'data-fontsize',
            'data-fontsize-min': 'data-fontsize-min',
            'data-fontsize-preferred': 'data-fontsize-preferred',
            'data-fontsize-max': 'data-fontsize-max',
            'style': 'style'
        },
        edit: compose()(function(props) {
            return (
                <TypographyFeaturesControl {...props} />
            );
        })
    });

})(window.wp);
