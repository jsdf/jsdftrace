import { createTextTextureAtlases } from "./textTextureAtlasRenderingUtils";
// worker receives text strings and returns a texture atlas
onmessage = async (event) => {
  const textLabels = event.data;
  // render the text  to image bitmaps,
  // pack the image bitmaps into one or more texture atlases, and return them
  // along with the mapping from text to texture coordinates

  const textureAtlases = createTextTextureAtlases(textLabels);

  postMessage(textureAtlases);
};
