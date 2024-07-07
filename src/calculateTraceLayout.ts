export type MeasureShape = {
  startTime: number;
  duration: number;
};

// renderable trace has vertical layout precaluated:
// overlapping measures stack vertically based on start time
export type RenderableMeasure<TMeasure extends MeasureShape> = {
  stackIndex: number;
  measure: TMeasure;
};

const EDGETYPES_SORT_WEIGHTS = {
  end: 0,
  start: 1,
};

type Edge<TMeasure extends MeasureShape> = {
  type: "start" | "end";
  time: number;
  measure: TMeasure;
};
export default function calculateTraceLayout<TMeasure extends MeasureShape>(
  trace: Array<TMeasure>
): Array<RenderableMeasure<TMeasure>> {
  // we need to find all overlapping measures, so we will create points
  // representing the start and end of each measure, then sort the points by
  // point time, breaking ties by putting points representing closing measures
  // first (in reverse order of start time), then opening measures (in order of
  // end time)

  const edges: Array<Edge<TMeasure>> = trace
    // .slice(0, 3)
    .reduce((edges: Array<Edge<TMeasure>>, measure: TMeasure) => {
      // zero size measures are omitted from the trace
      if (measure.duration > 0) {
        edges.push({ type: "start", time: measure.startTime, measure } as {
          type: "start";
          time: number;
          measure: TMeasure;
        });
        edges.push({
          type: "end",
          time: measure.startTime + measure.duration,
          measure,
        });
      }
      return edges;
    }, [])
    .sort((a: Edge<TMeasure>, b: Edge<TMeasure>): number => {
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      // break ties between different types
      if (a.type !== b.type) {
        return EDGETYPES_SORT_WEIGHTS[a.type] - EDGETYPES_SORT_WEIGHTS[b.type];
      }

      // break ties between same type
      switch (a.type) {
        case "end":
          // start time desc (so inner measures close first)
          return b.measure.startTime - a.measure.startTime;
        case "start":
          // end time desc (so outer measures open first)
          return (
            b.measure.startTime +
            b.measure.duration -
            (a.measure.startTime + a.measure.duration)
          );
        default:
          throw new Error("invalid edge");
      }
    });

  // to implement the trace layout we need to calculate the vertical offset of
  // each measure as they stack up. we want to place a measure at the highest
  // offset for which there isn't a currently open measure. to do so we keep an
  // array of currently open measures
  const renderableTrace: Array<RenderableMeasure<TMeasure>> = [];
  const openStack = [];
  const measuresStackIndexes = new Map();
  for (var i = 0; i < edges.length; i++) {
    const edge = edges[i];
    switch (edge.type) {
      case "start":
        const nextStackIndex = openStack.length;
        renderableTrace.push({
          stackIndex: nextStackIndex,
          measure: edge.measure,
        });
        measuresStackIndexes.set(edge.measure, nextStackIndex);
        openStack.push(edge.measure);
        break;
      case "end":
        const stackIndexToRemove = measuresStackIndexes.get(edge.measure);
        // should never be null
        if (stackIndexToRemove != null) {
          openStack[stackIndexToRemove] = null;
        } else {
          throw new Error("couldn't find measure to remove");
        }
        // truncate stack
        let newLength = openStack.length;
        while (newLength > 0 && openStack[newLength - 1] == null) {
          newLength--;
        }
        if (openStack.length !== newLength) {
          openStack.length = newLength;
        }
        break;
      default:
        throw new Error("invalid edge");
    }
  }

  return renderableTrace;
}
