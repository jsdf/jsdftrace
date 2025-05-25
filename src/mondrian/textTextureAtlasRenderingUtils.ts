import Rect from './Rect';
const DEBUG_USE_SMALL_TEXTURES = false; // to make it easier to test the behavior of exceeding the texture size
const TEXTURE_SIZE_X = DEBUG_USE_SMALL_TEXTURES ? 1024 : 2048;
const TEXTURE_SIZE_Y = DEBUG_USE_SMALL_TEXTURES ? 256 : 2048;
const font = '11px "Lucida Grande", sans-serif';
export function generateImageBitmapsForText(
  strings: string[],
  textCanvasHeight?: number | null,
  pixelRatio: number = 1
): Map<string, ImageBitmap> {
  const canvas = new OffscreenCanvas(128, 128);
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
    desynchronized: true,
  });
  if (!context) {
    throw new Error('couldnt use 2d context');
  }

  // Set actual size in memory (scaled to account for extra pixel density).
  const scale = pixelRatio; // Change to 1 on retina screens to see blurry canvas.

  return new Map(
    strings.map((text) => {
      // Normalize coordinate system to use logical pixels.
      context.scale(scale, scale);

      context.font = font; // set the font+size before measuring
      const metrics = context.measureText(text);
      canvas.width = Math.floor(metrics.width * scale);

      // calculate the height of the text using advanced text metrics
      let actualHeight =
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      let heightToUse =
        textCanvasHeight == null ? actualHeight : textCanvasHeight;
      canvas.height = Math.floor(heightToUse * scale);

      context.clearRect(0, 0, canvas.width, canvas.height);
      // Normalize coordinate system to use logical pixels.
      context.scale(scale, scale);

      context.fillStyle = 'transparent';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'black';
      context.font = font; // this was reset by the clearRect
      context.fillText(text, 0, metrics.actualBoundingBoxAscent);

      const imageBitmap = canvas.transferToImageBitmap();

      return [text, imageBitmap];
    })
  );
}

function nextMacrotask() {
  return new Promise((resolve) => setTimeout(resolve));
}

export async function generateImageBitmapsForTextAsync(
  strings: string[],
  textCanvasHeight?: number | null,
  pixelRatio: number = 1,
  chunkSize: number = 10, // how many to process per yield
  yieldBetweenChunks: boolean = false
): Promise<Map<string, ImageBitmap>> {
  const results = new Map();
  for (let i = 0; i < strings.length; i += chunkSize) {
    const chunk = strings.slice(i, i + chunkSize);
    const chunkResults = generateImageBitmapsForText(
      chunk,
      textCanvasHeight,
      pixelRatio
    );
    for (const [key, value] of chunkResults) {
      results.set(key, value);
    }
    if (yieldBetweenChunks) {
      await nextMacrotask();
    }
  }
  return results;
}

export type TextTextureAtlas = {
  image: ImageBitmap;
  // RectInit is {position:{x:number,y:number},size:{x:number,y:number}}
  mapping: Map<string, Rect>;
};

export function createTextureAtlases(
  singleTextImages: Map<string, ImageBitmap>
): TextTextureAtlas[] {
  const textureAtlases: TextTextureAtlas[] = [];
  let canvas = new OffscreenCanvas(TEXTURE_SIZE_X, TEXTURE_SIZE_Y);
  let context = canvas.getContext('2d', {
    willReadFrequently: true,
    desynchronized: true,
  });
  if (!context) {
    throw new Error('couldnt use 2d context');
  }

  const inputs = Array.from(singleTextImages.entries());
  // produce n texture atlases as required to contain the input images
  let currentInputIndex = 0;
  while (currentInputIndex < inputs.length) {
    // reset for a new texture atlas
    context.clearRect(0, 0, TEXTURE_SIZE_X, TEXTURE_SIZE_Y);
    let currentAtlas = new Map<string, Rect>();
    let currentX = 0;
    let currentY = 0;
    let currentRowHeight = 0;

    // insert as many images as can fit in this texture atlas, until we run out of images
    while (
      currentInputIndex < inputs.length &&
      currentY + currentRowHeight < TEXTURE_SIZE_Y
    ) {
      const [text, imageBitmap] = inputs[currentInputIndex];
      if (
        imageBitmap.height > TEXTURE_SIZE_Y ||
        imageBitmap.width > TEXTURE_SIZE_X
      ) {
        throw new Error('Image too large to fit in texture atlas');
      }
      if (currentX + imageBitmap.width > TEXTURE_SIZE_X) {
        // width of this image extends past the edge of the canvas,
        // move to the next row
        currentY += currentRowHeight;
        currentX = 0;
        currentRowHeight = 0;
      }
      if (currentY + imageBitmap.height > TEXTURE_SIZE_Y) {
        // height of this image extends past the edge of the canvas,
        // move to the next texture atlas
        break;
      }
      // place the image on the canvas
      context.drawImage(imageBitmap, currentX, currentY);
      currentAtlas.set(
        text,
        new Rect({
          position: { x: currentX, y: currentY },
          size: { x: imageBitmap.width, y: imageBitmap.height },
        })
      );
      // account for space taken by this image
      currentX += imageBitmap.width;
      currentRowHeight = Math.max(currentRowHeight, imageBitmap.height);
      currentInputIndex++;
    }
    // done with this texture atlas
    const image = canvas.transferToImageBitmap();
    textureAtlases.push({ image, mapping: currentAtlas });
  }
  // done creating texture atlases
  return textureAtlases;
}

export function createTextTextureAtlases(
  strings: string[],
  textCanvasHeight?: number | null,
  pixelRatio: number = 1
) {
  const singleTextImages = generateImageBitmapsForText(
    strings,
    textCanvasHeight,
    pixelRatio
  );
  // pack the image bitmaps into one or more texture atlases, and return them
  // along with the mapping from text labels to texture coordinates
  return createTextureAtlases(singleTextImages);
}

// display each texture atlas in a separate canvas for debugging
export function debugDrawTextureAtlases(
  textureAtlases: TextTextureAtlas[],
  container: HTMLElement
) {
  textureAtlases.forEach((textureAtlas, i) => {
    const h1 = document.createElement('h2');
    h1.textContent = 'Texture Atlas ' + i;
    const div = document.createElement('div');
    div.append(h1);
    container.appendChild(div);
    const canvas = document.createElement('canvas');
    canvas.style.border = '1px solid black';
    div.appendChild(canvas);
    canvas.width = textureAtlas.image.width;
    canvas.height = textureAtlas.image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('couldnt get 2d context');
    }
    ctx.drawImage(textureAtlas.image, 0, 0);
    textureAtlas.mapping.forEach((rect, label) => {
      ctx.strokeStyle = 'red';
      ctx.strokeRect(
        rect.position.x,
        rect.position.y,
        rect.size.x,
        rect.size.y
      );
      ctx.font = '10px sans-serif';
      ctx.fillStyle = 'white';
      ctx.fillText(
        `${label.slice(3)} {${rect.size.x}x${rect.size.y}}`,
        rect.position.x,
        rect.position.y + 18
      );
    });
    const details = document.createElement('details');
    details.innerHTML = `<summary>rects</summary><pre>${JSON.stringify(
      [...textureAtlas.mapping.entries()],
      null,
      2
    )}</pre>`;
    div.appendChild(details);
  });
}
