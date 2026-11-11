/**
 * Typography Stylist Block - OpenType feature category titles.
 *
 * Moved out of edit.js unchanged (#356). It was a closure inside Edit that
 * read nothing from it.
 */

import { __ } from '@wordpress/i18n';

// Category titles
const getCategoryTitle = (category) => {
	const titles = {
		'ligatures': __('Ligatures', 'typography-stylist'),
		'stylistic-sets': __('Stylistic Sets', 'typography-stylist'),
		'alternates': __('Swashes & Alternates', 'typography-stylist'),
		'decorative': __('Decorative', 'typography-stylist'),
		'numerals': __('Numerals & Figures', 'typography-stylist'),
		'capitals': __('Capitals & Case', 'typography-stylist'),
		'positional': __('Positional Forms', 'typography-stylist'),
		'super-sub': __('Superscript & Ordinals', 'typography-stylist'),
		'other': __('Other Features', 'typography-stylist')
	};
	return titles[category] || category;
};

export default getCategoryTitle;
