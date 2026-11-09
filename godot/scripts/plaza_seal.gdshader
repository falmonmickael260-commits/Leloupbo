shader_type canvas_item;
render_mode unshaded;
// Paramètres conservés pour les scènes et outils de transition existants.
// Le décor nocturne contient déjà les fenêtres, guirlandes et gravures éclairées.
// Ne pas déduire une émission des pixels clairs : cela allumait aussi les pavés.
uniform float ignition : hint_range(0.0, 1.0) = 0.0;
uniform float clock = 0.0;
uniform bool pulse_enabled = true;
varying vec4 item_tint;
void vertex() { item_tint = COLOR; }
void fragment() {
    COLOR = texture(TEXTURE, UV) * item_tint;
}
