shader_type canvas_item;
render_mode unshaded;
uniform float clock = 0.0;
uniform float night_amount = 1.0;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p) {
    vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);
}
void fragment() {
    vec2 p = UV * vec2(4.0, 5.0) + vec2(clock*0.018, 0.0);
    float clouds = n(p)*0.55 + n(p*2.0)*0.30 + n(p*4.0)*0.15;
    float opacity = smoothstep(0.40,0.72,clouds) * (1.0-smoothstep(0.10,0.40,UV.y));
    COLOR = vec4(mix(vec3(0.8,0.85,0.90),vec3(0.22,0.29,0.42),night_amount),opacity*0.42);
}
