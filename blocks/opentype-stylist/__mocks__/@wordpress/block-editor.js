/**
 * Mock for @wordpress/block-editor
 * Used in Jest tests to simulate WordPress block editor components
 */

import React from 'react';

export const RichText = {
	Content: ({ tagName: Tag = 'div', value, className, style, ...props }) => (
		<Tag className={className} style={style} {...props}>
			{value}
		</Tag>
	)
};
