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

    // Feature preview interaction - apply features on click
    // Store history per demo card using WeakMap for memory efficiency.
    // WeakMap allows garbage collection of history when DOM elements are removed
    // (e.g., when collapsing/expanding feature categories). Unlike Map,
    // WeakMap doesn't prevent DOM elements from being garbage collected.
    var featureHistoryMap = new WeakMap();

    $(document).on('click', '.ots-feature-apply-btn', function() {
        var $btn = $(this);
        var $card = $btn.closest('.ots-feature-demo-card');
        var $undoContainer = $card.find('.ots-feature-undo-container');
        var featureId = $btn.data('feature-id');
        var featureName = $btn.data('feature-name');

        // Get or initialize history for this card
        var cardElement = $card[0];
        if (!featureHistoryMap.has(cardElement)) {
            featureHistoryMap.set(cardElement, []);
        }
        var history = featureHistoryMap.get(cardElement);

        // Save current state to history
        var currentStyle = $btn.attr('style') || '';
        history.push({
            style: currentStyle
        });

        // Parse existing font-feature-settings
        var currentSettings = $btn.css('font-feature-settings');
        var newFeature = "'" + featureId + "' 1";

        // Build new font-feature-settings
        var newSettings;
        if (!currentSettings || currentSettings === 'normal' || currentSettings === 'none') {
            newSettings = newFeature;
        } else {
            // Check if this feature is already applied
            // Escape special regex characters in featureId for safety
            var escapedFeatureId = featureId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var featureRegex = new RegExp("'" + escapedFeatureId + "'\\s+\\d+");
            if (featureRegex.test(currentSettings)) {
                // Feature already applied, just flash to indicate
                $btn.addClass('ots-feature-applied-flash');
                setTimeout(function() {
                    $btn.removeClass('ots-feature-applied-flash');
                }, 500);
                // Remove last history entry since we're not actually changing
                history.pop();
                return;
            }
            // Append new feature
            newSettings = currentSettings + ', ' + newFeature;
        }

        // Apply new settings
        $btn.css('font-feature-settings', newSettings);

        // Visual feedback - flash animation
        $btn.addClass('ots-feature-applied-flash');
        setTimeout(function() {
            $btn.removeClass('ots-feature-applied-flash');
        }, 500);

        // Show undo button
        $undoContainer.slideDown(200);

        // Announce to screen readers (translatable)
        var announcement;
        if (window.wp && window.wp.i18n && typeof window.wp.i18n.__ === 'function' && typeof window.wp.i18n.sprintf === 'function') {
            announcement = window.wp.i18n.sprintf(
                window.wp.i18n.__('%s applied', 'opentype-stylist'),
                featureName
            );
        } else {
            // Fallback for environments without wp.i18n
            announcement = featureName + ' applied';
        }
        if (window.wp && window.wp.a11y) {
            window.wp.a11y.speak(announcement);
        }
    });

    // Undo last change
    $(document).on('click', '.ots-feature-undo-btn', function() {
        var $undoBtn = $(this);
        var $card = $undoBtn.closest('.ots-feature-demo-card');
        var $btn = $card.find('.ots-feature-apply-btn');
        var cardElement = $card[0];

        // Get history for this card
        if (!featureHistoryMap.has(cardElement)) {
            return;
        }
        var history = featureHistoryMap.get(cardElement);

        // Pop last state
        var lastState = history.pop();
        if (lastState) {
            // Restore previous style
            $btn.attr('style', lastState.style);

            // Visual feedback
            $btn.addClass('ots-feature-applied-flash');
            setTimeout(function() {
                $btn.removeClass('ots-feature-applied-flash');
            }, 500);

            // Announce to screen readers
            if (window.wp && window.wp.a11y) {
                var undoMessage = (window.wp.i18n && typeof window.wp.i18n.__ === 'function')
                    ? window.wp.i18n.__('Change undone', 'opentype-stylist')
                    : 'Change undone';
                window.wp.a11y.speak(undoMessage);
            }
        }

        // Hide undo button if no more history
        if (history.length === 0) {
            $undoBtn.closest('.ots-feature-undo-container').slideUp(200);
        }
    });

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
    });

    // Delete font
    $('.ots-delete-font').on('click', function() {
        if (!confirm(otsAdmin.strings.confirmDelete)) {
            return;
        }

        var $btn = $(this);
        var fontId = $btn.data('font-id');

        $btn.prop('disabled', true);

        $.ajax({
            url: otsAdmin.restUrl + 'fonts/' + fontId,
            method: 'DELETE',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function() {
                $btn.closest('.ots-font-card').fadeOut(function() {
                    $(this).remove();
                    if ($('.ots-font-card').length === 0) {
                        $('.ots-fonts-list').replaceWith('<div class="ots-empty-state" role="status"><p><strong>' + otsAdmin.strings.noFonts + '</strong></p><p>' + otsAdmin.strings.uploadPrompt + '</p></div>');
                    }
                });
            },
            error: function() {
                alert(otsAdmin.strings.deleteError);
                $btn.prop('disabled', false);
            }
        });
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
                $message.html('<div class="notice notice-success inline"><p>' + otsAdmin.strings.adobeFontSuccess + '</p></div>');

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

    // Delete Adobe Font
    $('.ots-delete-adobe-font').on('click', function() {
        if (!confirm(otsAdmin.strings.confirmDeleteAdobeFont)) {
            return;
        }

        var $btn = $(this);
        var fontId = $btn.data('font-id');

        $btn.prop('disabled', true);

        $.ajax({
            url: otsAdmin.restUrl + 'adobe-fonts/' + fontId,
            method: 'DELETE',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function() {
                $btn.closest('.ots-adobe-font-card').fadeOut(function() {
                    $(this).remove();
                    // Check if there are any Adobe fonts left
                    if ($('.ots-adobe-font-card').length === 0) {
                        $('.ots-adobe-fonts-list').remove();
                    }
                });
            },
            error: function() {
                alert(otsAdmin.strings.deleteAdobeFontError);
                $btn.prop('disabled', false);
            }
        });
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

    // Delete Manual Font
    $('.ots-delete-manual-font').on('click', function() {
        if (!confirm(otsAdmin.strings.confirmDeleteManualFont)) {
            return;
        }

        var $btn = $(this);
        var fontId = $btn.data('font-id');

        $btn.prop('disabled', true);

        $.ajax({
            url: otsAdmin.restUrl + 'manual-fonts/' + fontId,
            method: 'DELETE',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', otsAdmin.nonce);
            },
            success: function() {
                $btn.closest('.ots-manual-font-card').fadeOut(function() {
                    $(this).remove();
                    // Check if there are any manual fonts left
                    if ($('.ots-manual-font-card').length === 0) {
                        $('.ots-manual-fonts-list').remove();
                    }
                });
            },
            error: function() {
                alert(otsAdmin.strings.deleteManualFontError);
                $btn.prop('disabled', false);
            }
        });
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
        var $card = $(this).closest('.ots-adobe-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Hide card content, show edit form
        $card.find('.ots-font-families, .ots-font-loading-option, .ots-font-meta, .ots-font-actions').hide();
        $editForm.show();
    });

    $('.ots-cancel-adobe-font-edit').on('click', function() {
        var $card = $(this).closest('.ots-adobe-font-card');
        var $editForm = $card.find('.ots-font-edit-form');

        // Show card content, hide edit form
        $card.find('.ots-font-families, .ots-font-loading-option, .ots-font-meta, .ots-font-actions').show();
        $editForm.hide();
        $editForm.find('.ots-adobe-font-edit-message').html('');
    });

    $('.ots-save-adobe-font-edit').on('click', function() {
        var $btn = $(this);
        var $card = $btn.closest('.ots-adobe-font-card');
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
});
