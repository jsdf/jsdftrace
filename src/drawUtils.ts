import type { RenderableMeasure } from "./calculateTraceLayout";
import { ScaleOptions } from "./constants";

import memoizeWeak from "./mondrian/memoizeWeak";
import { getRandomColor, type Color } from "./mondrian/webglColorUtils";

export type StateForLayout = {
  center: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
};

export type Measure = {
  name: string;
  startTime: number;
  duration: number;
  group?: string;
  args?: {};
};

export type Layout = {
  width: number;
  height: number;
  x: number;
  y: number;
  inView: boolean;
};

export type RenderableTrace = Array<RenderableMeasure<Measure>>;

export const getColorForMeasure: (measure: Measure) => Color = memoizeWeak(
  (_measure) => getRandomColor()
);

export function getLayout(
  state: StateForLayout,
  measure: RenderableMeasure<Measure>,
  startY: number,
  scaleOptions: ScaleOptions
) {
  const centerOffset = state.center;

  const width = Math.max(
    measure.measure.duration * scaleOptions.pxPerMS * state.zoom -
      scaleOptions.barXGutter,
    0
  );
  const height = scaleOptions.barHeight;
  const x =
    (measure.measure.startTime - centerOffset) *
      scaleOptions.pxPerMS *
      state.zoom +
    state.viewportWidth / 2;
  const y = measure.stackIndex * (height + scaleOptions.barYGutter) + startY;

  return {
    width,
    height,
    x,
    y,
    inView: !(x + width < 0 || state.viewportWidth < x),
  };
}

export class DrawUtilsWithCache {
  _getMeasureColor: (measure: Measure) => Color = memoizeWeak((_measure) =>
    getRandomColor()
  );

  _getMeasureColorRGBA(measure: Measure, opacity: number) {
    const color = this._getMeasureColor(measure);
    return `rgba(${color[0]},${color[1]},${color[2]},${opacity})`;
  }

  _getMeasureColorRGB: (measure: Measure) => string = memoizeWeak((measure) => {
    const color = this._getMeasureColor(measure);
    return `rgb(${color[0]},${color[1]},${color[2]})`;
  });

  _getMeasureHoverColorRGB: (measure: Measure) => string = memoizeWeak(
    (measure) => {
      const color = this._getMeasureColor(measure);
      return `rgb(${Math.min(color[0] + 20, 255)},${Math.min(
        color[1] + 20,
        255
      )},${Math.min(color[2] + 20, 255)})`;
    }
  );

  _getMaxStackIndex: (renderableTrace: RenderableTrace) => number = memoizeWeak(
    (renderableTrace) =>
      renderableTrace.reduce((acc, item) => Math.max(item.stackIndex, acc), 0)
  );
}

function truncateText(text: string, endSize: number) {
  return `${text.slice(0, endSize)}\u{2026}${text.slice(
    text.length - 1 - endSize
  )}`;
}

export function fitText(
  measureFn: (label: string) => number,
  label: string,
  textWidth: number
) {
  // binary search for minimum amount of truncation to make text fit
  let labelTrimmed = label;
  let l = 0;
  let r = label.length - 1;
  if (measureFn(labelTrimmed) > textWidth) {
    while (l < r) {
      let m = l + Math.floor((r - l) / 2);

      labelTrimmed = truncateText(label, m);

      if (measureFn(labelTrimmed) > textWidth) {
        r = m - 1;
      } else {
        l = m + 1;
      }
    }

    // this isn't quite right but close enough
    labelTrimmed = truncateText(label, r);
  }
  return labelTrimmed;
}
