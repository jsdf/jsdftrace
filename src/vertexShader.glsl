#version 300 es
precision highp float;

in vec4 aVertexPosition;
in vec4 aVertexColor;
in vec2 aTextureCoord;
in vec4 aTexturePieceRect; // x, y, z:width, w:height

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform sampler2D uSampler;
uniform uint uBackgroundPosition;
uniform mat4 uTextureTransform;

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

void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vColor = aVertexColor;
    vec2 totalTextureSize = vec2(textureSize(uSampler, 0));
    textureClippingCoords = vec4(aTexturePieceRect.xy / totalTextureSize, (aTexturePieceRect.xy + aTexturePieceRect.zw) / totalTextureSize);
    if(uBackgroundPosition == BackgroundPositionStretchToFill) {
        vTextureCoord = aTextureCoord;
        vTextureCoord = (uTextureTransform * vec4(aTextureCoord, 0.0f, 1.0f)).xy;
    } else if(uBackgroundPosition == BackgroundPositionTopLeft) {
        // scale the texture coordinates inversely:

        // 1. take the texture coordinates of the texture piece

        vec2 texturePieceCoord = aTextureCoord;

        // 2. offset by the top left of the piece within the texture

        vec2 texturePieceTopLeft = aTexturePieceRect.xy / totalTextureSize;
        texturePieceCoord -= texturePieceTopLeft; 

        // 3. apply the inverse of the view transform:
        //  because as we zoom in the rect gets larger, but we want the
        //  texture to stay the same size, so we need to shrink the texture
        //  relative to the rect, in other words scaling the texture coordinates
        //  down

        texturePieceCoord = (uTextureTransform * vec4(texturePieceCoord, 0.0f, 1.0f)).xy; 

        // 4. undo offset
        texturePieceCoord += texturePieceTopLeft;

        // output
        vTextureCoord = texturePieceCoord;

    } else if(uBackgroundPosition == BackgroundPositionTopRight ||
        uBackgroundPosition == BackgroundPositionBottomLeft ||
        uBackgroundPosition == BackgroundPositionBottomRight) {
        vColor = vec4(1.0f, 1.0f, 0.0f, 1.0f); // not implemented 
    } else {
        vColor = vec4(1.0f, 0.0f, 0.0f, 1.0f); // error 
    }
}