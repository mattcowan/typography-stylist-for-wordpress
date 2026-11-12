/**
 * The rules that tie a rem fit-to-width block's stored ratios to its line
 * font sizes (#235, buildFitFontSize() in blocks/typography-stylist/utils.js).
 *
 * The measured numbers change with the fonts of the machine, so the
 * saved-markup spec does not compare them with the fixture. It checks these
 * rules instead, on the content the editor writes:
 *
 * - each line's ratio R in `calc(R * var(--typost-fit-width, 100cqi))` is
 *   fitLineSizes[i];
 * - each line's word cap C in `calc(C * 100cqi)` is fitWordSizes[i] when
 *   that is larger than R, else R (the code's `wordRatio > ratio ? …`);
 * - with `wordLonger`, every line has a word cap above its ratio: true for
 *   a line of two or more words, whose widest word is narrower than the
 *   line.
 *
 * @param {string}  html       Post content with one fit block.
 * @param {Object}  [options]
 * @param {boolean} [options.wordLonger] Also require fitWordSizes[i] > R.
 * @return {string[]} The rules that do not hold; empty when all hold.
 */
function fitInvariantProblems(html, { wordLonger = false } = {}) {
	const problems = [];
	const comment = html.match(/<!-- wp:typost\/block (\{.*?\}) -->/);
	if (!comment) {
		return [ 'no Typography Stylist block comment' ];
	}
	const attributes = JSON.parse(comment[1]);
	const lineSizes = attributes.fitLineSizes || [];
	const wordSizes = attributes.fitWordSizes || [];
	const lines = [ ...html.matchAll(/<span class="typost-line" style="font-size:min\(calc\(([^ ]+) \* var\(--typost-fit-width, 100cqi\)\), calc\(([^ ]+) \* 100cqi\)\)">/g) ];
	if (!lines.length) {
		problems.push('no rem fit line');
	}
	if (lines.length !== lineSizes.length || lines.length !== wordSizes.length) {
		problems.push(`${lines.length} lines, ${lineSizes.length} fitLineSizes, ${wordSizes.length} fitWordSizes`);
	}
	lines.forEach(([ , ratioText, capText ], i) => {
		const ratio = Number(ratioText);
		const cap = Number(capText);
		const line = Number(lineSizes[i]);
		const word = Number(wordSizes[i]);
		if (!(ratio > 0)) {
			problems.push(`line ${i + 1}: ratio ${ratioText} is not above 0`);
		}
		if (ratio !== line) {
			problems.push(`line ${i + 1}: ratio ${ratio} is not fitLineSizes ${line}`);
		}
		const expectedCap = word > ratio ? word : ratio;
		if (cap !== expectedCap) {
			problems.push(`line ${i + 1}: word cap ${cap} is not ${expectedCap} (fitWordSizes ${word}, ratio ${ratio})`);
		}
		if (wordLonger && !(word > ratio)) {
			problems.push(`line ${i + 1}: fitWordSizes ${word} is not above the ratio ${ratio}`);
		}
	});
	return problems;
}

module.exports = { fitInvariantProblems };
