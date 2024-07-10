export async function createTextureAtlasForTextLabels(textLabels: string[]) {
  // create a web worker and pass the text labels to it
  const worker = new Worker("textRenderingWorker.js");

  worker.postMessage(textLabels);

  // wait for the worker to finish

  const textureAtlas = await new Promise((resolve) => {
    worker.onmessage = (event) => {
      resolve(event.data);
    };
  });

  // clean up the worker
  worker.terminate();

  return textureAtlas;
}
