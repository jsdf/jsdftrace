import "./style.css";
import {
  getRectTextureCoordinatesInTexture,
  initWebGLRenderer,
} from "./webglRenderer";
import Rect from "./Rect";
import { getRandomColor } from "./webglColorUtils";
import { mat4, vec2 } from "gl-matrix";

import * as datgui from "dat.gui";
import { createTextTextureAtlases } from "./textTextureAtlasRenderingUtils";
// import exampledata from "./exampledata.js";

const canvas = document.createElement("canvas");
document.querySelector<HTMLDivElement>("#app")!.appendChild(canvas);
canvas.width = window.innerWidth * 0.95;
canvas.height = window.innerHeight * 0.8;
const gl = canvas.getContext("webgl2");
if (!gl) {
  throw new Error("couldnt use webgl2");
}
const SPAN_HEIGHT = 20; //px

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

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_NEAREST
  );
  gl.generateMipmap(gl.TEXTURE_2D);

  return texture;
}

function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_v, k) => k + start);
}

const renderer = initWebGLRenderer(gl);

const rectInputs = range(0, 100).map(() => {
  return {
    rect: new Rect({
      position: { x: Math.random() * 0.7, y: Math.random() },
      size: { x: 0.3, y: SPAN_HEIGHT / canvas.height },
    }),
    label: generateRandomLabel(),
  };
});

const textureAtlases = createTextTextureAtlases(
  rectInputs.map((input) => input.label),
  SPAN_HEIGHT // using a fixed height until i write the shader code to handle variable height with screen space texture sampling
);

// display each texture atlas in a separate canvas for debugging
textureAtlases.forEach((textureAtlas, i) => {
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
  { texture: WebGLTexture; textureImageSize: vec2; coordinates: vec2[] }
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
      coordinates: getRectTextureCoordinatesInTexture(rect, textureAtlas.image),
      textureImageSize: vec2.fromValues(
        textureAtlas.image.width,
        textureAtlas.image.height
      ),
    });
  });
});

renderer.setRenderableRects(
  rectInputs
    .filter((rectInput) => textureAtlases[0].mapping.has(rectInput.label))
    .map((rectInput) => {
      const labelInAtlas = labelsInTextureAtlases.get(rectInput.label);
      if (!labelInAtlas) {
        throw new Error("couldnt find label in texture atlases");
      }
      return {
        backgroundColor: getRandomColor(),
        rect: rectInput.rect,
        textureCoordinates: labelInAtlas.coordinates,
        texture: labelInAtlas.texture,
        textureImageSize: labelInAtlas.textureImageSize,
      };
    })
);

const options = {
  transform: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const gui = new datgui.GUI();
gui.addFolder("Transform");
gui.add(options.transform, "x").min(-1).max(1).step(0.01);
gui.add(options.transform, "y").min(-1).max(1).step(0.01);
gui.add(options.transform, "z").min(-1).max(1).step(0.01);
gui.addFolder("Scale");
gui.add(options.scale, "x").min(0).max(2).step(0.01);
gui.add(options.scale, "y").min(0).max(2).step(0.01);
gui.add(options.scale, "z").min(0).max(2).step(0.01);
function animationLoop() {
  const transformationMatrix = mat4.create();

  mat4.translate(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to translate
    [options.transform.x, options.transform.y, options.transform.z] // translation vector
  );

  mat4.scale(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to scale
    [options.scale.x, options.scale.y, options.scale.z] // scaling vector
  );

  renderer.render(transformationMatrix);
  requestAnimationFrame(animationLoop);
}
animationLoop();