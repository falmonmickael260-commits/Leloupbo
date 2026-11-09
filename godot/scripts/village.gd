extends Node2D
## Démonstration locale uniquement : aucune partie ni identité réelle.
const Villager = preload("res://scripts/villager.gd")
const Atmosphere = preload("res://scripts/atmosphere.gd")
const PlazaSeal = preload("res://scripts/plaza_seal.gd")
const AVATARS := ["v-forgeron", "v-guerisseuse", "v-chasseur", "v-taverniere", "v-garde", "v-paysanne", "v-bucheron", "v-herboriste"]
const DEMO_SEATS := [Vector2(1290, 625), Vector2(1150, 730), Vector2(350, 730), Vector2(210, 625), Vector2(350, 520), Vector2(590, 485), Vector2(910, 485), Vector2(1150, 520)]
var characters: Array[Node2D] = []
var backdrop_only := false
var actor_layer: Node2D
var night := true
var reduced_motion := false
var selected_id := ""
var background: Sprite2D
var daytime_background: Sprite2D
var sunset_background: Sprite2D
var solar_material: ShaderMaterial
var lights: Sprite2D
var title: Label
var detail: Label
var day_button: Button
var phase_tween: Tween
var atmosphere: Node2D
var fog: ColorRect
var fog_material: ShaderMaterial
var clock := 0.0
var world: Node2D
var camera: Camera2D
var night_amount := 1.0
var plaza_seal: Node

func _ready() -> void:
	world = Node2D.new()
	add_child(world)
	daytime_background = _image("res://assets/decor/village-christmas-day.png")
	sunset_background = _image("res://assets/decor/village-christmas-sunset.png")
	background = _image("res://assets/decor/village-christmas-night.png")
	plaza_seal = PlazaSeal.new()
	world.add_child(plaza_seal)
	plaza_seal.attach_to(background)
	var solar := ColorRect.new()
	solar.size = Vector2(1500,844)
	solar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	solar_material = ShaderMaterial.new()
	solar_material.shader = preload("res://scripts/sun.gdshader")
	solar_material.set_shader_parameter("day_texture",daytime_background.texture)
	solar.material = solar_material
	world.add_child(solar)
	lights = Sprite2D.new()
	world.add_child(lights)
	lights.modulate.a = 0.65
	var actors := Node2D.new()
	actor_layer = actors
	actors.y_sort_enabled = true
	world.add_child(actors)
	for i in range(0 if backdrop_only else AVATARS.size()):
		var person := Villager.new()
		actors.add_child(person)
		person.setup("demo-%d" % i, ["Le Forgeron", "La Guérisseuse", "Le Chasseur", "La Tavernière", "La Garde", "La Paysanne", "Le Bûcheron", "L’Herboriste"][i], AVATARS[i], i)
		# Laisser la gravure centrale lisible : aucun siège devant le texte.
		person.position = DEMO_SEATS[i]
		var depth := clampf((person.position.y - 485.0) / 245.0, 0.0, 1.0)
		person.scale = Vector2.ONE * lerpf(0.80, 1.10, depth)
		person.selected.connect(select_player)
		characters.append(person)
	atmosphere = Atmosphere.new()
	atmosphere.foreground = true
	lights.add_child(atmosphere)
	fog = ColorRect.new()
	fog.size = Vector2(1500, 844)
	fog.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fog_material = ShaderMaterial.new()
	fog_material.shader = preload("res://scripts/fog.gdshader")
	fog.material = fog_material
	world.add_child(fog)
	camera = Camera2D.new()
	camera.position = Vector2(750, 422)
	camera.zoom = Vector2(1.025, 1.025)
	add_child(camera)
	_build_interface()
	set_night(true, true)

func _image(path: String) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture = load(path)
	sprite.centered = false
	sprite.scale = Vector2(1500.0 / sprite.texture.get_width(), 844.0 / sprite.texture.get_height())
	world.add_child(sprite)
	return sprite

func _build_interface() -> void:
	if backdrop_only: return
	var layer := CanvasLayer.new()
	add_child(layer)
	var ui := Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(ui)
	var theme := Theme.new()
	theme.default_font = load("res://assets/fonts/nunito-latin.woff2")
	theme.default_font_size = 19
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color(0.025, 0.035, 0.065, 0.88)
	panel.border_color = Color(0.62, 0.46, 0.23, 0.65)
	panel.set_border_width_all(1)
	panel.set_corner_radius_all(12)
	panel.content_margin_left = 18
	panel.content_margin_right = 18
	panel.content_margin_top = 10
	panel.content_margin_bottom = 10
	theme.set_stylebox("panel", "PanelContainer", panel)
	var button_style := panel.duplicate()
	button_style.bg_color = Color(0.13, 0.11, 0.08, 0.9)
	theme.set_stylebox("normal", "Button", button_style)
	var hover_style := button_style.duplicate()
	hover_style.bg_color = Color(0.27, 0.20, 0.10, 0.95)
	theme.set_stylebox("hover", "Button", hover_style)
	theme.set_stylebox("pressed", "Button", hover_style)
	ui.theme = theme
	var top := PanelContainer.new()
	top.position = Vector2(24, 20)
	top.size = Vector2(420, 88)
	ui.add_child(top)
	var heading := VBoxContainer.new()
	heading.alignment = BoxContainer.ALIGNMENT_CENTER
	top.add_child(heading)
	title = Label.new()
	title.text = "LA MEUTE NOIRE"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", Color("ecc67c"))
	heading.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Le village des murmures"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_child(subtitle)
	var bottom := PanelContainer.new()
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -88
	bottom.offset_left = 20
	bottom.offset_right = -20
	bottom.offset_bottom = -16
	ui.add_child(bottom)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	bottom.add_child(row)
	detail = Label.new()
	detail.text = "Choisis un habitant du village"
	detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(detail)
	day_button = Button.new()
	day_button.pressed.connect(func(): set_night(not night))
	row.add_child(day_button)
	var motion := CheckButton.new()
	motion.text = "Mouvements réduits"
	motion.toggled.connect(set_reduced_motion)
	row.add_child(motion)

func select_player(id: String) -> void:
	selected_id = id
	for person in characters:
		person.set_selected(person.player_id == id)
	for person in characters:
		if person.player_id == id:
			detail.text = person.display_name

func set_night(value: bool, instant := false, duration := 12.0) -> void:
	night = value
	if is_instance_valid(day_button):
		day_button.text = "Passer au jour" if value else "Passer à la nuit"
	var target_night := 1.0 if value else 0.0
	if phase_tween:
		phase_tween.kill()
	if instant or reduced_motion:
		night_amount = target_night
		_apply_lighting()
	else:
		phase_tween = create_tween()
		phase_tween.tween_property(self, "night_amount", target_night, maxf(duration,0.01)).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func set_reduced_motion(value: bool) -> void:
	reduced_motion = value
	plaza_seal.reduced_motion = value
	for person in characters:
		person.animated = not value
	atmosphere.animated = not value
	set_night(night, true)

func _process(delta: float) -> void:
	if not is_instance_valid(fog_material):
		return
	if not reduced_motion:
		clock += delta
		camera.offset = Vector2.ZERO
		lights.self_modulate.a = 0.92 + sin(clock * 9.0) * 0.035 + sin(clock * 17.2) * 0.025
	else:
		camera.offset = Vector2.ZERO
		lights.self_modulate.a = 1.0
	fog_material.set_shader_parameter("clock", clock)
	_apply_lighting()
	if reduced_motion:
		atmosphere.queue_redraw()

func _apply_lighting() -> void:
	var phase := clampf(night_amount,0.0,1.0)
	var lamps := smoothstep(0.45,0.88,phase)
	sunset_background.modulate.a = smoothstep(0.0,0.52,phase)
	background.modulate.a = smoothstep(0.56,1.0,phase)
	lights.modulate.a = 0.65*lamps
	atmosphere.night_amount = lamps
	plaza_seal.ignition = smoothstep(0.78,0.99,phase)
	plaza_seal._sync_effect()
	solar_material.set_shader_parameter("phase",phase)
	fog_material.set_shader_parameter("strength",0.12+phase*0.22)
	var sun_position := Vector2(1060,44).lerp(Vector2(920,245),phase)
	for person in characters:
		person.set_sunlight(phase,sun_position)
