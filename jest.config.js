/**
 * Jest Configuration for OpenType Stylist
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
	// Module paths - tells Jest where to find WordPress packages
	moduleNameMapper: {
		'^@wordpress/block-editor$': '<rootDir>/node_modules/@wordpress/block-editor',
		'^@wordpress/components$': '<rootDir>/node_modules/@wordpress/components',
		'^@wordpress/data$': '<rootDir>/node_modules/@wordpress/data',
		'^@wordpress/element$': '<rootDir>/node_modules/@wordpress/element',
		'^@wordpress/i18n$': '<rootDir>/node_modules/@wordpress/i18n',
		'^@wordpress/rich-text$': '<rootDir>/node_modules/@wordpress/rich-text',
		'^@wordpress/compose$': '<rootDir>/node_modules/@wordpress/compose',
	},
	// Test environment
	testEnvironment: 'jsdom',
};
