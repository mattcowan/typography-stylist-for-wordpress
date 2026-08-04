/**
 * Typography Stylist - Paragraph Styles: Admin Tab JavaScript
 *
 * Handles inline editing and deletion of paragraph styles in the
 * Typography Stylist settings page.
 */
(function($) {
	'use strict';

	if (typeof typostPSAdmin === 'undefined') {
		return;
	}

	var restUrl = typostPSAdmin.restUrl;
	var nonce   = typostPSAdmin.nonce;

	// -------------------------------------------------------------------------
	// Edit Style
	// -------------------------------------------------------------------------

	$(document).on('click', '.typost-ps-edit-btn', function() {
		var $card = $(this).closest('.typost-ps-style-card');
		$card.find('.typost-ps-edit-form').slideDown(200);
		$card.find('.typost-ps-style-actions').hide();
	});

	$(document).on('click', '.typost-ps-cancel-edit-btn', function() {
		var $card = $(this).closest('.typost-ps-style-card');
		$card.find('.typost-ps-edit-form').slideUp(200);
		$card.find('.typost-ps-style-actions').show();
	});

	$(document).on('click', '.typost-ps-save-edit-btn', function() {
		var $card   = $(this).closest('.typost-ps-style-card');
		var styleId = $card.data('style-id');
		var newName = $card.find('.typost-ps-edit-name').val().trim();

		if (!newName) {
			return;
		}

		$card.addClass('typost-ps-saving');

		$.ajax({
			url: restUrl + '/' + encodeURIComponent(styleId),
			method: 'PATCH',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			contentType: 'application/json',
			data: JSON.stringify({ name: newName }),
			success: function(response) {
				$card.find('.typost-ps-style-name').text(response.name);
				$card.find('.typost-ps-edit-form').slideUp(200);
				$card.find('.typost-ps-style-actions').show();
				$card.removeClass('typost-ps-saving');
			},
			error: function() {
				$card.removeClass('typost-ps-saving');
				alert(wp.i18n.__('Failed to update style. Please try again.', 'typost-paragraph-styles'));
			}
		});
	});

	// -------------------------------------------------------------------------
	// Delete Style
	// -------------------------------------------------------------------------

	$(document).on('click', '.typost-ps-delete-btn', function() {
		var $card   = $(this).closest('.typost-ps-style-card');
		var styleId = $card.data('style-id');
		var name    = $card.find('.typost-ps-style-name').text();

		/* translators: %s: style name */
		if (!confirm(wp.i18n.sprintf(
			wp.i18n.__('Are you sure you want to delete "%s"? This cannot be undone.', 'typost-paragraph-styles'),
			name
		))) {
			return;
		}

		$card.addClass('typost-ps-deleting');

		$.ajax({
			url: restUrl + '/' + encodeURIComponent(styleId),
			method: 'DELETE',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			success: function() {
				$card.slideUp(300, function() {
					$card.remove();
					// Show empty state if no cards remain
					if ($('#typost-ps-styles-list .typost-ps-style-card').length === 0) {
						$('#typost-ps-styles-list').html(
							'<div class="typost-ps-empty-state"><p>' +
							wp.i18n.__('No paragraph styles saved yet. Create styles from the Typography Stylist editor when editing a post.', 'typost-paragraph-styles') +
							'</p></div>'
						);
					}
				});
			},
			error: function() {
				$card.removeClass('typost-ps-deleting');
				alert(wp.i18n.__('Failed to delete style. Please try again.', 'typost-paragraph-styles'));
			}
		});
	});

})(jQuery);
