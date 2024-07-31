// @flow

import debounce from "debounce";
import type { ScaleOptions } from "./constants";
import type { HandleStateChangeFn } from "./CanvasWebGLTraceRenderer";

export type MouseEventWithTarget = {
  currentTarget: {
    getBoundingClientRect: () => {
      left: number;
      top: number;
    };
  };
  clientX: number;
  clientY: number;
};

export function configureRetinaCanvas(canvas: HTMLCanvasElement) {
  // hidpi canvas: https://www.html5rocks.com/en/tutorials/canvas/hidpi/

  // Get the device pixel ratio, falling back to 1.
  var dpr = window.devicePixelRatio || 1;
  // Get the size of the canvas in CSS pixels.
  var rect = canvas.getBoundingClientRect();
  // Give the canvas pixel dimensions of their CSS
  // size * the device pixel ratio.
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  return dpr;
}

export function getCanvasMousePos(
  event: MouseEvent | WheelEvent,
  canvas: Node | null | void
): { canvasMouseX: number; canvasMouseY: number } {
  const rect =
    canvas instanceof HTMLCanvasElement
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0 };
  const canvasMouseX = event.clientX - rect.left;
  const canvasMouseY = event.clientY - rect.top;

  return { canvasMouseX, canvasMouseY };
}

export class CanvasWheelHandler {
  _clampZoom(updated: number, minZoom: number, maxZoom: number) {
    return Math.max(minZoom, Math.min(maxZoom, updated));
  }

  _endWheel = debounce((onStateChange: HandleStateChangeFn) => {
    onStateChange({
      zooming: false,
    });
  }, 100);

  handleWheel = (
    event: WheelEvent,
    canvas: Node | null | void,
    props: {
      viewportWidth: number;
      center: number;
      minZoom: number;
      maxZoom: number;
      zoom: number;
      onStateChange: HandleStateChangeFn;
    },
    scaleOptions: ScaleOptions
  ) => {
    event.preventDefault();
    event.stopPropagation();
    // zoom centered on mouse
    const { canvasMouseX } = getCanvasMousePos(event, canvas);
    const mouseOffsetFromCenter = canvasMouseX - props.viewportWidth / 2;
    const updatedZoom = props.zoom * (1 + 0.005 * -event.deltaY);
    const updatedCenter =
      props.center +
      // offset to time space before zoom
      mouseOffsetFromCenter / scaleOptions.pxPerMS / props.zoom -
      // offset to time space after zoom
      mouseOffsetFromCenter / scaleOptions.pxPerMS / updatedZoom;

    if (
      this._clampZoom(updatedZoom, props.minZoom, props.maxZoom) !== props.zoom
    ) {
      props.onStateChange({
        zooming: true,
        zoom: updatedZoom,
        center: updatedCenter,
      });
      this._endWheel(props.onStateChange);
    }
  };
}
