/**
 * The Variable Fonts requests on the settings page ask for the user's
 * language (#296). admin.js is an IIFE over jQuery and wp.i18n with no
 * exports, so the check reads its source.
 */

const source = require('fs').readFileSync(require('path').resolve(__dirname, '../assets/js/admin.js'), 'utf8');

describe('REST requests ask for the user\'s language (#296)', () => {
	// determine_locale() reads _locale=user only on a JSON request, so every
	// call needs the URL parameter and dataType: 'json' (the Accept header).
	// Re-detect shows the server's error message next to the button.
	const calls = source.split('$.ajax({').slice(1).map((rest) => rest.slice(0, rest.indexOf('beforeSend')));

	test('the file makes its three REST calls', () => {
		expect(calls).toHaveLength(3);
	});

	test.each(calls.map((call) => [call.match(/url: (.*),/)[1], call]))('%s', (url, call) => {
		expect(url).toMatch(/^withUserLocale\(typostVFAdmin\.restUrl \+ .*\)$/);
		expect(call).toMatch(/\bdataType: 'json',/);
	});
});
