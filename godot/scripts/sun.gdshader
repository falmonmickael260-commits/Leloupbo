shader_type canvas_item;
render_mode unshaded;
uniform sampler2D day_texture : filter_linear;
uniform float phase = 0.0;
void fragment() {
    vec2 size = vec2(1500.0,844.0);
    vec2 sun = mix(vec2(1060.0,44.0),vec2(920.0,245.0),phase);
    vec2 p = UV*size;
    vec3 base = texture(day_texture,UV).rgb;
    // Le ciel de référence masque le disque derrière les arbres et les montagnes.
    float sky = smoothstep(0.52,0.73,base.b)*smoothstep(0.04,0.18,base.b-base.r);
    sky *= 1.0-smoothstep(0.23,0.31,UV.y);
    float visible = 1.0-smoothstep(0.67,0.83,phase);
    float radius = mix(15.0,21.0,smoothstep(0.0,0.65,phase));
    float distance = length(p-sun);
    float disk = 1.0-smoothstep(radius-1.5,radius+1.5,distance);
    float halo = exp(-distance*distance/13000.0)*0.16;
    float center = pow(clamp(1.0-distance/radius,0.0,1.0),0.45);
    vec3 edge = mix(vec3(1.0,0.94,0.62),vec3(1.0,0.51,0.19),smoothstep(0.0,0.66,phase));
    vec3 color = mix(edge,vec3(1.0,0.98,0.83),center*0.86);
    float glow = (disk*0.93+halo)*visible*sky;
    COLOR = vec4(color,clamp(glow,0.0,1.0));
}
