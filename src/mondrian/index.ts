// Mondrian Rendering Library
// Core exports for the mondrian rendering library

export {  Mondrian } from './Mondrian';
export { default as Rect } from './Rect';
export { default as Vec2d } from './Vec2d';
export type { Vec2dInit } from './Vec2d';
export type { RectInit } from './Rect';

// WebGL Rendering
export {
  initWebGLRenderer,
  type RenderableRect,
  type WebGLRenderer,
  BackgroundPosition,
} from './webglRenderer';

// Colors
export type { Color } from './webglColorUtils';
export { getRandomColor } from './webglColorUtils';

// Text Rendering
export {
  createTextureAtlases,
  debugDrawTextureAtlases,
  generateImageBitmapsForTextAsync,
  generateImageBitmapsForText,
  type TextTextureAtlas,
} from './textTextureAtlasRenderingUtils';

export {
  createTextRenderingWorkerPool,
} from './textRenderingWorkerHost';

// Utilities
export { nullthrows } from './nullthrows';
export { default as memoizeWeak } from './memoizeWeak';
export { default as range } from './range';
