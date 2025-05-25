#version 300 es
precision highp float;

in vec4 aVertexPosition;
in vec4 aVertexColor;
in vec2 aTextureCoord;
in vec4 aTexturePieceRect; // size of the texture piece in texture coordinate space {x, y, z:width, w:height}.
// Effectively, how much smaller (or larger, if clipped) the textured area is than the rect. Used to scale the texture coordinates. 
// This is useful when converting between texture and vertex coordinates:
// transforming a vertex position by the model view matrix is sufficient to convert the vertex position to screen space,
// however, the textured area only takes up a portion of the rect, so if we want the textured area to maintain its size relative to the rect
// as the rect is scaled, we need to scale the texture coordinates by the ratio of the textured area to the rect size.
// We can also use this ratio to find the screen space size of the textured area, by multiplying the rect size in screen space by this ratio.
in vec2 aRectTexturedAreaRatio;
in vec4 aRect; // size of the rectangle in vertex coordinates {x, y, z:width, w:height}
in vec2 aTextureOffset; // offset (translation) to apply to the texture in screen space

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform uint uBackgroundPosition; // BackgroundPosition enum
uniform vec2 uModelViewScale; // scaling factor for the model view matrix, used to scale the texture coordinates
uniform vec2 uViewportSize; // Viewport size in pixels (e.g., vec2(800, 600))
uniform vec2 uTextureOffset; // Offset to apply to the texture in screen space

uniform vec3 uMouse; // x,y = mouse position in screen space, z = mouse button state (0.0f = up, 1.0f = down)

out vec4 vColor;
out vec2 vTextureCoord;
out vec4 vTextureClippingCoords;
out vec4 vScreenSpaceRect;
flat out uint vHovered;

/*
enum BackgroundPosition {
  TopLeft = 0,
  TopRight = 1,
  BottomLeft = 2,
  BottomRight = 3,
  StretchToFill = 4,
}
*/
const uint BackgroundPositionTopLeft = 0u;
const uint BackgroundPositionTopRight = 1u;
const uint BackgroundPositionBottomLeft = 2u;
const uint BackgroundPositionBottomRight = 3u;
const uint BackgroundPositionStretchToFill = 4u;

// Function to translate texture coordinates by a pixel offset in screen space
vec2 screenspaceOffsetToTextureCoordOffset(
    vec2 pixelOffset, 
    // the size of the texture piece in texture coordinates
    // e.g. how much of the texture does the texture piece take up
    vec2 texturePieceSizeInTextureSpace
) { 
    // Calculate the size of a screen pixel in rect space (e.g. how much of the rect does a pixel take up)
    vec2 pixelSizeInRectSpace = vec2(1.0f, 1.0f) / aRect.zw; // e.g. how much of the rect does a pixel take up

    // Convert the screen pixel offset to a rect space offset
    vec2 rectSpaceOffset = pixelOffset * pixelSizeInRectSpace; // e.g how much of the rect does the pixel offset correspond to

    // Convert the rectSpace coordinate offset to texture coordinate space considering the texture piece size
    vec2 texSpaceOffset = rectSpaceOffset * texturePieceSizeInTextureSpace;

    return texSpaceOffset;
}

// scale the texture coordinates so that the texture piece maintains a constant size on the screen
// as the rect is scaled. This is done by scaling the texture coordinates by the model view scaling vector
// and takes into account the offset of the texture piece within the texture.
vec2 scaleTexCoordsToConstantScreenSize(
    vec2 texCoords
) { 

    // 1. take the texture coordinates of the texture piece

    vec2 texturePieceCoords = texCoords;

    // 2. offset so the top left of the texture piece moves to the origin

    vec2 texturePieceTopLeft = aTexturePieceRect.xy;
    texturePieceCoords -= texturePieceTopLeft; 

    // 3. scale texture coords by the model view scaling vector
    //  as we zoom in the rect gets larger, but we want the
    //  texture to stay the same size, so we need to shrink the texture
    //  relative to the rect, in other words scaling the texture coordinates
    //  up. we need to scale the texture coordinates up because if the texture
    //  coordinates are larger, the visible texture area will encompass more
    //  of the texture, and thus the texture piece we want to display will be
    //  smaller.
    //  NOTE: as a result of this we then need to clip away the excess
    //  texture area, because when zooming in it will now include parts of the 
    //  texture that are not part of the texture piece we want to display.
    //  this is handled in the fragment shader by applying the vTextureClippingCoords.
    //  we divide by the rect texture ratio to scale the texture coordinates

    // scale the texture coordinates by the ratio of the textured area to the rect size
    texturePieceCoords /= aRectTexturedAreaRatio;
    // scale the texture coordinates by the model view scaling vector
    texturePieceCoords *= uModelViewScale;

    // 4. undo offset, moving the top left of the texture piece back to its original position

    texturePieceCoords += texturePieceTopLeft;

    return texturePieceCoords;
}

vec4 getScreenSpaceRect() {    // Define the four corners of the rectangle in object space
    vec4 corners[4];
    corners[0] = vec4(aRect.xy, 0.0f, 1.0f); // Bottom-left
    corners[1] = vec4(aRect.x + aRect.z, aRect.y, 0.0f, 1.0f); // Bottom-right
    corners[2] = vec4(aRect.x, aRect.y + aRect.w, 0.0f, 1.0f); // Top-left
    corners[3] = vec4(aRect.x + aRect.z, aRect.y + aRect.w, 0.0f, 1.0f); // Top-right

    // Transform the corners to clip space
    for(int i = 0 ; i < 4 ; ++i) {
        corners[i] = uProjectionMatrix * uModelViewMatrix * corners[i];
    }

    // Convert clip space to NDC
    for(int i = 0 ; i < 4 ; ++i) {
        corners[i] /= corners[i].w;
    }

    // Convert NDC to screen space
    vec2 screenCorners[4];
    for(int i = 0 ; i < 4 ; ++i) {
        screenCorners[i] = (corners[i].xy * 0.5f + 0.5f) * uViewportSize;
    }

    // Compute the bounding box in screen space
    vec2 minScreenSpace = min(min(screenCorners[0], screenCorners[1]), min(screenCorners[2], screenCorners[3]));
    vec2 maxScreenSpace = max(max(screenCorners[0], screenCorners[1]), max(screenCorners[2], screenCorners[3]));

    // Pass the screen space rectangle to the fragment shader
    return vec4(minScreenSpace, maxScreenSpace);

}

void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vColor = aVertexColor;

    vTextureClippingCoords = vec4(aTexturePieceRect.xy, (aTexturePieceRect.xy + aTexturePieceRect.zw));

    vTextureCoord = aTextureCoord;

    if(uBackgroundPosition == BackgroundPositionStretchToFill) {
        vTextureCoord = aTextureCoord;
    } else if(uBackgroundPosition == BackgroundPositionTopLeft) {
        vTextureCoord = scaleTexCoordsToConstantScreenSize(vTextureCoord);
        // apply pixel offset to the texture coordinates
        vTextureCoord -= screenspaceOffsetToTextureCoordOffset(uTextureOffset, aTexturePieceRect.zw / aRectTexturedAreaRatio);
    } else if(uBackgroundPosition == BackgroundPositionTopRight ||
        uBackgroundPosition == BackgroundPositionBottomLeft ||
        uBackgroundPosition == BackgroundPositionBottomRight) {
        vColor = vec4(1.0f, 1.0f, 0.0f, 1.0f); // not implemented 
    } else {
        vColor = vec4(1.0f, 0.0f, 0.0f, 1.0f); // error 
    }

    vScreenSpaceRect = getScreenSpaceRect();

    // check if mouse pos is in screen space rect
    vHovered = uMouse.x >= vScreenSpaceRect.x && uMouse.x <= vScreenSpaceRect.z && uMouse.y >= vScreenSpaceRect.y && uMouse.y <= vScreenSpaceRect.w ? 1u : 0u;

    if(aTextureOffset.x > 9999.0f) {
        return;
    }
}