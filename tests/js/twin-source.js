/**
 * Read one copy of a twin out of a source file so a Jest test can run it
 * (#358, docs/twins.md).
 *
 * Some copies cannot be imported: a hand-written ES5 script with no export,
 * a function that is not exported, a method of a class component, or an
 * object literal assigned at load time. These helpers cut the code out of
 * the file by name and turn it into something the test can call, so the
 * test compares behavior, never source text.
 *
 * The cutting is done by matchingBrace(), a small scanner and not a parser.
 * It guesses a regular expression literal from the token before the slash
 * (a slash after `)` or after a word such as `return` is read as division,
 * so `if (x) /re/.test(y)` and `return /re/` are misread), and it does not
 * follow a backtick nested inside `${…}` of a
 * template string. A missing name throws "renamed or moved". A wrong cut
 * shows as a syntax error from `new Function`, or as a function that ends
 * early: if a test fails that way after an edit to the copy it reads, check
 * matchingBrace() first.
 *
 * This file is outside every folder Jest collects (`__tests__`, `test/`,
 * `*.test.js`; see @wordpress/jest-preset-default), so it is a helper, not
 * a test. It does not ship (`/tests` is in .distignore).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readSource(file) {
	return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function notFound(what, file) {
	return new Error(what + ' not found in ' + file + ': it was renamed or moved; update the test and its row in docs/twins.md.');
}

/**
 * The index of the brace that closes the block opened at `open`.
 *
 * Skips braces inside comments, quoted strings, template strings and
 * regular expression literals.
 *
 * @param {string} source Source text.
 * @param {number} open   Index of a `{`.
 * @return {number} Index of the matching `}`, or -1.
 */
function matchingBrace(source, open) {
	let depth = 0;
	let previous = '';
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		const next = source[i + 1];
		if (ch === '/' && next === '/') {
			i = source.indexOf('\n', i);
			if (i === -1) {
				return -1;
			}
			continue;
		}
		if (ch === '/' && next === '*') {
			i = source.indexOf('*/', i + 2) + 1;
			if (i === 0) {
				return -1;
			}
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			for (i++; i < source.length && source[i] !== ch; i++) {
				if (source[i] === '\\') {
					i++;
				}
			}
			previous = ch;
			continue;
		}
		// A slash after an operator or an opening bracket starts a regular
		// expression literal, not a division.
		if (ch === '/' && (previous === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(previous) !== -1)) {
			let inClass = false;
			for (i++; i < source.length; i++) {
				if (source[i] === '\\') {
					i++;
				} else if (source[i] === '[') {
					inClass = true;
				} else if (source[i] === ']') {
					inClass = false;
				} else if (source[i] === '/' && !inClass) {
					break;
				}
			}
			previous = '/';
			continue;
		}
		if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth--;
			if (depth === 0) {
				return i;
			}
		}
		if (!/\s/.test(ch)) {
			previous = ch;
		}
	}
	return -1;
}

/**
 * The source of one named function declaration (`function name(`).
 *
 * @param {string} file Path from the plugin root.
 * @param {string} name Function name.
 * @return {string} The declaration. Throws when it is not found.
 */
function extractFunction(file, name) {
	const source = readSource(file);
	const start = source.search(new RegExp('function\\s+' + name + '\\s*\\('));
	if (start === -1) {
		throw notFound('function ' + name + '()', file);
	}
	const end = matchingBrace(source, source.indexOf('{', start));
	if (end === -1) {
		throw notFound('the end of function ' + name + '()', file);
	}
	return source.slice(start, end + 1);
}

/**
 * The block of code that follows a marker ending in `{`, braces included:
 * an object literal (`window.typostHooks = window.typostHooks || {`) or a
 * class method (`handleHeaderKeyDown(e) {`).
 *
 * @param {string} file   Path from the plugin root.
 * @param {string} marker Text that ends with the opening brace.
 * @return {string} From the opening brace to the closing one. Throws when the marker is not found.
 */
function extractBlock(file, marker) {
	const source = readSource(file);
	const at = source.indexOf(marker);
	if (at === -1 || marker[marker.length - 1] !== '{') {
		throw notFound('"' + marker + '"', file);
	}
	const open = at + marker.length - 1;
	const end = matchingBrace(source, open);
	if (end === -1) {
		throw notFound('the end of "' + marker + '"', file);
	}
	return source.slice(open, end + 1);
}

/**
 * Run a named function declaration from a file and return it.
 *
 * @param {string} file Path from the plugin root.
 * @param {string} name Function name.
 * @return {Function}
 */
function loadFunction(file, name) {
	return new Function(extractFunction(file, name) + '\nreturn ' + name + ';')();
}

module.exports = { readSource, extractFunction, extractBlock, loadFunction, matchingBrace };
