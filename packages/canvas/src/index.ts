/**
 * @kalketa/canvas — drawings placed in the sheet like pictures.
 *
 * The main program knows a canvas only through this module: a picture line
 * pointing at canvases/<name>.json, the scene drawn as SVG, and the editor
 * from '@kalketa/canvas/editor'. This part has no DOM and no dependency on
 * the other packages, so the command line can draw canvases too.
 */

export * from './scene.js';
export * from './edit.js';
