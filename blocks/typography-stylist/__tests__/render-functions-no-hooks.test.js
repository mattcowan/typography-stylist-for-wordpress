/**
 * The files in components/ (except zoom-notice.js, a real component) hold
 * render functions: Edit calls renderQuickFeatureToggles(), renderCasePanel()
 * and the others as plain functions inside its own render, some only on a
 * condition (the QFT modal only while it is open, the font family panel only
 * when there are fonts). A hook called in one of them would be a hook of
 * Edit that runs conditionally, which breaks React's hook order. Nothing else
 * catches it: the repo has no hooks lint and the build accepts it. So this
 * test fails when one of these files calls a hook.
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS = path.join(__dirname, '..', 'components');
// A real component, rendered as <ZoomNotice />; it may use hooks
const REAL_COMPONENTS = ['zoom-notice.js'];

function listRenderFunctionFiles(dir) {
	const out = [];
	fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...listRenderFunctionFiles(full));
		} else if (entry.name.endsWith('.js') && !REAL_COMPONENTS.includes(entry.name)) {
			out.push(full);
		}
	});
	return out;
}

/**
 * Hook calls in a source text, comments ignored.
 *
 * @param {string} source File text
 * @return {string[]} The hook calls found
 */
function findHookCalls(source) {
	const code = source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:\\])\/\/.*$/gm, '$1');
	return [
		...(code.match(/\buse[A-Z]\w*\(/g) || []),
		...(code.match(/\bwp\.\w+\.use\w*/g) || []),
	];
}

const files = listRenderFunctionFiles(COMPONENTS);

describe('render functions in components/ call no hooks', () => {
	it('finds the render function files', () => {
		// The QFT modal and the 12 sidebar panels at the time of writing
		expect(files.length).toBeGreaterThanOrEqual(13);
		expect(files.some((f) => f.endsWith('quick-feature-toggles.js'))).toBe(true);
	});

	it.each(files.map((f) => [path.relative(COMPONENTS, f), f]))('%s calls no hook', (_, file) => {
		expect(findHookCalls(fs.readFileSync(file, 'utf8'))).toEqual([]);
	});

	// Controls: the check must find what it exists for, and not a hook named in a comment
	it('finds a hook call in a copy of a render function', () => {
		const source = fs.readFileSync(path.join(COMPONENTS, 'inspector', 'case-panel.js'), 'utf8')
			.replace('\treturn (', '\tconst [open] = useState(false);\n\treturn (');
		expect(findHookCalls(source)).toEqual(['useState(']);
	});

	it('finds a hook reached through the wp global', () => {
		expect(findHookCalls('const x = wp.element.useRef(null);')).toContain('wp.element.useRef');
		expect(findHookCalls('const x = wp.data.useSelect;')).toEqual(['wp.data.useSelect']);
	});

	it('ignores hooks named in comments', () => {
		expect(findHookCalls('// call useState() here?\n/* useEffect() */\nconst a = 1;')).toEqual([]);
	});
});
