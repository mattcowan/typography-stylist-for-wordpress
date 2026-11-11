/**
 * The handler factories in qft/ take what they need from one context object,
 * `qft`, which Edit builds and then extends with
 * `Object.assign(qft, createX(qft))` in a fixed order (#356). A name a
 * factory takes but the context lacks is undefined until someone uses that
 * control, and neither the build nor the other tests notice. This test reads
 * the sources and checks that every name a factory takes is in Edit's `qft`
 * literal or in the return of a factory Edit calls before it, and that no
 * name is defined twice. It also checks that every name Edit takes back
 * from `qft` is provided, and that no factory body reads a name it neither
 * declares, imports, nor takes from ctx (the repo has no lint for that).
 */

const fs = require('fs');
const path = require('path');

const BLOCK = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(BLOCK, file), 'utf8');

// Names in a `{ a, b, c }` list; comments and line breaks allowed
const names = (list) => list
	.replace(/\/\/.*$/gm, '')
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

/**
 * Check the factory wiring.
 *
 * @param {string}   editSource       Source of edit.js
 * @param {Function} readFactory      Reads a qft/ file by its import path
 * @return {string[]} Problems found (empty when the wiring is right)
 */
function checkFactoryContext(editSource, readFactory) {
	const problems = [];
	const literal = editSource.match(/\n\tconst qft = \{([\s\S]*?)\n\t\};/);
	if (!literal) {
		return ['no `const qft = { … };` literal in edit.js'];
	}
	const defined = new Set();
	names(literal[1]).forEach((name) => {
		if (defined.has(name)) {
			problems.push(`${name} is in the qft literal twice`);
		}
		defined.add(name);
	});

	const imports = {};
	for (const m of editSource.matchAll(/import (create\w+) from '\.\/qft\/([\w-]+)';/g)) {
		imports[m[1]] = m[2];
	}
	const calls = [...editSource.matchAll(/Object\.assign\(qft, (create\w+)\(qft\)\);/g)].map((m) => m[1]);
	if (calls.length === 0) {
		problems.push('no factory calls found');
	}
	calls.forEach((factory) => {
		if (!imports[factory]) {
			problems.push(`${factory} is called but not imported from ./qft/`);
			return;
		}
		const source = readFactory(imports[factory]);
		const taken = source.match(new RegExp(`export default function ${factory}\\(ctx\\) \\{\\s*const \\{([\\s\\S]*?)\\} = ctx;`));
		const returned = source.match(/\n\treturn \{([\s\S]*?)\n\t\};\n\}\s*$/);
		if (!taken || !returned) {
			problems.push(`${factory}: cannot read what it takes or returns`);
			return;
		}
		names(taken[1]).forEach((name) => {
			if (!defined.has(name)) {
				problems.push(`${factory} takes ${name}, which nothing defines before it`);
			}
		});
		names(returned[1]).forEach((name) => {
			if (defined.has(name)) {
				problems.push(`${factory} returns ${name}, which is already defined`);
			}
			defined.add(name);
		});
	});
	return problems;
}

const readFactory = (name) => read(`qft/${name}.js`);

/**
 * Names Edit takes from `qft` (`const { … } = qft;`) that neither the
 * literal nor a factory provides: they would be silently undefined.
 *
 * @param {string}   editSource  Source of edit.js
 * @param {Function} readFactory Reads a qft/ file by its import path
 * @return {string[]} The names
 */
function findUnprovidedEditNames(editSource, readFactory) {
	const literal = editSource.match(/\n\tconst qft = \{([\s\S]*?)\n\t\};/);
	const provided = new Set(literal ? names(literal[1]) : []);
	for (const m of editSource.matchAll(/import (create\w+) from '\.\/qft\/([\w-]+)';/g)) {
		const returned = readFactory(m[2]).match(/\n\treturn \{([\s\S]*?)\n\t\};\n\}\s*$/);
		names(returned ? returned[1] : '').forEach((name) => provided.add(name));
	}
	const taken = [];
	for (const m of editSource.matchAll(/\n\tconst \{([^}]*)\} = qft;/g)) {
		taken.push(...names(m[1]));
	}
	return taken.filter((name) => !provided.has(name));
}

// Browser globals the factories may use without importing them
const GLOBALS = new Set(['window', 'document', 'DOMParser', 'CustomEvent', 'Node', 'NodeFilter', 'Math', 'Object', 'Array', 'String', 'Number', 'JSON', 'Set', 'Map', 'parseInt', 'parseFloat', 'isNaN', 'undefined']);

/**
 * Identifiers a factory file reads that it neither declares, imports, takes
 * from ctx, nor finds among the known globals: a ReferenceError on first use.
 *
 * @param {string} source Factory source
 * @return {string[]} The names
 */
function findUnboundNames(source) {
	const { parseSync, traverse } = require('@babel/core');
	const ast = parseSync(source, { babelrc: false, configFile: false, sourceType: 'module', parserOpts: { plugins: ['jsx'] } });
	const unbound = new Set();
	traverse(ast, {
		ReferencedIdentifier(p) {
			const name = p.node.name;
			if (p.isJSXIdentifier() || p.scope.hasBinding(name) || GLOBALS.has(name)) {
				return;
			}
			unbound.add(name);
		},
	});
	return [...unbound];
}

const factoryFiles = fs.readdirSync(path.join(BLOCK, 'qft')).filter((f) => f.endsWith('.js'));

describe('qft handler factories', () => {
	it('every name a factory takes exists when Edit calls it, and none is defined twice', () => {
		expect(checkFactoryContext(read('edit.js'), readFactory)).toEqual([]);
	});

	it('calls all eight factories', () => {
		const calls = read('edit.js').match(/Object\.assign\(qft, create\w+\(qft\)\);/g) || [];
		expect(calls).toHaveLength(8);
	});

	// Controls: the check must fail on the faults it exists for
	it('finds a name removed from the qft literal', () => {
		const edit = read('edit.js').replace(/(\n\tconst qft = \{[\s\S]*?)\binlineStylesAtSelection, /, '$1');
		expect(edit).not.toBe(read('edit.js'));
		expect(checkFactoryContext(edit, readFactory)).toEqual(expect.arrayContaining([
			expect.stringContaining('takes inlineStylesAtSelection'),
		]));
	});

	it('finds factories called in the wrong order', () => {
		const edit = read('edit.js');
		const control = 'Object.assign(qft, createControlActions(qft));';
		const spacing = 'Object.assign(qft, createSpacingActions(qft));';
		const swapped = edit.replace(control, '__A__').replace(spacing, control).replace('__A__', spacing);
		expect(checkFactoryContext(swapped, readFactory)).toEqual(expect.arrayContaining([
			expect.stringContaining('createSpacingActions takes revertInlineControl'),
		]));
	});

	it('finds a name defined twice', () => {
		const edit = read('edit.js').replace(/(\n\tconst qft = \{\n)/, '$1\t\tcontent,\n');
		expect(checkFactoryContext(edit, readFactory)).toContain('content is in the qft literal twice');
	});

	it('Edit takes from qft only names that the literal or a factory provides', () => {
		expect(findUnprovidedEditNames(read('edit.js'), readFactory)).toEqual([]);
	});

	it('finds a name Edit takes from qft that nothing provides (control)', () => {
		const edit = read('edit.js').replace(/(\n\tconst \{ )(populateControlsFromDetectedStyles)/, '$1notProvidedAnywhere, $2');
		expect(edit).not.toBe(read('edit.js'));
		expect(findUnprovidedEditNames(edit, readFactory)).toEqual(['notProvidedAnywhere']);
	});

	it.each(factoryFiles)('qft/%s reads no name it does not declare, import or take from ctx', (file) => {
		expect(findUnboundNames(read(`qft/${file}`))).toEqual([]);
	});

	it('finds a name a factory body uses without taking it from ctx (control)', () => {
		const source = read('qft/reset-actions.js').replace('\treturn {', '\tconst zzz = () => notDestructuredName + 1;\n\n\treturn {');
		expect(findUnboundNames(source)).toEqual(['notDestructuredName']);
	});
});
