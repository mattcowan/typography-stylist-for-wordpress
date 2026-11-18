/**
 * The block's text has the same margins in the editor as on the frontend
 * (#422). The frontend copy has typost-styled, which style.css resets; the
 * editor RichText has it only with a paragraph style or fit to width, so
 * editor.css resets the RichText itself, with the same specificity.
 *
 * What an author sees is proved in the real editor by
 * tests/e2e/editor-text-margins.spec.js; this file keeps the two rules from
 * being dropped or drifting apart where the e2e suite does not run.
 */

import fs from 'fs';
import path from 'path';

const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const editorCss = fs.readFileSync(path.join(__dirname, '..', 'editor.css'), 'utf8');

/** The declarations of every rule whose whole selector is `selector`. */
function ruleBodies(source, selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp('(?:^|[}/])\\s*' + escaped + '\\s*\\{([^}]*)\\}', 'gm');
	const bodies = [];
	let match;
	while ((match = pattern.exec(source)) !== null) {
		bodies.push(match[1]);
	}
	return bodies;
}

/** One declaration's value in a rule body, or null. */
function declaration(body, property) {
	const match = new RegExp('(?:^|[;{\\s])' + property + '\\s*:\\s*([^;]+);').exec(body);
	return match ? match[1].trim() : null;
}

describe('text margins (#422)', () => {
	it('control: the rule finder finds every rule with the selector', () => {
		// editor.css has the outline rule and the reset on the same selector
		const bodies = ruleBodies(editorCss, '.wp-block-typost .typost-block-content');
		expect(bodies.length).toBeGreaterThanOrEqual(2);
		expect(bodies.some((body) => declaration(body, 'outline-offset') === '4px')).toBe(true);
	});

	it('style.css resets the frontend copy', () => {
		const bodies = ruleBodies(styleCss, '.wp-block-typost .typost-styled');
		expect(bodies.some((body) => declaration(body, 'margin') === '0' && declaration(body, 'padding') === '0')).toBe(true);
	});

	it('editor.css resets the RichText the same way, with the same (0,2,0) selector shape', () => {
		const bodies = ruleBodies(editorCss, '.wp-block-typost .typost-block-content');
		const resets = bodies.filter((body) => declaration(body, 'margin') !== null || declaration(body, 'padding') !== null);
		expect(resets).toHaveLength(1);
		expect(declaration(resets[0], 'margin')).toBe('0');
		expect(declaration(resets[0], 'padding')).toBe('0');
		// No !important: a paragraph style's space before and after (#199)
		// and its indents must still win on a block that has one
		expect(resets[0]).not.toMatch(/!important/);
	});
});
