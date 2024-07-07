import calculateTraceLayout, {
  RenderableMeasure,
} from "./calculateTraceLayout";
import { CanvasWebGLTraceRenderer } from "./CanvasWebGLTraceRenderer";
import { Measure } from "./drawUtils";

export default class TraceViewer {
  renderableTrace: Array<RenderableMeasure<Measure>>;
  state: {
    selection: RenderableMeasure<Measure> | null;
    zoom: number;
    center: number;
    dragging: boolean;
    dragMoved: boolean;
    zooming: boolean;
    hovered: RenderableMeasure<Measure> | null;
  };

  setState(
    state: Partial<{
      selection: RenderableMeasure<Measure> | null;
      zoom: number;
      center: number;
      dragging: boolean;
      dragMoved: boolean;
      zooming: boolean;
      hovered: RenderableMeasure<Measure> | null;
    }>
  ): void {
    this.state = { ...this.state, ...state };
  }

  renderer: CanvasWebGLTraceRenderer;

  constructor(traceData: Measure[], private canvas: HTMLCanvasElement) {
    this.renderableTrace = calculateTraceLayout(traceData);
    this.state = {
      selection: null,
      zoom: 1,
      center: 0,
      dragging: false,
      dragMoved: false,
      zooming: false,
      hovered: null,
    };

    this.renderer = new CanvasWebGLTraceRenderer({
      canvas: this.canvas,
      renderableTrace: this.renderableTrace,
      center: this.state.center,
      zoom: this.state.zoom,
      viewportWidth: this.canvas.width,
      viewportHeight: this.canvas.height,
      // constrain rendered extends to the range of the trace data
      renderableExtents: this.renderableTrace.reduce(
        (acc, item) => ({
          maxY: Math.max(acc.maxY, item.stackIndex),
          startTime: Math.min(acc.startTime, item.measure.startTime),
          endTime: Math.max(
            acc.endTime,
            item.measure.startTime + item.measure.duration
          ),
        }),
        {
          startTime: Infinity,
          endTime: -Infinity,
          maxY: 0,
        }
      ),
    });
  }
}
