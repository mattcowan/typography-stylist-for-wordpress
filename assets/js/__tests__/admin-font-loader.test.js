/**
 * Tests for the settings page font loading helpers in assets/js/admin-page.js
 * (#226): Adobe kit URL lookup, the on-screen font loader, and the
 * Feature Visibility fieldsets built on first open.
 */

global.jQuery = jest.fn(() => ({ ready: jest.fn(), on: jest.fn() }));

const {
	adobeCssUrlsForFontId,
	createAdminFontLoader,
	buildFeatureVisibilityFieldsets,
} = require('../admin-page.js');

/**
 * Minimal IntersectionObserver stand-in: records observed elements and lets
 * a test report them as intersecting (or not).
 */
function makeFakeObserver() {
	const instances = [];
	class FakeObserver {
		constructor(callback) {
			this.callback = callback;
			this.observed = new Set();
			instances.push(this);
		}
		observe(el) {
			this.observed.add(el);
		}
		unobserve(el) {
			this.observed.delete(el);
		}
		fire(el, isIntersecting) {
			this.callback([{ target: el, isIntersecting }]);
		}
	}
	return { FakeObserver, instances };
}

const ADOBE = [
	{ id: 'adobe-a', font_id: 5, kit_id: 'abc', css_url: 'https://use.typekit.net/abc.css' },
	{ id: 'adobe-b', font_id: '6', kit_id: 'abc', css_url: 'https://use.typekit.net/abc.css' },
	{ id: 'adobe-c', font_id: 6, kit_id: 'xyz', css_url: 'https://use.typekit.net/xyz.css' },
	{ id: 'adobe-d', font_id: 7, kit_id: 'bad', css_url: 'http://use.typekit.net/insecure.css' },
	{ id: 'adobe-e', font_id: 8, kit_id: 'js', css_url: 'javascript:alert(1)' },
];

afterEach(() => {
	document.head.innerHTML = '';
	document.body.innerHTML = '';
});

describe('adobeCssUrlsForFontId', () => {
	test('returns the kit stylesheet for a font', () => {
		expect(adobeCssUrlsForFontId(ADOBE, 5)).toEqual(['https://use.typekit.net/abc.css']);
	});

	test('matches string and numeric IDs and lists each kit once', () => {
		expect(adobeCssUrlsForFontId(ADOBE, '6')).toEqual([
			'https://use.typekit.net/abc.css',
			'https://use.typekit.net/xyz.css',
		]);
	});

	test('returns only https URLs', () => {
		expect(adobeCssUrlsForFontId(ADOBE, 7)).toEqual([]);
		expect(adobeCssUrlsForFontId(ADOBE, 8)).toEqual([]);
	});

	test('returns nothing for unknown, empty or invalid input', () => {
		expect(adobeCssUrlsForFontId(ADOBE, 99)).toEqual([]);
		expect(adobeCssUrlsForFontId(ADOBE, 0)).toEqual([]);
		expect(adobeCssUrlsForFontId(ADOBE, 'abc')).toEqual([]);
		expect(adobeCssUrlsForFontId(null, 5)).toEqual([]);
		expect(adobeCssUrlsForFontId([null, {}], 5)).toEqual([]);
	});
});

describe('createAdminFontLoader', () => {
	function kitLinks() {
		return Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href);
	}

	function setup() {
		const { FakeObserver, instances } = makeFakeObserver();
		const loader = createAdminFontLoader({
			doc: document,
			getAdobeFonts: () => ADOBE,
			IntersectionObserver: FakeObserver,
		});
		return { loader, observer: instances[0] };
	}

	test('does nothing until an element is on screen', () => {
		document.body.innerHTML = '<h3 data-typost-font-id="5" data-typost-font-family="var(--font-5), sans-serif">A</h3>';
		const heading = document.querySelector('h3');
		const { loader, observer } = setup();

		expect(loader.scan(document)).toBe(1);
		expect(observer.observed.has(heading)).toBe(true);
		expect(heading.style.fontFamily).toBe('');
		expect(kitLinks()).toEqual([]);

		// A hidden tab reports "not intersecting": still nothing loads
		observer.fire(heading, false);
		expect(heading.style.fontFamily).toBe('');
		expect(kitLinks()).toEqual([]);
	});

	test('applies the font and loads the kit once the element is on screen', () => {
		document.body.innerHTML = '<h3 data-typost-font-id="5" data-typost-font-family="var(--font-5), sans-serif">A</h3>';
		const heading = document.querySelector('h3');
		const { loader, observer } = setup();
		loader.scan(document);

		observer.fire(heading, true);

		expect(heading.style.fontFamily).toBe('var(--font-5), sans-serif');
		expect(heading.hasAttribute('data-typost-font-family')).toBe(false);
		expect(kitLinks()).toEqual(['https://use.typekit.net/abc.css']);
		expect(observer.observed.has(heading)).toBe(false);
	});

	test('adds a shared kit only once', () => {
		document.body.innerHTML =
			'<h3 data-typost-font-id="5">A</h3><h3 data-typost-font-id="6">B</h3>';
		const [first, second] = document.querySelectorAll('h3');
		const { loader, observer } = setup();
		loader.scan(document);

		observer.fire(first, true);
		observer.fire(second, true);

		expect(kitLinks()).toEqual([
			'https://use.typekit.net/abc.css',
			'https://use.typekit.net/xyz.css',
		]);
	});

	test('does not add a kit the page already links', () => {
		document.head.innerHTML = '<link rel="stylesheet" href="https://use.typekit.net/abc.css">';
		const { loader } = setup();

		expect(loader.ensureFontId(5)).toBe(0);
		expect(kitLinks()).toHaveLength(1);
	});

	test('ignores fonts that are not Adobe fonts', () => {
		const { loader } = setup();
		expect(loader.ensureFontId(36)).toBe(0);
		expect(kitLinks()).toEqual([]);
	});

	test('scan includes the root element itself', () => {
		document.body.innerHTML = '<div id="r" data-typost-font-id="5"><p data-typost-font-id="6">x</p></div>';
		const { loader } = setup();
		expect(loader.scan(document.getElementById('r'))).toBe(2);
	});

	test('watch re-observes an element whose attribute changed', () => {
		document.body.innerHTML = '<div id="preview">x</div>';
		const preview = document.getElementById('preview');
		const { loader, observer } = setup();

		preview.setAttribute('data-typost-font-id', '5');
		loader.watch(preview);
		expect(observer.observed.has(preview)).toBe(true);
		observer.fire(preview, true);
		expect(kitLinks()).toEqual(['https://use.typekit.net/abc.css']);

		preview.setAttribute('data-typost-font-id', '6');
		loader.watch(preview);
		observer.fire(preview, true);
		expect(kitLinks()).toContain('https://use.typekit.net/xyz.css');
	});

	test('without IntersectionObserver it handles elements at once', () => {
		document.body.innerHTML = '<h3 data-typost-font-id="5" data-typost-font-family="Georgia, serif">A</h3>';
		const loader = createAdminFontLoader({
			doc: document,
			getAdobeFonts: () => ADOBE,
			IntersectionObserver: null,
		});

		loader.scan(document);

		expect(document.querySelector('h3').style.fontFamily).toBe('Georgia, serif');
		expect(kitLinks()).toEqual(['https://use.typekit.net/abc.css']);
	});

	test('reads the current adobeFonts data on each request', () => {
		let data = [];
		const loader = createAdminFontLoader({
			doc: document,
			getAdobeFonts: () => data,
			IntersectionObserver: null,
		});

		expect(loader.ensureFontId(5)).toBe(0);
		data = ADOBE; // e.g. merged in by an admin refresh
		expect(loader.ensureFontId(5)).toBe(1);
	});
});

describe('buildFeatureVisibilityFieldsets', () => {
	const features = [
		{ id: 'liga', name: 'Standard Ligatures', category: 'ligatures' },
		{ id: 'ss01', name: 'Stylistic Set 1', category: 'stylistic-sets' },
		{ id: 'dlig', name: 'Discretionary Ligatures', category: 'ligatures' },
		{ id: 'kern', name: 'Kerning' },
	];
	const titles = { ligatures: 'Ligatures', 'stylistic-sets': 'Stylistic Sets' };

	function build(disabled) {
		const host = document.createElement('div');
		host.appendChild(buildFeatureVisibilityFieldsets(document, features, titles, disabled));
		return host;
	}

	test('groups features by category in first-seen order', () => {
		const host = build([]);
		const legends = Array.from(host.querySelectorAll('fieldset > legend')).map((l) => l.textContent);
		expect(legends).toEqual(['Ligatures', 'Stylistic Sets', 'Other']);
		const ligatureIds = Array.from(host.querySelectorAll('fieldset')[0].querySelectorAll('input'))
			.map((i) => i.getAttribute('data-feature-id'));
		expect(ligatureIds).toEqual(['liga', 'dlig']);
	});

	test('produces the markup the save handlers read', () => {
		const host = build([]);
		const input = host.querySelector('input');
		expect(input.type).toBe('checkbox');
		expect(input.className).toBe('typost-font-form-visibility-checkbox');
		expect(host.querySelector('fieldset').className).toBe('typost-form-visibility-category');
		expect(host.querySelector('label').className).toBe('typost-form-visibility-label');
		expect(host.querySelector('code').textContent).toBe('liga');
		// The label wraps the input, so the name is its accessible name
		expect(input.closest('label').textContent).toContain('Standard Ligatures');
	});

	test('checks every feature except the disabled ones', () => {
		const host = build(['dlig', 'kern']);
		const state = {};
		host.querySelectorAll('input').forEach((i) => {
			state[i.getAttribute('data-feature-id')] = i.checked;
		});
		expect(state).toEqual({ liga: true, dlig: false, ss01: true, kern: false });
	});

	test('treats missing visibility data as all enabled', () => {
		const host = build(undefined);
		expect(Array.from(host.querySelectorAll('input')).every((i) => i.checked)).toBe(true);
	});

	test('renders names as text, never as markup', () => {
		const host = document.createElement('div');
		host.appendChild(buildFeatureVisibilityFieldsets(
			document,
			[{ id: 'salt', name: '<img src=x onerror=alert(1)>', category: '<b>x</b>' }],
			{},
			[]
		));
		expect(host.querySelector('img')).toBeNull();
		expect(host.querySelector('b')).toBeNull();
		expect(host.querySelector('.typost-form-visibility-feature-name').textContent).toBe('<img src=x onerror=alert(1)>');
	});

	test('returns an empty fragment for missing features', () => {
		expect(buildFeatureVisibilityFieldsets(document, null, null, null).childNodes).toHaveLength(0);
	});
});
