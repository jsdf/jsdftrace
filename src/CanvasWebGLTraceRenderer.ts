import { RenderableMeasure } from "./calculateTraceLayout";
import { configureRetinaCanvas } from "./canvasUtils";
import { SCALE_OPTIONS } from "./constants";
import {
  Measure,
  RenderableTrace,
  getLayout,
  StateForLayout,
} from "./drawUtils";
import memoize from "memoize-one";
import memoizeWeak from "./memoizeWeak";
import {
  initWebGLRenderer,
  rectsToBuffers,
  RenderableRect,
  WebGLRenderBuffers,
} from "./webglRenderer";
import { getColorForMeasure } from "./webglColorUtils";
import { nullthrows } from "./nullthrows";
import Rect from "./Rect";

export const CANVAS_DRAW_TEXT = true;
export const CANVAS_DRAW_TEXT_MIN_PX = 35;
export const CANVAS_USE_FLOAT_DIMENSIONS = false;
export const CANVAS_OPAQUE = true;
export const CANVAS_SUPPORT_RETINA = true;
export const CANVAS_ZOOMING_TEXT_OPT = false;
export const CANVAS_TEXT_PADDING_PX = 2;
export const WEBGL_TEXT_TOP_PADDING_PX = -2;
export const WEBGL_TRUNCATE_BIAS = 20;
export const WEBGL_USE_GPU_TRANSFORM = true;

export type HandleStateChangeFn = (
  changes: Partial<{
    zoom: number;
    center: number;
    dragging: boolean;
    dragMoved: boolean;
    hovered: RenderableMeasure<Measure> | null | undefined;
    selection: RenderableMeasure<Measure> | null | undefined;
    zooming: boolean;
    verticalOffset: number;
  }>
) => void;

export type Props = {
  canvas: HTMLCanvasElement;
  // we want to preserve the absolute timestamps of the trace
  // but for scrolling and zooming, we want to constrain the
  // viewport to only the range of time that has data.
  renderableExtents: {
    startTime: number;
    endTime: number;
    maxY: number;
  };
  viewportWidth: number;
  viewportHeight: number;
  center: number;
  zoom: number;
  renderableTrace: RenderableTrace;
};

export class CanvasRendererBase {
  _canvas: HTMLCanvasElement | null = null;

  _framecounter = 0;
  _frameSecond = Math.floor(performance.now() / 1000);
  _lastFrameFPS = 0;
  _animationFrameID: number | null = null;

  props: Props;

  enqueueRender: () => void = () => {
    if (this._animationFrameID == null) {
      this._animationFrameID = requestAnimationFrame(() => {
        this._renderCanvasWithFramecount();
        this._animationFrameID = null;
      });
    }
  };

  _renderCanvasWithFramecount() {
    const curSecond = Math.floor(performance.now() / 1000);
    if (curSecond !== this._frameSecond) {
      this._lastFrameFPS = this._framecounter;
      this._framecounter = 0;
      this._frameSecond = curSecond;
    } else {
      this._framecounter++;
    }

    this._renderCanvas();
  }

  _getMaxStackIndex: (renderableTrace: RenderableTrace) => number = memoizeWeak(
    (renderableTrace) =>
      renderableTrace.reduce((acc, item) => Math.max(item.stackIndex, acc), 0)
  );

  __renderCanvasImpl(_canvas: HTMLCanvasElement) {
    // implement in subclass
  }

  _renderCanvas() {
    const canvas = this._canvas;
    if (canvas instanceof HTMLCanvasElement) {
      this.__renderCanvasImpl(canvas);
    }
  }

  constructor(props: Props) {
    this.props = props;
    this._canvas = props.canvas;
  }

  setProps(props: Props) {
    this.props = props;
  }

  didMount() {
    this.enqueueRender();
  }

  didUpdate() {
    this.enqueueRender();
  }
}

export class CanvasWebGLTraceRenderer extends CanvasRendererBase {
  _getCanvasGLContext = memoize((canvas: HTMLCanvasElement) => {
    if (CANVAS_SUPPORT_RETINA) {
      configureRetinaCanvas(canvas);
    }
    const gl = canvas.getContext("webgl");
    if (!gl) {
      throw new Error("couldnt use webgl");
    }
    return gl;
  });
  private _webglRender: null | ((buffers: WebGLRenderBuffers) => void);

  constructor(props: Props) {
    super(props);
    const gl = this._getCanvasGLContext(props.canvas);
    this._webglRender = initWebGLRenderer(gl);
  }

  setProps(props: Props) {
    super.setProps(props);

    // check changes to zoom and center, and if necessary, set needsUpdate
    this._needsUpdate = true;
  }

  _renderTextWebGL() {
    // TODO
  }

  _createBuffersForState(
    state: StateForLayout & {
      renderableTrace: RenderableTrace;
    }
  ) {
    const renderableRects: RenderableRect[] = [];

    for (let i = 0; i < state.renderableTrace.length; i++) {
      const measure = state.renderableTrace[i];
      const layout = getLayout(state, measure, 0 /*startY*/, SCALE_OPTIONS);
      if (!layout.inView) {
        continue;
      }

      const x = (layout.x / state.viewportWidth) * 2 - 1;
      const y = (layout.y / state.viewportHeight) * 2 - 1; // flip sign
      const width = (layout.width / state.viewportWidth) * 2;
      const height = (layout.height / state.viewportHeight) * 2;
      const rect = new Rect({
        position: { x, y },
        size: { x: width, y: height },
      });
      const color = getColorForMeasure(measure.measure);
      renderableRects.push({ rect, backgroundColor: color });
    }

    return rectsToBuffers(
      this._getCanvasGLContext(nullthrows(this._canvas)),
      renderableRects
    );
  }

  _buffers: WebGLRenderBuffers | null = null;
  _needsUpdate = true;

  _renderWebGL(canvas: HTMLCanvasElement) {
    if (!this._webglRender) {
      return;
    }
    let buffers = this._buffers;
    if (this._needsUpdate || !buffers) {
      // TODO: implement heuristic to determine if we need to update the buffers
      // ideally we don't send new geometry to the GPU every frame.
      // the trace doesn't change after initialization, but the viewport does,
      // and we only generate geometry for measures that are in view, with some
      // overdraw. similarly, the generated geometry depends on the zoom level,
      // as we do some level of detail optimization at lower zoom levels, and
      // scale the geometry coordinates to ensure numerical stability at higher
      // zoom levels.
      buffers = this._createBuffersForState(this.props);
    }
    this._buffers = buffers;
    this._webglRender(buffers);

    // TODO: implement rendering text as 2d canvas rendering to a webgl texture
  }

  __renderCanvasImpl(canvas: HTMLCanvasElement) {
    this._renderWebGL(canvas);
  }
}
