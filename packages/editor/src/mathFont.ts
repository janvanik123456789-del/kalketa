/**
 * The math font that comes with the program, so formulas look right where the system has none (Linux; Cambria Math goes
 * first where it is installed). Kept in the code as data: a printout is a page of its own and needs the font inside it.
 */

import font from '@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff2?inline';

export const MATH_FONT_CSS = `@font-face { font-family: "STIX Two Math"; font-style: normal; font-weight: 400; src: url(${font}) format("woff2"); }`;

/** A printout with the font inside its first stylesheet. */
export const withMathFont = (html: string): string => html.replace('</style>', () => `${MATH_FONT_CSS}\n</style>`);
