import * as Comlink from "comlink";
import type { TextRenderingWorker } from "./textRenderingWorker";
import range from "./range";
import { TextTextureAtlas } from "./textTextureAtlasRenderingUtils";

type TextRenderingWorkerPool = {
  renderText(
    strings: string[],
    textCanvasHeight?: number | null,
    pixelRatio?: number
  ): Promise<Map<string, ImageBitmap>>;
  createTextureAtlases(
    singleTextImages: Map<string, ImageBitmap>
  ): Promise<TextTextureAtlas[]>;
  release(): void;
};
export async function createTextRenderingWorkerPool(): Promise<TextRenderingWorkerPool> {
  // create workers
  let numWorkers = navigator.hardwareConcurrency || 1;
  const textRenderingWorkers = await Promise.all(
    range(0, numWorkers).map((): Comlink.Remote<TextRenderingWorker> => {
      const worker = new Worker(
        new URL("./textRenderingWorker", import.meta.url),
        {
          type: "module",
        }
      );

      return Comlink.wrap(worker);
    })
  );

  return {
    async renderText(
      strings: string[],
      textCanvasHeight?: number | null,
      pixelRatio: number = 1
    ) {
      // divide the work among the workers
      const chunkSize = Math.ceil(strings.length / textRenderingWorkers.length);
      const results = await Promise.all(
        textRenderingWorkers.map((worker, i) =>
          worker.renderText(
            strings.slice(i * chunkSize, (i + 1) * chunkSize),
            textCanvasHeight,
            pixelRatio
          )
        )
      );
      const mergedResult = new Map(
        results.flatMap((result) => Array.from(result.entries()))
      );
      return Comlink.transfer(mergedResult, [...mergedResult.values()]);
    },

    async createTextureAtlases(singleTextImages: Map<string, ImageBitmap>) {
      // divide the work among the workers
      const numWorkersToUse = 1;
      const chunkSize = Math.ceil(singleTextImages.size / numWorkersToUse);
      const results = await Promise.all(
        textRenderingWorkers
          .slice(0, numWorkersToUse)
          .map((worker, i) =>
            worker.createTextureAtlases(
              new Map(
                Array.from(singleTextImages.entries()).slice(
                  i * chunkSize,
                  (i + 1) * chunkSize
                )
              )
            )
          )
      );
      const mergedResult = results.flat();
      return Comlink.transfer(
        mergedResult,
        mergedResult.map((atlas) => atlas.image)
      );
    },

    release() {
      textRenderingWorkers.forEach((worker) => worker[Comlink.releaseProxy]());
    },
  };
}
