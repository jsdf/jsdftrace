import { mat4, vec2, vec3 } from "gl-matrix";
import Rect from "./Rect";
import vertexShaderSource from "./vertexShader.glsl";
import fragmentShaderSource from "./fragmentShader.glsl";
import Vec2d from "./Vec2d";
import { nullthrows } from "./nullthrows";

export type RenderableRect = {
  rect: Rect;
  backgroundColor: number[];
  texture: WebGLTexture;
  textureImageSize: Vec2d;
  textureImagePieceRect: Rect;
  textureOffset: Vec2d;
};
const SIZE_OF_FLOAT32 = 4;
const POSITION_COMPONENTS = 3;
const RECT_VERTICES = 4;
const RECT_INDICES = 6; // 2 triangles
const COLOR_COMPONENTS = 4;
let checkErrors = true; // TODO: turn this off in release builds

export enum BackgroundPosition {
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

  const numUniforms = gl.getProgramParameter(shaderProgram, gl.ACTIVE_UNIFORMS);

  // Loop through all the active uniforms
  for (let i = 0; i < numUniforms; ++i) {
    // Get the information about the uniform
    const uniformInfo = nullthrows(gl.getActiveUniform(shaderProgram, i));

    // Log the uniform name
    console.log(
      `Uniform ${i}: Name = ${uniformInfo.name}, Type = ${uniformInfo.type}, Size = ${uniformInfo.size}`
    );
  }

  // Get the number of active attributes in the shader program
  const numAttributes = gl.getProgramParameter(
    shaderProgram,
    gl.ACTIVE_ATTRIBUTES
  );

  // Loop through all the active attributes
  for (let i = 0; i < numAttributes; ++i) {
    // Get the information about the attribute
    const attributeInfo = nullthrows(gl.getActiveAttrib(shaderProgram, i));

    // Log the attribute name
    console.log(
      `Attribute ${i}: Name = ${attributeInfo.name}, Type = ${attributeInfo.type}, Size = ${attributeInfo.size}`
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

function makeUniformSetter(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo
) {
  const uniformsSet = new Set();

  const expectedUniforms = new Set(uniformNames);

  function set(
    name: Uniforms,
    setter: (location: WebGLUniformLocation) => void
  ) {
    expectedUniforms.has(name);
    const uniformLocations = programInfo.uniformLocations as {
      [key in Uniforms]: WebGLUniformLocation;
    };
    const location = uniformLocations[name];
    setter(location);

    checkErrors && checkGLError(gl, "setting " + name + " uniform");
    uniformsSet.add(name);
  }

  function checkAllSet() {
    const expectedUniforms = new Set(Object.keys(programInfo.uniformLocations));
    // check that all uniforms were set
    assertSetsMatch(expectedUniforms, uniformsSet, "uniforms set");
  }
  return {
    set,
    checkAllSet,
  };
}

function makeAttribSetter(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo
) {
  const attributesSet = new Set();

  const expectedAttributes = new Set(attributeNames);

  const boundBuffers: WebGLBuffer[] = [];

  function set(
    name: Attributes,
    setter: (location: number, name: Attributes) => void
  ): WebGLBuffer | null {
    expectedAttributes.has(name);
    const attribLocations = programInfo.attribLocations as {
      [key in Attributes]: number;
    };
    const location = attribLocations[name];

    const buffer = setter(location, name);
    if (buffer != null) {
      boundBuffers.push(buffer);
    }

    checkErrors && checkGLError(gl, "setting " + name + " attribute");
    attributesSet.add(name);
    return null;
  }

  function checkAllSet() {
    const expectedAttributes = new Set(
      Object.keys(programInfo.attribLocations)
    );
    // check that all attributes were set
    assertSetsMatch(expectedAttributes, attributesSet, "attributes set");
  }
  return {
    set,
    checkAllSet,
    getBoundBuffers: () => boundBuffers,
  };
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

const attributeNames = [
  "aVertexPosition",
  "aVertexColor",
  "aTextureCoord",
  "aTexturePieceRect",
  "aRectTexturedAreaRatio",
  "aRectSize",
  "aTextureOffset",
] as const;

type Attributes = (typeof attributeNames)[number];

const uniformNames = [
  "uProjectionMatrix",
  "uModelViewMatrix",
  "uTextureSampler",
  "uModelViewScale",
  "uBackgroundPosition",
  "uViewportSize",
  "uTextureOffset",
] as const;

type Uniforms = (typeof uniformNames)[number];

type ProgramInfo = {
  program: WebGLProgram;
  attribLocations: {
    [key in Attributes]: number;
  };
  uniformLocations: { [key in Uniforms]: WebGLUniformLocation };
};

export type RectsRenderBuffers = {
  rects: RenderableRect[];
  boundBuffers: WebGLBuffer[];
  vao: WebGLVertexArrayObject;
  texturesToElementRanges: Map<WebGLTexture, { start: number; count: number }>;
};

// whenever the geometry changes, we need to reinitialize the buffers
// but then we'll reuse the buffers for each render call

function initBuffers(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  rectsUnsorted: RenderableRect[]
): RectsRenderBuffers {
  const rectsByTexture = new Map<WebGLTexture, RenderableRect[]>();
  rectsUnsorted.forEach((rect) => {
    const { texture } = rect;
    let rectsForTexture = rectsByTexture.get(texture);
    if (!rectsForTexture) {
      rectsForTexture = [];
      rectsByTexture.set(texture, rectsForTexture);
    }
    rectsForTexture.push(rect);
  });

  // rects are sorted by texture, so we can batch draw calls by texture
  const rects = Array.from(rectsByTexture.values()).flat();
  const texturesToElementRanges = new Map();
  let index = 0;
  rectsByTexture.forEach((rectsForTexture) => {
    const count = rectsForTexture.length * RECT_INDICES;
    const texture = rectsForTexture[0]?.texture;
    if (texture == null) {
      throw new Error("texture for rect not found");
    }
    texturesToElementRanges.set(texture, {
      start: index,
      count,
    });
    index += count;
  });

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // TODO: interleave vertex attributes?
  // TODO: sort rects by texture atlas
  for (let i = 0; i < rects.length; i++) {
    const renderableRect = rects[i];
    const { x, y } = renderableRect.rect.position;
    const { x: width, y: height } = renderableRect.rect.size;
    const startIndex = i * RECT_VERTICES;
    // 2 triangles for a rectangle
    indices.push(startIndex, startIndex + 1, startIndex + 2);
    indices.push(startIndex + 1, startIndex + 2, startIndex + 3);

    // z value is used to define stacking order
    // just using rect index for now
    const z = 1 - i / rects.length;

    // 4 vertices for a rectangle, each with 3 components
    positions.push(x, y, z); // top left
    positions.push(x + width, y, z); // top right
    positions.push(x, y + height, z); // bottom left
    positions.push(x + width, y + height, z); // bottom right

    const color = renderableRect.backgroundColor;
    for (let i = 0; i < RECT_VERTICES; i++) {
      colors.push(...color);
    }
  }
  console.log("positions", positions);
  console.log("colors", colors);
  console.log("indices", indices);
  console.log("rects", rects);

  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("unable to create vertex array object");
  }
  gl.bindVertexArray(vao);
  const attributes = makeAttribSetter(gl, programInfo);

  const numVertices = positions.length / POSITION_COMPONENTS;

  // vertices that will be reused each render
  attributes.set("aVertexPosition", (attribLocation) =>
    createAndBindFloatAttribVertexArray(gl, "aVertexPosition", {
      attribLocation,
      dataArray: positions,
      numComponents: POSITION_COMPONENTS,
      numVertices,
    })
  );

  attributes.set("aVertexColor", (attribLocation, name) =>
    createAndBindFloatAttribVertexArray(gl, name, {
      attribLocation,
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
        // position of the texture piece in the texture atlas in texture coordinate space
        rect.textureImagePieceRect.position.x / rect.textureImageSize.x,
        rect.textureImagePieceRect.position.y / rect.textureImageSize.y,
        // the size of the texture piece in the texture atlas in texture coordinate space
        rect.textureImagePieceRect.size.x / rect.textureImageSize.x,
        rect.textureImagePieceRect.size.y / rect.textureImageSize.y
      );
    }
  });
  attributes.set("aTexturePieceRect", (attribLocation, name) =>
    createAndBindFloatAttribVertexArray(gl, name, {
      attribLocation,
      dataArray: texturePieceRects,
      numComponents: 4,
      numVertices,
    })
  );

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
  }
  console.log({ textureCoordinates });
  attributes.set("aTextureCoord", (attribLocation, name) =>
    createAndBindFloatAttribVertexArray(gl, name, {
      attribLocation,
      dataArray: textureCoordinates,
      numComponents: 2,
      numVertices,
    })
  );

  // Create a buffer for the texture ratio
  const rectTexturedAreaRatio: number[] = [];
  rects.forEach((rect: RenderableRect) => {
    // for each rect vert
    for (let i = 0; i < RECT_VERTICES; i++) {
      rectTexturedAreaRatio.push(
        // The ratio of the textured area to the rect size.
        // Basically, how much smaller the textured region is than
        // the rect.
        // Note: this assumes that the texture piece will be rendered
        // at 1:1 pixel scale with the rect.
        rect.textureImagePieceRect.size.x / rect.rect.size.x,
        rect.textureImagePieceRect.size.y / rect.rect.size.y
      );
    }
  });
  console.log({ rectTexturedAreaRatio });
  attributes.set("aRectTexturedAreaRatio", (attribLocation, name) =>
    createAndBindFloatAttribVertexArray(gl, name, {
      attribLocation,
      dataArray: rectTexturedAreaRatio,
      numComponents: 2,
      numVertices,
    })
  );

  // Create a buffer for the rect size
  const rectSizes: number[] = [];
  rects.forEach((rect: RenderableRect) => {
    // for each rect vert
    for (let i = 0; i < RECT_VERTICES; i++) {
      rectSizes.push(rect.rect.size.x, rect.rect.size.y);
    }
  });
  console.log({ rectSizes });
  attributes.set("aRectSize", (attribLocation, name) =>
    createAndBindFloatAttribVertexArray(gl, name, {
      attribLocation,
      dataArray: rectSizes,
      numComponents: 2,
      numVertices,
    })
  );

  // Create a buffer for the texture offset
  const textureOffsets: number[] = [];
  rects.forEach((rect: RenderableRect) => {
    // for each rect vert
    for (let i = 0; i < RECT_VERTICES; i++) {
      textureOffsets.push(rect.textureOffset.x, rect.textureOffset.y);
    }
  });
  console.log({ textureOffsets });
  attributes.set("aTextureOffset", (attribLocation, name) =>
    createAndBindFloatAttribVertexArray(gl, name, {
      attribLocation,
      dataArray: textureOffsets,
      numComponents: 2,
      numVertices,
    })
  );

  const indexBuffer = gl.createBuffer();
  {
    if (!indexBuffer) {
      throw new Error("unable to create index buffer");
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(indices),
      gl.STATIC_DRAW
    );
  }

  attributes.checkAllSet();

  gl.bindVertexArray(null); // unbind the vao

  return {
    rects,
    boundBuffers: attributes.getBoundBuffers().concat(indexBuffer),
    texturesToElementRanges,
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
  {
    viewTransform,
    backgroundPosition,
    viewport,
    textureOffset,
  }: {
    viewport: vec2;
    viewTransform: mat4;
    backgroundPosition: BackgroundPosition;
    textureOffset: vec2;
  }
) {
  // when rendering textures in screen space, we need to scale the texture
  // coordinates along with the view transform so that the texture doesn't
  // stretch as the view is zoomed in.
  const modelViewScaling3d = mat4.getScaling(vec3.create(), viewTransform);
  const modelViewScaling = vec2.fromValues(
    modelViewScaling3d[0],
    modelViewScaling3d[1]
  );

  let drawCalls = 0;
  gl.clearColor(0, 0, 0, 1.0); // black, fully opaque
  gl.clearDepth(1.0); // Clear everything
  gl.enable(gl.DEPTH_TEST); // Enable depth testing
  gl.depthFunc(gl.LEQUAL); // Near things obscure far things
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // execute clear canvas

  // Orthographic projection with a width/height
  // ratio that matches the display size of the canvas.
  // Use z-values between -1 and 1 as stacking order.
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
  // vertex positions are in pixels, scale to NDC
  mat4.scale(
    modelViewMatrix, // destination matrix
    modelViewMatrix, // matrix to scale
    [1 / viewport[0], 1 / viewport[1], 1] // scaling vector
  );

  mat4.multiply(modelViewMatrix, modelViewMatrix, defaultTransform);

  // enable the vao
  gl.bindVertexArray(buffers.vao);
  checkErrors && checkGLError(gl, "binding vertex array object");

  // Tell WebGL to use our program when drawing

  gl.useProgram(programInfo.program);
  checkErrors && checkGLError(gl, "using program");

  const uniforms = makeUniformSetter(gl, programInfo);

  // Set the shader uniforms
  uniforms.set("uProjectionMatrix", (location) => {
    gl.uniformMatrix4fv(location, false, projectionMatrix);
  });

  uniforms.set("uModelViewMatrix", (location) => {
    gl.uniformMatrix4fv(location, false, modelViewMatrix);
  });

  uniforms.set("uTextureSampler", (location) => {
    gl.uniform1i(location, 0 /* index of texture unit */);
  });

  uniforms.set("uBackgroundPosition", (location) => {
    gl.uniform1ui(location, backgroundPosition);
  });

  uniforms.set("uModelViewScale", (location) => {
    gl.uniform2fv(location, modelViewScaling);
  });

  uniforms.set("uViewportSize", (location) => {
    gl.uniform2fv(location, viewport);
  });

  uniforms.set("uTextureOffset", (location) => {
    gl.uniform2fv(location, textureOffset);
  });

  // enable the texture
  gl.activeTexture(gl.TEXTURE0);

  // draw in batches
  for (let [
    texture,
    { start: offset, count },
  ] of buffers.texturesToElementRanges) {
    // bind the texture of the current texture atlas batch
    gl.bindTexture(gl.TEXTURE_2D, texture);
    checkErrors && checkGLError(gl, "binding texture");
    const type = gl.UNSIGNED_SHORT;
    gl.drawElements(gl.TRIANGLES, count, type, offset);
    checkErrors && checkGLError(gl, "drawing elements");
    drawCalls++;
  }

  uniforms.checkAllSet();

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
    attribLocations: Object.fromEntries(
      attributeNames.map((name: Attributes) => [
        name,
        getAttribLocationOrThrow(gl, shaderProgram, name),
      ])
    ) as { [key in Attributes]: number },
    uniformLocations: Object.fromEntries(
      uniformNames.map((name: Uniforms) => [
        name,
        getUniformLocationOrThrow(gl, shaderProgram, name),
      ])
    ) as { [key in Uniforms]: WebGLUniformLocation },
  };

  checkErrors && checkGLError(gl, "initWebGLRenderer");

  let buffers: RectsRenderBuffers | null = null;
  return {
    render({
      viewport,
      viewTransform = mat4.create(),
      backgroundPosition = BackgroundPosition.TopLeft,
      textureOffset = vec2.create(),
    }: {
      viewport: vec2;
      viewTransform: mat4;
      backgroundPosition: BackgroundPosition;
      textureOffset: vec2;
    }) {
      if (!buffers) {
        throw new Error(
          "render() called but setRenderableRects() was not called first to initialize scenegraph"
        );
      }
      // Draw the scene
      return drawScene(gl, programInfo, buffers, {
        viewport,
        viewTransform,
        backgroundPosition,
        textureOffset,
      });
    },
    setRenderableRects: (renderableRects: RenderableRect[]) => {
      if (buffers) {
        releaseBuffers(gl, buffers);
      }
      buffers = initBuffers(gl, programInfo, renderableRects);
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
