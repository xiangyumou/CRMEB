/**
 * DIY v2 page decoration (spike S3). The editor library (Puck) is an
 * implementation detail of this folder: callers use `DecorEditor`, the
 * document conversion and the canvas-data provider, never `@puckeditor/core`.
 *
 * `DecorEditor` itself is exported from `./editor` and should be loaded with
 * `next/dynamic` — it carries the editor library and its CSS.
 */
export { DecorCanvasDataProvider, type DecorCanvasData, type DecorData } from './config';
export { DecorConversionError, toPageDocument, toPuckData } from './document';
