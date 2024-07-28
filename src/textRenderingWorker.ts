import * as Comlink from "comlink";

import {
  createTextureAtlases,
  generateImageBitmapsForTextAsync,
} from "./textTextureAtlasRenderingUtils";

const worker = {
  async renderText(
    strings: string[],
    textCanvasHeight?: number | null,
    pixelRatio: number = 1
  ) {
    return await generateImageBitmapsForTextAsync(
      strings,
      textCanvasHeight,
      pixelRatio
    );
  },

  createTextureAtlases,
};

Comlink.expose(worker);

export type TextRenderingWorker = typeof worker;
