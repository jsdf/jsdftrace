import Rect from "./Rect";
const DEBUG_USE_SMALL_TEXTURES = true; // to make it easier to test the behavior of exceeding the texture size
const TEXTURE_SIZE_X = DEBUG_USE_SMALL_TEXTURES ? 1024 : 4096;
const TEXTURE_SIZE_Y = DEBUG_USE_SMALL_TEXTURES ? 256 : 4096;

export function generateImageBitmapsForText(
  strings: string[],
  textCanvasHeight?: number | null
): Map<string, ImageBitmap> {
  const canvas = new OffscreenCanvas(128, 128);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("couldnt use 2d context");
  }
  return new Map(
    strings.map((text) => {
      context.font = "11px sans-serif"; // set the font+size before measuring
      const metrics = context.measureText(text);
      canvas.width = metrics.width;
      // calculate the height of the text using advanced text metrics
      let actualHeight =
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      if (textCanvasHeight == null) {
        canvas.height = actualHeight;
      } else {
        canvas.height = textCanvasHeight;
      }
      console.log("text", text);
      console.log("metrics", metrics);
      console.log("canvas.width", canvas.width, "canvas.height", canvas.height);

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "orange";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "black";
      context.font = "11px sans-serif"; // this was reset by the clearRect
      context.fillText(text, 0, metrics.actualBoundingBoxAscent);

      const imageBitmap = canvas.transferToImageBitmap();

      return [text, imageBitmap];
    })
  );
}

type TextTextureAtlas = {
  image: ImageBitmap;
  // RectInit is {position:{x:number,y:number},size:{x:number,y:number}}
  mapping: Map<string, Rect>;
};

export function createTextureAtlases(
  singleTextImages: Map<string, ImageBitmap>
): TextTextureAtlas[] {
  const textureAtlases: TextTextureAtlas[] = [];
  let canvas = new OffscreenCanvas(TEXTURE_SIZE_X, TEXTURE_SIZE_Y);
  let context = canvas.getContext("2d");
  if (!context) {
    throw new Error("couldnt use 2d context");
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
        throw new Error("Image too large to fit in texture atlas");
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
  textCanvasHeight?: number | null
) {
  const singleTextImages = generateImageBitmapsForText(
    strings,
    textCanvasHeight
  );
  // pack the image bitmaps into one or more texture atlases, and return them
  // along with the mapping from text labels to texture coordinates
  return createTextureAtlases(singleTextImages);
}
