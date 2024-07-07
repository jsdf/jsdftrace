export const MIN_ZOOM = 0.2; // TODO: determine from trace extents
export const MAX_ZOOM = 100;

export type ScaleOptions = {
  pxPerMS: number;
  barXGutter: number;
  barYGutter: number;
  barHeight: number;
};

export const SCALE_OPTIONS: ScaleOptions = {
  pxPerMS: 1,
  barXGutter: 1,
  barYGutter: 1,
  barHeight: 16,
};

export const TOOLTIP_OFFSET = 8;
export const TOOLTIP_HEIGHT = 20;
