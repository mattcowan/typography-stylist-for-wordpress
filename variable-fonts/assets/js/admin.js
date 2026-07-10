/**
 * Typography Stylist - Variable Fonts: Admin JavaScript
 *
 * Handles the variable font checkbox, axis row management, and
 * saving axes data via the extension's REST endpoint.
 */
(function($) {
    'use strict';

    var __ = wp.i18n.__;

    // Registered axis tag → name auto-fill map.
    var registeredAxes = (window.typostVFAdmin || {}).registeredAxes || {};

    /**
     * Create a new empty axis row HTML string.
     *
     * @return {string} HTML for a new axis row.
     */
    function createAxisRowHtml() {
        return '<div class="typost-vf-axis-row">' +
            '<input type="text" class="typost-vf-axis-tag" value="" placeholder="' + __( 'Tag', 'typost-variable-fonts' ) + '" maxlength="4" size="5" />' +
            '<input type="text" class="typost-vf-axis-name" value="" placeholder="' + __( 'Name', 'typost-variable-fonts' ) + '" size="12" />' +
            '<label class="typost-vf-axis-num-label">' + __( 'Min', 'typost-variable-fonts' ) + ' ' +
                '<input type="number" class="typost-vf-axis-min" value="0" step="any" size="6" />' +
            '</label>' +
            '<label class="typost-vf-axis-num-label">' + __( 'Max', 'typost-variable-fonts' ) + ' ' +
                '<input type="number" class="typost-vf-axis-max" value="1000" step="any" size="6" />' +
            '</label>' +
            '<label class="typost-vf-axis-num-label">' + __( 'Default', 'typost-variable-fonts' ) + ' ' +
                '<input type="number" class="typost-vf-axis-default" value="400" step="any" size="6" />' +
            '</label>' +
            '<button type="button" class="button typost-vf-remove-axis" title="' + __( 'Remove axis', 'typost-variable-fonts' ) + '">&times;</button>' +
        '</div>';
    }

    /**
     * Collect axes data from a variable font settings container.
     *
     * @param {jQuery} $container The .typost-vf-settings element.
     * @return {Array} Array of axis objects.
     */
    function collectAxesFromContainer($container) {
        var axes = [];
        $container.find('.typost-vf-axis-row').each(function() {
            var $row = $(this);
            var tag = $row.find('.typost-vf-axis-tag').val().trim();
            if (tag.length !== 4) return; // Skip incomplete rows.
            axes.push({
                tag: tag,
                name: $row.find('.typost-vf-axis-name').val().trim(),
                min: parseFloat($row.find('.typost-vf-axis-min').val()) || 0,
                max: parseFloat($row.find('.typost-vf-axis-max').val()) || 1000,
                'default': parseFloat($row.find('.typost-vf-axis-default').val()) || 400
            });
        });
        return axes;
    }

    /**
     * Check whether any axis row has a wght tag.
     *
     * @param {jQuery} $container The .typost-vf-settings element.
     * @return {boolean}
     */
    function hasWghtAxis($container) {
        var found = false;
        $container.find('.typost-vf-axis-tag').each(function() {
            if ($(this).val().trim() === 'wght') {
                found = true;
                return false; // break
            }
        });
        return found;
    }

    /**
     * Find the weight checkboxes field that sits just before a VF settings container.
     *
     * @param {jQuery} $container The .typost-vf-settings element.
     * @return {jQuery} The .typost-form-field element containing weight checkboxes, or empty jQuery.
     */
    function getWeightField($container) {
        var $prev = $container.prev('.typost-form-field');
        if ($prev.length && $prev.find('.typost-weight-checkboxes').length) {
            return $prev;
        }
        return $();
    }

    /**
     * Apply weight field visibility based on hide-weights state.
     *
     * @param {jQuery} $container The .typost-vf-settings element.
     * @param {boolean} animate Whether to animate the transition.
     */
    function applyWeightVisibility($container, animate) {
        var $weightField = getWeightField($container);
        if (!$weightField.length) return;

        var isVariable = $container.find('.typost-vf-is-variable-checkbox').is(':checked');
        var hideWeights = $container.find('.typost-vf-hide-weights-checkbox').is(':checked');

        if (isVariable && hideWeights) {
            if (animate) {
                $weightField.slideUp(200);
            } else {
                $weightField.hide();
            }
        } else {
            if (animate) {
                $weightField.slideDown(200);
            } else {
                $weightField.show();
            }
        }
    }

    /**
     * Auto-update the hide-weights checkbox based on whether a wght axis exists.
     * Only auto-updates if the user hasn't manually toggled the checkbox.
     *
     * @param {jQuery} $container The .typost-vf-settings element.
     */
    function autoUpdateHideWeights($container) {
        var $checkbox = $container.find('.typost-vf-hide-weights-checkbox');
        // Only auto-update if not manually overridden.
        if ($checkbox.data('manual')) return;

        var shouldHide = !hasWghtAxis($container);
        $checkbox.prop('checked', shouldHide);
        applyWeightVisibility($container, true);
    }

    $(function() {
        // On page load: apply initial weight visibility from server-rendered state.
        $('.typost-vf-settings').each(function() {
            var $container = $(this);
            if ($container.attr('data-hide-weights') === '1') {
                applyWeightVisibility($container, false);
            }
        });

        // Toggle axes section visibility.
        $(document).on('change', '.typost-vf-is-variable-checkbox', function() {
            var $container = $(this).closest('.typost-vf-settings');
            var $section = $container.find('.typost-vf-axes-section');
            if (this.checked) {
                $section.slideDown(200);
                autoUpdateHideWeights($container);
            } else {
                $section.slideUp(200);
                // Show weights again when variable is unchecked.
                var $weightField = getWeightField($container);
                if ($weightField.length) {
                    $weightField.slideDown(200);
                }
            }
        });

        // Add axis row.
        $(document).on('click', '.typost-vf-add-axis', function() {
            var $list = $(this).closest('.typost-vf-axes-section').find('.typost-vf-axes-list');
            $list.append(createAxisRowHtml());
        });

        // Remove axis row — also re-evaluate hide-weights auto state.
        $(document).on('click', '.typost-vf-remove-axis', function() {
            var $container = $(this).closest('.typost-vf-settings');
            $(this).closest('.typost-vf-axis-row').remove();
            autoUpdateHideWeights($container);
        });

        // Auto-fill axis name when a registered tag is typed, and
        // auto-update hide-weights when axis tags change.
        $(document).on('input', '.typost-vf-axis-tag', function() {
            var tag = $(this).val().trim();
            var $row = $(this).closest('.typost-vf-axis-row');
            var $nameInput = $row.find('.typost-vf-axis-name');
            // Only auto-fill if the name field is empty or already matches a registered name.
            var currentName = $nameInput.val().trim();
            var isRegisteredName = false;
            for (var t in registeredAxes) {
                if (registeredAxes[t] === currentName) {
                    isRegisteredName = true;
                    break;
                }
            }
            if (tag.length === 4 && registeredAxes[tag] && (!currentName || isRegisteredName)) {
                $nameInput.val(registeredAxes[tag]);
            }

            // Re-evaluate hide-weights auto state when any tag changes.
            autoUpdateHideWeights($(this).closest('.typost-vf-settings'));
        });

        // Manual toggle of hide-weights checkbox.
        $(document).on('change', '.typost-vf-hide-weights-checkbox', function() {
            var $container = $(this).closest('.typost-vf-settings');
            // Mark as manually overridden so auto-detect doesn't fight the user.
            $(this).data('manual', true);
            applyWeightVisibility($container, true);
        });

        // Save axes when core font save completes.
        $(document).on('typost:font-saved', function(e, data) {
            if (!data || !data.fontId) return;

            // Find the matching variable font settings container.
            var fontId = data.fontId;
            var $containers = $('.typost-vf-settings').filter(function() {
                return $(this).attr('data-font-id') === fontId;
            });

            $containers.each(function() {
                var $container = $(this);
                var isVariable = $container.find('.typost-vf-is-variable-checkbox').is(':checked');

                if (!isVariable) {
                    // If unchecked, delete any stored axes. Registering the
                    // request via waitUntil() makes core hold its reload
                    // until the save settles (no more racing a timeout).
                    var deleteRequest = $.ajax({
                        url: typostVFAdmin.restUrl + fontId,
                        method: 'DELETE',
                        beforeSend: function(xhr) {
                            xhr.setRequestHeader('X-WP-Nonce', typostVFAdmin.nonce);
                        }
                    });
                    if (data && typeof data.waitUntil === 'function') {
                        data.waitUntil(Promise.resolve(deleteRequest));
                    }
                    return;
                }

                var axes = collectAxesFromContainer($container);
                var $hideWeightsCheckbox = $container.find('.typost-vf-hide-weights-checkbox');
                var payload = { axes: axes, isVariable: true };
                // Only send hideWeights when manually toggled; omitting it lets the backend auto-detect.
                if ($hideWeightsCheckbox.data('manual')) {
                    payload.hideWeights = $hideWeightsCheckbox.is(':checked');
                }
                var saveRequest = $.ajax({
                    url: typostVFAdmin.restUrl + fontId,
                    method: 'POST',
                    data: JSON.stringify(payload),
                    contentType: 'application/json',
                    beforeSend: function(xhr) {
                        xhr.setRequestHeader('X-WP-Nonce', typostVFAdmin.nonce);
                    }
                });
                if (data && typeof data.waitUntil === 'function') {
                    data.waitUntil(Promise.resolve(saveRequest));
                }
            });
        });
    });
})(jQuery);
