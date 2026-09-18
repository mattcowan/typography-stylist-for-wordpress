/**
 * Typography Stylist - Paragraph Styles: Admin Tab JavaScript
 *
 * Handles inline editing and deletion of paragraph styles in the
 * Typography Stylist settings page.
 *
 * Focus and announcements (QA finding ADM-2): opening the edit form moves
 * focus to the name field, saving or cancelling returns it to the card's
 * Edit button, deleting moves it to the next card (or the list itself when
 * none is left), and every rename/delete is announced through wp.a11y —
 * jQuery's slide/remove left focus on <body> and said nothing.
 *
 * The DOM helpers below take plain elements and are exported for Jest; the
 * jQuery wiring at the bottom only runs in the browser.
 */
(function($) {
	'use strict';

	/**
	 * Announce a message to assistive technology (polite).
	 *
	 * @param {string} message
	 */
	function announce(message) {
		if (window.wp && window.wp.a11y && typeof window.wp.a11y.speak === 'function') {
			window.wp.a11y.speak(message, 'polite');
		}
	}

	/**
	 * Move focus to a card's name input and select its text.
	 *
	 * @param {Element|null} card .typost-ps-style-card element
	 * @return {Element|null} The focused input
	 */
	function focusEditName(card) {
		var input = card ? card.querySelector('.typost-ps-edit-name') : null;
		if (!input) {
			return null;
		}
		input.focus();
		if (typeof input.select === 'function') {
			input.select();
		}
		return input;
	}

	/**
	 * Move focus back to a card's Edit button.
	 *
	 * @param {Element|null} card
	 * @return {Element|null} The focused button
	 */
	function focusEditButton(card) {
		var button = card ? card.querySelector('.typost-ps-edit-btn') : null;
		if (!button) {
			return null;
		}
		button.focus();
		return button;
	}

	/**
	 * Decide where focus goes once a card is removed: the next card's Edit
	 * button, else the previous card's, else the list container itself
	 * (given tabindex -1 so it can take focus and read its empty state).
	 *
	 * Pure: takes the card that is about to go and returns the target
	 * without focusing it, so the caller can remove the card first.
	 *
	 * @param {Element} card The card being deleted (still in the DOM)
	 * @param {Element} list #typost-ps-styles-list
	 * @return {Element|null}
	 */
	function focusTargetAfterDelete(card, list) {
		var cards = list ? Array.prototype.slice.call(list.querySelectorAll('.typost-ps-style-card')) : [];
		var index = cards.indexOf(card);
		var neighbour = null;
		if (index !== -1) {
			neighbour = cards[index + 1] || cards[index - 1] || null;
		}
		if (neighbour) {
			return neighbour.querySelector('.typost-ps-edit-btn') || neighbour;
		}
		if (list) {
			list.setAttribute('tabindex', '-1');
			return list;
		}
		return null;
	}

	var helpers = {
		announce: announce,
		focusEditName: focusEditName,
		focusEditButton: focusEditButton,
		focusTargetAfterDelete: focusTargetAfterDelete
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = helpers;
	}

	if (!$ || typeof typostPSAdmin === 'undefined') {
		return;
	}

	var restUrl = typostPSAdmin.restUrl;
	var nonce   = typostPSAdmin.nonce;

	// -------------------------------------------------------------------------
	// Edit Style
	// -------------------------------------------------------------------------

	$(document).on('click', '.typost-ps-edit-btn', function() {
		var $card = $(this).closest('.typost-ps-style-card');
		$card.find('.typost-ps-style-actions').hide();
		$card.find('.typost-ps-edit-form').slideDown(200, function() {
			focusEditName($card[0]);
		});
	});

	$(document).on('click', '.typost-ps-cancel-edit-btn', function() {
		var $card = $(this).closest('.typost-ps-style-card');
		$card.find('.typost-ps-edit-form').slideUp(200);
		$card.find('.typost-ps-style-actions').show();
		focusEditButton($card[0]);
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
				focusEditButton($card[0]);
				/* translators: %s: style name */
				announce(wp.i18n.sprintf(wp.i18n.__('Style renamed to "%s".', 'typost-paragraph-styles'), response.name));
			},
			error: function() {
				$card.removeClass('typost-ps-saving');
				alert(wp.i18n.__('Failed to update style. Please try again.', 'typost-paragraph-styles'));
				focusEditName($card[0]);
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
				var list   = document.getElementById('typost-ps-styles-list');
				var target = focusTargetAfterDelete($card[0], list);
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
					if (target && typeof target.focus === 'function') {
						target.focus();
					}
					/* translators: %s: style name */
					announce(wp.i18n.sprintf(wp.i18n.__('Style "%s" deleted.', 'typost-paragraph-styles'), name));
				});
			},
			error: function() {
				$card.removeClass('typost-ps-deleting');
				alert(wp.i18n.__('Failed to delete style. Please try again.', 'typost-paragraph-styles'));
				$card.find('.typost-ps-delete-btn').trigger('focus');
			}
		});
	});

})(typeof jQuery !== 'undefined' ? jQuery : null);
