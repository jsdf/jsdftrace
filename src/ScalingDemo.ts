import "./style.css";
import { initWebGLRenderer } from "./webglRenderer";
import Rect from "./Rect";
import { getRandomColor } from "./webglColorUtils";
import { mat4 } from "gl-matrix";

import * as datgui from "dat.gui";
import { createTextTextureAtlases } from "./textTextureAtlasRenderingUtils";
import Vec2d from "./Vec2d";
// import exampledata from "./exampledata.js";

const canvas = document.createElement("canvas");
document.querySelector<HTMLDivElement>("#app")!.appendChild(canvas);
canvas.width = window.innerWidth * 0.95 * devicePixelRatio;
canvas.height = window.innerHeight * 0.8 * devicePixelRatio;
canvas.style.width = `${canvas.width / devicePixelRatio}px`;
canvas.style.height = `${canvas.height / devicePixelRatio}px`;
const gl = canvas.getContext("webgl2");
if (!gl) {
  throw new Error("couldnt use webgl2");
}
const SPAN_HEIGHT = 20 * devicePixelRatio; //px

const generateRandomLabel = (() => {
  const words = [
    "Apple",
    "Banana",
    "Cherry",
    "Date",
    "Elderberry",
    "Fig",
    "Grape",
    "Honeydew",
    "Kiwi",
    "Lemon",
    "Mango",
    "Nectarine",
    "Orange",
    "Papaya",
    "Quince",
    "Raspberry",
    "Strawberry",
    "Tangerine",
    "Ugli",
    "Vanilla",
    "Watermelon",
    "Xigua",
    "Yellow",
    "Zucchini",
  ];
  function randomWord() {
    return words[Math.floor(Math.random() * words.length)];
  }
  return function generateRandomLabel() {
    return randomWord() + randomWord() + randomWord();
  };
})();

function imageBitmapToWebGLTexture(
  imageBitmap: ImageBitmap,
  gl: WebGL2RenderingContext
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("couldnt create texture");
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

function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_v, k) => k + start);
}

const renderer = initWebGLRenderer(gl);

const rectInputs = range(0, 1000).map(() => {
  return {
    rect: new Rect({
      position: {
        x: (Math.random() - 0.5) * 10 * SPAN_HEIGHT * 5,
        y: (Math.random() - 0.5) * SPAN_HEIGHT * 10,
      },
      size: { x: SPAN_HEIGHT * 3, y: SPAN_HEIGHT },
    }),
    label: generateRandomLabel(),
  };
});

console.log(rectInputs);

const textureAtlases = createTextTextureAtlases(
  rectInputs.map((input) => input.label),
  null,
  devicePixelRatio
);

// display each texture atlas in a separate canvas for debugging
textureAtlases.forEach((textureAtlas, i) => {
  return;
  const h1 = document.createElement("h2");
  h1.textContent = "Texture Atlas " + i;
  const div = document.createElement("div");
  div.append(h1);
  document.querySelector<HTMLDivElement>("#app")!.appendChild(div);
  const canvas = document.createElement("canvas");
  canvas.style.border = "1px solid black";
  div.appendChild(canvas);
  canvas.width = textureAtlas.image.width;
  canvas.height = textureAtlas.image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("couldnt get 2d context");
  }
  ctx.drawImage(textureAtlas.image, 0, 0);
  textureAtlas.mapping.forEach((rect, label) => {
    ctx.strokeStyle = "red";
    ctx.strokeRect(rect.position.x, rect.position.y, rect.size.x, rect.size.y);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "white";
    ctx.fillText(
      `${label.slice(3)} {${rect.size.x}x${rect.size.y}}`,
      rect.position.x,
      rect.position.y + 18
    );
  });

  const details = document.createElement("details");
  details.innerHTML = `<summary>rects</summary><pre>${JSON.stringify(
    [...textureAtlas.mapping.entries()],
    null,
    2
  )}</pre>`;
  div.appendChild(details);
});

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

renderer.setRenderableRects(
  rectInputs
    // .filter((rectInput) => textureAtlases[0].mapping.has(rectInput.label))
    .map((rectInput) => {
      const labelInAtlas = labelsInTextureAtlases.get(rectInput.label);
      if (!labelInAtlas) {
        throw new Error("couldnt find label in texture atlases");
      }
      return {
        backgroundColor: getRandomColor(),
        rect: rectInput.rect,
        texture: labelInAtlas.texture,
        textureImageSize: labelInAtlas.textureImageSize,
        textureImagePieceRect: labelInAtlas.textureImagePieceRect,
      };
    })
);

const options = {
  translate: { x: 0, y: 0 },
  zoom: 1,
  textureTranslate: { x: 0, y: 0 },
};

const gui = new datgui.GUI();
const viewTransformFolder = gui.addFolder("View Transform");
viewTransformFolder.open();
viewTransformFolder.add(options.translate, "x").min(-1).max(1).step(0.01);
viewTransformFolder.add(options.translate, "y").min(-1).max(1).step(0.01);
viewTransformFolder.add(options, "zoom").min(0.01).max(4).step(0.01);
const textureTransformFolder = gui.addFolder("Texture Transform");
textureTransformFolder.open();
textureTransformFolder
  .add(options.textureTranslate, "x")
  .min(-1)
  .max(1)
  .step(0.01);
textureTransformFolder
  .add(options.textureTranslate, "y")
  .min(-1)
  .max(1)
  .step(0.01);

function animationLoop() {
  const transformationMatrix = mat4.create();

  mat4.translate(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to translate
    [options.translate.x, options.translate.y, 0] // translation vector
  );

  mat4.scale(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to scale
    [options.zoom, options.zoom, 1] // scaling vector
  );

  // vertex positions are in pixels, scale to NDC
  mat4.scale(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to scale
    [1 / canvas.width, 1 / canvas.height, 1] // scaling vector
  );

  const textureTransformMatrix = mat4.create();

  mat4.translate(
    textureTransformMatrix, // destination matrix
    textureTransformMatrix, // matrix to translate
    [-options.textureTranslate.x, -options.textureTranslate.y, 0] // translation vector
  );
  mat4.scale(textureTransformMatrix, textureTransformMatrix, [
    options.zoom,
    options.zoom,
    1,
  ]); // scaling vector

  renderer.render(transformationMatrix, textureTransformMatrix);
  requestAnimationFrame(animationLoop);
}
export default function main() {
  animationLoop();
}
