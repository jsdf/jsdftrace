#version 300 es
precision highp float;

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

in vec4 vColor;
in vec2 vTextureCoord;
in vec4 textureClippingCoords;

uniform sampler2D uSampler;

out vec4 FragColor;

void main(void) {
    bool clip = vTextureCoord.x < textureClippingCoords.x || vTextureCoord.x > textureClippingCoords.z ||
        vTextureCoord.y < textureClippingCoords.y || vTextureCoord.y > textureClippingCoords.w;

    if(clip) {
        // just output background color
        FragColor = vColor;
    } else {
        // sample the texture 
        vec4 texel = texture(uSampler, vTextureCoord);
        FragColor = mix(vColor, texel, texel.a);
    }
}