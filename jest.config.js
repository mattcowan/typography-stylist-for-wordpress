/**
 * Jest Configuration for Typography Stylist
 *
 * This extends the default WordPress scripts Jest config
 * and adds module name mapping for WordPress packages.
 */

const defaultConfig = require('@wordpress/scripts/config/jest-unit.config.js');

module.exports = {
	...defaultConfig,
	// Transform JSX files
	transform: {
		'^.+\\.[jt]sx?$': '<rootDir>/node_modules/@wordpress/scripts/config/babel-transform',
	},
	// Setup files to run before tests
	setupFilesAfterEnv: [
		'<rootDir>/jest.setup.js',
	],
	// Test environment
	testEnvironment: 'jsdom',
};
