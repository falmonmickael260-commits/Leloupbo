shader_type canvas_item;
render_mode unshaded;
uniform vec4 ambient : source_color = vec4(1.0);
uniform vec4 sun_color : source_color = vec4(1.0,0.82,0.55,1.0);
uniform float sun_energy = 0.0;
uniform float lamp_energy = 0.0;
uniform float moon_energy = 0.0;
uniform vec2 light_direction = vec2(0.7,-0.7);
varying vec4 item_tint;
void vertex() { item_tint = COLOR; }
void fragment() {
    vec4 tex = texture(TEXTURE,UV);
    vec2 direction = normalize(light_direction);
    float neighbour = texture(TEXTURE,UV + direction*TEXTURE_PIXEL_SIZE*9.0).a;
    float rim = max(0.0,tex.a-neighbour);
    float side = mix(1.0-UV.x,UV.x,step(0.0,direction.x));
    float upper = 1.0-smoothstep(0.5,1.0,UV.y);
    // La silhouette reste intacte ; seule sa lumière varie.
    vec3 color = tex.rgb * ambient.rgb;
    color += tex.rgb*sun_color.rgb*sun_energy*(0.12+side*0.35);
    color += sun_color.rgb*rim*sun_energy*0.48;
    color += tex.rgb*vec3(1.0,0.66,0.36)*lamp_energy*(0.35+side*0.24);
    color += vec3(0.55,0.70,1.0)*rim*moon_energy*upper*0.22;
    // Éclairage de remplissage conservé toute la nuit, même loin d'un brasero.
    color += tex.rgb*vec3(0.34,0.33,0.32)*moon_energy;
    color = mix(color,pow(clamp(color,vec3(0.0),vec3(1.0)),vec3(0.87)),moon_energy*0.65);
    COLOR = vec4(color,tex.a)*item_tint;
}
