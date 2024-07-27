import { mat4, vec2 } from "gl-matrix";
import { nullthrows } from "./nullthrows";
import Rect from "./Rect";
import vertexShaderSource from "./vertexShader.glsl";
import fragmentShaderSource from "./fragmentShader.glsl";
import Vec2d from "./Vec2d";

export type RenderableRect = {
  rect: Rect;
  backgroundColor: number[];
  texture: WebGLTexture;
  textureImageSize: Vec2d;
  textureImagePieceRect: Rect;
};
const SIZE_OF_FLOAT32 = 4;
const POSITION_COMPONENTS = 3;
const RECT_VERTICES = 4;
const RECT_INDICES = 6; // 2 triangles
const COLOR_COMPONENTS = 4;
let checkErrors = true; // TODO: turn this off in release builds

enum BackgroundPosition {
  TopLeft = 0,
  TopRight = 1,
  BottomLeft = 2,
  BottomRight = 3,
  StretchToFill = 4,
}

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

function assertSetsMatch<T>(expected: Set<T>, actual: Set<T>, name: string) {
  let equal = true;
  if (expected.size !== actual.size) {
    equal = false;
  }
  for (const value of expected) {
    if (!actual.has(value)) {
      equal = false;
    }
  }
  if (!equal) {
    const difference = new Set(
      [...expected, ...actual].filter((x) => {
        return !(expected.has(x) && actual.has(x));
      })
    );

    throw new Error(
      `${name} doesn't match expected set,\nexpected:\n  {${Array.from(
        expected
      ).join(", ")}}\nactual:\n  {${Array.from(actual).join(
        ", "
      )}}\ndifference:\n  {${Array.from(difference).join(", ")}}`
    );
  }
}

function extractErrorMessages(shaderError: string, source: string) {
  // extract 5 lines around the line that caused the error
  const lines = source.split("\n");

  const regex = /ERROR: (\d+)\:(\d+)\:(.*)\n*/g;
  const matches = shaderError.matchAll(regex);
  for (const match of matches) {
    let extractedSource = "";
    if (match) {
      const [, , lineNumber, message] = match;
      const start = Math.max(0, parseInt(lineNumber, 10) - 5);
      const end = Math.min(lines.length, parseInt(lineNumber, 10) + 5);

      for (let i = start; i < end; i++) {
        extractedSource +=
          `${i + 1}: ${lines[i]}` +
          (i === parseInt(lineNumber, 10) - 1 ? ` <<< error\n` : "\n");
      }

      console.error(
        message + " (at line " + lineNumber + "):\n" + extractedSource
      );
    }
  }
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
    const errorMessage = gl.getShaderInfoLog(shader) || "";
    console.error(
      "Errors occurred compiling the " +
        (type === gl.VERTEX_SHADER ? "vertex" : "fragment") +
        " shader: "
    );
    extractErrorMessages(errorMessage, source);

    throw new Error(
      "An error occurred compiling the " +
        (type === gl.VERTEX_SHADER ? "vertex" : "fragment") +
        " shader: " +
        errorMessage
    );
  }

  return shader;
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

function getUniformLocationOrThrow(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`unable to get uniform location for ${name}`);
  }
  return location;
}

// creates a buffer of float vertex attributes and binds it to the given attribute location
// assumes that the data for this attribute is stored linearly rather than interleaved
// with other attributes.
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

type ProgramInfo = {
  program: WebGLProgram;
  attribLocations: {
    aVertexPosition: number;
    aVertexColor: number;
    aTextureCoord: number;
    aTexturePieceRect: number;
  };
  uniformLocations: {
    projectionMatrix: WebGLUniformLocation;
    modelViewMatrix: WebGLUniformLocation;
    texture: WebGLUniformLocation;
    textureTransform: WebGLUniformLocation;
    backgroundPosition: WebGLUniformLocation;
  };
};

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
  const attributesDefined = new Set();

  const boundBuffers = [];

  const numVertices = positions.length / POSITION_COMPONENTS;

  // vertices that will be reused each render
  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "aVertexPosition", {
      attribLocation: programInfo.attribLocations.aVertexPosition,
      dataArray: positions,
      numComponents: POSITION_COMPONENTS,
      numVertices,
    })
  );
  attributesDefined.add("aVertexPosition");

  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "aVertexColor", {
      attribLocation: programInfo.attribLocations.aVertexColor,
      dataArray: colors,
      numComponents: COLOR_COMPONENTS,
      numVertices,
    })
  );
  attributesDefined.add("aVertexColor");

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
  attributesDefined.add("aTexturePieceRect");

  // Create a buffer for the texture coordinates
  const textureCoordinates: number[] = [];
  for (let i = 0; i < rects.length; i++) {
    const textureCoordinatesForRect = getRectTextureCoordinatesInTexture(
      rects[i].textureImagePieceRect,
      rects[i].textureImageSize
    );
    // for each rect vert
    for (
      let j = 0;
      j < RECT_VERTICES;
      j++ // 4 vertices per rect
    ) {
      textureCoordinates.push(
        textureCoordinatesForRect[j][0],
        textureCoordinatesForRect[j][1]
      );
    }

    // // just use full texture (for debuggging)
    // textureCoordinates.push(
    //   ...[0, 0], // top left
    //   ...[1, 0], // top right
    //   ...[0, 1], // bottom left
    //   ...[1, 1] // bottom right
    // );
  }
  console.log({ textureCoordinates });
  boundBuffers.push(
    createAndBindFloatAttribVertexArray(gl, "aTextureCoord", {
      attribLocation: programInfo.attribLocations.aTextureCoord,
      dataArray: textureCoordinates,
      numComponents: 2,
      numVertices,
    })
  );
  attributesDefined.add("aTextureCoord");

  {
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
  }

  const expectedAttributes = new Set(Object.keys(programInfo.attribLocations));
  // check that all attributes were set
  assertSetsMatch(expectedAttributes, attributesDefined, "attributes set");

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

const defaultTransform = mat4.create();

mat4.translate(
  defaultTransform, // destination matrix
  defaultTransform, // matrix to translate
  [-1, -1, 0] // translation vector. shift to the top left of the viewport
);

mat4.scale(
  defaultTransform, // destination matrix
  defaultTransform, // matrix to scale
  [2, 2, 1] // scaling vector. scale to the full viewport (-1 to 1)
);

function drawScene(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  buffers: RectsRenderBuffers,
  viewTransform: mat4,
  textureTransform: mat4
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
  // default transformation matrix first, then the view transformation matrix
  mat4.multiply(modelViewMatrix, modelViewMatrix, viewTransform);
  mat4.multiply(modelViewMatrix, modelViewMatrix, defaultTransform);

  // enable the vao
  gl.bindVertexArray(buffers.vao);
  checkErrors && checkGLError(gl, "binding vertex array object");

  // Tell WebGL to use our program when drawing

  gl.useProgram(programInfo.program);
  checkErrors && checkGLError(gl, "using program");

  const uniformsSet = new Set();

  // Set the shader uniforms

  gl.uniformMatrix4fv(
    programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  );
  checkErrors && checkGLError(gl, "setting projection matrix uniform");
  uniformsSet.add("projectionMatrix");

  gl.uniformMatrix4fv(
    programInfo.uniformLocations.modelViewMatrix,
    false,
    modelViewMatrix
  );
  checkErrors && checkGLError(gl, "setting model view matrix uniform");
  uniformsSet.add("modelViewMatrix");

  // enable the texture
  gl.activeTexture(gl.TEXTURE0);
  // TODO: bind the correct texture, not just the first one, once the rendering is batched by texture
  const { texture } = buffers.rects[0];
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.uniform1i(
    programInfo.uniformLocations.texture,
    0 /* index of texture unit */
  );
  uniformsSet.add("texture");

  gl.uniform1ui(
    programInfo.uniformLocations.backgroundPosition,
    BackgroundPosition.TopLeft
  );
  uniformsSet.add("backgroundPosition");

  gl.uniformMatrix4fv(
    programInfo.uniformLocations.textureTransform,
    false,
    textureTransform
    // mat4.invert(mat4.create(), viewTransform)
    // mat4.clone(viewTransform)
  );
  checkErrors && checkGLError(gl, "setting texture transform uniform");
  uniformsSet.add("textureTransform");

  // define array to draw the rectangles
  {
    const offset = 0;
    const count = buffers.rects.length * RECT_INDICES; // each rectangle has 6 indices: 2 triangles * 3 vertices
    const type = gl.UNSIGNED_SHORT;
    // TODO: draw in batches grouped by texture atlas
    gl.drawElements(gl.TRIANGLES, count, type, offset);
    checkErrors && checkGLError(gl, "drawing elements");
    drawCalls++;
  }

  const expectedUniforms = new Set(Object.keys(programInfo.uniformLocations));
  // check that all uniforms were set
  assertSetsMatch(expectedUniforms, uniformsSet, "uniforms set");

  gl.bindVertexArray(null); // unbind the vao
  return drawCalls;
}

export function initWebGLRenderer(
  gl: WebGL2RenderingContext,
  checkErrorsOpt = false
) {
  checkErrors = checkErrorsOpt;
  // Vertex shader program

  // Initialize a shader program; this is where all the lighting
  // for the vertices and so forth is established.
  const shaderProgram = initShaderProgram(
    gl,
    vertexShaderSource,
    fragmentShaderSource
  );

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
    },
    uniformLocations: {
      projectionMatrix: getUniformLocationOrThrow(
        gl,
        shaderProgram,
        "uProjectionMatrix"
      ),
      modelViewMatrix: getUniformLocationOrThrow(
        gl,
        shaderProgram,
        "uModelViewMatrix"
      ),
      texture: getUniformLocationOrThrow(gl, shaderProgram, "uSampler"),
      textureTransform: getUniformLocationOrThrow(
        gl,
        shaderProgram,
        "uTextureTransform"
      ),
      backgroundPosition: getUniformLocationOrThrow(
        gl,
        shaderProgram,
        "uBackgroundPosition"
      ),
    },
  };

  checkErrors && checkGLError(gl, "initWebGLRenderer");

  let buffers: RectsRenderBuffers | null = null;
  return {
    render(
      viewTransform: mat4 = mat4.create(),
      textureTransform: mat4 = mat4.create()
    ) {
      if (!buffers) {
        throw new Error(
          "render() called but setRenderableRects() was not called first to initialize scenegraph"
        );
      }
      // Draw the scene
      return drawScene(
        gl,
        programInfo,
        buffers,
        viewTransform,
        textureTransform
      );
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
  texturePieceRect: Rect,
  textureDimensions: Vec2d
): vec2[] {
  const { x, y } = texturePieceRect.position;
  const { x: width, y: height } = texturePieceRect.size;
  const { x: textureWidth, y: textureHeight } = textureDimensions;

  // normalized texture coordinates
  const textureCoordinates = [
    vec2.fromValues(x / textureWidth, y / textureHeight), // top left
    vec2.fromValues((x + width) / textureWidth, y / textureHeight), // top right
    vec2.fromValues(x / textureWidth, (y + height) / textureHeight), // bottom left
    vec2.fromValues((x + width) / textureWidth, (y + height) / textureHeight), // bottom right
  ];

  // texel space texture coordinates
  // const textureCoordinates = [
  //   vec2.fromValues(x, y), // top left
  //   vec2.fromValues(x + width, y), // top right
  //   vec2.fromValues(x, y + height), // bottom left
  //   vec2.fromValues(x + width, y + height), // bottom right
  // ];
  return textureCoordinates;
}
