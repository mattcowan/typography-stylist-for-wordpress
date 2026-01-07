/**
 * Admin Page JavaScript
 * Headline Ligatures & Styles Plugin
 */

jQuery(document).ready(function($) {
    'use strict';

    // Tab switching with ARIA support
    $('.ots-tab-button').on('click', function() {
        var tab = $(this).data('tab');

        // Update ARIA states
        $('.ots-tab-button').removeClass('active').attr('aria-selected', 'false');
        $(this).addClass('active').attr('aria-selected', 'true');

        $('.ots-tab-content').removeClass('active').attr('hidden', 'true');
        var $panel = $('#ots-tab-' + tab);
        $panel.addClass('active').removeAttr('hidden');

        // Move focus to panel for screen readers
        $panel.focus();
    });

    // Add keyboard navigation (arrow keys for tabs)
    $('.ots-tab-button').on('keydown', function(e) {
        var $tabs = $('.ots-tab-button');
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

    // Kit toggle handling
    $(document).on('click', '.ots-toggle-kit', function() {
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
    $('#ots-select-file-btn').on('click', function() {
        $('#ots-font-file').click();
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
    $('#ots-font-file').on('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.endsWith('.zip')) {
            alert(otsAdmin.strings.selectZip);
            $(this).val('');
            return;
        }

        selectedFile = file;

        // Show file name and size
        $('#ots-file-name').text(file.name);
        $('#ots-file-size').text('(' + formatFileSize(file.size) + ')');
        $('#ots-selected-file').show();

        // Enable upload button
        $('#ots-upload-font-btn').prop('disabled', false);

        // Auto-fill kit name from filename if empty
        if (!$('#ots-font-name').val()) {
            var kitName = file.name.replace(/\.(zip)$/i, '');
            $('#ots-font-name').val(kitName);
        }
    });

    // Clear file selection
    $('#ots-clear-file-btn').on('click', function() {
        selectedFile = null;
        $('#ots-font-file').val('');
        $('#ots-selected-file').hide();
        $('#ots-upload-font-btn').prop('disabled', true);
    });

    // Upload font kit
    $('#ots-upload-font-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#ots-font-message');
        var $progress = $('#ots-upload-progress');
        var $progressFill = $('.ots-progress-fill');
        var $progressText = $('.ots-progress-text');
        var $progressBar = $('.ots-progress-bar');
        var fontName = $('#ots-font-name').val().trim();

        // Clear previous message
        $message.html('');

        // Validate
        if (!fontName) {
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.enterName + '</p></div>');
            $('#ots-font-name').focus().attr('aria-invalid', 'true');
            return;
        }

        if (!selectedFile) {
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.selectFile + '</p></div>');
            return;
        }

        // Clear aria-invalid on success
        $('#ots-font-name').attr('aria-invalid', 'false');

        // Prepare FormData
        var formData = new FormData();
        formData.append('zip_file', selectedFile);
        formData.append('name', fontName);

        // Disable button, show progress, and add aria-busy
        $('.ots-upload-form').attr('aria-busy', 'true');
        $btn.prop('disabled', true).text(otsAdmin.strings.uploading);
        $progress.show();
        $progressFill.css('width', '0%');
        $progressText.text(otsAdmin.strings.uploadingZip);
        $progressBar.attr('aria-valuenow', '0');

        // Upload via REST API
        $.ajax({
            url: otsAdmin.restUrl + 'fonts',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            xhr: function() {
                var xhr = new window.XMLHttpRequest();
                // Upload progress
                xhr.upload.addEventListener('progress', function(e) {
                    if (e.lengthComputable) {
                        var percentComplete = Math.round((e.loaded / e.total) * 100);
                        $progressFill.css('width', percentComplete + '%');
                        $progressBar.attr('aria-valuenow', percentComplete);
                        $progressText.text(otsAdmin.strings.uploading + ' ' + percentComplete + '%');
                    }
                }, false);
                return xhr;
            },
            success: function(response) {
                $progressText.text(otsAdmin.strings.processing);
                $progressFill.css('width', '100%');
                $progressBar.attr('aria-valuenow', '100');

                $message.html('<div class="notice notice-success inline"><p>' + otsAdmin.strings.uploadSuccess + '</p></div>');

                // Reset form
                selectedFile = null;
                $('#ots-font-name').val('');
                $('#ots-font-file').val('');
                $('#ots-selected-file').hide();

                // Refresh page after 2 seconds
                setTimeout(function() {
                    location.reload();
                }, 2000);
            },
            error: function(xhr) {
                var errorMsg = otsAdmin.strings.uploadError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
                $progress.hide();
            },
            complete: function() {
                $('.ots-upload-form').attr('aria-busy', 'false');
                $btn.prop('disabled', false).text(otsAdmin.strings.uploadButton);
            }
        });
    });

    // Font preview selector
    $('#ots-preview-font-select').on('change', function() {
        var selectedFont = $(this).val();

        // Update all feature demo previews
        $('.ots-feature-preview').each(function() {
            if (selectedFont) {
                $(this).css('font-family', selectedFont);
            } else {
                $(this).css('font-family', 'Georgia, serif');
            }
        });

        // Update all preset previews (if any exist)
        $('.ots-preset-preview').each(function() {
            if (selectedFont) {
                $(this).css('font-family', selectedFont);
            } else {
                $(this).css('font-family', 'Georgia, serif');
            }
        });

        // Update baseline preview
        if (selectedFont) {
            $('#ots-baseline-preview').css('font-family', selectedFont);
        } else {
            $('#ots-baseline-preview').css('font-family', 'Georgia, serif');
        }
    });

    // Auto-select first non-system font on page load
    var $fontSelect = $('#ots-preview-font-select');
    if ($fontSelect.length && $fontSelect.find('option').length > 1) {
        // Get first option that's not the default (empty value)
        var $firstFont = $fontSelect.find('option:not([value=""])').first();
        if ($firstFont.length) {
            $fontSelect.val($firstFont.val()).trigger('change');
        }
    }

    // Preview size slider
    $('#ots-preview-size-slider').on('input', function() {
        var size = $(this).val();
        var $slider = $(this);

        // Update the displayed value
        $('#ots-preview-size-value').text(size + 'px');

        // Update ARIA attributes
        $slider.attr('aria-valuenow', size);
        $slider.attr('aria-valuetext', size + ' pixels');

        // Update all feature demo previews
        $('.ots-feature-preview').css('font-size', size + 'px');

        // Update all preset previews (if any exist)
        $('.ots-preset-preview').css('font-size', size + 'px');

        // Update baseline preview
        $('#ots-baseline-preview').css('font-size', size + 'px');
    });

    // Custom preview text input
    $('#ots-preview-custom-text').on('input', function() {
        var customText = $(this).val();
        var $resetBtn = $('#ots-preview-reset-text');
        var $baselinePreview = $('#ots-baseline-preview');

        if (customText && customText.trim()) {
            // Show reset button
            $resetBtn.show();

            // Update all feature previews with custom text
            $('.ots-feature-preview').each(function() {
                $(this).text(customText);
            });

            // Update baseline preview with custom text
            $baselinePreview.text(customText);
        } else {
            // Hide reset button
            $resetBtn.hide();

            // Restore default demo text
            $('.ots-feature-preview').each(function() {
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
    $('#ots-preview-reset-text').on('click', function() {
        $('#ots-preview-custom-text').val('').trigger('input');
    });

    // Delete font - show replacement modal
    var deleteFontContext = null; // Store deletion context

    $('.ots-delete-font').on('click', function() {
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
    $('#ots-add-adobe-font-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#ots-adobe-font-message');
        var fontName = $('#ots-adobe-font-name').val().trim();
        var embedCode = $('#ots-adobe-embed-code').val().trim();
        var fontFamiliesInput = $('#ots-adobe-font-families').val().trim();

        // Clear previous message
        $message.html('');

        // Validate
        if (!fontName) {
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.enterAdobeProjectName + '</p></div>');
            $('#ots-adobe-font-name').focus().attr('aria-invalid', 'true');
            return;
        }

        if (!embedCode) {
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.enterAdobeEmbedCode + '</p></div>');
            $('#ots-adobe-embed-code').focus().attr('aria-invalid', 'true');
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
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.enterAdobeFontFamilies + '</p></div>');
            $('#ots-adobe-font-families').focus().attr('aria-invalid', 'true');
            return;
        }

        // Clear aria-invalid on success
        $('#ots-adobe-font-name').attr('aria-invalid', 'false');
        $('#ots-adobe-embed-code').attr('aria-invalid', 'false');
        $('#ots-adobe-font-families').attr('aria-invalid', 'false');

        // Prepare data
        var data = {
            name: fontName,
            embed_code: embedCode,
            font_families: fontFamilies
        };

        // Disable button
        $btn.prop('disabled', true).text(otsAdmin.strings.adding);

        // Add via REST API
        $.ajax({
            url: otsAdmin.restUrl + 'adobe-fonts',
            method: 'POST',
            data: JSON.stringify(data),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function(response) {
                // Handle new response format: array of fonts instead of single font
                var count = response.count || (response.fonts ? response.fonts.length : 1);
                var successMsg = count === 1
                    ? otsAdmin.strings.adobeFontSuccess
                    : otsAdmin.strings.adobeFontSuccess.replace('added', 'Added ' + count + ' fonts from');

                $message.html('<div class="notice notice-success inline"><p>' + successMsg + '</p></div>');

                // Reset form
                $('#ots-adobe-font-name').val('');
                $('#ots-adobe-embed-code').val('');
                $('#ots-adobe-font-families').val('');

                // Refresh page after 1.5 seconds
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = otsAdmin.strings.addAdobeFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(otsAdmin.strings.addAdobeFontButton);
            }
        });
    });

    // Delete Adobe Font - show replacement modal
    $('.ots-delete-adobe-font').on('click', function() {
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
    $('.ots-adobe-font-load-all-pages').on('change', function() {
        var $checkbox = $(this);
        var fontId = $checkbox.data('font-id');
        var loadOnAllPages = $checkbox.is(':checked');
        var originalState = !loadOnAllPages; // Store original state for rollback

        // Disable checkbox while saving
        $checkbox.prop('disabled', true);

        // Update via REST API
        $.ajax({
            url: otsAdmin.restUrl + 'adobe-fonts/' + fontId + '/load-on-all-pages',
            method: 'PATCH',
            data: JSON.stringify({
                load_on_all_pages: loadOnAllPages
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function(response) {
                // Visual feedback: briefly highlight the checkbox label
                var $label = $checkbox.closest('label');
                $label.addClass('ots-success-flash');
                setTimeout(function() {
                    $label.removeClass('ots-success-flash');
                }, 500);
            },
            error: function(xhr) {
                // Revert checkbox to original state
                $checkbox.prop('checked', originalState);

                var errorMsg = (otsAdmin.strings && otsAdmin.strings.updateSettingError) ? otsAdmin.strings.updateSettingError : 'Failed to update font loading setting.';
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
    $('#ots-add-manual-font-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#ots-manual-font-message');
        var fontName = $('#ots-manual-font-name').val().trim();
        var fontFamily = $('#ots-manual-font-family').val().trim();
        var fontFallbacks = $('#ots-manual-font-fallbacks').val().trim();

        // Clear previous message
        $message.html('');

        // Validate
        if (!fontName) {
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.enterManualFontName + '</p></div>');
            $('#ots-manual-font-name').focus().attr('aria-invalid', 'true');
            return;
        }

        if (!fontFamily) {
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.enterFontFamily + '</p></div>');
            $('#ots-manual-font-family').focus().attr('aria-invalid', 'true');
            return;
        }

        // Clear aria-invalid on success
        $('#ots-manual-font-name').attr('aria-invalid', 'false');
        $('#ots-manual-font-family').attr('aria-invalid', 'false');

        // Prepare data
        var data = {
            name: fontName,
            font_family: fontFamily,
            fallbacks: fontFallbacks
        };

        // Disable button
        $btn.prop('disabled', true).text(otsAdmin.strings.adding);

        // Add via REST API
        $.ajax({
            url: otsAdmin.restUrl + 'manual-fonts',
            method: 'POST',
            data: JSON.stringify(data),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function(response) {
                $message.html('<div class="notice notice-success inline"><p>' + otsAdmin.strings.manualFontSuccess + '</p></div>');

                // Reset form
                $('#ots-manual-font-name').val('');
                $('#ots-manual-font-family').val('');
                $('#ots-manual-font-fallbacks').val('');

                // Refresh page after 1.5 seconds
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = otsAdmin.strings.addManualFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(otsAdmin.strings.addManualFontButton);
            }
        });
    });

    // Delete Manual Font - show replacement modal
    $('.ots-delete-manual-font').on('click', function() {
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
    $('.ots-font-load-all-pages').on('change', function() {
        var $checkbox = $(this);
        var fontId = $checkbox.data('font-id');
        var loadOnAllPages = $checkbox.is(':checked');
        var originalState = !loadOnAllPages; // Store original state for rollback

        // Disable checkbox while saving
        $checkbox.prop('disabled', true);

        // Update via REST API
        $.ajax({
            url: otsAdmin.restUrl + 'fonts/' + fontId + '/load-on-all-pages',
            method: 'PATCH',
            data: JSON.stringify({
                load_on_all_pages: loadOnAllPages
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function(response) {
                // Visual feedback: briefly highlight the checkbox label
                var $label = $checkbox.closest('label');
                $label.addClass('ots-success-flash');
                setTimeout(function() {
                    $label.removeClass('ots-success-flash');
                }, 500);
            },
            error: function(xhr) {
                // Revert checkbox to original state
                $checkbox.prop('checked', originalState);

                var errorMsg = (otsAdmin.strings && otsAdmin.strings.updateSettingError) ? otsAdmin.strings.updateSettingError : 'Failed to update font loading setting.';
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
    $('.ots-edit-font').on('click', function() {
        var $card = $(this).closest('.ots-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Hide card content, show edit form (keep loading-option visible)
        $card.find('.ots-font-families, .ots-font-meta, .ots-font-actions').hide();
        $editForm.show();
    });

    $('.ots-cancel-font-edit').on('click', function() {
        var $card = $(this).closest('.ots-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Show card content, hide edit form
        $card.find('.ots-font-families, .ots-font-meta, .ots-font-actions').show();
        $editForm.hide();
        $editForm.find('.ots-font-edit-message').html('');
    });

    $('.ots-save-font-edit').on('click', function() {
        var $btn = $(this);
        var $card = $btn.closest('.ots-font-card');
        var $message = $card.find('.ots-font-edit-message');
        var fontId = $card.find('.ots-edit-font').data('font-id');
        var fallbacks = $card.find('.ots-font-fallback-input').val().trim();

        $message.html('');
        $btn.prop('disabled', true).text(otsAdmin.strings.saving);

        $.ajax({
            url: otsAdmin.restUrl + 'fonts/' + fontId + '/fallback',
            method: 'PATCH',
            data: JSON.stringify({ fallbacks: fallbacks }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function() {
                $message.html('<div class="notice notice-success inline"><p>' + otsAdmin.strings.fallbacksUpdated + '</p></div>');
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = otsAdmin.strings.updateFallbacksError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(otsAdmin.strings.saveChanges);
            }
        });
    });

    // Edit Adobe Fonts fallback
    $('.ots-edit-adobe-font').on('click', function() {
        // Support both .ots-adobe-font-card (legacy) and .ots-font-card (new kit structure)
        var $card = $(this).closest('.ots-adobe-font-card, .ots-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Hide card content, show edit form
        $card.find('.ots-font-families, .ots-font-loading-option, .ots-font-meta, .ots-font-actions').hide();
        $editForm.show();
    });

    $('.ots-cancel-adobe-font-edit').on('click', function() {
        // Support both .ots-adobe-font-card (legacy) and .ots-font-card (new kit structure)
        var $card = $(this).closest('.ots-adobe-font-card, .ots-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Show card content, hide edit form
        $card.find('.ots-font-families, .ots-font-loading-option, .ots-font-meta, .ots-font-actions').show();
        $editForm.hide();
        $editForm.find('.ots-adobe-font-edit-message').html('');
    });

    $('.ots-save-adobe-font-edit').on('click', function() {
        var $btn = $(this);
        // Support both .ots-adobe-font-card (legacy) and .ots-font-card (new kit structure)
        var $card = $btn.closest('.ots-adobe-font-card, .ots-font-card');
        var $message = $card.find('.ots-adobe-font-edit-message');
        var fontId = $card.find('.ots-edit-adobe-font').data('font-id');
        var fallbacks = $card.find('.ots-adobe-font-fallback-input').val().trim();

        $message.html('');
        $btn.prop('disabled', true).text(otsAdmin.strings.saving);

        $.ajax({
            url: otsAdmin.restUrl + 'adobe-fonts/' + fontId + '/fallback',
            method: 'PATCH',
            data: JSON.stringify({ fallbacks: fallbacks }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function() {
                $message.html('<div class="notice notice-success inline"><p>' + otsAdmin.strings.fallbacksUpdated + '</p></div>');
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = otsAdmin.strings.updateFallbacksError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(otsAdmin.strings.saveChanges);
            }
        });
    });

    // Edit Manual Font
    $('.ots-edit-manual-font').on('click', function() {
        var $card = $(this).closest('.ots-manual-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Hide card content, show edit form
        $card.find('.ots-font-families, .ots-font-fallbacks, .ots-font-meta, .ots-font-actions').hide();
        $editForm.show();
    });

    $('.ots-cancel-manual-font-edit').on('click', function() {
        var $card = $(this).closest('.ots-manual-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Show card content, hide edit form
        $card.find('.ots-font-families, .ots-font-fallbacks, .ots-font-meta, .ots-font-actions').show();
        $editForm.hide();
        $editForm.find('.ots-manual-font-edit-message').html('');
    });

    $('.ots-save-manual-font-edit').on('click', function() {
        var $btn = $(this);
        var $card = $btn.closest('.ots-manual-font-card');
        var $message = $card.find('.ots-manual-font-edit-message');
        var fontId = $card.find('.ots-edit-manual-font').data('font-id');
        var fontFamily = $card.find('.ots-manual-font-family-input').val().trim();
        var fallbacks = $card.find('.ots-manual-font-fallback-input').val().trim();

        $message.html('');

        // Validate
        if (!fontFamily) {
            $message.html('<div class="notice notice-error inline"><p>' + otsAdmin.strings.enterFontFamily + '</p></div>');
            $card.find('.ots-manual-font-family-input').focus().attr('aria-invalid', 'true');
            return;
        }

        $card.find('.ots-manual-font-family-input').attr('aria-invalid', 'false');
        $btn.prop('disabled', true).text(otsAdmin.strings.saving);

        $.ajax({
            url: otsAdmin.restUrl + 'manual-fonts/' + fontId,
            method: 'PATCH',
            data: JSON.stringify({
                font_family: fontFamily,
                fallbacks: fallbacks
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function() {
                $message.html('<div class="notice notice-success inline"><p>' + otsAdmin.strings.fontUpdated + '</p></div>');
                setTimeout(function() {
                    location.reload();
                }, 1500);
            },
            error: function(xhr) {
                var errorMsg = otsAdmin.strings.updateFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                $btn.prop('disabled', false).text(otsAdmin.strings.saveChanges);
            }
        });
    });

    // =========================================================================
    // FONT REPLACEMENT & DELETION MODAL
    // =========================================================================

    /**
     * Show deletion modal with replacement options
     */
    function showDeletionModal(fontId) {
        var $modal = $('#ots-delete-font-modal');
        var $select = $('#ots-replacement-font-select');

        // Build font options (exclude the font being deleted)
        $select.find('option:not(:first)').remove();

        // Add all fonts except the one being deleted
        if (otsAdmin.fonts) {
            otsAdmin.fonts.forEach(function(font) {
                if (font.font_id && font.font_id !== fontId && font.font_faces) {
                    font.font_faces.forEach(function(face) {
                        $select.append('<option value="' + font.font_id + '">📁 ' + face.family + '</option>');
                    });
                }
            });
        }

        if (otsAdmin.adobeFonts) {
            otsAdmin.adobeFonts.forEach(function(font) {
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

        if (otsAdmin.manualFonts) {
            otsAdmin.manualFonts.forEach(function(font) {
                if (font.font_id && font.font_id !== fontId && font.font_family) {
                    $select.append('<option value="' + font.font_id + '">⚙️ ' + font.name + '</option>');
                }
            });
        }

        // Reset form
        $select.val('');
        $('#ots-replacement-global-load').prop('checked', false);

        // Show modal
        $modal.fadeIn(200);
        $modal.find('.ots-modal-content').focus();
    }

    /**
     * Close deletion modal
     */
    function closeDeletionModal() {
        $('#ots-delete-font-modal').fadeOut(200);
        deleteFontContext = null;
    }

    // Modal close handlers
    $('.ots-modal-close, .ots-modal-cancel, .ots-modal-overlay').on('click', closeDeletionModal);

    // Confirm deletion with optional replacement
    $('.ots-modal-confirm-delete').on('click', function() {
        if (!deleteFontContext) return;

        var $btn = $(this);
        var replacementId = $('#ots-replacement-font-select').val();
        var globalLoad = $('#ots-replacement-global-load').is(':checked');

        $btn.prop('disabled', true).text('Deleting...');

        // First, create replacement mapping if selected
        var promises = [];

        if (replacementId) {
            var replacementPromise = $.ajax({
                url: otsAdmin.restUrl + 'font-replacements',
                method: 'POST',
                data: JSON.stringify({
                    deleted_id: deleteFontContext.fontNumericId,
                    replacement_id: parseInt(replacementId, 10),
                    global_load: globalLoad
                }),
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
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
                url: otsAdmin.restUrl + deleteFontContext.endpoint + '/' + deleteFontContext.fontId,
                method: 'DELETE',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
                },
                success: function() {
                    closeDeletionModal();

                    // Show success message
                    var $message = $('<div class="notice notice-success is-dismissible" style="margin: 20px 0;"><p>' +
                                    otsAdmin.strings.deleteFontSuccess + '</p></div>');
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
        var allFonts = (otsAdmin.fonts || []).concat(otsAdmin.adobeFonts || []).concat(otsAdmin.manualFonts || []);

        for (var i = 0; i < allFonts.length; i++) {
            if (allFonts[i].font_id === fontId) {
                return allFonts[i].name || 'Unknown Font';
            }
        }

        return 'Deleted Font';
    }

    function loadReplacementsList() {
        $.ajax({
            url: otsAdmin.restUrl + 'font-replacements',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function(data) {
                var $list = $('#ots-replacements-list');
                var mappings = data.mappings || {};
                var globalLoad = data.global_load || [];

                if (Object.keys(mappings).length === 0) {
                    $list.html('<p class="ots-no-replacements">No font replacements configured.</p>');
                    $('#ots-unassigned-fonts').hide();
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
                    html += '<td><input type="checkbox" class="ots-toggle-global-load" ' +
                           'data-deleted-id="' + deletedId + '"' +
                           (isGlobal ? ' checked' : '') + ' /></td>';
                    html += '<td>';
                    html += '<button class="button ots-edit-replacement" data-deleted-id="' + deletedId + '" data-replacement-id="' + replacementId + '">Edit</button> ';
                    html += '<button class="button ots-delete-replacement" data-deleted-id="' + deletedId + '">Remove</button>';
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
            url: otsAdmin.restUrl + 'font-replacements/orphans',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function(data) {
                if (data.orphaned_ids && data.orphaned_ids.length > 0) {
                    var html = '<p>Unassigned IDs: ' + data.orphaned_ids.join(', ') + '</p>';
                    $('#ots-unassigned-list').html(html);
                    $('#ots-unassigned-fonts').show();
                } else {
                    $('#ots-unassigned-fonts').hide();
                }
            }
        });
    }

    // Edit replacement mapping
    $(document).on('click', '.ots-edit-replacement', function() {
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
        $('#ots-replacement-font-select').val(currentReplacementId);

        // Change modal title and button text
        $('#ots-delete-font-modal .ots-modal-header h2').text('Edit Font Replacement');
        $('.ots-modal-confirm-delete').text('Update Replacement');
        $('#ots-delete-font-modal .ots-modal-description').html(
            '<p>Select a new replacement font for ID <strong>' + deletedId + '</strong>.</p>'
        );
    });

    // Delete replacement mapping
    $(document).on('click', '.ots-delete-replacement', function() {
        var deletedId = $(this).data('deleted-id');

        // Validate ID
        if (!deletedId || deletedId == 0 || deletedId === '0') {
            alert('Invalid font ID. Please refresh the page and try again.');
            return;
        }

        if (!confirm('Remove this font replacement mapping?')) return;

        $.ajax({
            url: otsAdmin.restUrl + 'font-replacements/' + deletedId,
            method: 'DELETE',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
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
    $(document).on('change', '.ots-toggle-global-load', function() {
        var deletedId = $(this).data('deleted-id');
        var globalLoad = $(this).is(':checked');

        $.ajax({
            url: otsAdmin.restUrl + 'font-replacements/' + deletedId,
            method: 'PATCH',
            data: JSON.stringify({
                global_load: globalLoad
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            error: function() {
                alert('Failed to update global load setting.');
                // Revert checkbox
                $(this).prop('checked', !globalLoad);
            }
        });
    });

    // Load replacements when tab is opened
    $('.ots-tab-button[data-tab="replacements"]').on('click', function() {
        loadReplacementsList();
        populateAddReplacementForm();
    });

    /**
     * Populate the "Add New Replacement" form dropdowns
     */
    function populateAddReplacementForm() {
        // Get all active font IDs
        var activeFontIds = [];
        var allFonts = (otsAdmin.fonts || []).concat(otsAdmin.adobeFonts || []).concat(otsAdmin.manualFonts || []);

        allFonts.forEach(function(font) {
            if (font.font_id) {
                activeFontIds.push(parseInt(font.font_id));
            }
        });

        // Get existing replacement mappings
        $.ajax({
            url: otsAdmin.restUrl + 'font-replacements',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
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
                var $deletedSelect = $('#ots-new-deleted-id');
                $deletedSelect.find('option:not(:first)').remove();
                availableIds.forEach(function(id) {
                    $deletedSelect.append('<option value="' + id + '">' + id + '</option>');
                });

                // Populate replacement font dropdown
                var $replacementSelect = $('#ots-new-replacement-id');
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
    $('#ots-add-replacement-btn').on('click', function() {
        var $btn = $(this);
        var $message = $('#ots-add-replacement-message');
        var deletedId = $('#ots-new-deleted-id').val();
        var replacementId = $('#ots-new-replacement-id').val();

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
            url: otsAdmin.restUrl + 'font-replacements',
            method: 'POST',
            data: JSON.stringify({
                deleted_id: parseInt(deletedId),
                replacement_id: parseInt(replacementId)
            }),
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function() {
                $message.html('<p class="notice notice-success">Replacement mapping added successfully!</p>');
                $('#ots-new-deleted-id').val('');
                $('#ots-new-replacement-id').val('');
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
