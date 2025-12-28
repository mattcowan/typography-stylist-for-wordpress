/**
 * Jest Setup File
 *
 * This file runs before each test file.
 * It sets up testing utilities and global mocks.
 */

// Import testing library extensions
import '@testing-library/jest-dom';

// Mock window.matchMedia (used by WordPress components)
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: jest.fn().mockImplementation(query => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: jest.fn(), // Deprecated
		removeListener: jest.fn(), // Deprecated
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		dispatchEvent: jest.fn(),
	})),
});

// Mock IntersectionObserver (used by some WordPress components)
global.IntersectionObserver = class IntersectionObserver {
	constructor() {}
	disconnect() {}
	observe() {}
	takeRecords() {
		return [];
	}
	unobserve() {}
};

// Suppress console errors in tests (optional)
// Uncomment if you want cleaner test output
// global.console = {
// 	...console,
// 	error: jest.fn(),
// 	warn: jest.fn(),
// };
