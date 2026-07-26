/**
 * Typography Stylist Block - Save Component Tests
 *
 * Tests for the frontend rendering component (save.js)
 * These tests verify the accessibility implementation and semantic HTML structure.
 *
 * Key Testing Goals:
 * 1. Verify dual semantic heading structure (not span + heading)
 * 2. Ensure screen reader version uses cleanText (HTML stripped)
 * 3. Validate ARIA attributes are correctly applied
 * 4. Confirm both elements use the same tagName for semantic consistency
 */

import { create } from 'react-test-renderer';

/**
 * Tell Jest to use our manual mock for @wordpress/block-editor
 * The mock is located in __mocks__/@wordpress/block-editor.js
 */
jest.mock('@wordpress/block-editor');

// Import the save component after mock is set up
import save from '../save';

describe('Typography Stylist - Save Component (Frontend Rendering)', () => {

	describe('Semantic Heading Structure', () => {
		it('should render both screen reader and visual versions with same heading tag', () => {
			const attributes = {
				content: '<strong>Beautiful</strong> Typography',
				tagName: 'h2',
				features: ['ss02', 'calt'],
				fontFamily: 'Calgary Script',
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Verify wrapper div exists
			expect(tree.type).toBe('div');
			expect(tree.props.className).toBe('wp-block-typost');

			// Verify we have two children (screen reader + visual)
			expect(tree.children).toHaveLength(2);

			// Verify both are H2 elements (same tagName)
			expect(tree.children[0].type).toBe('h2');
			expect(tree.children[1].type).toBe('h2');
		});

		it('should use h1 tags when tagName is h1', () => {
			const attributesH1 = {
				content: 'Title',
				tagName: 'h1',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes: attributesH1 }));
			const tree = component.toJSON();

			expect(tree.children[0].type).toBe('h1');
			expect(tree.children[1].type).toBe('h1');
		});
	});

	describe('Screen Reader Class Assignment', () => {
		it('should apply default visually-hidden class to screen reader version', () => {
			const attributes = {
				content: 'Test Content',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// First child is screen reader version
			expect(tree.children[0].props.className).toBe('visually-hidden');
		});

		it('should apply custom screen reader class when specified', () => {
			const attributes = {
				content: 'Test Content',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'sr-only',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			expect(tree.children[0].props.className).toBe('sr-only');
		});

		it('should apply typost-styled class to visual version only', () => {
			const attributes = {
				content: 'Test Content',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Second child is visual version
			expect(tree.children[1].props.className).toBe('typost-styled');
		});
	});

	describe('ARIA Attributes', () => {
		it('should add aria-hidden="true" to visual version only', () => {
			const attributes = {
				content: 'Test Content',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Screen reader version should NOT have aria-hidden
			expect(tree.children[0].props['aria-hidden']).toBeUndefined();

			// Visual version SHOULD have aria-hidden="true"
			expect(tree.children[1].props['aria-hidden']).toBe('true');
		});
	});

	describe('HTML Stripping for Screen Readers', () => {
		it('should strip all HTML tags from screen reader version', () => {
			const attributes = {
				content: '<strong>Bold</strong> and <em>italic</em> text',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Screen reader version should have plain text
			expect(tree.children[0].children[0]).toBe('Bold and italic text');
		});

		it('should preserve HTML in visual version', () => {
			const attributes = {
				content: '<strong>Bold</strong> text',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Visual version should have the original HTML content
			expect(tree.children[1].children[0]).toBe('<strong>Bold</strong> text');
		});

		it('should handle nested HTML tags correctly', () => {
			const attributes = {
				content: '<span class="typost-styled"><strong>Nested</strong></span> tags',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			expect(tree.children[0].children[0]).toBe('Nested tags');
		});

		it('should replace <br> tags with spaces in screen reader version', () => {
			const attributes = {
				content: 'MILANO<br>CORTINA',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Screen reader version should have a space where <br> was
			expect(tree.children[0].children[0]).toBe('MILANO CORTINA');
		});

		it('should replace self-closing <br/> tags with spaces in screen reader version', () => {
			const attributes = {
				content: 'Line One<br/>Line Two<br />Line Three',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			expect(tree.children[0].children[0]).toBe('Line One Line Two Line Three');
		});

		it('should replace RichText <br data-rich-text-line-break="true"> tags with spaces in screen reader version', () => {
			const attributes = {
				content: 'Line One<br data-rich-text-line-break="true">Line Two',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			expect(tree.children[0].children[0]).toBe('Line One Line Two');
		});

		it('should handle empty content gracefully', () => {
			const attributes = {
				content: '',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Empty content results in null children for both versions
			expect(tree.children[0].children).toBeNull();
			expect(tree.children[1].children).toBeNull();
		});
	});

	describe('Font Feature Settings', () => {
		it('should apply font-feature-settings style to visual version', () => {
			const attributes = {
				content: 'Typography',
				tagName: 'h2',
				features: ['ss02', 'calt', 'liga'],
				fontFamily: 'Calgary Script',
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Visual version should have font-feature-settings in style
			const visualStyle = tree.children[1].props.style;
			expect(visualStyle.fontFeatureSettings).toBe('"ss02" 1, "calt" 1, "liga" 1');
		});

		it('should not apply styles to screen reader version', () => {
			const attributes = {
				content: 'Typography',
				tagName: 'h2',
				features: ['ss02'],
				fontFamily: 'Calgary Script',
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Screen reader version should have NO style attribute
			expect(tree.children[0].props.style).toBeUndefined();
		});
	});

	describe('Data Attributes', () => {
		it('should add data-font attribute to visual version when fontFamily is set', () => {
			const attributes = {
				content: 'Typography',
				tagName: 'h2',
				features: [],
				fontFamily: 'Calgary Script',
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			expect(tree.children[1].props['data-font']).toBe('Calgary Script');
		});

		it('should not add data-font when fontFamily is empty', () => {
			const attributes = {
				content: 'Typography',
				tagName: 'h2',
				features: [],
				fontFamily: '',
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			expect(tree.children[1].props['data-font']).toBeUndefined();
		});

		it('should add data-animation-config-id to the visual version only when set', () => {
			const attributes = {
				content: 'Typography',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0,
				animationConfigId: 3
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Visual (aria-hidden) heading carries the animation reference
			expect(tree.children[1].props['data-animation-config-id']).toBe(3);
			// Screen reader heading must stay clean
			expect(tree.children[0].props['data-animation-config-id']).toBeUndefined();
		});

		it('should not emit data-animation-config-id when unset or zero', () => {
			const base = {
				content: 'Typography',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			// Unset (legacy blocks) — save output must be unchanged
			let tree = create(save({ attributes: base })).toJSON();
			expect(tree.children[1].props['data-animation-config-id']).toBeUndefined();

			// Explicit default 0
			tree = create(save({ attributes: { ...base, animationConfigId: 0 } })).toJSON();
			expect(tree.children[1].props['data-animation-config-id']).toBeUndefined();
		});
	});

	describe('Accessibility Regression Prevention', () => {
		it('should NEVER use span for screen reader version', () => {
			// This test prevents regression to the old <span> implementation
			const attributes = {
				content: 'Test',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// CRITICAL: First child must NOT be a span
			expect(tree.children[0].type).not.toBe('span');
			// It should match the tagName
			expect(tree.children[0].type).toBe('h2');
		});

		it('should maintain semantic heading structure for document outline', () => {
			// Test all heading levels to ensure semantic structure
			const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

			headingLevels.forEach(level => {
				const attributes = {
					content: `Level ${level}`,
					tagName: level,
					features: [],
					screenReaderClass: 'visually-hidden',
					fontSize: 'inherit',
					fontWeight: '400',
					letterSpacing: 0
				};

				const component = create(save({ attributes }));
				const tree = component.toJSON();

				// Both versions must use the same heading level
				expect(tree.children[0].type).toBe(level);
				expect(tree.children[1].type).toBe(level);
			});
		});
	});

	describe('Windows Narrator Focus Enhancement', () => {
		it('should maintain existing screen reader class structure', () => {
			const attributes = {
				content: 'Focus Test',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0,
				lineHeight: 0
			};

			const component = create(save({ attributes }));
			const tree = component.toJSON();

			// Screen reader version should still have visually-hidden class
			expect(tree.children[0].props.className).toBe('visually-hidden');

			// Visual version should still have typost-styled class
			expect(tree.children[1].props.className).toBe('typost-styled');

			// Order must be preserved (screen reader first, visual second)
			expect(tree.children[0].type).toBe('h2');
			expect(tree.children[1].type).toBe('h2');
		});

		it('should work with all three screen reader class options', () => {
			const classes = ['visually-hidden', 'sr-only', 'screen-reader-text'];

			classes.forEach(className => {
				const attributes = {
					content: 'Test',
					tagName: 'h2',
					features: [],
					screenReaderClass: className,
					fontSize: 'inherit',
					fontWeight: '400',
					letterSpacing: 0,
					lineHeight: 0
				};

				const component = create(save({ attributes }));
				const tree = component.toJSON();

				expect(tree.children[0].props.className).toBe(className);
			});
		});

		it('should maintain semantic heading structure for focus navigation', () => {
			const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

			headingLevels.forEach(level => {
				const attributes = {
					content: `${level} heading`,
					tagName: level,
					features: [],
					screenReaderClass: 'visually-hidden',
					fontSize: 'inherit',
					fontWeight: '400',
					letterSpacing: 0,
					lineHeight: 0
				};

				const component = create(save({ attributes }));
				const tree = component.toJSON();

				// Both versions must maintain same heading level for focus order
				expect(tree.children[0].type).toBe(level);
				expect(tree.children[1].type).toBe(level);
			});
		});
	});
});
describe('fontStyle attribute (visual italic)', () => {
	const baseAttributes = {
		content: 'Headline',
		tagName: 'h2',
		features: [],
		screenReaderClass: 'visually-hidden',
		fontSize: 'inherit',
		fontWeight: '400',
		letterSpacing: 0
	};

	const visualStyleOf = (attributes) => {
		const tree = create(save({ attributes })).toJSON();
		// children[1] is the visual (aria-hidden) heading
		return tree.children[1].props.style || {};
	};

	it('adds font-style to the visual heading when set', () => {
		const style = visualStyleOf({ ...baseAttributes, fontStyle: 'italic' });
		expect(style.fontStyle).toBe('italic');
	});

	it('empty/absent fontStyle produces identical output (block validation safety)', () => {
		const withDefault = create(save({ attributes: { ...baseAttributes, fontStyle: '' } })).toJSON();
		const without = create(save({ attributes: { ...baseAttributes } })).toJSON();
		expect(JSON.stringify(withDefault)).toBe(JSON.stringify(without));
		expect((withDefault.children[1].props.style || {}).fontStyle).toBeUndefined();
	});
});
