/**
 * Admin Page JavaScript
 * Headline Ligatures & Styles Plugin
 */

/**
 * Build the status message for a bulk weight-detection response.
 *
 * @param {object} response REST response with updated/defaulted/failed arrays.
 * @param {string} template Localized template with %1$s (updated), %2$s (defaulted), %3$s (failed) placeholders.
 * @return {string} Formatted message.
 */
function typostFormatDetectWeightsSummary(response, template) {
    var updated = ((response && response.updated) || []).length;
    var defaulted = ((response && response.defaulted) || []).length;
    var failed = ((response && response.failed) || []).length;
    return String(template)
        .replace('%1$s', String(updated))
        .replace('%2$s', String(defaulted))
        .replace('%3$s', String(failed));
}

/**
 * Merge an admin refresh REST payload into the typostAdmin data object.
 *
 * Only the known data keys are copied; anything else in the payload (HTML
 * fragments, CSS strings) is left for the DOM-updating code.
 *
 * @param {object} adminData The typostAdmin object (mutated in place).
 * @param {object} payload   Response from GET /typost/v1/admin/refresh.
 * @return {object} The same adminData object.
 */
function typostMergeAdminRefreshData(adminData, payload) {
    if (!adminData || !payload) {
        return adminData;
    }
    ['fonts', 'adobeFonts', 'manualFonts', 'fontFeatureVisibility', 'fontOrder', 'wpFontLibraryFonts'].forEach(function(key) {
        if (typeof payload[key] !== 'undefined') {
            adminData[key] = payload[key];
        }
    });
    return adminData;
}

/**
 * Decide which value the preview font select should hold after its options
 * are refreshed: keep the current selection when still available, otherwise
 * fall back to the first available font (matching the page-load auto-select),
 * or the default when no fonts remain.
 *
 * @param {string}   currentValue    The value selected before the refresh.
 * @param {string[]} availableValues Option values after the refresh ('' = default).
 * @return {string} The value the select should hold.
 */
function typostResolvePreviewSelection(currentValue, availableValues) {
    if (currentValue && availableValues.indexOf(currentValue) !== -1) {
        return currentValue;
    }
    for (var i = 0; i < availableValues.length; i++) {
        if (availableValues[i]) {
            return availableValues[i];
        }
    }
    return '';
}

/**
 * Add a dismiss button to every `.notice.is-dismissible` in `scope` (the
 * scope element itself included) that does not have one yet.
 *
 * WordPress wires dismiss buttons once, at page load (common.js), so a
 * notice rendered later — the refreshed fonts region, the deletion notice —
 * carries the class but no button unless this runs for it.
 *
 * @param {Element|Document} scope     Container to scan.
 * @param {string}           label     Screen-reader text for the button.
 * @param {Function}         [dismiss] Called with the notice element on click;
 *                                     defaults to removing the notice outright.
 * @return {number} Number of buttons added.
 */
function typostAttachDismissButtons(scope, label, dismiss) {
    if (!scope || typeof scope.querySelectorAll !== 'function') {
        return 0;
    }
    var notices = Array.prototype.slice.call(scope.querySelectorAll('.notice.is-dismissible'));
    if (typeof scope.matches === 'function' && scope.matches('.notice.is-dismissible')) {
        notices.unshift(scope);
    }
    var added = 0;
    notices.forEach(function(notice) {
        if (notice.querySelector('.notice-dismiss')) {
            return;
        }
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'notice-dismiss';
        var text = document.createElement('span');
        text.className = 'screen-reader-text';
        text.textContent = label || 'Dismiss this notice.';
        button.appendChild(text);
        button.addEventListener('click', function(event) {
            event.preventDefault();
            if (typeof dismiss === 'function') {
                dismiss(notice);
            } else if (notice.parentNode) {
                notice.parentNode.removeChild(notice);
            }
        });
        notice.appendChild(button);
        added++;
    });
    return added;
}

/**
 * Mark a control busy for the length of a request without disabling it.
 *
 * Setting the `disabled` property on the focused button drops keyboard
 * focus to the document (the browser blurs a control the moment it becomes
 * disabled), so after every save a screen reader re-read the page title
 * before the confirmation and a keyboard user had to Tab back in from the
 * top (QA 2026-09 finding E-17). aria-disabled + a busy class keep the
 * control focusable and announced as unavailable; the guard below refuses a
 * second activation while the first request is in flight.
 *
 * @param {jQuery|Element} control  The button or checkbox.
 * @param {string}         [busyText] Label to show while busy (buttons).
 * @return {boolean} False when the control is already busy (caller returns).
 */
function typostBeginBusy(control, busyText) {
    var el = (control && control.jquery) ? control[0] : control;
    if (!el || typeof el.setAttribute !== 'function') {
        return true;
    }
    if (el.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('aria-busy', 'true');
    el.classList.add('typost-busy');
    if (typeof busyText === 'string' && el.tagName !== 'INPUT') {
        el.setAttribute('data-typost-label', el.textContent);
        el.textContent = busyText;
    }
    return true;
}

/**
 * Clear the busy state set by typostBeginBusy(); focus is untouched.
 *
 * @param {jQuery|Element} control The button or checkbox.
 * @param {string}         [text]  Label to restore (default: the one saved).
 */
function typostEndBusy(control, text) {
    var el = (control && control.jquery) ? control[0] : control;
    if (!el || typeof el.removeAttribute !== 'function') {
        return;
    }
    el.removeAttribute('aria-disabled');
    el.removeAttribute('aria-busy');
    el.classList.remove('typost-busy');
    var saved = el.getAttribute('data-typost-label');
    if (typeof text === 'string') {
        el.textContent = text;
    } else if (saved !== null) {
        el.textContent = saved;
    }
    el.removeAttribute('data-typost-label');
}

/**
 * Empty every `.typost-settings-ajax-message` container under `root` except
 * `keep`, so only one settings confirmation is on screen at a time. The
 * containers are emptied rather than removed: each stays a registered
 * role="status" live region, so its next message is still announced.
 *
 * @param {Element|Document} root   Where to look for message containers.
 * @param {Element}          [keep] The container about to receive a message.
 * @return {number} Number of containers cleared.
 */
function typostClearSettingsMessages(root, keep) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return 0;
    }
    var cleared = 0;
    Array.prototype.forEach.call(root.querySelectorAll('.typost-settings-ajax-message'), function(el) {
        if (el === keep) {
            return;
        }
        el.textContent = '';
        cleared++;
    });
    return cleared;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatDetectWeightsSummary: typostFormatDetectWeightsSummary,
        mergeAdminRefreshData: typostMergeAdminRefreshData,
        resolvePreviewSelection: typostResolvePreviewSelection,
        attachDismissButtons: typostAttachDismissButtons,
        clearSettingsMessages: typostClearSettingsMessages,
        beginBusy: typostBeginBusy,
        endBusy: typostEndBusy
    };
}

jQuery(document).ready(function($) {
    'use strict';

    // Tab switching with ARIA support
    $('.typost-admin-tabs .nav-tab').on('click', function() {
        var tab = $(this).data('tab');

        // Update ARIA states and tab order
        $('.typost-admin-tabs .nav-tab').removeClass('nav-tab-active').attr('aria-selected', 'false').attr('tabindex', '-1');
        $(this).addClass('nav-tab-active').attr('aria-selected', 'true').attr('tabindex', '0');

        $('.typost-tab-content').removeClass('active').attr('hidden', 'true');
        var $panel = $('#typost-tab-' + tab);
        $panel.addClass('active').removeAttr('hidden');

        // Move focus to panel for screen readers (without scrolling away from tabs)
        $panel[0].focus({ preventScroll: true });
    });

    // Add keyboard navigation (arrow keys for tabs)
    $('.typost-admin-tabs .nav-tab').on('keydown', function(e) {
        var $tabs = $('.typost-admin-tabs .nav-tab');
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
            var $tabButton = $('.typost-admin-tabs .nav-tab[data-tab="' + tab + '"]');
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

    /* ─────────────────────────────────────────────────────────────────────
     * AJAX refresh infrastructure
     *
     * Font changes used to end in location.reload(). Instead, the page now
     * re-fetches server-rendered fragments (GET admin/refresh) and swaps
     * them in place, announcing the update through a polite live region.
     * ──────────────────────────────────────────────────────────────────── */

    /**
     * Announce a message through the global polite live region.
     * Cleared first so repeating the same text is re-announced.
     */
    function announce(message) {
        var $region = $('#typost-live-region');
        if (!$region.length || !message) {
            return;
        }
        $region.text('');
        setTimeout(function() {
            $region.text(message);
        }, 100);
    }

    /**
     * Read a localized string from typostAdmin.strings, falling back to the
     * English literal when the key is missing (the localized-data transient
     * can lag a release by up to an hour).
     *
     * @param {string} key      Key in typostAdmin.strings.
     * @param {string} fallback English text used when the key is absent.
     * @return {string}
     */
    function adminString(key, fallback) {
        return (typostAdmin.strings && typostAdmin.strings[key]) || fallback;
    }

    /**
     * Fill the %s / %1$s / %2$s placeholders of a localized template.
     * Function replacements keep `$` in the values literal.
     *
     * @param {string} template Localized template.
     * @param {*}      value1   Value for %s / %1$s.
     * @param {*}      [value2] Value for %2$s.
     * @return {string}
     */
    function formatString(template, value1, value2) {
        return String(template)
            .replace('%1$s', function() { return String(value1); })
            .replace('%2$s', function() { return String(value2); })
            .replace('%s', function() { return String(value1); });
    }

    /**
     * Wire dismiss buttons on the is-dismissible notices inside `scope`,
     * fading a notice out on click the way WordPress core does.
     *
     * @param {Element} scope Container (or notice) to scan.
     */
    function attachDismissButtons(scope) {
        typostAttachDismissButtons(scope, adminString('dismissNotice', 'Dismiss this notice.'), function(notice) {
            var $el = $(notice);
            $el.fadeTo(100, 0, function() {
                $el.slideUp(100, function() {
                    $el.remove();
                });
            });
        });
    }

    /**
     * Ensure a <style> element with the given id exists in <head> and set
     * its content. Returns the element.
     */
    function setStyleElement(id, css) {
        var el = document.getElementById(id);
        if (!el) {
            el = document.createElement('style');
            el.id = id;
            document.head.appendChild(el);
        }
        el.textContent = css || '';
        return el;
    }

    /**
     * Apply an admin/refresh payload: swap the fonts region, repopulate the
     * preview font selector, refresh typostAdmin data, and update font CSS
     * so new fonts preview immediately.
     */
    function applyAdminRefresh(response) {
        // 1. Swap the fonts region (notices + unified font list + empty state)
        var $region = $('#typost-fonts-region');
        var focusWasInRegion = $region.length && document.activeElement &&
            $.contains($region[0], document.activeElement);
        if ($region.length && typeof response.fontListHtml === 'string') {
            $region.html(response.fontListHtml);
            initFontListSortable();
            // Re-attach dismiss buttons: WordPress only processes
            // .is-dismissible notices at page load, so re-rendered ones
            // would lose their button.
            attachDismissButtons($region[0]);
            // Keep keyboard users anchored: if focus lived inside the swapped
            // markup (or was dropped to <body>), move it to the region container.
            if (focusWasInRegion || document.activeElement === document.body) {
                // :focus-visible does not match a programmatic focus that
                // follows <body>, which is exactly this rescue; the class
                // paints the ring and leaves with the focus (review of E-12).
                $region.addClass('typost-focus-ring');
                $region.one('blur', function() { $region.removeClass('typost-focus-ring'); });
                $region.trigger('focus');
            }
        }

        // 2. Repopulate the preview font selector, preserving the selection
        var $select = $('#typost-preview-font-select');
        if ($select.length && typeof response.previewOptionsHtml === 'string') {
            var previous = $select.val();
            $select.html(response.previewOptionsHtml);
            var available = $select.find('option').map(function() {
                return $(this).val();
            }).get();
            $select.val(typostResolvePreviewSelection(previous, available));
            $('#typost-preset-font-selector').toggle(available.length > 1);
            // Re-apply preview font + feature visibility for the resolved selection
            $select.trigger('change');
        }

        // 3. Refresh the localized data used by the deletion modal and the
        //    Replacement Fonts tab
        typostMergeAdminRefreshData(typostAdmin, response);

        // 4. Refresh font CSS so newly added fonts render in previews
        if (typeof response.fontVariablesCss === 'string') {
            setStyleElement('typost-font-variables', response.fontVariablesCss);
        }
        if (typeof response.adminFontCss === 'string') {
            setStyleElement('typost-ajax-font-css', response.adminFontCss);
        }
        (response.adobeCssUrls || []).forEach(function(url) {
            var loaded = $('link[rel="stylesheet"]').filter(function() {
                return this.href === url;
            }).length;
            if (!loaded) {
                $('<link>', { rel: 'stylesheet', href: url }).appendTo('head');
            }
        });

        // 5. The Replacement Fonts tab lists fonts by name — rebuild it if
        //    the user is currently looking at it (it reloads on tab open
        //    otherwise)
        if ($('#typost-tab-replacements').hasClass('active')) {
            loadReplacementsList();
            populateAddReplacementForm();
        }
    }

    var adminRefreshInFlight = false;

    /**
     * Fetch fresh fragments/data and update the page in place.
     *
     * @param {string} [extraMessage] Prepended to the polite announcement —
     *        pass only when the triggering action has no aria-live message
     *        of its own (e.g. font deletion).
     */
    function refreshAdminFontData(extraMessage) {
        if (adminRefreshInFlight) {
            return;
        }
        adminRefreshInFlight = true;

        $.ajax({
            url: typostAdmin.restUrl + 'admin/refresh',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(response) {
                applyAdminRefresh(response);
                var text = typostAdmin.strings.fontListUpdated;
                if (extraMessage) {
                    text = extraMessage + ' ' + text;
                }
                announce(text);
            },
            error: function() {
                // The server-side change already happened but the page could
                // not re-render — fall back to a reload rather than sit stale.
                announce(typostAdmin.strings.refreshError);
                setTimeout(function() {
                    location.reload();
                }, 800);
            },
            complete: function() {
                adminRefreshInFlight = false;
            }
        });
    }

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

        // Clear previous message
        $message.html('');

        // Validate
        if (!selectedFile) {
            $message.html('<div class="notice notice-error inline"><p>' + typostAdmin.strings.selectFile + '</p></div>');
            return;
        }

        // Prepare FormData. No kit name — the server derives it from the
        // ZIP filename (font cards display parsed family names instead).
        var formData = new FormData();
        formData.append('zip_file', selectedFile);

        // Disable button, show progress, and add aria-busy
        $('.typost-upload-form').attr('aria-busy', 'true');
        if (!typostBeginBusy($btn, typostAdmin.strings.uploading)) { return; }
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

                // Surface non-fatal server warnings (e.g. the stylesheet was
                // generated from filename guesses for WOFF2-only kits).
                var warnings = response.warnings || [];
                if (warnings.length) {
                    var $warningNotice = $('<div>').addClass('notice notice-warning inline');
                    warnings.forEach(function(warning) {
                        $warningNotice.append($('<p>').text(warning));
                    });
                    $message.append($warningNotice);
                }

                // Reset form
                selectedFile = null;
                $('#typost-font-file').val('');
                $('#typost-selected-file').hide();

                // Refresh in place after extensions post-process the new entries.
                // Warnings get a longer window so they can be read first.
                refreshAfterFontsAdded({
                    type: 'uploaded',
                    fonts: response.fonts || [],
                    $message: $message
                }, warnings.length ? 8000 : 2000);
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
                typostEndBusy($btn, typostAdmin.strings.uploadButton);
            }
        });
    });

    // Tracks which font_id is currently being edited for feature visibility
    var currentVisibilityFontId = null;

    // Show/hide visibility checkboxes and update their state for the selected font
    function updateFeatureVisibilityState(fontId) {
        var $controls = $('.typost-feature-visibility-control');
        var $masterControls = $('#typost-visibility-master-controls');

        if (!fontId) {
            $controls.hide().attr('aria-hidden', 'true');
            $masterControls.hide();
            $('.typost-feature-demo-card').removeClass('typost-feature-disabled');
            currentVisibilityFontId = null;
            return;
        }

        currentVisibilityFontId = fontId;

        // Load disabled features for this font from localized data
        var visibilityMap = (typostAdmin && typostAdmin.fontFeatureVisibility) ? typostAdmin.fontFeatureVisibility : {};
        var entry = visibilityMap[fontId];
        var disabledFeatures = (entry && Array.isArray(entry.disabled_features)) ? entry.disabled_features : [];

        // Update each checkbox and card state
        $controls.each(function() {
            var $card = $(this).closest('.typost-feature-demo-card');
            var featureId = $(this).find('.typost-feature-visibility-checkbox').data('feature-id');
            var isEnabled = disabledFeatures.indexOf(featureId) === -1;
            $(this).find('.typost-feature-visibility-checkbox').prop('checked', isEnabled);
            $card.toggleClass('typost-feature-disabled', !isEnabled);
        });

        // Show controls
        $controls.show().attr('aria-hidden', 'false');
        $masterControls.show();
    }

    // Debounce timer for feature grid visibility saves
    var featureVisibilitySaveTimer = null;

    function scheduleFeatureVisibilitySave() {
        if (featureVisibilitySaveTimer) {
            clearTimeout(featureVisibilitySaveTimer);
        }
        featureVisibilitySaveTimer = setTimeout(saveFeatureVisibility, 400);
    }

    // Save visibility for the current font via REST API
    function saveFeatureVisibility() {
        if (!currentVisibilityFontId) {
            return;
        }

        var disabledFeatures = [];
        $('.typost-feature-visibility-checkbox').each(function() {
            if (!$(this).prop('checked')) {
                disabledFeatures.push($(this).data('feature-id'));
            }
        });

        var fontId = currentVisibilityFontId;
        $.ajax({
            url: typostAdmin.restUrl + 'font-feature-visibility/' + fontId,
            method: 'POST',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            contentType: 'application/json',
            data: JSON.stringify({ disabled_features: disabledFeatures }),
            success: function(response) {
                // Update local cache so re-selecting the font reflects new state
                if (!typostAdmin.fontFeatureVisibility) {
                    typostAdmin.fontFeatureVisibility = {};
                }
                typostAdmin.fontFeatureVisibility[fontId] = { disabled_features: disabledFeatures };

                // Flash "Saved" indicator
                var $indicator = $('#typost-visibility-save-indicator');
                $indicator.text(typostAdmin.strings.featureVisibilitySaved || 'Saved').addClass('typost-save-visible');
                setTimeout(function() {
                    $indicator.removeClass('typost-save-visible');
                }, 2000);
            },
            error: function() {
                var $indicator = $('#typost-visibility-save-indicator');
                $indicator.text(typostAdmin.strings.featureVisibilityError || 'Error saving').addClass('typost-save-visible');
                setTimeout(function() {
                    $indicator.removeClass('typost-save-visible');
                }, 3000);
            }
        });
    }

    // Font preview selector
    $('#typost-preview-font-select').on('change', function() {
        var selectedFont = $(this).val();
        var selectedFontId = $(this).find('option:selected').data('font-id') || null;

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

        // Update feature visibility checkboxes for this font
        updateFeatureVisibilityState(selectedFont ? selectedFontId : null);
    });

    // Visibility checkbox — auto-save on change (debounced to avoid rate limit)
    $(document).on('change', '.typost-feature-visibility-checkbox', function() {
        var $card = $(this).closest('.typost-feature-demo-card');
        $card.toggleClass('typost-feature-disabled', !$(this).prop('checked'));
        scheduleFeatureVisibilitySave();
    });

    // Enable All features for current font
    $('#typost-enable-all-features').on('click', function() {
        $('.typost-feature-visibility-checkbox').prop('checked', true);
        $('.typost-feature-demo-card').removeClass('typost-feature-disabled');
        scheduleFeatureVisibilitySave();
    });

    // Disable All features for current font
    $('#typost-disable-all-features').on('click', function() {
        $('.typost-feature-visibility-checkbox').prop('checked', false);
        $('.typost-feature-demo-card').addClass('typost-feature-disabled');
        scheduleFeatureVisibilitySave();
    });

    // Debounce timers for font edit form visibility saves, keyed by font numeric ID
    var formVisibilitySaveTimers = {};

    function scheduleFormFeatureVisibilitySave($section) {
        var fontNumericId = $section.data('font-numeric-id');
        if (!fontNumericId) {
            return;
        }
        if (formVisibilitySaveTimers[fontNumericId]) {
            clearTimeout(formVisibilitySaveTimers[fontNumericId]);
        }
        formVisibilitySaveTimers[fontNumericId] = setTimeout(function() {
            saveFormFeatureVisibility($section);
        }, 400);
    }

    // Helper: save visibility from a font edit form section
    function saveFormFeatureVisibility($section) {
        var fontNumericId = $section.data('font-numeric-id');
        if (!fontNumericId) {
            return;
        }

        // Clean up the timer reference now that it has fired
        delete formVisibilitySaveTimers[fontNumericId];

        var disabledFeatures = [];
        $section.find('.typost-font-form-visibility-checkbox').each(function() {
            if (!$(this).prop('checked')) {
                disabledFeatures.push($(this).data('feature-id'));
            }
        });

        $.ajax({
            url: typostAdmin.restUrl + 'font-feature-visibility/' + fontNumericId,
            method: 'POST',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            contentType: 'application/json',
            data: JSON.stringify({ disabled_features: disabledFeatures }),
            success: function() {
                // Update local cache
                if (!typostAdmin.fontFeatureVisibility) {
                    typostAdmin.fontFeatureVisibility = {};
                }
                typostAdmin.fontFeatureVisibility[fontNumericId] = { disabled_features: disabledFeatures };

                var $indicator = $section.find('.typost-form-visibility-save-indicator');
                $indicator.text(typostAdmin.strings.featureVisibilitySaved || 'Saved').addClass('typost-save-visible');
                setTimeout(function() { $indicator.removeClass('typost-save-visible'); }, 2000);
            },
            error: function() {
                var $indicator = $section.find('.typost-form-visibility-save-indicator');
                $indicator.text(typostAdmin.strings.featureVisibilityError || 'Error saving').addClass('typost-save-visible');
                setTimeout(function() { $indicator.removeClass('typost-save-visible'); }, 3000);
            }
        });
    }

    // Font edit form: visibility checkbox change → auto-save (debounced)
    $(document).on('change', '.typost-font-form-visibility-checkbox', function() {
        var $section = $(this).closest('.typost-feature-visibility-section');
        scheduleFormFeatureVisibilitySave($section);
    });

    // Font edit form: Enable All
    $(document).on('click', '.typost-form-enable-all', function() {
        var $section = $(this).closest('.typost-feature-visibility-section');
        $section.find('.typost-font-form-visibility-checkbox').prop('checked', true);
        scheduleFormFeatureVisibilitySave($section);
    });

    // Font edit form: Disable All
    $(document).on('click', '.typost-form-disable-all', function() {
        var $section = $(this).closest('.typost-feature-visibility-section');
        $section.find('.typost-font-form-visibility-checkbox').prop('checked', false);
        scheduleFormFeatureVisibilitySave($section);
    });

    // ── Unified font list: drag-to-reorder ──────────────────────────────────
    // Wrapped in a function so it can be re-initialized after the font list
    // is swapped in place by an AJAX refresh.
    function initFontListSortable() {
        var $unifiedList = $('#typost-unified-font-list');
        if (!$unifiedList.length || !$.fn.sortable) {
            return;
        }
        $unifiedList.sortable({
            handle: '.typost-drag-handle',
            axis: 'y',
            cursor: 'grabbing',
            placeholder: 'typost-unified-font-item ui-sortable-placeholder',
            update: function() {
                var order = [];
                $unifiedList.find('.typost-unified-font-item').each(function() {
                    var key = $(this).data('font-key');
                    if (key) {
                        order.push(key);
                    }
                });
                $.ajax({
                    url: typostAdmin.restUrl + 'font-order',
                    method: 'POST',
                    beforeSend: function(xhr) {
                        xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
                    },
                    contentType: 'application/json',
                    data: JSON.stringify({ order: order }),
                    error: function() {
                        if (typostAdmin.strings && typostAdmin.strings.orderSaveError) {
                            window.alert(typostAdmin.strings.orderSaveError);
                        }
                    }
                });
            }
        });
    }
    initFontListSortable();
    // ────────────────────────────────────────────────────────────────────────

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

    // Card width slider — restore saved preference on page load
    (function() {
        var saved;
        try {
            saved = localStorage.getItem('typost_card_width');
        } catch (e) {
            // localStorage unavailable (private browsing, blocked storage) — use default
        }
        if (saved) {
            var $slider = $('#typost-card-width-slider');
            $slider.val(saved).attr('aria-valuenow', saved).attr('aria-valuetext', saved + ' pixels');
            $('#typost-card-width-value').text(saved + 'px');
            $('.typost-feature-demos-grid').css(
                'grid-template-columns',
                'repeat(auto-fill, minmax(' + saved + 'px, 1fr))'
            );
        }
    }());

    // Card width slider — update grid and save preference
    $('#typost-card-width-slider').on('input', function() {
        var width = $(this).val();
        var $slider = $(this);

        // Update the displayed value
        $('#typost-card-width-value').text(width + 'px');

        // Update ARIA attributes
        $slider.attr('aria-valuenow', width);
        $slider.attr('aria-valuetext', width + ' pixels');

        // Update grid template columns on all feature demo grids
        $('.typost-feature-demos-grid').css(
            'grid-template-columns',
            'repeat(auto-fill, minmax(' + width + 'px, 1fr))'
        );

        // Persist preference in localStorage
        try {
            localStorage.setItem('typost_card_width', width);
        } catch (e) {
            // localStorage unavailable (private browsing, storage quota) — silent fail
        }
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

    $(document).on('click', '.typost-delete-font', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-font-card');
        var fontId = $card.data('font-id');
        var fontNumericId = $card.data('font-numeric-id');

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
        var embedCode = $('#typost-adobe-embed-code').val().trim();
        var fontFamiliesInput = $('#typost-adobe-font-families').val().trim();

        // Clear previous message
        $message.html('');

        // Validate
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
        $('#typost-adobe-embed-code').attr('aria-invalid', 'false');
        $('#typost-adobe-font-families').attr('aria-invalid', 'false');

        // Prepare data (no name field — the endpoint derives a kit name;
        // per-family entries are named by their family)
        var data = {
            embed_code: embedCode,
            font_families: fontFamilies
        };

        // Disable button
        if (!typostBeginBusy($btn, typostAdmin.strings.adding)) { return; }

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

                // Refresh in place after extensions post-process the new entries
                refreshAfterFontsAdded({
                    type: 'adobe',
                    fonts: response.fonts || [],
                    $message: $message
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
                typostEndBusy($btn, typostAdmin.strings.addAdobeFontButton);
            }
        });
    });

    // Delete Adobe Font - show replacement modal
    $(document).on('click', '.typost-delete-adobe-font', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-font-card');
        var fontId = $card.data('font-id');
        var fontNumericId = $card.data('font-numeric-id');

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
    $(document).on('change', '.typost-adobe-font-load-all-pages', function() {
        var $checkbox = $(this);
        var fontId = $checkbox.data('font-id');
        var loadOnAllPages = $checkbox.is(':checked');
        var originalState = !loadOnAllPages; // Store original state for rollback

        // Disable checkbox while saving
        if (!typostBeginBusy($checkbox)) { return; }

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
                typostEndBusy($checkbox);
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
        if (!typostBeginBusy($btn, typostAdmin.strings.adding)) { return; }

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

                // Refresh the font list in place after a short delay so the
                // success notice is read first
                setTimeout(function() {
                    refreshAdminFontData();
                }, 1200);
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.addManualFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                typostEndBusy($btn, typostAdmin.strings.addManualFontButton);
            }
        });
    });

    // Delete Manual Font - show replacement modal
    $(document).on('click', '.typost-delete-manual-font', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-font-card');
        var fontId = $card.data('font-id');
        var fontNumericId = $card.data('font-numeric-id');

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
    $(document).on('change', '.typost-font-load-all-pages', function() {
        var $checkbox = $(this);
        var fontId = $checkbox.data('font-id');
        var loadOnAllPages = $checkbox.is(':checked');
        var originalState = !loadOnAllPages; // Store original state for rollback

        // Disable checkbox while saving
        if (!typostBeginBusy($checkbox)) { return; }

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
                typostEndBusy($checkbox);
            }
        });
    });

    // ── Unified font card expand/collapse ────────────────────────────────────
    $(document).on('click', '.typost-font-expand-toggle', function() {
        var $toggle = $(this);
        var $card = $toggle.closest('.typost-font-card');
        var $details = $card.find('.typost-font-details');
        var expanded = $toggle.attr('aria-expanded') === 'true';

        $toggle.attr('aria-expanded', expanded ? 'false' : 'true');

        if (expanded) {
            $details.slideUp(150, function() { $details.attr('hidden', ''); });
        } else {
            $details.removeAttr('hidden').hide().slideDown(150);
        }
    });

    // Shared collapse helper
    function collapseCard($card) {
        var $toggle = $card.find('.typost-font-expand-toggle');
        var $details = $card.find('.typost-font-details');
        $toggle.attr('aria-expanded', 'false');
        $details.slideUp(150, function() { $details.attr('hidden', ''); });
        $card.find('.typost-font-edit-message, .typost-adobe-font-edit-message, .typost-manual-font-edit-message').html('');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Cancel handlers (all types — collapse the card)
    $(document).on('click', '.typost-cancel-font-edit, .typost-cancel-adobe-font-edit, .typost-cancel-manual-font-edit', function() {
        collapseCard($(this).closest('.typost-font-card'));
    });

    // Save uploaded font
    $(document).on('click', '.typost-save-font-edit', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-font-card');
        var $message = $card.find('.typost-font-edit-message');
        var fontId = $card.data('font-id');
        var fallbacks = $card.find('.typost-font-fallback-input').val().trim();
        var availableWeights = [];
        $card.find('.typost-font-weight-checkbox:checked').each(function() {
            availableWeights.push($(this).val());
        });

        $message.html('');
        if (!typostBeginBusy($btn, typostAdmin.strings.saving)) { return; }

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
                refreshAfterFontSaved({ fontId: fontId, type: 'uploaded', $card: $card });
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.updateFallbacksError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                typostEndBusy($btn, typostAdmin.strings.saveChanges);
            }
        });
    });

    /**
     * Fire typost:font-saved with a waitUntil(promise) collector, then
     * refresh the font list in place once every listener-registered promise
     * settles (extensions save their own per-font data via REST on this
     * event). The refresh waits at least 1200 ms so the success message
     * stays readable, and at most 5 s so a hung request can't block.
     */
    function refreshAfterFontSaved(payload) {
        var pending = [];
        payload.waitUntil = function(promise) {
            if (promise && typeof promise.then === 'function') {
                pending.push(promise);
            }
        };
        $(document).trigger('typost:font-saved', payload);

        var swallow = function(p) { return Promise.resolve(p).catch(function() {}); };
        var settled = Promise.all(pending.map(swallow));
        var cap = new Promise(function(resolve) { setTimeout(resolve, 5000); });
        var minDelay = new Promise(function(resolve) { setTimeout(resolve, 1200); });

        Promise.all([minDelay, Promise.race([settled, cap])]).then(function() {
            refreshAdminFontData();
        });
    }

    /**
     * Fire typost:fonts-added with a waitUntil(promise) collector, then
     * refresh the font list in place once every listener-registered promise
     * settles. Same contract as typost:font-saved, but for the add/upload
     * flows where extensions post-process brand-new entries (e.g. variable
     * font axis auto-detection, which downloads and parses font binaries —
     * hence the longer 15 s cap).
     *
     * @param {Object} payload   {type: 'uploaded'|'adobe', fonts: Array, $message: jQuery}
     * @param {number} minDelayMs Minimum delay so the success notice stays readable.
     */
    function refreshAfterFontsAdded(payload, minDelayMs) {
        var pending = [];
        payload.waitUntil = function(promise) {
            if (promise && typeof promise.then === 'function') {
                pending.push(promise);
            }
        };
        $(document).trigger('typost:fonts-added', payload);

        var swallow = function(p) { return Promise.resolve(p).catch(function() {}); };
        var settled = Promise.all(pending.map(swallow));
        var cap = new Promise(function(resolve) { setTimeout(resolve, 15000); });
        var minDelay = new Promise(function(resolve) { setTimeout(resolve, minDelayMs); });

        Promise.all([minDelay, Promise.race([settled, cap])]).then(function() {
            refreshAdminFontData();
        });
    }

    // Save Adobe font
    $(document).on('click', '.typost-save-adobe-font-edit', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-font-card');
        var $message = $card.find('.typost-adobe-font-edit-message');
        var fontId = $card.data('font-id');
        var fallbacks = $card.find('.typost-adobe-font-fallback-input').val().trim();
        var availableWeights = [];
        $card.find('.typost-adobe-weight-checkbox:checked').each(function() {
            availableWeights.push($(this).val());
        });

        $message.html('');
        if (!typostBeginBusy($btn, typostAdmin.strings.saving)) { return; }

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
                refreshAfterFontSaved({ fontId: fontId, type: 'adobe', $card: $card });
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.updateFallbacksError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                typostEndBusy($btn, typostAdmin.strings.saveChanges);
            }
        });
    });

    // Save manual font
    $(document).on('click', '.typost-save-manual-font-edit', function() {
        var $btn = $(this);
        var $card = $btn.closest('.typost-font-card');
        var $message = $card.find('.typost-manual-font-edit-message');
        var fontId = $card.data('font-id');
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
        if (!typostBeginBusy($btn, typostAdmin.strings.saving)) { return; }

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
                refreshAfterFontSaved({ fontId: fontId, type: 'manual', $card: $card });
            },
            error: function(xhr) {
                var errorMsg = typostAdmin.strings.updateFontError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<div class="notice notice-error inline"><p>' + errorMsg + '</p></div>');
            },
            complete: function() {
                typostEndBusy($btn, typostAdmin.strings.saveChanges);
            }
        });
    });

    // =========================================================================
    // FONT REPLACEMENT & DELETION MODAL
    // =========================================================================

    // Store previously focused element for modal focus management
    var previouslyFocusedElement = null;

    // Default modal labels, captured from the PHP-localized markup so they
    // can be restored when the modal is reused. Since the page no longer
    // reloads after a deletion, a previous open (or an edit-replacement flow,
    // which retitles the modal) would otherwise leak its state into the next.
    var deleteModalDefaults = {
        title: $('#typost-delete-font-modal .typost-modal-header h2').text(),
        confirmLabel: $('#typost-delete-font-modal .typost-modal-confirm-delete').text()
    };

    /**
     * Show deletion modal with replacement options
     */
    function showDeletionModal(fontId) {
        var $modal = $('#typost-delete-font-modal');
        var $select = $('#typost-replacement-font-select');

        // Reset title and confirm button to their defaults; the
        // edit-replacement flow overrides them after this call.
        $modal.find('.typost-modal-header h2').text(deleteModalDefaults.title);
        $modal.find('.typost-modal-confirm-delete')
            .prop('disabled', false)
            .text(deleteModalDefaults.confirmLabel);

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

        // Capture the current label — it differs between the delete flow
        // ("Delete Font") and the edit-replacement flow ("Update Replacement")
        var originalLabel = $btn.text();

        if (!typostBeginBusy($btn, typostAdmin.strings.deleting)) { return; }

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
                typostEndBusy($btn, originalLabel);
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

                    // Show success message. Replace any earlier deletion
                    // notice so repeated deletions do not stack, and wire
                    // the dismiss button WordPress only adds at page load.
                    $('.typost-font-deleted-notice').remove();
                    var $message = $('<div class="notice notice-success is-dismissible typost-font-deleted-notice" style="margin: 20px 0;"><p></p></div>');
                    $message.find('p').text(typostAdmin.strings.deleteFontSuccess);
                    $('.wrap h1').after($message);
                    attachDismissButtons($message[0]);

                    // Refresh the font list in place after a brief delay.
                    // The h1 notice is not a live region, so the deletion is
                    // included in the polite announcement.
                    setTimeout(function() {
                        refreshAdminFontData(typostAdmin.strings.deleteFontSuccess);
                    }, 1200);
                },
                error: function() {
                    alert(typostAdmin.strings.deleteFontFailed);
                    typostEndBusy($btn, originalLabel);
                }
            });
        }).fail(function() {
            alert(typostAdmin.strings.replacementFailed);
            typostEndBusy($btn, originalLabel);
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
                return allFonts[i].name || adminString('unknownFont', 'Unknown Font');
            }
        }

        return adminString('deletedFont', 'Deleted Font');
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
                    $list.html($('<p class="typost-no-replacements"></p>').text(adminString('noReplacements', 'No font replacements configured.')));
                    $('#typost-unassigned-fonts').hide();
                    return;
                }

                var html = '<table class="widefat"><thead><tr>';
                html += '<th>' + adminString('deletedFont', 'Deleted Font') + '</th>' +
                        '<th>' + adminString('replacementFont', 'Replacement Font') + '</th>' +
                        '<th>' + adminString('globalLoad', 'Global Load') + '</th>' +
                        '<th>' + adminString('actions', 'Actions') + '</th>';
                html += '</tr></thead><tbody>';

                $.each(mappings, function(deletedId, replacementId) {
                    var isGlobal = globalLoad.indexOf(parseInt(deletedId)) !== -1;
                    var deletedName = getFontNameById(deletedId);
                    var replacementName = getFontNameById(replacementId);

                    html += '<tr data-deleted-id="' + deletedId + '" data-replacement-id="' + replacementId + '">';
                    html += '<td><strong>' + deletedName + '</strong><br><small>' + formatString(adminString('fontIdLabel', 'ID: %s'), deletedId) + '</small></td>';
                    html += '<td><strong>' + replacementName + '</strong><br><small>' + formatString(adminString('fontIdLabel', 'ID: %s'), replacementId) + '</small></td>';
                    html += '<td><input type="checkbox" class="typost-toggle-global-load" ' +
                           'data-deleted-id="' + deletedId + '"' +
                           (isGlobal ? ' checked' : '') + ' /></td>';
                    html += '<td>';
                    html += '<button class="button typost-edit-replacement" data-deleted-id="' + deletedId + '" data-replacement-id="' + replacementId + '">' + adminString('edit', 'Edit') + '</button> ';
                    html += '<button class="button typost-delete-replacement" data-deleted-id="' + deletedId + '">' + adminString('remove', 'Remove') + '</button>';
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
                    var html = '<p>' + formatString(adminString('unassignedIds', 'Unassigned IDs: %s'), data.orphaned_ids.join(', ')) + '</p>';
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
        $('#typost-delete-font-modal .typost-modal-header h2').text(adminString('editReplacementTitle', 'Edit Font Replacement'));
        $('.typost-modal-confirm-delete').text(adminString('updateReplacement', 'Update Replacement'));
        $('#typost-delete-font-modal .typost-modal-description').html(
            '<p>' + formatString(
                adminString('editReplacementDescription', 'Select a new replacement font for ID %s.'),
                '<strong>' + parseInt(deletedId, 10) + '</strong>'
            ) + '</p>'
        );
    });

    // Delete replacement mapping
    $(document).on('click', '.typost-delete-replacement', function() {
        var deletedId = $(this).data('deleted-id');

        // Validate ID
        if (!deletedId || deletedId == 0 || deletedId === '0') {
            alert(adminString('invalidFontId', 'Invalid font ID. Please refresh the page and try again.'));
            return;
        }

        if (!confirm(adminString('confirmRemoveReplacement', 'Remove this font replacement mapping?'))) return;

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
                alert(adminString('removeReplacementError', 'Failed to remove replacement.'));
            }
        });
    });

    // Toggle global load for replacement
    $(document).on('change', '.typost-toggle-global-load', function() {
        // Captured up front: inside jQuery's ajax callbacks `this` is the
        // settings object, not the checkbox, so a `$(this)` revert there
        // silently does nothing.
        var $checkbox = $(this);
        var deletedId = $checkbox.data('deleted-id');
        var globalLoad = $checkbox.is(':checked');

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
                alert(adminString('globalLoadUpdateError', 'Failed to update global load setting.'));
                // Revert checkbox
                $checkbox.prop('checked', !globalLoad);
            }
        });
    });

    // Load replacements when tab is opened
    $('.typost-admin-tabs .nav-tab[data-tab="replacements"]').on('click', function() {
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
                        var fontName = font.name || adminString('unknownFont', 'Unknown Font');
                        $replacementSelect.append('<option value="' + font.font_id + '">' + formatString(adminString('fontOptionWithId', '%1$s (ID: %2$s)'), fontName, font.font_id) + '</option>');
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
            $message.html('<p class="notice notice-error">' + adminString('selectDeletedId', 'Please select a deleted font ID.') + '</p>');
            return;
        }

        if (!replacementId || replacementId === '') {
            $message.html('<p class="notice notice-error">' + adminString('selectReplacementFont', 'Please select a replacement font.') + '</p>');
            return;
        }

        if (deletedId == 0 || deletedId === '0') {
            $message.html('<p class="notice notice-error">' + adminString('invalidFontIdZero', 'Invalid font ID (0). Please select a valid ID.') + '</p>');
            return;
        }

        if (!typostBeginBusy($btn, adminString('adding', 'Adding...'))) { return; }

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
                $message.html('<p class="notice notice-success">' + adminString('replacementAdded', 'Replacement mapping added successfully!') + '</p>');
                $('#typost-new-deleted-id').val('');
                $('#typost-new-replacement-id').val('');
                loadReplacementsList();
                populateAddReplacementForm();
                typostEndBusy($btn, adminString('addReplacementButton', 'Add Replacement'));
            },
            error: function(xhr) {
                var errorMsg = adminString('addReplacementError', 'Failed to add replacement mapping.');
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                $message.html('<p class="notice notice-error">' + errorMsg + '</p>');
                typostEndBusy($btn, adminString('addReplacementButton', 'Add Replacement'));
            }
        });
    });

    /* ─────────────────────────────────────────────────────────────────────
     * WP Font Library registration (register / unregister / bulk / notice)
     * ──────────────────────────────────────────────────────────────────── */

    function wplRestCall(path, method, onSuccess, onError) {
        $.ajax({
            url: typostAdmin.restUrl + path,
            method: method,
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: onSuccess,
            error: onError
        });
    }

    function wplErrorMessage(xhr, fallback) {
        if (xhr && xhr.responseJSON && xhr.responseJSON.message) {
            return xhr.responseJSON.message;
        }
        return fallback;
    }

    // Register a single font in the WP Font Library
    $(document).on('click', '.typost-wpl-register', function() {
        var $btn = $(this);
        var fontId = $btn.data('font-id');
        var originalText = $btn.text();
        var $message = $btn.closest('.typost-font-details').find('.typost-font-edit-message');

        if (!typostBeginBusy($btn, typostAdmin.strings.wplRegistering)) { return; }

        wplRestCall('fonts/' + fontId + '/wp-library', 'POST', function() {
            $message.html('<div class="notice notice-success inline"><p>' + typostAdmin.strings.wplRegisterSuccess + '</p></div>');
            setTimeout(function() { refreshAdminFontData(); }, 1200);
        }, function(xhr) {
            $message.html('<div class="notice notice-error inline"><p>' + wplErrorMessage(xhr, typostAdmin.strings.wplRegisterError) + '</p></div>');
            typostEndBusy($btn, originalText);
        });
    });

    // Remove a single font from the WP Font Library
    $(document).on('click', '.typost-wpl-unregister', function() {
        if (!window.confirm(typostAdmin.strings.wplConfirmRemove)) {
            return;
        }

        var $btn = $(this);
        var fontId = $btn.data('font-id');
        var originalText = $btn.text();
        var $message = $btn.closest('.typost-font-details').find('.typost-font-edit-message');

        if (!typostBeginBusy($btn, typostAdmin.strings.wplRemoving)) { return; }

        wplRestCall('fonts/' + fontId + '/wp-library', 'DELETE', function() {
            $message.html('<div class="notice notice-success inline"><p>' + typostAdmin.strings.wplRemoveSuccess + '</p></div>');
            setTimeout(function() { refreshAdminFontData(); }, 1200);
        }, function(xhr) {
            $message.html('<div class="notice notice-error inline"><p>' + wplErrorMessage(xhr, typostAdmin.strings.wplRemoveError) + '</p></div>');
            typostEndBusy($btn, originalText);
        });
    });

    // Bulk register all unregistered uploaded fonts
    $(document).on('click', '#typost-wpl-bulk-register', function() {
        var $btn = $(this);
        var originalText = $btn.text();

        if (!typostBeginBusy($btn, typostAdmin.strings.wplRegistering)) { return; }

        wplRestCall('fonts/wp-library/bulk', 'POST', function(response) {
            var registered = (response.registered || []).length;
            var failed = (response.failed || []).length;
            var msg = typostAdmin.strings.wplBulkDone
                .replace('%1$s', String(registered))
                .replace('%2$s', String(failed));
            $btn.after($('<p role="status"></p>').text(msg));
            setTimeout(function() { refreshAdminFontData(); }, 1500);
        }, function(xhr) {
            alert(wplErrorMessage(xhr, typostAdmin.strings.wplRegisterError));
            typostEndBusy($btn, originalText);
        });
    });

    // Persist dismissal of the migration notice
    $(document).on('click', '#typost-wpl-migration-notice .notice-dismiss', function() {
        wplRestCall('fonts/wp-library/dismiss-notice', 'POST', function() {}, function() {});
    });

    // Bulk auto-detect available weights for fonts predating weight detection
    $(document).on('click', '#typost-detect-weights-bulk', function() {
        var $btn = $(this);
        var originalText = $btn.text();
        var $message = $('#typost-detect-weights-message');

        if (!typostBeginBusy($btn, typostAdmin.strings.detectWeightsRunning)) { return; }

        wplRestCall('fonts/detect-weights/bulk', 'POST', function(response) {
            var msg = typostFormatDetectWeightsSummary(response, typostAdmin.strings.detectWeightsDone);
            $message.html($('<p></p>').text(msg));
            setTimeout(function() { refreshAdminFontData(); }, 1500);
        }, function(xhr) {
            $message.html($('<p></p>').text(wplErrorMessage(xhr, typostAdmin.strings.detectWeightsError)));
            typostEndBusy($btn, originalText);
        });
    });

    /* ─────────────────────────────────────────────────────────────────────
     * Settings forms — progressive enhancement to AJAX
     *
     * The Options, Accessibility, and Clear Cache forms keep their PHP POST
     * handlers as the no-JavaScript fallback; with JavaScript available the
     * submits go through REST and the page updates in place.
     * ──────────────────────────────────────────────────────────────────── */

    /**
     * Show an inline notice after a settings form's submit row.
     * The notice container is a polite live region of its own so sighted
     * and screen reader users get the same message. Only one settings
     * message is on screen at a time: the other forms' containers are
     * emptied first (they keep their role="status"). Messages stay until
     * the next submit replaces them: no timer, so WCAG 2.2.1 (Timing
     * Adjustable) has nothing to adjust (review of E-13, Matt's call).
     *
     * @param {jQuery} $form The settings form.
     * @param {string} type  'success' or 'error'.
     * @param {string} text  Message text.
     */
    function settingsFormMessage($form, type, text) {
        var $msg = $form.find('.typost-settings-ajax-message');
        if (!$msg.length) {
            $msg = $('<div class="typost-settings-ajax-message" role="status" aria-live="polite" aria-atomic="true"></div>');
            $form.find('p.submit').first().after($msg);
        }
        typostClearSettingsMessages(document, $msg[0]);
        var $notice = $('<div></div>').addClass('notice inline notice-' + type).append($('<p></p>').text(text));
        $msg.empty().append($notice);
    }

    /**
     * Apply a color scheme in place: swap the data attribute (used by
     * admin-page.css) and replace the scheme's inline style content.
     */
    function applyColorScheme(scheme, css) {
        $('.typost-admin-wrap').attr('data-color-scheme', scheme);
        // PHP prints the scheme CSS under this id (see
        // output_admin_color_scheme); when the page loaded with the
        // 'default' scheme there is no tag yet, so create it.
        setStyleElement('typost-admin-color-scheme-inline-css', css || '');
    }

    // Options form (Options tab)
    $('button[name="typost_save_options_settings"]').closest('form').on('submit', function(e) {
        e.preventDefault();

        var $form = $(this);
        var $submit = $form.find('button[name="typost_save_options_settings"]');
        var originalText = $submit.text();
        var $autoRegister = $('#typost_auto_register_wp_fonts');
        var $enterLineBreak = $('#typost_block_enter_line_break');

        if (!typostBeginBusy($submit, typostAdmin.strings.savingSettings)) { return; }

        // Checkbox rows added by modules/extensions on the
        // typost_admin_options_rows action. Collected by attribute rather than
        // by name so core does not need to know what they are; the server saves
        // only the keys registered on typost_admin_options_checkboxes.
        var payload = {};
        $form.find('input[type="checkbox"][data-typost-option]').each(function() {
            var name = $(this).attr('name');
            if (name) {
                payload[name] = $(this).is(':checked');
            }
        });

        $.ajax({
            url: typostAdmin.restUrl + 'admin/options',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify($.extend(payload, {
                show_clear_confirmation: $('#typost_show_clear_confirmation').is(':checked'),
                archive_full_content_check: $('#typost_archive_full_content_check').is(':checked'),
                // null when the checkbox isn't in the DOM: a missing element must
                // not read as "unchecked", which would turn the option off. The
                // REST handler skips a null, so client and server agree that
                // absent means "leave it alone".
                block_enter_line_break: $enterLineBreak.length ? $enterLineBreak.is(':checked') : null,
                // Checkbox only rendered when the WP Font Library is available
                auto_register_wp_fonts: $autoRegister.length ? $autoRegister.is(':checked') : null,
                color_scheme: $('#typost_admin_color_scheme').val()
            })),
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function(response) {
                applyColorScheme(response.scheme, response.schemeCss);
                settingsFormMessage($form, 'success', typostAdmin.strings.optionsSaved);
            },
            error: function(xhr) {
                settingsFormMessage($form, 'error', wplErrorMessage(xhr, typostAdmin.strings.optionsSaveError));
            },
            complete: function() {
                typostEndBusy($submit, originalText);
            }
        });
    });

    // Accessibility settings form (Accessibility tab)
    $('button[name="typost_save_accessibility_settings"]').closest('form').on('submit', function(e) {
        e.preventDefault();

        var $form = $(this);
        var $submit = $form.find('button[name="typost_save_accessibility_settings"]');
        var originalText = $submit.text();

        if (!typostBeginBusy($submit, typostAdmin.strings.savingSettings)) { return; }

        $.ajax({
            url: typostAdmin.restUrl + 'admin/accessibility',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                enable_aria_labels: $('#typost_enable_aria_labels').is(':checked'),
                disable_accessibility_warning: $('#typost_disable_accessibility_warning').is(':checked')
            }),
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function() {
                settingsFormMessage($form, 'success', typostAdmin.strings.accessibilitySaved);
            },
            error: function(xhr) {
                settingsFormMessage($form, 'error', wplErrorMessage(xhr, typostAdmin.strings.accessibilitySaveError));
            },
            complete: function() {
                typostEndBusy($submit, originalText);
            }
        });
    });

    // Clear font cache form (Options tab)
    $('button[name="typost_clear_cache"]').closest('form').on('submit', function(e) {
        e.preventDefault();

        var $form = $(this);
        var $submit = $form.find('button[name="typost_clear_cache"]');
        var originalText = $submit.text();

        if (!typostBeginBusy($submit, typostAdmin.strings.savingSettings)) { return; }

        $.ajax({
            url: typostAdmin.restUrl + 'admin/clear-cache',
            method: 'POST',
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', typostAdmin.nonce);
            },
            success: function() {
                settingsFormMessage($form, 'success', typostAdmin.strings.cacheCleared);
            },
            error: function(xhr) {
                settingsFormMessage($form, 'error', wplErrorMessage(xhr, typostAdmin.strings.cacheClearError));
            },
            complete: function() {
                typostEndBusy($submit, originalText);
            }
        });
    });

    // Show editor tips again (Options tab). The dismissal lives in this
    // browser's localStorage (the editor panels read the same key), so the
    // reset is a client-side clear — nothing is sent to the server.
    $('.typost-reset-tips-form').on('submit', function(e) {
        e.preventDefault();

        var $form = $(this);
        try {
            window.localStorage.removeItem('typography_stylist_hide_modal_tips');
            settingsFormMessage($form, 'success', typostAdmin.strings.tipsReset);
        } catch (err) {
            settingsFormMessage($form, 'error', typostAdmin.strings.tipsResetError);
        }
    });
});
