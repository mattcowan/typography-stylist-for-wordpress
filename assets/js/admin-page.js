/**
 * Admin Page JavaScript
 * Headline Ligatures & Styles Plugin
 */

jQuery(document).ready(function($) {
    'use strict';

    // Tab switching with ARIA support
    $('.typost-tab-button').on('click', function() {
        var tab = $(this).data('tab');

        // Update ARIA states
        $('.typost-tab-button').removeClass('active').attr('aria-selected', 'false');
        $(this).addClass('active').attr('aria-selected', 'true');

        $('.typost-tab-content').removeClass('active').attr('hidden', 'true');
        var $panel = $('#typost-tab-' + tab);
        $panel.addClass('active').removeAttr('hidden');

        // Move focus to panel for screen readers
        $panel.focus();
    });

    // Add keyboard navigation (arrow keys for tabs)
    $('.typost-tab-button').on('keydown', function(e) {
        var $tabs = $('.typost-tab-button');
        var currentIndex = $tabs.index(this);
        var newIndex;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            newIndex = (currentIndex + 1) % $tabs.length;
            $tabs.eq(newIndex).click().focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            newIndex = (currentIndex - 1 + $tabs.length) % $tabs.length;
            $tabs.eq(newIndex).click().focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            $tabs.first().click().focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            $tabs.last().click().focus();
        }
    });

    // Handle URL parameters for deep linking to specific tabs and settings
    (function() {
        var params = new URLSearchParams(window.location.search);
        var tab = params.get('tab');
        var highlight = params.get('highlight');

        if (tab) {
            var $tabButton = $('.typost-tab-button[data-tab="' + tab + '"]');
            if ($tabButton.length) {
                $tabButton.click();
            }
        }

        if (highlight) {
            var $target = $('#' + highlight);
            if ($target.length) {
                var $row = $target.closest('tr');
                if ($row.length) {
                    $row.addClass('typost-highlight-row');
                    // Scroll to the highlighted row after a short delay for tab animation
                    setTimeout(function() {
                        $row[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                    // Remove highlight after animation completes
                    setTimeout(function() {
                        $row.removeClass('typost-highlight-row');
                    }, 3000);
                }
            }
        }
    })();

    // Kit toggle handling
    $(document).on('click', '.typost-toggle-kit', function() {
        var $button = $(this);
        var $kitFonts = $('#' + $button.attr('aria-controls'));
        var isExpanded = $button.attr('aria-expanded') === 'true';

        if (isExpanded) {
            $button.attr('aria-expanded', 'false');
            $button.find('.dashicons').removeClass('dashicons-arrow-down').addClass('dashicons-arrow-right');
            $kitFonts.attr('hidden', 'true');
        } else {
            $button.attr('aria-expanded', 'true');
            $button.find('.dashicons').removeClass('dashicons-arrow-right').addClass('dashicons-arrow-down');
            $kitFonts.removeAttr('hidden');
        }
    });

    // File selection handling
    var selectedFile = null;

    // Trigger file input when button is clicked
    $('#typost-select-file-btn').on('click', function() {
        $('#typost-font-file').click();
    });

    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        var k = 1024;
        var sizes = ['Bytes', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Handle file selection
    $('#typost-font-file').on('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.endsWith('.zip')) {
            alert(typostAdmin.strings.selectZip);
            $(this).val('');
            return;
        }

        selectedFile = file;

        // Show file name and size
        $('#typost-file-name').text(file.name);
        $('#typost-file-size').text('(' + formatFileSize(file.size) + ')');
        $('#typost-selected-file').show();

        // Enable upload button
        $('#typost-upload-font-btn').prop('disabled', false);

        // Auto-fill kit name from filename if empty
        if (!$('#typost-font-name').val()) {
            var kitName = file.name.replace(/\.(zip)$/i, '');
            $('#typost-font-name').val(kitName);
        }
    });

    // Clear file selection
    $('#typost-clear-file-btn').on('click', function() {
        selectedFile = null;
        $('#typost-font-file').val('');
        $('#typost-selected-file').hide();
        $('#typost-upload-font-btn').prop('disabled', true);
    });

    // Upload font kit
    $('#typost-upload-font-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#typost-font-message');
        var $progress = $('#typost-upload-progress');
        var $progressFill = $('.typost-progress-fill');
        var $progressText = $('.typost-progress-text');
        var $progressBar = $('.typost-progress-bar');
        var fontName = $('#typost-font-name').val().trim();

        // Clear previous message
        $message.html('');

        // Validate
        if (!fontName) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.enterName + '</p></div>');
            $('#typost-font-name').focus().attr('aria-invalid', 'true');
            return;
        }

        if (!selectedFile) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.selectFile + '</p></div>');
            return;
        }

        // Clear aria-invalid on success
        $('#typost-font-name').attr('aria-invalid', 'false');

        // Prepare FormData
        var formData = new FormData();
        formData.append('zip_file', selectedFile);
        formData.append('name', fontName);

        // Disable button, show progress, and add aria-busy
        $('.typost-upload-form').attr('aria-busy', 'true');
        $btn.prop('disabled', true).text(typostAdmin.strings.uploading);
        $progress.show();
        $progressFill.css('width', '0%');
        $progressText.text(typostAdmin.strings.uploadingZip);
        $progressBar.attr('aria-valuenow', '0');

        // Upload via REST API
        $.ajax({
            url: typostAdmin.restUrl + 'fonts',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            xhr: function() {
                var xhr = new window.XMLHttpRequest();
                // Upload progress
                xhr.upload.addEventListener('progress', function(e) {
                    if (e.lengthComputable) {
                        var percentComplete = Math.round((e.loaded / e.total) * 100);
                        $progressFill.css('width', percentComplete + '%');
                        $progressBar.attr('aria-valuenow', percentComplete);
                        $progressText.text(typostAdmin.strings.uploading + ' ' + percentComplete + '%');
                    }
                }, false);
                return xhr;
            },
            success: function(response) {
                $progressText.text(typostAdmin.strings.processing);
                $progressFill.css('width', '100%');
                $progressBar.attr('aria-valuenow', '100');

                $message.html('<div class="notice notice-success inline"><p>' + typostAdmin.strings.uploadSuccess + '</p></div>');

                // Reset form
                selectedFile = null;
                $('#typost-font-name').val('');
                $('#typost-font-file').val('');
                $('#typost-selected-file').hide();

                // Refresh page after 2 seconds
                setTimeout(function() {
                    location.reload();
                }, 2000);
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.uploadError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
                $progress.hide();
            },
            complete: function() {
                $('.typost-upload-form').attr('aria-busy', 'false');
                $btn.prop('disabled', false).text(typostAdmin.strings.uploadButton);
            }
        });
    });

    // Font preview selector
    $('#typost-preview-font-select').on('change', function() {
        var selectedFont = $(this).val();

        // Update all feature demo previews
        $('.typost-feature-preview').each(function() {
            if (selectedFont) {
                $(this).css('font-family', selectedFont);
            } else {
                $(this).css('font-family', 'Georgia, serif');
            }
        });

        // Update all preset previews (if any exist)
        $('.typost-preset-preview').each(function() {
            if (selectedFont) {
                $(this).css('font-family', selectedFont);
            } else {
                $(this).css('font-family', 'Georgia, serif');
            }
        });

        // Update baseline preview
        if (selectedFont) {
            $('#typost-baseline-preview').css('font-family', selectedFont);
        } else {
            $('#typost-baseline-preview').css('font-family', 'Georgia, serif');
        }
    });

    // Auto-select first non-system font on page load
    var $fontSelect = $('#typost-preview-font-select');
    if ($fontSelect.length && $fontSelect.find('option').length > 1) {
        // Get first option that's not the default (empty value)
        var $firstFont = $fontSelect.find('option:not([value=""])').first();
        if ($firstFont.length) {
            $fontSelect.val($firstFont.val()).trigger('change');
        }
    }

    // Preview size slider
    $('#typost-preview-size-slider').on('input', function() {
        var size = $(this).val();
        var $slider = $(this);

        // Update the displayed value
        $('#typost-preview-size-value').text(size + 'px');

        // Update ARIA attributes
        $slider.attr('aria-valuenow', size);
        $slider.attr('aria-valuetext', size + ' pixels');

        // Update all feature demo previews
        $('.typost-feature-preview').css('font-size', size + 'px');

        // Update all preset previews (if any exist)
        $('.typost-preset-preview').css('font-size', size + 'px');

        // Update baseline preview
        $('#typost-baseline-preview').css('font-size', size + 'px');
    });

    // Custom preview text input
    $('#typost-preview-custom-text').on('input', function() {
        var customText = $(this).val();
        var $resetBtn = $('#typost-preview-reset-text');
        var $baselinePreview = $('#typost-baseline-preview');

        if (customText && customText.trim()) {
            // Show reset button
            $resetBtn.show();

            // Update all feature previews with custom text
            $('.typost-feature-preview').each(function() {
                $(this).text(customText);
            });

            // Update baseline preview with custom text
            $baselinePreview.text(customText);
        } else {
            // Hide reset button
            $resetBtn.hide();

            // Restore default demo text
            $('.typost-feature-preview').each(function() {
                var defaultText = $(this).data('demo-text');
                if (defaultText) {
                    $(this).text(defaultText);
                }
            });

            // Restore baseline preview default text
            var baselineDefault = $baselinePreview.data('default-text');
            if (baselineDefault) {
                $baselinePreview.text(baselineDefault);
            }
        }
    });

    // Reset custom preview text
    $('#typost-preview-reset-text').on('click', function() {
        $('#typost-preview-custom-text').val('').trigger('input');
    });

    // Delete font - show replacement modal
    var deleteFontContext = null; // Store deletion context

    $('.typost-delete-font').on('click', function() {
        var $btn = $(this);
        var fontId = $btn.data('font-id');
        var fontNumericId = $btn.data('font-numeric-id');

        // Store context for modal
        deleteFontContext = {
            button: $btn,
            fontId: fontId,
            fontNumericId: fontNumericId || 0,
            endpoint: 'fonts',
            type: 'custom'
        };

        showDeletionModal(fontNumericId || 0);
    });

    // Add Adobe Font
    $('#typost-add-adobe-font-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#typost-adobe-font-message');
        var fontName = $('#typost-adobe-font-name').val().trim();
        var embedCode = $('#typost-adobe-embed-code').val().trim();
        var fontFamiliesInput = $('#typost-adobe-font-families').val().trim();

        // Clear previous message
        $message.html('');

        // Validate
        if (!fontName) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.enterAdobeProjectName + '</p></div>');
            $('#typost-adobe-font-name').focus().attr('aria-invalid', 'true');
            return;
        }

        if (!embedCode) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.enterAdobeEmbedCode + '</p></div>');
            $('#typost-adobe-embed-code').focus().attr('aria-invalid', 'true');
            return;
        }

        // Parse font families
        var fontFamilies = [];
        if (fontFamiliesInput) {
            fontFamilies = fontFamiliesInput.split(',').map(function(f) {
                return f.trim();
            }).filter(function(f) {
                return f.length > 0;
            });
        }

        if (fontFamilies.length === 0) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.enterAdobeFontFamilies + '</p></div>');
            $('#typost-adobe-font-families').focus().attr('aria-invalid', 'true');
            return;
        }

        // Clear aria-invalid on success
        $('#typost-adobe-font-name').attr('aria-invalid', 'false');
        $('#typost-adobe-embed-code').attr('aria-invalid', 'false');
        $('#typost-adobe-font-families').attr('aria-invalid', 'false');

        // Prepare data
        var data = {
            name: fontName,
            embed_code: embedCode,
            font_families: fontFamilies
        };

        // Disable button
        $btn.prop('disabled', true).text(typostAdmin.strings.adding);

        // Add via REST API
        $.ajax({
            url: typostAdmin.restUrl + 'adobe-fonts',
            method: 'POST',
            data: JSON.stringify(data),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(response) {
                // Handle new response format: array of fonts instead of single font
                var count = response.count || (response.fonts ? response.fonts.length : 1);
                var successMsg = count === 1
                    ? typostAdmin.strings.adobeFontSuccess
                    : typostAdmin.strings.adobeFontSuccess.replace('added', 'Added ' + count + ' fonts from');

                $message.html('<div class="notice notice-success inline"><p>' + successMsg + '</p></div>');

                // Reset form
                $('#typost-adobe-font-name').val('');
                $('#typost-adobe-embed-code').val('');
                $('#typost-adobe-font-families').val('');

                // Refresh page after 1.5 seconds
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.addAdobeFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(typostAdmin.strings.addAdobeFontButton);
            }
        });
    });

    // Delete Adobe Font - show replacement modal
    $('.typost-delete-adobe-font').on('click', function() {
        var $btn = $(this);
        var fontId = $btn.data('font-id');
        var fontNumericId = $btn.data('font-numeric-id');

        deleteFontContext = {
            button: $btn,
            fontId: fontId,
            fontNumericId: fontNumericId || 0,
            endpoint: 'adobe-fonts',
            type: 'adobe'
        };

        showDeletionModal(fontNumericId || 0);
    });

    // Handle Adobe Font "Load on all pages" checkbox
    $('.typost-adobe-font-load-all-pages').on('change', function() {
        var $checkbox = $(this);
        var fontId = $checkbox.data('font-id');
        var loadOnAllPages = $checkbox.is(':checked');
        var originalState = !loadOnAllPages; // Store original state for rollback

        // Disable checkbox while saving
        $checkbox.prop('disabled', true);

        // Update via REST API
        $.ajax({
            url: typostAdmin.restUrl + 'adobe-fonts/' + fontId + '/load-on-all-pages',
            method: 'PATCH',
            data: JSON.stringify({
                load_on_all_pages: loadOnAllPages
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(response) {
                // Visual feedback: briefly highlight the checkbox label
                var $label = $checkbox.closest('label');
                $label.addClass('typost-success-flash');
                setTimeout(function() {
                    $label.removeClass('typost-success-flash');
                }, 500);
            },
            error: function(xhr) {
                // Revert checkbox to original state
                $checkbox.prop('checked', originalState);

                var errorMsg = (typostAdmin.strings && typostAdmin.strings.updateSettingError) ? typostAdmin.strings.updateSettingError : 'Failed to update font loading setting.';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                alert(errorMsg);
            },
            complete: function() {
                // Re-enable checkbox
                $checkbox.prop('disabled', false);
            }
        });
    });

    // Add Manual Font
    $('#typost-add-manual-font-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#typost-manual-font-message');
        var fontName = $('#typost-manual-font-name').val().trim();
        var fontFamily = $('#typost-manual-font-family').val().trim();

        // Clear previous message
        $message.html('');

        // Validate
        if (!fontName) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.enterManualFontName + '</p></div>');
            $('#typost-manual-font-name').focus().attr('aria-invalid', 'true');
            return;
        }

        if (!fontFamily) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.enterFontFamily + '</p></div>');
            $('#typost-manual-font-family').focus().attr('aria-invalid', 'true');
            return;
        }

        // Clear aria-invalid on success
        $('#typost-manual-font-name').attr('aria-invalid', 'false');
        $('#typost-manual-font-family').attr('aria-invalid', 'false');

        // Prepare data
        var data = {
            name: fontName,
            font_family: fontFamily
        };

        // Disable button
        $btn.prop('disabled', true).text(typostAdmin.strings.adding);

        // Add via REST API
        $.ajax({
            url: typostAdmin.restUrl + 'manual-fonts',
            method: 'POST',
            data: JSON.stringify(data),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(response) {
                $message.html('<div class="notice notice-success inline"><p>' + typostAdmin.strings.manualFontSuccess + '</p></div>');

                // Reset form
                $('#typost-manual-font-name').val('');
                $('#typost-manual-font-family').val('');

                // Refresh page after 1.5 seconds
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.addManualFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(typostAdmin.strings.addManualFontButton);
            }
        });
    });

    // Delete Manual Font - show replacement modal
    $('.typost-delete-manual-font').on('click', function() {
        var $btn = $(this);
        var fontId = $btn.data('font-id');
        var fontNumericId = $btn.data('font-numeric-id');

        deleteFontContext = {
            button: $btn,
            fontId: fontId,
            fontNumericId: fontNumericId || 0,
            endpoint: 'manual-fonts',
            type: 'manual'
        };

        showDeletionModal(fontNumericId || 0);
    });

    // Handle MyFonts "Load on all pages" checkbox
    $('.typost-font-load-all-pages').on('change', function() {
        var $checkbox = $(this);
        var fontId = $checkbox.data('font-id');
        var loadOnAllPages = $checkbox.is(':checked');
        var originalState = !loadOnAllPages; // Store original state for rollback

        // Disable checkbox while saving
        $checkbox.prop('disabled', true);

        // Update via REST API
        $.ajax({
            url: typostAdmin.restUrl + 'fonts/' + fontId + '/load-on-all-pages',
            method: 'PATCH',
            data: JSON.stringify({
                load_on_all_pages: loadOnAllPages
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(response) {
                // Visual feedback: briefly highlight the checkbox label
                var $label = $checkbox.closest('label');
                $label.addClass('typost-success-flash');
                setTimeout(function() {
                    $label.removeClass('typost-success-flash');
                }, 500);
            },
            error: function(xhr) {
                // Revert checkbox to original state
                $checkbox.prop('checked', originalState);

                var errorMsg = (typostAdmin.strings && typostAdmin.strings.updateSettingError) ? typostAdmin.strings.updateSettingError : 'Failed to update font loading setting.';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                alert(errorMsg);
            },
            complete: function() {
                // Re-enable checkbox
                $checkbox.prop('disabled', false);
            }
        });
    });

    // Edit MyFonts (uploaded fonts) fallback
    $('.typost-edit-font').on('click', function() {
        var $card = $(this).closest('.typost-font-card');
        var $editForm = $card.find('.typost-font-edit-form');

        // Hide card content, show edit form (keep loading-option visible)
        $card.find('.typost-font-families, .typost-font-meta, .typost-font-actions').hide();
        $editForm.show();
    });

    $('.typost-cancel-font-edit').on('click', function() {
        var $card = $(this).closest('.typost-font-card');
        var $editForm = $card.find('.typost-font-edit-form');

        // Show card content, hide edit form
        $card.find('.typost-font-families, .typost-font-meta, .typost-font-actions').show();
        $editForm.hide();
        $editForm.find('.typost-font-edit-message').html('');
    });

    $('.typost-save-font-edit').on('click', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-font-card');
        var $message = $card.find('.typost-font-edit-message');
        var fontId = $card.find('.typost-edit-font').data('font-id');
        var fallbacks = $card.find('.typost-font-fallback-input').val().trim();
        var availableWeights = [];
        $card.find('.typost-font-weight-checkbox:checked').each(function() {
            availableWeights.push($(this).val());
        });

        $message.html('');
        $btn.prop('disabled', true).text(typostAdmin.strings.saving);

        $.ajax({
            url: typostAdmin.restUrl + 'fonts/' + fontId + '/fallback',
            method: 'PATCH',
            data: JSON.stringify({ fallbacks: fallbacks, available_weights: availableWeights }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function() {
                $message.html('<div class="notice notice-success inline"><p>' + typostAdmin.strings.fallbacksUpdated + '</p></div>');
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.updateFallbacksError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(typostAdmin.strings.saveChanges);
            }
        });
    });

    // Edit Adobe Fonts fallback
    $('.typost-edit-adobe-font').on('click', function() {
        // Support both .typost-adobe-font-card (legacy) and .typost-font-card (new kit structure)
        var $card = $(this).closest('.typost-adobe-font-card, .typost-font-card');
        var $editForm = $card.find('.typost-font-edit-form');

        // Hide card content, show edit form
        $card.find('.typost-font-families, .typost-font-loading-option, .typost-font-meta, .typost-font-actions').hide();
        $editForm.show();
    });

    $('.typost-cancel-adobe-font-edit').on('click', function() {
        // Support both .typost-adobe-font-card (legacy) and .typost-font-card (new kit structure)
        var $card = $(this).closest('.typost-adobe-font-card, .typost-font-card');
        var $editForm = $card.find('.typost-font-edit-form');

        // Show card content, hide edit form
        $card.find('.typost-font-families, .typost-font-loading-option, .typost-font-meta, .typost-font-actions').show();
        $editForm.hide();
        $editForm.find('.typost-adobe-font-edit-message').html('');
    });

    $('.typost-save-adobe-font-edit').on('click', function() {
        var $btn = $(this);
        // Support both .typost-adobe-font-card (legacy) and .typost-font-card (new kit structure)
        var $card = $btn.closest('.typost-adobe-font-card, .typost-font-card');
        var $message = $card.find('.typost-adobe-font-edit-message');
        var fontId = $card.find('.typost-edit-adobe-font').data('font-id');
        var fallbacks = $card.find('.typost-adobe-font-fallback-input').val().trim();
        var availableWeights = [];
        $card.find('.typost-adobe-weight-checkbox:checked').each(function() {
            availableWeights.push($(this).val());
        });

        $message.html('');
        $btn.prop('disabled', true).text(typostAdmin.strings.saving);

        $.ajax({
            url: typostAdmin.restUrl + 'adobe-fonts/' + fontId + '/fallback',
            method: 'PATCH',
            data: JSON.stringify({ fallbacks: fallbacks, available_weights: availableWeights }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function() {
                $message.html('<div class="notice notice-success inline"><p>' + typostAdmin.strings.fallbacksUpdated + '</p></div>');
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.updateFallbacksError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(typostAdmin.strings.saveChanges);
            }
        });
    });

    // Edit Manual Font
    $('.typost-edit-manual-font').on('click', function() {
        var $card = $(this).closest('.typost-manual-font-card');
        var $editForm = $card.find('.typost-font-edit-form');

        // Hide card content, show edit form
        $card.find('.typost-font-families, .typost-font-fallbacks, .typost-font-meta, .typost-font-actions').hide();
        $editForm.show();
    });

    $('.typost-cancel-manual-font-edit').on('click', function() {
        var $card = $(this).closest('.typost-manual-font-card');
        var $editForm = $card.find('.typost-font-edit-form');

        // Show card content, hide edit form
        $card.find('.typost-font-families, .typost-font-fallbacks, .typost-font-meta, .typost-font-actions').show();
        $editForm.hide();
        $editForm.find('.typost-manual-font-edit-message').html('');
    });

    $('.typost-save-manual-font-edit').on('click', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-manual-font-card');
        var $message = $card.find('.typost-manual-font-edit-message');
        var fontId = $card.find('.typost-edit-manual-font').data('font-id');
        var fontFamily = $card.find('.typost-manual-font-family-input').val().trim();
        var fallbacks = $card.find('.typost-manual-font-fallback-input').val().trim();
        var availableWeights = [];
        $card.find('.typost-manual-weight-checkbox:checked').each(function() {
            availableWeights.push($(this).val());
        });

        $message.html('');

        // Validate
        if (!fontFamily) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.enterFontFamily + '</p></div>');
            $card.find('.typost-manual-font-family-input').focus().attr('aria-invalid', 'true');
            return;
        }

        $card.find('.typost-manual-font-family-input').attr('aria-invalid', 'false');
        $btn.prop('disabled', true).text(typostAdmin.strings.saving);

        $.ajax({
            url: typostAdmin.restUrl + 'manual-fonts/' + fontId,
            method: 'PATCH',
            data: JSON.stringify({
                font_family: fontFamily,
                fallbacks: fallbacks,
                available_weights: availableWeights
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function() {
                $message.html('<div class="notice notice-success inline"><p>' + typostAdmin.strings.fontUpdated + '</p></div>');
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.updateFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(typostAdmin.strings.saveChanges);
            }
        });
    });

    // =========================================================================
    // FONT REPLACEMENT & DELETION MODAL
    // =========================================================================

    // Store previously focused element for modal focus management
    var previouslyFocusedElement = null;

    /**
     * Show deletion modal with replacement options
     */
    function showDeletionModal(fontId) {
        var $modal = $('#typost-delete-font-modal');
        var $select = $('#typost-replacement-font-select');

        // Store currently focused element
        previouslyFocusedElement = document.activeElement;

        // Build font options (exclude the font being deleted)
        $select.find('option:not(:first)').remove();

        // Add all fonts except the one being deleted
        if (typostAdmin.fonts) {
            typostAdmin.fonts.forEach(function(font) {
                if (font.font_id && font.font_id !== fontId && font.font_faces) {
                    font.font_faces.forEach(function(face) {
                        $select.append('<option value="' + font.font_id + '">📁 ' + face.family + '</option>');
                    });
                }
            });
        }

        if (typostAdmin.adobeFonts) {
            typostAdmin.adobeFonts.forEach(function(font) {
                if (font.font_id && font.font_id !== fontId) {
                    // New structure: font_family (single string)
                    if (font.font_family) {
                        $select.append('<option value="' + font.font_id + '">🅰️ ' + font.font_family + '</option>');
                    }
                    // Legacy structure: font_families (array)
                    else if (font.font_families) {
                        font.font_families.forEach(function(family) {
                            $select.append('<option value="' + font.font_id + '">🅰️ ' + family + '</option>');
                        });
                    }
                }
            });
        }

        if (typostAdmin.manualFonts) {
            typostAdmin.manualFonts.forEach(function(font) {
                if (font.font_id && font.font_id !== fontId && font.font_family) {
                    $select.append('<option value="' + font.font_id + '">⚙️ ' + font.name + '</option>');
                }
            });
        }

        // Reset form
        $select.val('');
        $('#typost-replacement-global-load').prop('checked', false);

        // Show modal
        $modal.fadeIn(200, function() {
            // Move focus to modal content
            var $modalContent = $modal.find('.typost-modal-content');
            $modalContent.attr('tabindex', '-1').focus();

            // Set up focus trap
            setupModalFocusTrap($modal);
        });
    }

    /**
     * Close deletion modal
     */
    function closeDeletionModal() {
        var $modal = $('#typost-delete-font-modal');

        // Remove focus trap event listeners
        $modal.off('keydown.focustrap');

        $modal.fadeOut(200, function() {
            // Restore focus to previously focused element
            if (previouslyFocusedElement && previouslyFocusedElement.focus) {
                previouslyFocusedElement.focus();
            }
            previouslyFocusedElement = null;
        });

        deleteFontContext = null;
    }

    /**
     * Set up focus trap for modal
     */
    function setupModalFocusTrap($modal) {
        // Remove any existing focus trap
        $modal.off('keydown.focustrap');

        // Recalculate focusable elements on each interaction to handle dynamic content
        function getFocusableElements() {
            return $modal.find('button, input, select, textarea, [tabindex]:not([tabindex="-1"])').filter(':visible');
        }

        // Handle ESC and Tab keys
        $modal.on('keydown.focustrap', function(e) {
            var focusableElements = getFocusableElements();
            var firstFocusable = focusableElements.first();
            var lastFocusable = focusableElements.last();
            // ESC key closes modal
            if (e.key === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                closeDeletionModal();
                return;
            }

            // TAB key traps focus
            if (e.key === 'Tab' || e.keyCode === 9) {
                if (e.shiftKey) {
                    // Shift+Tab: if on first element, jump to last
                    if (document.activeElement === firstFocusable[0]) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    // Tab: if on last element, jump to first
                    if (document.activeElement === lastFocusable[0]) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        });
    }

    // Modal close handlers
    $('.typost-modal-close, .typost-modal-cancel, .typost-modal-overlay').on('click', closeDeletionModal);

    // Confirm deletion with optional replacement
    $('.typost-modal-confirm-delete').on('click', function() {
        if (!deleteFontContext) return;

        var $btn = $(this);
        var replacementId = $('#typost-replacement-font-select').val();
        var globalLoad = $('#typost-replacement-global-load').is(':checked');

        $btn.prop('disabled', true).text('Deleting...');

        // First, create replacement mapping if selected
        var promises = [];

        if (replacementId) {
            var replacementPromise = $.ajax({
                url: typostAdmin.restUrl + 'font-replacements',
                method: 'POST',
                data: JSON.stringify({
                    deleted_id: deleteFontContext.fontNumericId,
                    replacement_id: parseInt(replacementId, 10),
                    global_load: globalLoad
                }),
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
                }
            });
            promises.push(replacementPromise);
        }

        // Wait for replacement to be saved, then delete font (if not editing)
        $.when.apply($, promises).done(function() {
            // If editing mode, just reload the replacements list
            if (deleteFontContext.editing) {
                closeDeletionModal();
                loadReplacementsList();
                return;
            }

            // Otherwise, proceed with font deletion
            $.ajax({
                url: typostAdmin.restUrl + deleteFontContext.endpoint + '/' + deleteFontContext.fontId,
                method: 'DELETE',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
                },
                success: function() {
                    closeDeletionModal();

                    // Show success message
                    var $message = $('<div class="notice notice-success is-dismissible" style="margin: 20px 0;"><p>' +
                                    typostAdmin.strings.deleteFontSuccess + '</p></div>');
                    $('.wrap h1').after($message);

                    // Reload page after brief delay
                    setTimeout(function() {
                        location.reload();
                    }, 1500);
                },
                error: function() {
                    alert('Failed to delete font.');
                    $btn.prop('disabled', false).text('Delete Font');
                }
            });
        }).fail(function() {
            alert('Failed to create font replacement.');
            $btn.prop('disabled', false).text('Delete Font');
        });
    });

    /**
     * Load and display replacements list
     */
    /**
     * Get font name by numeric ID
     */
    function getFontNameById(fontId) {
        fontId = parseInt(fontId);

        // Check all font sources
        var allFonts = (typostAdmin.fonts || []).concat(typostAdmin.adobeFonts || []).concat(typostAdmin.manualFonts || []);

        for (var i = 0; i < allFonts.length; i++) {
            if (allFonts[i].font_id === fontId) {
                return allFonts[i].name || 'Unknown Font';
            }
        }

        return 'Deleted Font';
    }

    function loadReplacementsList() {
        $.ajax({
            url: typostAdmin.restUrl + 'font-replacements',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(data) {
                var $list = $('#typost-replacements-list');
                var mappings = data.mappings || {};
                var globalLoad = data.global_load || [];

                if (Object.keys(mappings).length === 0) {
                    $list.html('<p class="typost-no-replacements">No font replacements configured.</p>');
                    $('#typost-unassigned-fonts').hide();
                    return;
                }

                var html = '<table class="widefat"><thead><tr>';
                html += '<th>Deleted Font</th><th>Replacement Font</th><th>Global Load</th><th>Actions</th>';
                html += '</tr></thead><tbody>';

                $.each(mappings, function(deletedId, replacementId) {
                    var isGlobal = globalLoad.indexOf(parseInt(deletedId)) !== -1;
                    var deletedName = getFontNameById(deletedId);
                    var replacementName = getFontNameById(replacementId);

                    html += '<tr data-deleted-id="' + deletedId + '" data-replacement-id="' + replacementId + '">';
                    html += '<td><strong>' + deletedName + '</strong><br><small>ID: ' + deletedId + '</small></td>';
                    html += '<td><strong>' + replacementName + '</strong><br><small>ID: ' + replacementId + '</small></td>';
                    html += '<td><input type="checkbox" class="typost-toggle-global-load" ' +
                           'data-deleted-id="' + deletedId + '"' +
                           (isGlobal ? ' checked' : '') + ' /></td>';
                    html += '<td>';
                    html += '<button class="button typost-edit-replacement" data-deleted-id="' + deletedId + '" data-replacement-id="' + replacementId + '">Edit</button> ';
                    html += '<button class="button typost-delete-replacement" data-deleted-id="' + deletedId + '">Remove</button>';
                    html += '</td>';
                    html += '</tr>';
                });

                html += '</tbody></table>';
                $list.html(html);

                // Load unassigned fonts
                loadUnassignedFonts();
            }
        });
    }

    /**
     * Load unassigned font IDs
     */
    function loadUnassignedFonts() {
        $.ajax({
            url: typostAdmin.restUrl + 'font-replacements/orphans',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(data) {
                if (data.orphaned_ids && data.orphaned_ids.length > 0) {
                    var html = '<p>Unassigned IDs: ' + data.orphaned_ids.join(', ') + '</p>';
                    $('#typost-unassigned-list').html(html);
                    $('#typost-unassigned-fonts').show();
                } else {
                    $('#typost-unassigned-fonts').hide();
                }
            }
        });
    }

    // Edit replacement mapping
    $(document).on('click', '.typost-edit-replacement', function() {
        var deletedId = $(this).data('deleted-id');
        var currentReplacementId = $(this).data('replacement-id');

        // Show the deletion modal but pre-populate with current replacement
        deleteFontContext = {
            fontNumericId: parseInt(deletedId),
            fontId: deletedId, // Not used for editing
            editing: true // Flag that we're editing, not deleting
        };

        showDeletionModal(parseInt(deletedId));

        // Pre-select the current replacement
        $('#typost-replacement-font-select').val(currentReplacementId);

        // Change modal title and button text
        $('#typost-delete-font-modal .typost-modal-header h2').text('Edit Font Replacement');
        $('.typost-modal-confirm-delete').text('Update Replacement');
        $('#typost-delete-font-modal .typost-modal-description').html(
            '<p>Select a new replacement font for ID <strong>' + deletedId + '</strong>.</p>'
        );
    });

    // Delete replacement mapping
    $(document).on('click', '.typost-delete-replacement', function() {
        var deletedId = $(this).data('deleted-id');

        // Validate ID
        if (!deletedId || deletedId == 0 || deletedId === '0') {
            alert('Invalid font ID. Please refresh the page and try again.');
            return;
        }

        if (!confirm('Remove this font replacement mapping?')) return;

        $.ajax({
            url: typostAdmin.restUrl + 'font-replacements/' + deletedId,
            method: 'DELETE',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function() {
                loadReplacementsList();
            },
            error: function() {
                alert('Failed to remove replacement.');
            }
        });
    });

    // Toggle global load for replacement
    $(document).on('change', '.typost-toggle-global-load', function() {
        var deletedId = $(this).data('deleted-id');
        var globalLoad = $(this).is(':checked');

        $.ajax({
            url: typostAdmin.restUrl + 'font-replacements/' + deletedId,
            method: 'PATCH',
            data: JSON.stringify({
                global_load: globalLoad
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            error: function() {
                alert('Failed to update global load setting.');
                // Revert checkbox
                $(this).prop('checked', !globalLoad);
            }
        });
    });

    // Load replacements when tab is opened
    $('.typost-tab-button[data-tab="replacements"]').on('click', function() {
        loadReplacementsList();
        populateAddReplacementForm();
    });

    /**
     * Populate the "Add New Replacement" form dropdowns
     */
    function populateAddReplacementForm() {
        // Get all active font IDs
        var activeFontIds = [];
        var allFonts = (typostAdmin.fonts || []).concat(typostAdmin.adobeFonts || []).concat(typostAdmin.manualFonts || []);

        allFonts.forEach(function(font) {
            if (font.font_id) {
                activeFontIds.push(parseInt(font.font_id));
            }
        });

        // Get existing replacement mappings
        $.ajax({
            url: typostAdmin.restUrl + 'font-replacements',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(data) {
                var existingMappings = data.mappings || {};
                var existingDeletedIds = Object.keys(existingMappings).map(function(id) {
                    return parseInt(id);
                });

                // Get next_id (simple integer now, sequential allocation)
                var nextId = data.next_id || 1;

                // Generate available deleted IDs (1 through next_id - 1)
                // Exclude active fonts and fonts that already have replacements
                var availableIds = [];
                for (var i = 1; i < nextId; i++) {
                    if (activeFontIds.indexOf(i) === -1 && existingDeletedIds.indexOf(i) === -1) {
                        availableIds.push(i);
                    }
                }

                // Populate deleted ID dropdown
                var $deletedSelect = $('#typost-new-deleted-id');
                $deletedSelect.find('option:not(:first)').remove();
                availableIds.forEach(function(id) {
                    $deletedSelect.append('<option value="' + id + '">' + id + '</option>');
                });

                // Populate replacement font dropdown
                var $replacementSelect = $('#typost-new-replacement-id');
                $replacementSelect.find('option:not(:first)').remove();
                allFonts.forEach(function(font) {
                    if (font.font_id) {
                        var fontName = font.name || 'Unknown Font';
                        $replacementSelect.append('<option value="' + font.font_id + '">' + fontName + ' (ID: ' + font.font_id + ')</option>');
                    }
                });
            }
        });
    }

    /**
     * Handle "Add Replacement" button click
     */
    $('#typost-add-replacement-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#typost-add-replacement-message');
        var deletedId = $('#typost-new-deleted-id').val();
        var replacementId = $('#typost-new-replacement-id').val();

        $message.html('');

        // Validation
        if (!deletedId || deletedId === '') {
            $message.html('<p class="notice notice-error">Please select a deleted font ID.</p>');
            return;
        }

        if (!replacementId || replacementId === '') {
            $message.html('<p class="notice notice-error">Please select a replacement font.</p>');
            return;
        }

        if (deletedId == 0 || deletedId === '0') {
            $message.html('<p class="notice notice-error">Invalid font ID (0). Please select a valid ID.</p>');
            return;
        }

        $btn.prop('disabled', true).text('Adding...');

        // Create the replacement mapping
        $.ajax({
            url: typostAdmin.restUrl + 'font-replacements',
            method: 'POST',
            data: JSON.stringify({
                deleted_id: parseInt(deletedId),
                replacement_id: parseInt(replacementId)
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function() {
                $message.html('<p class="notice notice-success">Replacement mapping added successfully!</p>');
                $('#typost-new-deleted-id').val('');
                $('#typost-new-replacement-id').val('');
                loadReplacementsList();
                populateAddReplacementForm();
                $btn.prop('disabled', false).text('Add Replacement');
            },
            error: function(xhr) {
                var errorMsg = 'Failed to add replacement mapping.';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<p class="notice notice-error">' + errorMsg + '</p>');
                $btn.prop('disabled', false).text('Add Replacement');
            }
        });
    });
});
