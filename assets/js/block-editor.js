/**
 * Block Editor Integration for Headline Ligatures & Styles
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
    const FORMAT_TYPE = 'hls/typography-features';

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
            const features = hlsData.features || [];
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
            const fonts = hlsData.fonts || [];
            const options = [];

            fonts.forEach(font => {
                if (font.font_faces && font.font_faces.length > 0) {
                    // Get unique font families from this kit
                    const families = [...new Set(font.font_faces.map(face => face.family))];
                    families.forEach(family => {
                        options.push({
                            label: family,
                            value: family
                        });
                    });
                }
            });

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
                <div key={feature.id} className="hls-feature-toggle">
                    <ToggleControl
                        label={feature.name}
                        help={feature.description}
                        checked={isActive}
                        onChange={() => this.toggleFeature(feature.id)}
                    />
                    <code className="hls-feature-code">{feature.id}</code>
                    <div className="hls-feature-preview">
                        <span className="hls-feature-preview-on" style={previewStyle}>
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
                    className="hls-preset-button"
                >
                    <div className="hls-preset-name">{preset.name}</div>
                    <div className="hls-preset-features-list">{preset.features.join(', ')}</div>
                </Button>
            );
        }

        render() {
            const { isActive } = this.props;
            const { isOpen, selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, showPreview, previewText } = this.state;
            const groupedFeatures = this.groupFeatures();
            const presets = hlsData.presets || [];
            const fonts = hlsData.fonts || [];

            // Use stored preview text or fallback
            const displayText = previewText || __('Elegant Typography & Flourish', 'headline-ligatures-styles');

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
                        title={__('Typography Features', 'headline-ligatures-styles')}
                        onClick={this.togglePopover}
                        isActive={isActive}
                        className="hls-toolbar-button"
                    />

                    {isOpen && (
                        <Popover
                            position="bottom center"
                            onClose={this.togglePopover}
                            className="hls-popover"
                        >
                            <div className="hls-popover-content">
                                <div className="hls-popover-header">
                                    <h3>{__('Typography Features', 'headline-ligatures-styles')}</h3>
                                </div>

                                {/* Font Selector */}
                                {fonts.length > 0 && (
                                    <div className="hls-font-section">
                                        <h4>{__('Font Family', 'headline-ligatures-styles')}</h4>
                                        <SelectControl
                                            value={selectedFont}
                                            options={[
                                                { label: __('(Default)', 'headline-ligatures-styles'), value: '' },
                                                ...this.getFontOptions()
                                            ]}
                                            onChange={this.setFont}
                                        />
                                    </div>
                                )}

                                {/* Font Size Controls */}
                                <div className="hls-fontsize-section">
                                    <h4>{__('Font Size', 'headline-ligatures-styles')}</h4>
                                    <SelectControl
                                        value={fontSize}
                                        options={[
                                            { label: __('Inherit', 'headline-ligatures-styles'), value: 'inherit' },
                                            { label: __('Responsive (Fluid)', 'headline-ligatures-styles'), value: 'responsive' }
                                        ]}
                                        onChange={this.setFontSize}
                                    />

                                    {fontSize === 'responsive' && (
                                        <div className="hls-fontsize-controls">
                                            <RangeControl
                                                label={__('Minimum Size (mobile)', 'headline-ligatures-styles')}
                                                value={fontSizeMin}
                                                onChange={this.setFontSizeMin}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizeMin}px`}
                                            />
                                            <RangeControl
                                                label={__('Preferred Size (tablet)', 'headline-ligatures-styles')}
                                                value={fontSizePreferred}
                                                onChange={this.setFontSizePreferred}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizePreferred}px`}
                                            />
                                            <RangeControl
                                                label={__('Maximum Size (desktop)', 'headline-ligatures-styles')}
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
                                    <div className="hls-presets-section">
                                        <h4>{__('Quick Presets', 'headline-ligatures-styles')}</h4>
                                        <div className="hls-presets-grid">
                                            {presets.map(preset => this.renderPresetButton(preset))}
                                        </div>
                                    </div>
                                )}

                                {/* Features Section */}
                                <div className="hls-features-section">
                                    <h4>{__('Individual Features', 'headline-ligatures-styles')}</h4>

                                    {Object.entries(groupedFeatures).map(([category, features]) => (
                                        <PanelBody
                                            key={category}
                                            title={this.getCategoryTitle(category)}
                                            initialOpen={category === 'ligatures'}
                                            className="hls-feature-category"
                                        >
                                            {features.map(feature => this.renderFeatureToggle(feature))}
                                        </PanelBody>
                                    ))}
                                </div>

                                {/* Preview Section */}
                                {showPreview && (
                                    <div className="hls-preview-section">
                                        <h4>{__('Preview', 'headline-ligatures-styles')}</h4>
                                        <div
                                            className="hls-preview-text"
                                            style={previewStyle}
                                        >
                                            {displayText}
                                        </div>
                                        {selectedFeatures.length > 0 && (
                                            <div className="hls-preview-features">
                                                {__('Active: ', 'headline-ligatures-styles')}
                                                <code>{selectedFeatures.join(', ')}</code>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="hls-popover-actions">
                                    <ButtonGroup>
                                        <Button
                                            isPrimary
                                            onClick={this.applyFeatures}
                                        >
                                            {__('Apply', 'headline-ligatures-styles')}
                                        </Button>
                                        <Button
                                            isSecondary
                                            onClick={this.clearFeatures}
                                        >
                                            {__('Clear', 'headline-ligatures-styles')}
                                        </Button>
                                        <Button
                                            isTertiary
                                            onClick={this.togglePopover}
                                        >
                                            {__('Cancel', 'headline-ligatures-styles')}
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
                'ligatures': __('Ligatures', 'headline-ligatures-styles'),
                'stylistic-sets': __('Stylistic Sets', 'headline-ligatures-styles'),
                'alternates': __('Swashes & Alternates', 'headline-ligatures-styles'),
                'decorative': __('Decorative', 'headline-ligatures-styles'),
                'other': __('Other Features', 'headline-ligatures-styles')
            };

            return titles[category] || category;
        }
    }

    /**
     * Register the format type
     */
    registerFormatType(FORMAT_TYPE, {
        title: __('Typography Features', 'headline-ligatures-styles'),
        tagName: 'span',
        className: 'hls-styled',
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
