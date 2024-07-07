import "./style.css";
import { initWebGLRenderer } from "./webglRenderer";
import Rect from "./Rect";
import { getRandomColor } from "./webglColorUtils";

// import exampledata from "./exampledata.js";

const canvas = document.createElement("canvas");
document.querySelector<HTMLDivElement>("#app")!.appendChild(canvas);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const gl = canvas.getContext("webgl2");
if (!gl) {
  throw new Error("couldnt use webgl2");
}

function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_v, k) => k + start);
}
const renderer = initWebGLRenderer(gl);
renderer.setRenderableRects(
  range(0, 10000)
    .map(
      () =>
        new Rect({
          position: { x: Math.random(), y: Math.random() },
          size: { x: Math.random() * 0.1, y: Math.random() * 0.1 },
        })
    )
    .map((rect) => ({
      backgroundColor: getRandomColor(),
      rect: new Rect(rect),
    }))
);

renderer.render();
