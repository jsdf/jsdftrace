import { mat4 } from "gl-matrix";
import { nullthrows } from "./nullthrows";
import Rect from "./Rect";

export type RenderableRect = {
  rect: Rect;
  backgroundColor: number[];
  texture?: WebGLTexture;
};
const SIZE_OF_FLOAT32 = 4;
const POSITION_COMPONENTS = 3;
const RECT_VERTICES = 4;
const RECT_INDICES = 6; // 2 triangles
const COLOR_COMPONENTS = 4;
const CHECK_ERRORS = true;

// this renderer builds arrays of vertices and vertex colors each render

const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying lowp vec4 vColor;

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vColor = aVertexColor;
    }
  `;

const fsSource = `
    varying lowp vec4 vColor;

    void main(void) {
      gl_FragColor = vColor;
    }
  `;

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string
) {
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

export function rectsToBuffers(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  renderableRects: RenderableRect[]
) {
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
    positions.push(x, y, 1);
    positions.push(x + width, y, 1);
    positions.push(x, y + height, 1);
    positions.push(x + width, y + height, 1);

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
    numRects: renderableRects.length,
  });
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
    numRects,
  }: {
    programInfo: ProgramInfo;
    positions: number[];
    colors: number[];
    indices: number[];
    numRects: number;
  }
): WebGLRenderBuffers {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("unable to create vertex array object");
  }
  gl.bindVertexArray(vao);

  // vertices that will be reused each render
  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) {
    throw new Error("unable to create position buffer");
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  CHECK_ERRORS && checkGLError(gl, "setting bufferData to position buffer");
  // Tell WebGL how to pull out the positions from the position
  // buffer into the shader vertexPosition attribute
  {
    const numComponents = POSITION_COMPONENTS;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = numComponents * SIZE_OF_FLOAT32;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(
      programInfo.attribLocations.vertexPosition,
      numComponents,
      type,
      normalize,
      stride,
      0 // offset
    );
    CHECK_ERRORS &&
      checkGLError(gl, "setting vertexPosition attribute pointer");
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    CHECK_ERRORS && checkGLError(gl, "enabling vertexPosition attribute");
  }

  // vertex colors that will be reused each render
  const colorBuffer = gl.createBuffer();
  if (!colorBuffer) {
    throw new Error("unable to create color buffer");
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  CHECK_ERRORS && checkGLError(gl, "setting bufferData to color buffer");

  // Tell WebGL how to pull out the colors from the color buffer
  // into the shader vertexColor attribute.
  {
    const numComponents = COLOR_COMPONENTS;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = numComponents * SIZE_OF_FLOAT32;
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.vertexAttribPointer(
      programInfo.attribLocations.vertexColor,
      numComponents,
      type,
      normalize,
      stride,
      0 // offset
    );
    CHECK_ERRORS && checkGLError(gl, "setting vertexColor attribute pointer");
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
    CHECK_ERRORS && checkGLError(gl, "enabling vertexColor attribute");
  }

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

  gl.bindVertexArray(null); // unbind the vao

  return {
    numRects,
    positionBuffer,
    positionLength: positions.length,
    colorBuffer,
    vao,
  };
}

export function releaseBuffers(
  gl: WebGL2RenderingContext,
  buffers: WebGLRenderBuffers
) {
  gl.deleteBuffer(buffers.positionBuffer);
  gl.deleteBuffer(buffers.colorBuffer);
  gl.deleteVertexArray(buffers.vao);
}

type ProgramInfo = {
  program: WebGLProgram;
  attribLocations: {
    vertexPosition: number;
    vertexColor: number;
  };
  uniformLocations: {
    projectionMatrix: WebGLUniformLocation;
    modelViewMatrix: WebGLUniformLocation;
  };
};
export type WebGLRenderBuffers = {
  numRects: number;
  positionBuffer: WebGLBuffer;
  positionLength: number;
  colorBuffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
};

function drawScene(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  buffers: WebGLRenderBuffers
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
  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();

  // orthographic projection. flip y axis
  mat4.ortho(projectionMatrix, -1, 1, 1, -1, zNear, zFar);

  // drawing position starts as the identity point, which is the center of the
  // scene
  const modelViewMatrix = mat4.create();

  // offset to top left
  mat4.translate(
    modelViewMatrix, // destination matrix
    modelViewMatrix, // matrix to translate
    [-0.0, 0.0, -6.0] // ??? don't understand how this works
  ); // amount to translate

  // enable the vao
  gl.bindVertexArray(buffers.vao);
  CHECK_ERRORS && checkGLError(gl, "binding vertex array object");

  // Tell WebGL to use our program when drawing

  gl.useProgram(programInfo.program);
  CHECK_ERRORS && checkGLError(gl, "using program");

  // Set the shader uniforms

  gl.uniformMatrix4fv(
    programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  );
  CHECK_ERRORS && checkGLError(gl, "setting projection matrix uniform");
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.modelViewMatrix,
    false,
    modelViewMatrix
  );
  CHECK_ERRORS && checkGLError(gl, "setting model view matrix uniform");

  // draw the rectangles
  {
    const offset = 0;
    const count = buffers.numRects * RECT_INDICES; // each rectangle has 6 indices: 2 triangles
    const type = gl.UNSIGNED_SHORT;
    gl.drawElements(gl.TRIANGLES, count, type, offset);
    CHECK_ERRORS && checkGLError(gl, "drawing elements");
    drawCalls++;
  }

  gl.bindVertexArray(null); // unbind the vao
  return drawCalls;
}

export function initWebGLRenderer(gl: WebGL2RenderingContext) {
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
      vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
      vertexColor: gl.getAttribLocation(shaderProgram, "aVertexColor"),
    },
    uniformLocations: {
      projectionMatrix: nullthrows(
        gl.getUniformLocation(shaderProgram, "uProjectionMatrix")
      ),
      modelViewMatrix: nullthrows(
        gl.getUniformLocation(shaderProgram, "uModelViewMatrix")
      ),
    },
  };

  let buffers: WebGLRenderBuffers | null = null;
  return {
    render() {
      if (!buffers) {
        throw new Error(
          "render() called but setRenderableRects() was not called first to initialize scenegraph"
        );
      }
      // Draw the scene
      return drawScene(gl, programInfo, buffers);
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
