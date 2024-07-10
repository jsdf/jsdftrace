import { mat4, vec2 } from "gl-matrix";
import { nullthrows } from "./nullthrows";
import Rect from "./Rect";

export type RenderableRect = {
  rect: Rect;
  backgroundColor: number[];
  texture: WebGLTexture;
  textureImageSize: vec2;
  textureCoordinates: vec2[];
};
const SIZE_OF_FLOAT32 = 4;
const POSITION_COMPONENTS = 3;
const RECT_VERTICES = 4;
const RECT_INDICES = 6; // 2 triangles
const COLOR_COMPONENTS = 4;
let checkErrors = false;

// this renderer builds arrays of vertices and vertex colors each render

const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;
    attribute vec2 aTextureCoord;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix; 

    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoord; 

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition; 
      vColor = aVertexColor;
      vTextureCoord = aTextureCoord;
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
// in screen space) to sample the texture, combined with GL_TEXTURE_RECTANGLE textures, which
// gives us access to sample the texture at texel coordinates rather than normalized coordinates.
// - we would still need to calculate the screen space coordinates of the corner of the rectangle
// we're pinning the texture to, so we can correctly offset the local texel coordinates to align
// the texture with the rectangle.
// - we would also need to know the position of the texture piece within the texture atlas,
// - so we can correctly offset the texture coordinates to sample the correct piece of the texture.
const fsSource = `
    precision mediump float;

    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoord;

    uniform sampler2D uSampler;
    uniform vec2 textureSize;  // Texture dimensions

    void main(void) { 
      if (vTextureCoord.x>10.0) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      // Calculate screen space coordinates
        vec2 screenCoords = vTextureCoord * textureSize / vec2(gl_FragCoord.xy);
        // TODO: doesn't seem to work correctly. do i also need to account for the ratio
        // of the visible portion of the texture to the full texture size?
        gl_FragColor = texture2D(uSampler, screenCoords);
      } 

      gl_FragColor = texture2D(uSampler, vTextureCoord);
      // gl_FragColor = vec4(vTextureCoord.xy, 1.0, 1.0); // debug texture coordinates

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
    vertexPosition: number;
    vertexColor: number;
    textureCoord: number;
  };
  uniformLocations: {
    projectionMatrix: WebGLUniformLocation;
    modelViewMatrix: WebGLUniformLocation;
    texture: WebGLUniformLocation;
    textureSize: WebGLUniformLocation;
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
  console.log(
    "gl.MAX_TEXTURE_IMAGE_UNITS:",
    gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
  );

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
  checkErrors && checkGLError(gl, "setting bufferData to position buffer");
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
    checkErrors && checkGLError(gl, "setting vertexPosition attribute pointer");
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkErrors && checkGLError(gl, "enabling vertexPosition attribute");
  }

  // vertex colors that will be reused each render
  const colorBuffer = gl.createBuffer();
  if (!colorBuffer) {
    throw new Error("unable to create color buffer");
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  checkErrors && checkGLError(gl, "setting bufferData to color buffer");

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
    checkErrors && checkGLError(gl, "setting vertexColor attribute pointer");
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
    checkErrors && checkGLError(gl, "enabling vertexColor attribute");
  }

  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  const textureCoordinates = rects.flatMap((rect: RenderableRect) =>
    rect.textureCoordinates.flatMap((coord: vec2) => [coord[0], coord[1]])
  );
  console.log({ textureCoordinates });
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(textureCoordinates),
    gl.STATIC_DRAW
  );

  // Tell WebGL how to pull out the texture coordinates from the textureCoordBuffer
  {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = numComponents * SIZE_OF_FLOAT32;
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.vertexAttribPointer(
      programInfo.attribLocations.textureCoord,
      numComponents,
      type,
      normalize,
      stride,
      0 // offset
    );
    checkErrors && checkGLError(gl, "setting textureCoord attribute pointer");
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkErrors && checkGLError(gl, "enabling textureCoord attribute");
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
    rects,
    positionBuffer,
    positionLength: positions.length,
    colorBuffer,
    vao,
  };
}

export function releaseBuffers(
  gl: WebGL2RenderingContext,
  buffers: RectsRenderBuffers
) {
  gl.deleteBuffer(buffers.positionBuffer);
  gl.deleteBuffer(buffers.colorBuffer);
  gl.deleteVertexArray(buffers.vao);
}

export type RectsRenderBuffers = {
  rects: RenderableRect[];
  positionBuffer: WebGLBuffer;
  positionLength: number;
  colorBuffer: WebGLBuffer;
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
  const { texture, textureImageSize } = buffers.rects[0];
  gl.bindTexture(gl.TEXTURE_2D, texture); //  TODO: bind the correct texture

  // gl.bindTexture(gl.TEXTURE_2D, checkerboardTexture);
  gl.uniform1i(
    programInfo.uniformLocations.texture,
    0 /* index of texture unit */
  );

  // Set the texture size uniform
  gl.uniform2f(
    programInfo.uniformLocations.textureSize,
    textureImageSize[0],
    textureImageSize[1]
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
      vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
      vertexColor: gl.getAttribLocation(shaderProgram, "aVertexColor"),
      textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
    },
    uniformLocations: {
      projectionMatrix: nullthrows(
        gl.getUniformLocation(shaderProgram, "uProjectionMatrix")
      ),
      modelViewMatrix: nullthrows(
        gl.getUniformLocation(shaderProgram, "uModelViewMatrix")
      ),
      texture: nullthrows(gl.getUniformLocation(shaderProgram, "uSampler")),
      textureSize: nullthrows(
        gl.getUniformLocation(shaderProgram, "textureSize")
      ),
    },
  };

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

  const textureCoordinates = [
    vec2.fromValues(x / textureDimensions.width, y / textureDimensions.height), // top left
    vec2.fromValues(
      (x + width) / textureDimensions.width,
      y / textureDimensions.height
    ), // top right
    vec2.fromValues(
      x / textureDimensions.width,
      (y + height) / textureDimensions.height
    ), // bottom left
    vec2.fromValues(
      (x + width) / textureDimensions.width,
      (y + height) / textureDimensions.height
    ), // bottom right
  ];
  return textureCoordinates;
}
