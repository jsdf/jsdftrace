import './style.css';
import { BackgroundPosition, initWebGLRenderer } from './mondrian/webglRenderer';
import Rect from './mondrian/Rect';
import { getRandomColor } from './mondrian/webglColorUtils';
import { mat4, vec2 } from 'gl-matrix';

import * as datgui from 'dat.gui';
import { createTextRenderingWorkerPool } from './mondrian/textRenderingWorkerHost';
import Vec2d from './mondrian/Vec2d';
import { getCanvasMousePos } from './canvasUtils';
// import exampledata from "./exampledata.js";

import createFPSCounter from './FPSCounter';
import range from './mondrian/range';
import type { TextTextureAtlas } from './mondrian/textTextureAtlasRenderingUtils';

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);
canvas.width = (window.innerWidth - 10) * devicePixelRatio;
canvas.height = (window.innerHeight - 10) * devicePixelRatio;
canvas.style.width = `${canvas.width / devicePixelRatio}px`;
canvas.style.height = `${canvas.height / devicePixelRatio}px`;

const mouseState = {
  pressed: 0,
  x: 0,
  y: 0,
};
canvas.addEventListener('mousedown', (e) => {
  mouseState.pressed = 1;
  const mousePos = getCanvasMousePos(e, canvas);
  mouseState.x = mousePos.canvasMouseX;
  mouseState.y = mousePos.canvasMouseY;
});
canvas.addEventListener('mousemove', (e) => {
  const mousePos = getCanvasMousePos(e, canvas);
  mouseState.x = mousePos.canvasMouseX;
  mouseState.y = mousePos.canvasMouseY;
});
function expDecay(a: number, b: number, decay: number, dt: number) {
  return b + (a - b) * Math.exp(-decay * dt);
}

const SPAN_HEIGHT = 20 * devicePixelRatio; //px
const numRects = 10000;

const numLabels = 1000;

const generateRandomLabel = (() => {
  const words = [
    'Apple',
    'Banana',
    'Cherry',
    'Date',
    'Elderberry',
    'Fig',
    'Grape',
    'Honeydew',
    'Kiwi',
    'Lemon',
    'Mango',
    'Nectarine',
    'Orange',
    'Papaya',
    'Quince',
    'Raspberry',
    'Strawberry',
    'Tangerine',
    'Ugli',
    'Vanilla',
    'Watermelon',
    'Xigua',
    'Yellow',
    'Zucchini',
  ];
  function randomWord() {
    return words[Math.floor(Math.random() * words.length)];
  }
  return function generateRandomLabel() {
    return randomWord() + randomWord() + randomWord();
  };
})();

const labels = range(0, numLabels).map(generateRandomLabel);

function imageBitmapToWebGLTexture(
  imageBitmap: ImageBitmap,
  gl: WebGL2RenderingContext
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('couldnt create texture');
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.bindTexture(gl.TEXTURE_2D, texture);

  // copy the image data into the texture
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    imageBitmap
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  return texture;
}

const rectInputs = range(0, numRects).map((i) => {
  return {
    rect: new Rect({
      position: {
        x: (Math.random() - 0.5) * 10 * SPAN_HEIGHT * 5,
        y: (Math.random() - 0.5) * SPAN_HEIGHT * 10,
      },
      size: { x: SPAN_HEIGHT * 3, y: SPAN_HEIGHT },
    }),
    label: labels[i % labels.length],
  };
});

console.log(rectInputs);

const options = {
  translate: { x: 0, y: 0 },
  zoom: 4,
  zoomInterp: 4,
  textureTranslate: { x: 16, y: 16 },
};

const gui = new datgui.GUI();
const viewTransformFolder = gui.addFolder('View Transform');
viewTransformFolder.open();
viewTransformFolder.add(options.translate, 'x').min(-1).max(1).step(0.01);
viewTransformFolder.add(options.translate, 'y').min(-1).max(1).step(0.01);
viewTransformFolder.add(options, 'zoom').min(0.01).max(16).step(0.01);
viewTransformFolder.add(options, 'zoomInterp').min(0.01).max(16).step(0.01);
const textureTransformFolder = gui.addFolder('Texture Transform');
textureTransformFolder.open();
textureTransformFolder
  .add(options.textureTranslate, 'x')
  .min(-100)
  .max(100)
  .step(0.1);
textureTransformFolder
  .add(options.textureTranslate, 'y')
  .min(-100)
  .max(100)
  .step(0.1);

const fpsCounterOnFrame = createFPSCounter();

function initRenderer(
  gl: WebGL2RenderingContext,
  textureAtlases: TextTextureAtlas[]
) {
  // debugDrawTextureAtlases(textureAtlases);

  const labelsInTextureAtlases = new Map<
    string,
    {
      texture: WebGLTexture;
      textureImageSize: Vec2d;
      textureImagePieceRect: Rect;
    }
  >();
  textureAtlases.forEach((textureAtlas) => {
    const webGLTextures = new Map();
    Array.from(textureAtlas.mapping.entries()).forEach(([label, rect]) => {
      let texture = webGLTextures.get(textureAtlas.image);
      if (!texture) {
        texture = imageBitmapToWebGLTexture(textureAtlas.image, gl);
        webGLTextures.set(textureAtlas.image, texture);
      }

      labelsInTextureAtlases.set(label, {
        texture,
        textureImageSize: new Vec2d({
          x: textureAtlas.image.width,
          y: textureAtlas.image.height,
        }),
        textureImagePieceRect: rect,
      });
    });
  });

  const renderer = initWebGLRenderer(gl);

  function createRects() {
    renderer.setRenderableRects(
      rectInputs
        // .filter((rectInput) => textureAtlases[0].mapping.has(rectInput.label))
        .map((rectInput) => {
          const labelInAtlas = labelsInTextureAtlases.get(rectInput.label);
          if (!labelInAtlas) {
            throw new Error('couldnt find label in texture atlases');
          }
          return {
            backgroundColor: getRandomColor(),
            rect: rectInput.rect,
            texture: labelInAtlas.texture,
            textureImageSize: labelInAtlas.textureImageSize,
            textureImagePieceRect: labelInAtlas.textureImagePieceRect,
            textureOffset: new Vec2d({ x: 4, y: 4 }),
          };
        })
    );
  }
  createRects();

  function render() {
    const viewTransform = mat4.create();

    mat4.translate(
      viewTransform, // destination matrix
      viewTransform, // matrix to translate
      [options.translate.x, options.translate.y, 0] // translation vector
    );

    mat4.scale(
      viewTransform, // destination matrix
      viewTransform, // matrix to scale
      [options.zoomInterp, options.zoomInterp, 1] // scaling vector
    );

    const textureOffset = vec2.fromValues(
      options.textureTranslate.x,
      options.textureTranslate.y
    );

    renderer.render({
      viewport: vec2.fromValues(canvas.width, canvas.height),
      viewTransform,
      backgroundPosition: BackgroundPosition.TopLeft,
      textureOffset,
      mouseState,
    });
  }

  let lastTime = performance.now();
  function update() {
    const currentTime = performance.now();
    const dt = currentTime - lastTime;
    lastTime = currentTime;

    mouseState.pressed = expDecay(mouseState.pressed, 0, 5, dt / 1000);

    options.zoomInterp = expDecay(
      options.zoomInterp,
      options.zoom,
      16,
      dt / 1000
    );
    gui.updateDisplay();
  }

  return function animationLoop() {
    update();
    render();
    fpsCounterOnFrame();
    requestAnimationFrame(animationLoop);
  };
}
export default async function main() {
  const textRenderingWorkerPool = await createTextRenderingWorkerPool();

  const singleTextImages = await textRenderingWorkerPool.renderText(
    labels,
    null,
    devicePixelRatio
  );

  const textureAtlases = await textRenderingWorkerPool.createTextureAtlases(
    singleTextImages
  );

  textRenderingWorkerPool.release();

  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error('couldnt use webgl2');
  }
  const animationLoop = initRenderer(gl, textureAtlases);
  animationLoop();
}
