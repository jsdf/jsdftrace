import './style.css';
import { initWebGLRenderer } from './webglRenderer';
import Rect from './Rect';
import { getRandomColor } from './webglColorUtils';
import { mat4 } from 'gl-matrix';

import * as datgui from 'dat.gui';
import Vec2d from './Vec2d';
// import exampledata from "./exampledata.js";

import rockoImageURL from './assets/rocko.png';

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);
canvas.width = window.innerWidth * 0.95;
canvas.height = window.innerHeight * 0.8;
const gl = canvas.getContext('webgl2');
if (!gl) {
  throw new Error('couldnt use webgl2');
}
const renderer = initWebGLRenderer(gl);

const options = {
  transform: { x: 0, y: 0 },
  scale: 1,
  textureScale: 1,
  textureOffset: { x: 0, y: 0 },
};

const gui = new datgui.GUI();
const transformGUI = gui.addFolder('Transform');
transformGUI.add(options.transform, 'x').min(-1).max(1).step(0.01);
transformGUI.add(options.transform, 'y').min(-1).max(1).step(0.01);
const scaleGUI = gui.addFolder('Scale');
scaleGUI.add(options, 'scale').min(0.1).max(2).step(0.01);
const textureGUI = gui.addFolder('Texture');
textureGUI.open();
textureGUI.add(options, 'textureScale').min(0.1).max(2).step(0.01);
textureGUI.add(options.textureOffset, 'x').min(-1).max(1).step(0.01);
textureGUI.add(options.textureOffset, 'y').min(-1).max(1).step(0.01);

function animationLoop() {
  const transformationMatrix = mat4.create();

  mat4.translate(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to translate
    [options.transform.x, options.transform.y, 0] // translation vector
  );

  mat4.scale(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to scale
    [options.scale, options.scale, 1] // scaling vector
  );

  // vertex positions are in pixels, scale to NDC
  mat4.scale(
    transformationMatrix, // destination matrix
    transformationMatrix, // matrix to scale
    [1 / canvas.width, 1 / canvas.height, 1] // scaling vector
  );

  const textureTransformMatrix = mat4.create();
  mat4.scale(textureTransformMatrix, textureTransformMatrix, [
    options.textureScale,
    options.textureScale,
    1,
  ]);
  mat4.translate(textureTransformMatrix, textureTransformMatrix, [
    options.textureOffset.x,
    options.textureOffset.y,
    0,
  ]);

  renderer.render(transformationMatrix, textureTransformMatrix);
  requestAnimationFrame(animationLoop);
}

function imageBitmapToWebGLTexture(
  imageBitmap: ImageBitmap,
  gl: WebGL2RenderingContext
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("couldn't create texture");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    imageBitmap
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.NEAREST_MIPMAP_LINEAR
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // generate mipmaps
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export default async function main() {
  const rockoImage = await fetch(rockoImageURL)
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob));

  if (!gl) {
    throw new Error('couldnt use webgl2');
  }

  const rockoTexture = imageBitmapToWebGLTexture(rockoImage, gl);

  renderer.setRenderableRects([
    {
      backgroundColor: getRandomColor(),
      rect: new Rect({
        position: new Vec2d(0, 0),
        size: new Vec2d(100, 100),
      }),
      texture: rockoTexture,
      textureImageSize: new Vec2d(rockoImage.width, rockoImage.height),
      textureImagePieceRect: new Rect({
        position: new Vec2d(0, 0),
        size: new Vec2d(rockoImage.width, rockoImage.height),
      }),
    },
  ]);

  animationLoop();
}
