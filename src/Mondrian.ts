import { mat4, vec2 } from 'gl-matrix';
import Rect from './Rect';
import { Color } from './webglColorUtils';
import {
  createTextureAtlases,
  debugDrawTextureAtlases,
  generateImageBitmapsForTextAsync,
  TextTextureAtlas,
} from './textTextureAtlasRenderingUtils';
import Vec2d from './Vec2d';
import {
  initWebGLRenderer,
  RenderableRect,
  WebGLRenderer,
} from './webglRenderer';

export { default as Rect } from './Rect';
export { default as Vec2d } from './Vec2d';
export type { Color } from './webglColorUtils';

export type DrawRect = {
  id: number;
  label?: string | void;
  backgroundColor?: Color | void; // rgba
  rect: Rect;
};

const DEFAULT_COLOR: Color = [181, 0, 157, 255];

const DEFAULT_TEXTURE = {
  textureImageSize: new Vec2d(128, 128),
  textureImagePieceRect: new Rect({
    position: { x: 0, y: 0 },
    size: { x: 128, y: 128 },
  }),
};

const DEFAULT_TEXTURE_OFFSET = vec2.fromValues(0, 0);

function createPlaceholderTexture(gl: WebGL2RenderingContext) {
  // Create a new texture
  const texture = gl.createTexture();

  // Bind the texture to the TEXTURE_2D target
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Define the texture's dimensions and format
  gl.texImage2D(
    gl.TEXTURE_2D, // target
    0, // mipmap level
    gl.RGBA, // internalformat
    128, // width
    128, // height
    0, // border
    gl.RGBA, // format
    gl.UNSIGNED_BYTE, // pixel data type
    new Uint8Array([255, 0, 0, 255]) // red
    // new Uint8Array([0, 0, 0, 0]) // transparent black
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  if (!texture) throw new Error(`failed to create texture`);
  (texture as any).id = 'placeholder';
  return texture;
}

function imageBitmapToWebGLTexture(
  imageBitmap: TexImageSource,
  gl: WebGL2RenderingContext
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('couldnt create texture');
  }
  (texture as any).id = 'imagebitmap:' + Math.random();

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

export class Mondrian {
  labelsInTextureAtlases = new Map<
    string,
    {
      texture: WebGLTexture;
      textureImageSize: Vec2d;
      textureImagePieceRect: Rect;
    }
  >();

  labelTexturesToGenerate = new Set<string>();
  labelTexturesGenerating = false;

  private webGLRenderer: WebGLRenderer;
  private placeholderTexture: WebGLTexture;
  private gl: WebGL2RenderingContext;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('couldnt use webgl2');
    }
    this.gl = gl;
    this.webGLRenderer = initWebGLRenderer(gl);
    this.placeholderTexture = createPlaceholderTexture(gl);
  }

  currentDrawRects: DrawRect[] = [];
  setDrawRects(drawRects: DrawRect[]) {
    this.currentDrawRects = drawRects;
    this.webGLRenderer.setRenderableRects(
      drawRects.map((drawRect): RenderableRect => {
        let labelInAtlas;
        if (drawRect.label != null) {
          labelInAtlas = this.labelsInTextureAtlases.get(drawRect.label);
          if (!labelInAtlas) {
            // this.generateLabelTexture(drawRect.label);
          }
        }
        return {
          backgroundColor: drawRect.backgroundColor ?? DEFAULT_COLOR,
          rect: drawRect.rect,
          texture: labelInAtlas?.texture ?? this.placeholderTexture,
          textureImageSize: (labelInAtlas ?? DEFAULT_TEXTURE).textureImageSize,
          textureImagePieceRect: (labelInAtlas ?? DEFAULT_TEXTURE)
            .textureImagePieceRect,
          textureOffset: new Vec2d({ x: 4, y: 4 }), // padding for text
        };
      })
    );
  }

  generateLabelTexture(label: string) {
    this.labelTexturesToGenerate.add(label);
    if (!this.labelTexturesGenerating) {
      this.labelTexturesGenerating = true;
      // batch all generation requests from the current macrotask
      setTimeout(async () => {
        const setToGenerate = Array.from(this.labelTexturesToGenerate);
        console.log('generating', setToGenerate);

        const labelsBitmaps = await generateImageBitmapsForTextAsync(
          setToGenerate
        );

        console.log('generated', labelsBitmaps);

        const textureAtlases = createTextureAtlases(labelsBitmaps);

        this.addTextureAtlases(textureAtlases);

        setToGenerate.forEach((label) =>
          this.labelTexturesToGenerate.delete(label)
        );
        this.labelTexturesGenerating = false;
        // reinitialize RenderableRects now that we have textures
        // TODO: think of something smarter than this
        this.setDrawRects(this.currentDrawRects);
      });
    }
  }

  render(options: { translate: { x: number; y: number }; zoom: number }) {
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

    this.webGLRenderer.render({
      viewport: vec2.fromValues(this.canvas.width, this.canvas.height),
      viewTransform,
      textureOffset: DEFAULT_TEXTURE_OFFSET,
    });
  }

  addTextureAtlases(textureAtlases: TextTextureAtlas[]) {
    debugDrawTextureAtlases(textureAtlases, document.body);
    textureAtlases.forEach((textureAtlas) => {
      const webGLTextures = new Map();
      Array.from(textureAtlas.mapping.entries()).forEach(([label, rect]) => {
        let texture = webGLTextures.get(textureAtlas.image);
        if (!texture) {
          texture = imageBitmapToWebGLTexture(textureAtlas.image, this.gl);
          webGLTextures.set(textureAtlas.image, texture);
        }

        this.labelsInTextureAtlases.set(label, {
          texture,
          textureImageSize: new Vec2d({
            x: textureAtlas.image.width,
            y: textureAtlas.image.height,
          }),
          textureImagePieceRect: rect,
        });
      });
    });
  }
}
