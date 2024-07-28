import './style.css';
import { mat4, vec2, vec3 } from 'gl-matrix';

import * as datgui from 'dat.gui';
import { generateImageBitmapsForText } from './textTextureAtlasRenderingUtils';
// import exampledata from "./exampledata.js";

import createFPSCounter from './FPSCounter';
import { getRandomColor } from './webglColorUtils';
import { nullthrows } from './nullthrows';

type GLMatrixRect = {
  position: vec2;
  size: vec2;
};

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);
canvas.width = window.innerWidth * 0.95 * devicePixelRatio;
canvas.height = window.innerHeight * 0.8 * devicePixelRatio;
canvas.style.width = `${canvas.width / devicePixelRatio}px`;
canvas.style.height = `${canvas.height / devicePixelRatio}px`;
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('couldnt use 2d');
}
const SPAN_HEIGHT = 20 * devicePixelRatio; //px
const numRects = 10000;

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

function glmatrixRectsIntersect(a: GLMatrixRect, b: GLMatrixRect): boolean {
  // work out the corners (x1,x2,y1,y1) of each rectangle
  // top left
  let ax1 = a.position[0];
  let ay1 = a.position[1];
  // bottom right
  let ax2 = a.position[0] + a.size[0];
  let ay2 = a.position[1] + a.size[1];
  // top left
  let bx1 = b.position[0];
  let by1 = b.position[1];
  // bottom right
  let bx2 = b.position[0] + b.size[0];
  let by2 = b.position[1] + b.size[1];

  // test rectangular overlap
  return !(ax1 > bx2 || bx1 > ax2 || ay1 > by2 || by1 > ay2);
}

function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_v, k) => k + start);
}

const rectInputs = range(0, numRects).map(() => {
  return {
    rect: {
      position: vec2.clone([
        (Math.random() - 0.5) * 10 * SPAN_HEIGHT * 5,
        (Math.random() - 0.5) * SPAN_HEIGHT * 10,
      ]),
      size: vec2.clone([SPAN_HEIGHT * 3, SPAN_HEIGHT]),
    },
    label: generateRandomLabel(),
    color: `rgba(${getRandomColor()
      .map((component, i) =>
        i === 3 ? component.toString() : (component * 255).toFixed(0)
      )
      .join(',')})`,
  };
});

console.log({
  rectInputs,
});

const singleTextImages = generateImageBitmapsForText(
  rectInputs.map((input) => input.label),
  null,
  devicePixelRatio
);

const renderer = {
  render({ viewTransform }: { viewTransform: mat4 }) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const viewScale = vec3.create();
    mat4.getScaling(viewScale, viewTransform);

    const viewport: GLMatrixRect = {
      position: vec2.fromValues(0, 0),
      size: vec2.fromValues(canvas.width, canvas.height),
    };

    rectInputs.forEach((rectInput) => {
      const rectInScreen = {
        position: vec2.clone(rectInput.rect.position),
        size: vec2.clone(rectInput.rect.size),
      };
      vec2.transformMat4(
        rectInScreen.position,
        rectInScreen.position,
        viewTransform
      );
      rectInScreen.size[0] *= viewScale[0];
      rectInScreen.size[1] *= viewScale[1];

      if (glmatrixRectsIntersect(viewport, rectInScreen)) {
        ctx.fillStyle = rectInput.color;
        ctx.fillRect(
          rectInScreen.position[0],
          rectInScreen.position[1],
          rectInScreen.size[0],
          rectInScreen.size[1]
        );

        // Save the current clipping region
        ctx.save();
        ctx.beginPath();
        ctx.rect(
          rectInScreen.position[0],
          rectInScreen.position[1],
          rectInScreen.size[0],
          rectInScreen.size[1]
        ); // x, y, width, height
        ctx.clip();
        // Draw the ImageBitmap to the canvas
        ctx.drawImage(
          nullthrows(singleTextImages.get(rectInput.label)),
          rectInScreen.position[0],
          rectInScreen.position[1]
        );
        // Restore the original clipping region
        ctx.restore();
      }
    });
  },
};

const options = {
  translate: { x: 0, y: 0 },
  zoom: 1,
  textureTranslate: { x: 0, y: 0 },
};

const gui = new datgui.GUI();
const viewTransformFolder = gui.addFolder('View Transform');
viewTransformFolder.open();
viewTransformFolder.add(options.translate, 'x').min(-1000).max(1000).step(1);
viewTransformFolder.add(options.translate, 'y').min(-1000).max(1000).step(1);
viewTransformFolder.add(options, 'zoom').min(0.01).max(16).step(0.01);

const fpsCounterOnFrame = createFPSCounter();

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
    [options.zoom, options.zoom, 1] // scaling vector
  );

  renderer.render({
    viewTransform,
  });
}
function animationLoop() {
  render();
  fpsCounterOnFrame();
  requestAnimationFrame(animationLoop);
}
export default function main() {
  animationLoop();
}
