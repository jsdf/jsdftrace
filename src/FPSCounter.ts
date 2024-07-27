let framesSinceLastUpdate = 0;
let lastUpdateSecond = 0;
let lastUpdateFPS = 0;
let lastUpdateAvgFrameTime = 0;
export default function createFPSCounter() {
  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.top = '0';
  root.style.left = '0';
  document.body.appendChild(root);
  const line1 = document.createElement('div');
  const line2 = document.createElement('div');
  root.appendChild(line1);
  root.appendChild(line2);

  lastUpdateSecond = Math.floor(performance.now() / 1000);

  return function onFrame() {
    framesSinceLastUpdate++;
    const currentSecond = Math.floor(performance.now() / 1000);
    const secondsSinceLastUpdate = currentSecond - lastUpdateSecond;
    if (secondsSinceLastUpdate >= 1) {
      // currently handles pauses by averaging over seconds since last update
      lastUpdateFPS = framesSinceLastUpdate / secondsSinceLastUpdate;
      lastUpdateAvgFrameTime =
        (secondsSinceLastUpdate / framesSinceLastUpdate) * 1000;
      line1.innerText = `${lastUpdateFPS.toFixed(1)} fps`;
      line2.innerText = `${lastUpdateAvgFrameTime.toFixed(2)}ms`;
      lastUpdateSecond = currentSecond;
      framesSinceLastUpdate = 0;
    }
  };
}
