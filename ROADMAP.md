# OpenType Stylist - Roadmap

This document outlines potential future enhancements for the OpenType Stylist plugin. These are ideas under consideration and are not committed features.

## Table of Contents

- [Font Management Enhancements](#font-management-enhancements)
- [Typography Features](#typography-features)
- [User Experience](#user-experience)
- [Performance & Optimization](#performance--optimization)
- [Integration & Compatibility](#integration--compatibility)

---

## Font Management Enhancements

### Per-Font-Family Fallbacks
**Priority**: High
**Status**: Planned

**Current Behavior:**
- Fallbacks are configured at the kit/project level
- One fallback string applies to all font families in an uploaded kit or Adobe Fonts project
- Example: A kit with "Playfair Display" and "Playfair Display SC" uses the same fallbacks for both

**Proposed Enhancement:**
- Allow configuring fallbacks per font family within a kit
- UI shows one fallback input field for each unique font family
- Data structure: `fallbacks: { "Playfair Display": "Georgia, serif", "Playfair Display SC": "Georgia, serif" }`

**Benefits:**
- More granular control over font stacks
- Better fallback matching (serif fonts with serif fallbacks, sans-serif with sans-serif, etc.)
- Improved typography precision for multi-family kits

**Implementation Complexity:** High
- Requires data structure migration
- Complex UI changes for editing
- Updates needed across REST API, sanitization, and CSS generation
- Need to handle backward compatibility

**Estimated Effort:** 2-3 weeks

---

### Variable Font Support
**Priority**: Medium
**Status**: Under Consideration

**Description:**
- Support for variable fonts with OpenType features
- UI controls for font-variation-settings alongside font-feature-settings
- Integration with WordPress' existing variable font support

**Benefits:**
- Access to modern variable font technology
- More typographic control with fewer font files
- Better performance (one file instead of multiple weights)

---

### Font Subsetting & Optimization
**Priority**: Medium
**Status**: Under Consideration

**Description:**
- Automatic font subsetting for uploaded kits
- Remove unused glyphs to reduce file size
- Unicode range optimization

**Benefits:**
- Faster page loads
- Reduced bandwidth usage
- Better Core Web Vitals scores

---

## Typography Features

### Extended OpenType Feature Support
**Priority**: Medium
**Status**: Planned

**Current Features:**
- Ligatures (liga, dlig, calt)
- Stylistic Sets (ss01-ss20)
- Alternates (swsh, cswh, salt, titl, ornm)

**Proposed Additions:**
- Fractions (frac, afrc)
- Numerals (lnum, onum, pnum, tnum)
- Small Caps (smcp, c2sc)
- Superscript/Subscript (sups, subs)
- Ordinals (ordn)
- Case-sensitive forms (case)

**Implementation:** Extend `get_available_features()` method

---

### Feature Presets Library
**Priority**: Low
**Status**: Idea Stage

**Description:**
- Pre-built feature combinations for common use cases
- Community-contributed presets
- Import/export preset functionality

**Examples:**
- "Elegant Headlines" - dlig + ss01 + swsh
- "Clean Body Text" - liga + calt
- "Old Style Numbers" - onum + pnum

---

## User Experience

### Live Preview in Block Editor
**Priority**: High
**Status**: Planned

**Description:**
- Real-time preview of OpenType features as you toggle them
- No need to apply settings to see the result
- Visual feedback for feature availability

**Benefits:**
- Better user experience
- Faster workflow
- Easier to experiment with features

---

### Font Feature Detection
**Priority**: Medium
**Status**: Under Consideration

**Description:**
- Automatically detect which features are available in each font
- Show only supported features in the UI
- Indicate when a feature has no effect

**Benefits:**
- Less confusion for users
- Cleaner interface
- Better guidance

---

### Bulk Feature Application
**Priority**: Low
**Status**: Idea Stage

**Description:**
- Apply the same OpenType features to multiple headings at once
- Site-wide feature defaults
- Template-based feature application

---

## Performance & Optimization

### Advanced Caching Strategies
**Priority**: Medium
**Status**: Under Consideration

**Description:**
- More intelligent font loading
- Browser caching hints
- Preload/prefetch optimization
- Integration with WordPress caching plugins

---

### Critical CSS Integration
**Priority**: Low
**Status**: Idea Stage

**Description:**
- Extract font-face declarations for critical CSS
- Above-the-fold font loading
- Integration with performance plugins

---

## Integration & Compatibility

### Theme Builder Integration
**Priority**: Medium
**Status**: Under Consideration

**Description:**
- Direct integration with popular page builders
  - Elementor
  - Beaver Builder
  - Divi
- Custom controls in builder interfaces

---

### Full Site Editing (FSE) Support
**Priority**: High
**Status**: Planned

**Description:**
- Deep integration with WordPress Full Site Editing
- Global styles support
- Theme.json integration
- Template part typography controls

---

### WooCommerce Integration
**Priority**: Low
**Status**: Idea Stage

**Description:**
- Typography controls for product titles
- Category headings
- Shop page optimization

---

## How to Request Features

Have an idea for a new feature? We'd love to hear from you!

1. **Check this roadmap** to see if it's already planned
2. **Open a GitHub issue** with the "enhancement" label
3. **Describe your use case** - help us understand why you need it
4. **Provide examples** if possible

**Note:** Features on this roadmap are not guaranteed and timelines are estimates. Priorities may change based on user feedback and technical considerations.

---

## Contributing

Interested in helping implement these features?

- Check out [CLAUDE.md](CLAUDE.md) for development guidelines
- Review [TESTING.md](TESTING.md) for testing practices
- Read [DOCUMENTATION.md](DOCUMENTATION.md) for architecture overview

We welcome pull requests for any roadmap items!

---

**Last Updated:** December 31, 2025
**Plugin Version:** 1.0.6
