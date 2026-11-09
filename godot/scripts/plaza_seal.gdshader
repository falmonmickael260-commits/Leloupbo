shader_type canvas_item;
render_mode unshaded;
uniform float ignition : hint_range(0.0, 1.0) = 0.0;
uniform float clock = 0.0;
uniform bool pulse_enabled = true;
varying vec4 item_tint;

void vertex() { item_tint = COLOR; }

float claw_mask(vec4 source, vec2 uv) {
    float red = max(0.0, source.r - max(source.g, source.b));
    float region = step(0.31, uv.x) * (1.0-step(0.69, uv.x));
    region *= step(0.52, uv.y) * (1.0-smoothstep(0.675,0.69,uv.y));
    return smoothstep(0.04, 0.20, red) * region;
}

float lettering_mask(vec4 source, vec2 uv) {
    float region = step(0.25,uv.x)*(1.0-step(0.76,uv.x));
    region *= smoothstep(0.66,0.69,uv.y)*(1.0-smoothstep(0.83,0.86,uv.y));
    float luminance = dot(source.rgb,vec3(0.2126,0.7152,0.0722));
    return smoothstep(0.47,0.70,luminance)*region;
}

void fragment() {
    vec4 stone = texture(TEXTURE, UV);
    float mask = claw_mask(stone, UV);
    float reveal = smoothstep(UV.y-0.015, UV.y+0.015, 0.50+ignition*0.21);
    float pulse = pulse_enabled ? 0.94+0.06*sin(clock*1.7) : 1.0;
    float energy = ignition * pulse;
    vec2 radius = TEXTURE_PIXEL_SIZE * 7.0;
    float halo = 0.0;
    float letter_halo = 0.0;
    for (int i=0; i<8; i++) {
        float angle = float(i)*0.785398163;
        vec2 uv = UV + vec2(cos(angle),sin(angle))*radius;
        halo += claw_mask(texture(TEXTURE,uv),uv);
        letter_halo += lettering_mask(texture(TEXTURE,uv),uv);
    }
    halo = halo/8.0 * reveal * energy;
    vec3 lit = mix(stone.rgb, stone.rgb*0.30, mask*(1.0-reveal*energy));
    lit += vec3(0.30,0.012,0.003) * mask * reveal * energy;
    lit += vec3(0.18,0.004,0.001) * halo;
    float lettering = lettering_mask(stone,UV);
    lit += vec3(0.22,0.14,0.055)*lettering*ignition;
    lit += vec3(0.12,0.065,0.015)*(letter_halo/8.0)*ignition;
    COLOR = vec4(lit,stone.a) * item_tint;
}
