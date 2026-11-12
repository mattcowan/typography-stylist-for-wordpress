/**
 * The parse worker's copy of the error helpers (#358).
 *
 * parse-worker.js runs in a Web Worker and cannot import font-loader.js, so
 * it keeps its own tagError(), errorReason() and errorDetail(). The page
 * reads the reason the worker tags, so both copies must classify the same
 * way. tests/js/twin-source.js cuts the worker copies out of its source;
 * they run on the same inputs as the exported ones.
 */

const loader = require('../assets/js/lib/font-loader');
const { loadFunction } = require('../../tests/js/twin-source.js');

const WORKER = 'glyphs-panel/assets/js/lib/parse-worker.js';
const worker = {
	tagError: loadFunction(WORKER, 'tagError'),
	errorReason: loadFunction(WORKER, 'errorReason'),
	errorDetail: loadFunction(WORKER, 'errorDetail'),
};

const errors = () => [
	null,
	undefined,
	new Error('boom'),
	Object.assign(new Error('tagged'), { typostReason: 'fetch-failed' }),
	{ message: 42 },
	{},
];

test('errorReason and errorDetail agree for every kind of error', () => {
	const a = errors();
	const b = errors();
	a.forEach((err, i) => {
		expect(worker.errorReason(b[i])).toBe(loader.errorReason(err));
		expect(worker.errorDetail(b[i])).toBe(loader.errorDetail(err));
	});
});

test('tagError tags the same way, and the innermost tag wins in both', () => {
	const a = errors();
	const b = errors();
	a.forEach((err, i) => {
		const fromLoader = loader.tagError(loader.tagError(err, 'decompress-failed'), 'parse-failed');
		const fromWorker = worker.tagError(worker.tagError(b[i], 'decompress-failed'), 'parse-failed');
		expect(worker.errorReason(fromWorker)).toBe(loader.errorReason(fromLoader));
	});
});
