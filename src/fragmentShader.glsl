#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vTextureCoord;
in vec4 textureClippingCoords;

uniform sampler2D uTextureSampler;

out vec4 FragColor;

void main(void) {
    bool clip = vTextureCoord.x < textureClippingCoords.x || vTextureCoord.x > textureClippingCoords.z ||
        vTextureCoord.y < textureClippingCoords.y || vTextureCoord.y > textureClippingCoords.w;

    if(clip) {
        // just output background color
        FragColor = vColor;
    } else {
        // sample the texture 
        vec4 texel = texture(uTextureSampler, vTextureCoord);
        FragColor = mix(vColor, texel, texel.a);
    }
}