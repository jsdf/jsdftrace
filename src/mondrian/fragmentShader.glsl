#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vTextureCoord;
in vec4 vTextureClippingCoords;
in vec4 vScreenSpaceRect;
flat in uint vHovered;

uniform vec3 uMouse; // x,y = mouse position in screen space, z = mouse button state (0.0f = up, 1.0f = down)
uniform sampler2D uTextureSampler;
uniform vec2 uViewportSize; // Viewport size in pixels (e.g., vec2(800, 600))

out vec4 FragColor;

// b.x = width
// b.y = height
// r.x = roundness top-right  
// r.y = roundness bottom-right
// r.z = roundness top-left
// r.w = roundness bottom-left
float sdRoundBox(in vec2 p, in vec2 b, in vec4 r) {
    r.xy = (p.x > 0.0f) ? r.xy : r.zw;
    r.x = (p.y > 0.0f) ? r.x : r.y;
    vec2 q = abs(p) - b + r.x;
    return min(max(q.x, q.y), 0.0f) + length(max(q, 0.0f)) - r.x;
}

vec4 getMouseGlowColor() {
    vec2 p = vec2(gl_FragCoord.x, gl_FragCoord.y) - uMouse.xy;

    vec2 box = vec2(1.0f, 1.0f);

    vec4 cornerRadius = vec4(5.f, 5.f, 5.f, 5.f);
    cornerRadius = min(cornerRadius, min(box.x, box.y));

    float d = sdRoundBox(p, box, cornerRadius);

    float size = 2000.f;
    float maxOpacity = 0.2f;

    float falloff = maxOpacity - clamp(d / size, 0.f, maxOpacity);
    return vec4(0.65f, 0.85f, 1.0f, falloff);
}

// use signed distance field to determine if a point is inside the rect, as a rounded rect
float roundRectSDFTest() {
    // Compute the screen space rectangle size
    vec2 rectSize = (vScreenSpaceRect.zw - vScreenSpaceRect.xy) * 0.5f; // TODO: why * 0.5f?

    // Convert gl_FragCoord to local space of the rectangle
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 rectCenter = (vScreenSpaceRect.xy + vScreenSpaceRect.zw) * 0.5f;
    vec2 localPos = fragCoord - rectCenter;

    // Define the roundness of the rectangle corners
    vec4 roundness = vec4(8.0f, 8.0f, 8.0f, 8.0f); // Example values, adjust as needed

    // Compute the distance using the SDF
    return sdRoundBox(localPos, rectSize, roundness);
}

void main(void) {
    bool clip = vTextureCoord.x < vTextureClippingCoords.x || vTextureCoord.x > vTextureClippingCoords.z ||
        vTextureCoord.y < vTextureClippingCoords.y || vTextureCoord.y > vTextureClippingCoords.w;

    if(uViewportSize.x > 1000000.0f) {
        FragColor = vec4(uViewportSize.xy, uMouse.xy);
    }

    float distance = roundRectSDFTest();

    vec4 color;
    // Use the distance to determine shading
    if(distance < -2.0f) {
        // Inside the rounded rectangle
        color = vColor;
    } else if(distance < 0.0f) {
        // On the border
        FragColor = vHovered == 1u ? vec4(1.f, 1.f, 1.f, 1.f) : vec4(0.0f, 0.0f, 0.0f, 1.0f);
        return; // only output border color
    } else {
        // Outside the rounded rectangle
        discard;
    }
    vec4 mouseGlowColor = vHovered == 1u ? getMouseGlowColor() : vec4(0.0f, 0.0f, 0.0f, 0.0f);

    color = mix(color, mouseGlowColor, mouseGlowColor.a);

    if(clip) {
        // just output background color
        FragColor = color;
    } else {
        // sample the texture 
        vec4 texel = texture(uTextureSampler, vTextureCoord);
        float texelA = texel.a;
        FragColor = mix(color, texel, texelA);
    }
}