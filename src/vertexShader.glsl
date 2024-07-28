#version 300 es
precision highp float;

in vec4 aVertexPosition;
in vec4 aVertexColor;
in vec2 aTextureCoord;
in vec4 aTexturePieceRect; // x, y, z:width, w:height
in vec2 aRectTextureRatio;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform sampler2D uSampler;
uniform uint uBackgroundPosition;
uniform vec2 uModelViewScale;

out vec4 vColor;
out vec2 vTextureCoord;
out vec4 textureClippingCoords;

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

vec2 scaleTexCoordsToConstantScreenSize(vec2 totalTextureSize) { 
        // scale the texture coordinates inversely:

        // 1. take the texture coordinates of the texture piece
    vec2 texturePieceCoords = aTextureCoord;

        // 2. offset by the top left of the piece within the texture

    vec2 texturePieceTopLeft = aTexturePieceRect.xy / totalTextureSize;
    texturePieceCoords -= texturePieceTopLeft; 

        // 3. apply the inverse of the view transform:
        //  because as we zoom in the rect gets larger, but we want the
        //  texture to stay the same size, so we need to shrink the texture
        //  relative to the rect, in other words scaling the texture coordinates
        //  down.

    texturePieceCoords = (uModelViewScale * texturePieceCoords) / aRectTextureRatio; 

        // 4. undo offset
    texturePieceCoords += texturePieceTopLeft;

        // output
    return texturePieceCoords;
}

void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vColor = aVertexColor;

    vec2 totalTextureSize = vec2(textureSize(uSampler, 0));
    textureClippingCoords = vec4(aTexturePieceRect.xy / totalTextureSize, (aTexturePieceRect.xy + aTexturePieceRect.zw) / totalTextureSize);

    if(uBackgroundPosition == BackgroundPositionStretchToFill) {
        vTextureCoord = aTextureCoord;
        textureClippingCoords = vec4(0.0f, 0.0f, 1.0f, 1.0f);
    } else if(uBackgroundPosition == BackgroundPositionTopLeft) { 
        // output
        vTextureCoord = scaleTexCoordsToConstantScreenSize(totalTextureSize);

    } else if(uBackgroundPosition == BackgroundPositionTopRight ||
        uBackgroundPosition == BackgroundPositionBottomLeft ||
        uBackgroundPosition == BackgroundPositionBottomRight) {
        vColor = vec4(1.0f, 1.0f, 0.0f, 1.0f); // not implemented 
    } else {
        vColor = vec4(1.0f, 0.0f, 0.0f, 1.0f); // error 
    }
}