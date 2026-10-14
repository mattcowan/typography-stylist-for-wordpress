/**
 * Jest Configuration for Typography Stylist
 *
 * @wordpress/scripts 36 no longer ships a Jest config, so this file sets the
 * same defaults that its old config/jest-unit.config.js gave: the published
 * WordPress Jest preset and babel-jest with the WordPress Babel preset (the
 * project .babelrc still merges in, as before). `npm test` runs
 * `wp-scripts test-unit-jest`, which uses this file. Jest's built-in
 * github-actions reporter replaces the scripts reporter that the old config
 * added; it writes failure annotations only when GITHUB_ACTIONS is set.
 *
 * @see node_modules/@wordpress/scripts/docs/vitest-migration.md
 */

module.exports = {
	preset: '@wordpress/jest-preset-default',
	reporters: [ 'default', 'github-actions' ],
	// Transform JSX files
	transform: {
		'^.+\\.[jt]sx?$': [
			'babel-jest',
			{ presets: [ '@wordpress/babel-preset-default' ] },
		],
	},
	// Setup files to run before tests
	setupFilesAfterEnv: [
		'<rootDir>/jest.setup.js',
	],
	// Test environment
	testEnvironment: 'jsdom',
};
