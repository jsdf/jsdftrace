import { mat4, vec2 } from "gl-matrix";
import { nullthrows } from "./nullthrows";
import Rect from "./Rect";

export type RenderableRect = {
  rect: Rect;
  backgroundColor: number[];
  texture: WebGLTexture;
  textureImageSize: vec2;
  textureCoordinates: vec2[];
  textureImagePieceRect: Rect;
};
const SIZE_OF_FLOAT32 = 4;
const POSITION_COMPONENTS = 3;
const RECT_VERTICES = 4;
const RECT_INDICES = 6; // 2 triangles
const COLOR_COMPONENTS = 4;
let checkErrors = true;

const vsSource = `#version 300 es

in vec4 aVertexPosition;
in vec4 aVertexColor;
in vec2 aTextureCoord;  
in vec4 aTexturePieceRect;
in vec2 aTextureScaling;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix; 
uniform sampler2D uSampler;

out lowp vec4 vColor;
out highp vec2 vTextureCoord; 

void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition; 
    vColor = aVertexColor;
    vec2 totalTextureSize = vec2(textureSize(uSampler, 0));
    // work out the ratio of the texture piece size to the rectangle size
    // that we need to keep the texture piece in scale with the rectangle

      // ???
    // vec2 textureScalingForViewport = vec2(1.0,1.0) / (uProjectionMatrix * uModelViewMatrix * vec4(aTextureScaling, 0, 1)).xy;
     
    // offset the texture coordinates to the correct position in the texture atlas
    // scale the texture coordinates to the rectangle size
    // undo the offset of the texture piece in the texture atlas
    // normalize texture coordinates
    // TODO: clamp to texture piece rect
    vTextureCoord = (((aTextureCoord - aTexturePieceRect.xy) * aTextureScaling) + aTexturePieceRect.xy) / totalTextureSize; 
    // vTextureCoord = aTextureCoord / totalTextureSize;
}
`;

// TODO: rather than using gl_FragCoord we should be able to scale the texture coordinates
// inversely to the view transform, so that as you zoom in, the texture scales down equally,
// pinned to the appropriate corner of the rectangle. this would effectively keep the texture
// scale constant in screen space, which is what we want.
// to make sure it stays 1:1 to screen pixels, we also need to account for the ratio of the
// texture piece (e.g. texture within atlas) to the quad, which in turn is defined relative
// to the global coordinate system (e.g. ratio of pixels at default zoom level to vert-space units).

// alternatively, we might be able to get more crisp pixels by using gl_FragCoord (pixel coordinates
// in screen space) to sample the texture, combined with texture lookup converting to texel
// coordinates rather (normalized coordinates scaled by the texture size).
// - we would still need to calculate the screen space coordinates of the corner of the rectangle
// we're pinning the texture to, so we can correctly offset the local texel coordinates to align
// the texture with the rectangle.
// - we would also need to know the position of the texture piece within the texture atlas,
// - so we can correctly offset the texture coordinates to sample the correct piece of the texture.
const fsSource = `#version 300 es
precision mediump float;

in lowp vec4 vColor;
in highp vec2 vTextureCoord; 

uniform sampler2D uSampler;

out vec4 FragColor;

void main(void) {  
      // approach based on scaling texture coordinates inversely to the view transform
      FragColor = texture(uSampler, vTextureCoord);
}
`;

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string
): WebGLProgram {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();

  if (!shaderProgram) {
    throw new Error("unable to create shader program");
  }

  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw new Error(
      "Unable to initialize the shader program: " +
        (gl.getProgramInfoLog(shaderProgram) || "")
    );
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("unable to create shader");
  }

  // Send the source to the shader object

  gl.shaderSource(shader, source);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      "An error occurred compiling the shaders: " +
        (gl.getShaderInfoLog(shader) || "")
    );
  }

  return shader;
}

type ProgramInfo = {
  program: WebGLProgram;
  attribLocations: {
    aVertexPosition: number;
    aVertexColor: number;
    aTextureCoord: number;
    aTexturePieceRect: number;
    aTextureScaling: number;
  };
  uniformLocations: {
    projectionMatrix: WebGLUniformLocation;
    modelViewMatrix: WebGLUniformLocation;
    texture: WebGLUniformLocation;
  };
};

export function rectsToBuffers(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  renderableRects: RenderableRect[]
): RectsRenderBuffers {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < renderableRects.length; i++) {
    const renderableRect = renderableRects[i];
    const { x, y } = renderableRect.rect.position;
    const { x: width, y: height } = renderableRect.rect.size;
    const startIndex = i * RECT_VERTICES;
    // 2 triangles for a rectangle
    indices.push(startIndex, startIndex + 1, startIndex + 2);
    indices.push(startIndex + 1, startIndex + 2, startIndex + 3);

    // 4 vertices for a rectangle, each with 3 components
    // position at z=0 (in future we can add z-index to sort rectangles in z-space)
    positions.push(x, y, 0); // top left
    positions.push(x + width, y, 0); // top right
    positions.push(x, y + height, 0); // bottom left
    positions.push(x + width, y + height, 0); // bottom right

    const color = renderableRect.backgroundColor;
    for (let i = 0; i < RECT_VERTICES; i++) {
      colors.push(...color);
    }
  }

  return initBuffers(gl, {
    programInfo,
    positions,
    colors,
    indices,
    rects: renderableRects,
  });
}

function createAndBindFloatAttribVertexArray(
  gl: WebGL2RenderingContext,
  name: string,
  {
    attribLocation,
    dataArray,
    numComponents,
    numVertices,
  }: {
    attribLocation: number;
    dataArray: number[];
    numComponents: number;
    numVertices: number;
  }
): WebGLBuffer | null {
  if (attribLocation === -1) {
    console.warn(
      `${name} attribute not found in shader, skipping ${name} buffer creation`
    );
    return null;
  }
  // vertices that will be reused each render
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error(`unable to create ${name} buffer`);
  }
  if (dataArray.length % numComponents !== 0) {
    throw new Error(
      `number of components in ${name} buffer data is not a multiple of ${numComponents}`
    );
  }
  if (dataArray.length / numComponents !== numVertices) {
    throw new Error(
      `number of vertices in ${name} buffer data is not equal to ${numVertices}`
    );
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dataArray), gl.STATIC_DRAW);
  checkErrors && checkGLError(gl, `setting bufferData to ${name} buffer`);
  // Tell WebGL how to pull out the positions from the position
  // buffer into the shader attribute
  {
    const type = gl.FLOAT;
    const normalize = false;
    const stride = numComponents * SIZE_OF_FLOAT32;
    gl.vertexAttribPointer(
      attribLocation,
      numComponents,
      type,
      normalize,
      stride,
      0 // offset
    );
    checkErrors && checkGLError(gl, `setting ${name} attribute pointer`);
    gl.enableVertexAttribArray(attribLocation);
    checkErrors && checkGLError(gl, `enabling ${name} attribute`);
  }

  return buffer;
}

// whenever the geometry changes, we need to reinitialize the buffers
// but then we'll reuse the buffers for each render call
export function initBuffers(
  gl: WebGL2RenderingContext,
  {
    programInfo,
    positions,
    colors,
    indices,
    rects,
  }: {
    programInfo: ProgramInfo;
    positions: number[];
    colors: number[];
    indices: number[];
    rects: RenderableRect[];
  }
): RectsRenderBuffers {
  console.log("positions", positions);
  console.log("colors", colors);
  console.log("indices", indices);
  console.log("rects", rects);

  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("unable to create vertex array object");
  }
  gl.bindVertexArray(vao);

  const boundBuffers = [];

  const numVertices = positions.length / POSITION_COMPONENTS;

  // vertices that will be reused each render
  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "aPosition", {
      attribLocation: programInfo.attribLocations.aVertexPosition,
      dataArray: positions,
      numComponents: POSITION_COMPONENTS,
      numVertices,
    })
  );
  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "aColor", {
      attribLocation: programInfo.attribLocations.aVertexColor,
      dataArray: colors,
      numComponents: COLOR_COMPONENTS,
      numVertices,
    })
  );

  const texturePieceRects: number[] = [];
  rects.forEach((rect: RenderableRect) => {
    // for each rect vert
    for (let i = 0; i < RECT_VERTICES; i++) {
      texturePieceRects.push(
        // position of the texture piece in the texture atlas
        rect.textureImagePieceRect.position.x,
        rect.textureImagePieceRect.position.y,
        // the size of the texture piece in the texture atlas
        rect.textureImagePieceRect.size.x,
        rect.textureImagePieceRect.size.y
      );
    }
  });
  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "aTexturePieceRect", {
      attribLocation: programInfo.attribLocations.aTexturePieceRect,
      dataArray: texturePieceRects,
      numComponents: 4,
      numVertices,
    })
  );

  // TODO: figure out whats wrong with this causing it to give errors
  // about the buffer being too small
  const textureScaling: number[] = [];
  rects.forEach((rect: RenderableRect) => {
    // for each rect vert
    for (let i = 0; i < RECT_VERTICES; i++) {
      textureScaling.push(
        1 / (rect.textureImagePieceRect.size.x / rect.rect.size.x),
        1 / (rect.textureImagePieceRect.size.y / rect.rect.size.y)
      );
    }
  });
  console.log("textureScaling", textureScaling);

  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "aTextureScaling", {
      attribLocation: programInfo.attribLocations.aTextureScaling,
      dataArray: textureScaling,
      numComponents: 2,
      numVertices,
    })
  );

  // Create a buffer for the texture coordinates

  const textureCoordinates = rects.flatMap((rect: RenderableRect) =>
    rect.textureCoordinates.flatMap((coord: vec2) => [coord[0], coord[1]])
  );
  console.log({ textureCoordinates });
  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "textureCoord", {
      attribLocation: programInfo.attribLocations.aTextureCoord,
      dataArray: textureCoordinates,
      numComponents: 2,
      numVertices,
    })
  );

  const indexBuffer = gl.createBuffer();
  if (!indexBuffer) {
    throw new Error("unable to create index buffer");
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );
  boundBuffers.push(indexBuffer);

  gl.bindVertexArray(null); // unbind the vao

  return {
    rects,
    boundBuffers: boundBuffers.filter(
      (buffer) => buffer !== null
    ) as WebGLBuffer[],
    vao,
  };
}

export function releaseBuffers(
  gl: WebGL2RenderingContext,
  buffers: RectsRenderBuffers
) {
  buffers.boundBuffers.forEach((buffer) => {
    gl.deleteBuffer(buffer);
  });
  gl.deleteVertexArray(buffers.vao);
}

export type RectsRenderBuffers = {
  rects: RenderableRect[];
  boundBuffers: WebGLBuffer[];
  vao: WebGLVertexArrayObject;
};

const defaultTransformationMatrix = mat4.create();

mat4.translate(
  defaultTransformationMatrix, // destination matrix
  defaultTransformationMatrix, // matrix to translate
  [-1, -1, 0] // translation vector. shift to the top left of the viewport
);

mat4.scale(
  defaultTransformationMatrix, // destination matrix
  defaultTransformationMatrix, // matrix to scale
  [2, 2, 1] // scaling vector. scale to the full viewport (-1 to 1)
);

function drawScene(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  buffers: RectsRenderBuffers,
  userTransformationMatrix: mat4
) {
  let drawCalls = 0;
  gl.clearColor(0, 0, 0, 1.0); // black, fully opaque
  gl.clearDepth(1.0); // Clear everything
  gl.enable(gl.DEPTH_TEST); // Enable depth testing
  gl.depthFunc(gl.LEQUAL); // Near things obscure far things
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // execute clear canvas

  // Orthographic projection with a width/height
  // ratio that matches the display size of the canvas
  // and we only want to see objects between 0.1 units
  // and 100 units away from the camera.
  const zNear = -1.0;
  const zFar = 1.0;
  const projectionMatrix = mat4.create();

  // orthographic projection. flip y axis
  mat4.ortho(projectionMatrix, -1, 1, 1, -1, zNear, zFar);

  // drawing position starts as the identity point, which is the center of the
  // scene
  const modelViewMatrix = mat4.create();

  // matrix multiplication is right to left, so this effectively applies the
  // default transformation matrix first, then the user transformation matrix
  mat4.multiply(modelViewMatrix, modelViewMatrix, userTransformationMatrix);
  mat4.multiply(modelViewMatrix, modelViewMatrix, defaultTransformationMatrix);

  // enable the vao
  gl.bindVertexArray(buffers.vao);
  checkErrors && checkGLError(gl, "binding vertex array object");

  // Tell WebGL to use our program when drawing

  gl.useProgram(programInfo.program);
  checkErrors && checkGLError(gl, "using program");

  // Set the shader uniforms

  gl.uniformMatrix4fv(
    programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  );
  checkErrors && checkGLError(gl, "setting projection matrix uniform");
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.modelViewMatrix,
    false,
    modelViewMatrix
  );
  checkErrors && checkGLError(gl, "setting model view matrix uniform");

  // enable the texture
  gl.activeTexture(gl.TEXTURE0);
  // TODO: bind the correct texture, not just the first one, once the rendering is batched by texture
  const { texture } = buffers.rects[0];
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.uniform1i(
    programInfo.uniformLocations.texture,
    0 /* index of texture unit */
  );

  // draw the rectangles
  {
    const offset = 0;
    const count = buffers.rects.length * RECT_INDICES; // each rectangle has 6 indices: 2 triangles * 3 vertices
    const type = gl.UNSIGNED_SHORT;
    // TODO: draw in batches grouped by texture atlas
    gl.drawElements(gl.TRIANGLES, count, type, offset);
    checkErrors && checkGLError(gl, "drawing elements");
    drawCalls++;
  }

  gl.bindVertexArray(null); // unbind the vao
  return drawCalls;
}

function getAttribLocationOrThrow(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string
): number {
  const location = gl.getAttribLocation(program, name);
  if (location === -1) {
    // throw new Error(`unable to get attribute location for ${name}`);
    console.warn(`unable to get attribute location for ${name}`);
  }
  return location;
}

export function initWebGLRenderer(
  gl: WebGL2RenderingContext,
  checkErrorsOpt = false
) {
  checkErrors = checkErrorsOpt;
  // Vertex shader program

  // Initialize a shader program; this is where all the lighting
  // for the vertices and so forth is established.
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  // Collect all the info needed to use the shader program.
  // Look up which attribute our shader program is using
  // for aVertexPosition and look up uniform locations.
  const programInfo: ProgramInfo = {
    program: shaderProgram,
    attribLocations: {
      aVertexPosition: getAttribLocationOrThrow(
        gl,
        shaderProgram,
        "aVertexPosition"
      ),
      aVertexColor: getAttribLocationOrThrow(gl, shaderProgram, "aVertexColor"),
      aTextureCoord: getAttribLocationOrThrow(
        gl,
        shaderProgram,
        "aTextureCoord"
      ),
      aTexturePieceRect: getAttribLocationOrThrow(
        gl,
        shaderProgram,
        "aTexturePieceRect"
      ),
      aTextureScaling: getAttribLocationOrThrow(
        gl,
        shaderProgram,
        "aTextureScaling"
      ),
    },
    uniformLocations: {
      projectionMatrix: nullthrows(
        gl.getUniformLocation(shaderProgram, "uProjectionMatrix")
      ),
      modelViewMatrix: nullthrows(
        gl.getUniformLocation(shaderProgram, "uModelViewMatrix")
      ),
      texture: nullthrows(gl.getUniformLocation(shaderProgram, "uSampler")),
    },
  };

  checkErrors && checkGLError(gl, "initWebGLRenderer");

  let buffers: RectsRenderBuffers | null = null;
  return {
    render(transformationMatrix: mat4 = mat4.create()) {
      if (!buffers) {
        throw new Error(
          "render() called but setRenderableRects() was not called first to initialize scenegraph"
        );
      }
      // Draw the scene
      return drawScene(gl, programInfo, buffers, transformationMatrix);
    },
    setRenderableRects: (renderableRects: RenderableRect[]) => {
      if (buffers) {
        releaseBuffers(gl, buffers);
      }
      buffers = rectsToBuffers(gl, programInfo, renderableRects);
    },
    destroy() {
      if (buffers) {
        releaseBuffers(gl, buffers);
      }

      gl.deleteProgram(programInfo.program);
    },
  };
}

function checkGLError(gl: WebGL2RenderingContext, situation: string) {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    let errorMessage = "";
    switch (error) {
      case gl.INVALID_ENUM:
        errorMessage = "gl.INVALID_ENUM";
        break;
      case gl.INVALID_VALUE:
        errorMessage = "gl.INVALID_VALUE";
        break;
      case gl.INVALID_OPERATION:
        errorMessage = "gl.INVALID_OPERATION";
        break;
      case gl.OUT_OF_MEMORY:
        errorMessage = "gl.OUT_OF_MEMORY";
        break;
      case gl.INVALID_FRAMEBUFFER_OPERATION:
        errorMessage = "gl.INVALID_FRAMEBUFFER_OPERATION";
        break;
      default:
        errorMessage = "Unknown WebGL error";
    }

    throw new Error(situation + ": " + errorMessage);
  }
}

export function getRectTextureCoordinatesInTexture(
  rect: Rect,
  textureDimensions: { width: number; height: number }
): vec2[] {
  const { x, y } = rect.position;
  const { x: width, y: height } = rect.size;

  // normalized texture coordinates
  // const textureCoordinates = [
  //   vec2.fromValues(x / textureDimensions.width, y / textureDimensions.height), // top left
  //   vec2.fromValues(
  //     (x + width) / textureDimensions.width,
  //     y / textureDimensions.height
  //   ), // top right
  //   vec2.fromValues(
  //     x / textureDimensions.width,
  //     (y + height) / textureDimensions.height
  //   ), // bottom left
  //   vec2.fromValues(
  //     (x + width) / textureDimensions.width,
  //     (y + height) / textureDimensions.height
  //   ), // bottom right
  // ];

  // texel space texture coordinates
  const textureCoordinates = [
    vec2.fromValues(x, y), // top left
    vec2.fromValues(x + width, y), // top right
    vec2.fromValues(x, y + height), // bottom left
    vec2.fromValues(x + width, y + height), // bottom right
  ];
  return textureCoordinates;
}
