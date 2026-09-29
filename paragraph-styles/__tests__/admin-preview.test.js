/**
 * Tests for the style preview disclosure in paragraph-styles/assets/js/admin.js
 * (issue #220). The jQuery wiring is inert here: no jQuery global.
 */

const { togglePreview } = require('../assets/js/admin.js');

function buildCard(id) {
	const card = document.createElement('div');
	card.className = 'typost-ps-style-card';
	card.innerHTML =
		'<button type="button" class="button typost-ps-preview-btn" aria-expanded="false" aria-controls="typost-ps-preview-' + id + '">Preview</button>' +
		'<div class="typost-ps-preview" id="typost-ps-preview-' + id + '" hidden>' +
		'<p class="typost-ps-preview-sample typost-ps-' + id + '">Sample</p>' +
		'</div>';
	document.body.appendChild(card);
	return {
		button: card.querySelector('.typost-ps-preview-btn'),
		region: card.querySelector('.typost-ps-preview'),
	};
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('togglePreview', () => {
	test('opens a closed preview and marks the button expanded', () => {
		const { button, region } = buildCard(3);

		const result = togglePreview(button);

		expect(result).toBe(true);
		expect(region.hidden).toBe(false);
		expect(button.getAttribute('aria-expanded')).toBe('true');
	});

	test('closes an open preview again', () => {
		const { button, region } = buildCard(3);
		togglePreview(button);

		const result = togglePreview(button);

		expect(result).toBe(false);
		expect(region.hidden).toBe(true);
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	test('toggles only the preview its button controls', () => {
		const first = buildCard(1);
		const second = buildCard(2);

		togglePreview(second.button);

		expect(first.region.hidden).toBe(true);
		expect(first.button.getAttribute('aria-expanded')).toBe('false');
		expect(second.region.hidden).toBe(false);
	});

	test('keeps the button label, so aria-expanded alone carries the state', () => {
		const { button } = buildCard(3);
		togglePreview(button);
		expect(button.textContent).toBe('Preview');
	});

	test('returns null and changes nothing when the region is missing', () => {
		const { button, region } = buildCard(3);
		region.remove();

		expect(togglePreview(button)).toBeNull();
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	test('returns null for a missing button or a button without aria-controls', () => {
		expect(togglePreview(null)).toBeNull();
		const bare = document.createElement('button');
		expect(togglePreview(bare)).toBeNull();
	});
});
