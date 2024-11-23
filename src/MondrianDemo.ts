import { Mondrian, Rect } from './Mondrian';
import Stats from 'stats.js';

import * as datgui from 'dat.gui';

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);
canvas.width = (window.innerWidth - 10) * devicePixelRatio;
canvas.height = (window.innerHeight - 10) * devicePixelRatio;
canvas.style.width = `${canvas.width / devicePixelRatio}px`;
canvas.style.height = `${canvas.height / devicePixelRatio}px`;

const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);

const settings = {
  translate: { x: 0, y: 0 },
  zoom: 4,
};

const gui = new datgui.GUI();
const viewTransformFolder = gui.addFolder('View Transform');
viewTransformFolder.open();
viewTransformFolder.add(settings.translate, 'x').min(-1).max(1).step(0.01);
viewTransformFolder.add(settings.translate, 'y').min(-1).max(1).step(0.01);
viewTransformFolder.add(settings, 'zoom').min(0.01).max(16).step(0.01);

export default async function main() {
  const mondrian = new Mondrian(canvas);

  mondrian.setDrawRects([
    {
      id: 0,
      label: 'hi',
      backgroundColor: [0, 255, 0, 255],
      rect: new Rect({ size: { x: 100, y: 20 } }),
    },

    {
      id: 1,
      label: 'hi also',
      backgroundColor: [0, 255, 255, 255],
      rect: new Rect({ size: { x: 90, y: 30 }, position: { x: 200, y: 100 } }),
    },
  ]);

  function animationLoop() {
    stats.begin();
    // update();
    mondrian.render(settings);
    stats.end();

    requestAnimationFrame(animationLoop);
  }
  animationLoop();
}
