extends Node2D
## Animation cosmétique : aucun rôle ni pouvoir n'est déduit de l'avatar.
signal selected(player_id: String)

var player_id := ""
var clock := 0.0
var animated := true
var base_scale := Vector2.ONE
var portrait: Sprite2D
var ring: Line2D
var shadow: Polygon2D
var display_name := ""
var projected_shadow: Sprite2D
var light_material: ShaderMaterial
var shadow_length := 0.0
var player_light_pool: Sprite2D

func setup(id: String, label: String, avatar: String, seat: int) -> void:
	player_id = id
	display_name = label
	clock = float(seat) * 0.7
	player_light_pool = Sprite2D.new()
	var gradient := Gradient.new()
	gradient.colors = PackedColorArray([Color(1.0,0.65,0.28,0.22),Color(1.0,0.65,0.28,0.0)])
	var light_texture := GradientTexture2D.new()
	light_texture.gradient = gradient
	light_texture.width = 256
	light_texture.height = 128
	light_texture.fill = GradientTexture2D.FILL_RADIAL
	light_texture.fill_from = Vector2(0.5,0.5)
	light_texture.fill_to = Vector2(1.0,0.5)
	player_light_pool.texture = light_texture
	player_light_pool.position.y = -5.0
	player_light_pool.scale = Vector2(0.72,0.50)
	var additive := CanvasItemMaterial.new()
	additive.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	player_light_pool.material = additive
	add_child(player_light_pool)
	shadow = Polygon2D.new()
	var points := PackedVector2Array()
	for i in range(32):
		var angle := TAU * float(i) / 32.0
		points.append(Vector2(cos(angle) * 38.0, sin(angle) * 10.0))
	shadow.polygon = points
	shadow.color = Color(0.01, 0.01, 0.025, 0.45)
	add_child(shadow)
	ring = Line2D.new()
	ring.points = points
	ring.closed = true
	ring.width = 2.0
	ring.default_color = Color("ecc67c")
	ring.visible = false
	add_child(ring)
	portrait = Sprite2D.new()
	portrait.texture = load("res://assets/characters/%s.png" % avatar)
	projected_shadow = Sprite2D.new()
	projected_shadow.texture = portrait.texture
	projected_shadow.centered = false
	add_child(projected_shadow)
	portrait.centered = false
	base_scale = Vector2.ONE * 0.20
	portrait.scale = base_scale
	portrait.position = Vector2(-51.2, -153.6)
	add_child(portrait)
	light_material = ShaderMaterial.new()
	light_material.shader = preload("res://scripts/character_light.gdshader")
	portrait.material = light_material
	var button := Button.new()
	button.position = Vector2(-58, -177)
	button.size = Vector2(116, 26)
	button.text = display_name
	button.tooltip_text = "Sélectionner %s" % display_name
	button.pressed.connect(func(): selected.emit(player_id))
	add_child(button)
	var area := Area2D.new()
	var hitbox := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(90, 145)
	hitbox.shape = shape
	hitbox.position.y = -75
	area.add_child(hitbox)
	area.input_event.connect(_on_input)
	add_child(area)

func _on_input(_viewport: Node, event: InputEvent, _shape: int) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		selected.emit(player_id)

func _process(delta: float) -> void:
	if not is_instance_valid(portrait):
		return
	if animated:
		clock += delta
		if ring.visible:
			ring.modulate.a = 0.7 + sin(clock * 3.0) * 0.25
	else:
		portrait.scale = base_scale
		portrait.rotation = 0.0
		shadow.scale = Vector2.ONE
		ring.modulate.a = 1.0

func set_selected(value: bool) -> void:
	ring.visible = value

func set_sunlight(phase: float, sun_position: Vector2) -> void:
	var golden := smoothstep(0.08,0.48,phase)*(1.0-smoothstep(0.58,0.90,phase))
	var darkness := smoothstep(0.60,1.0,phase)
	# Garder les visages lisibles après la disparition du soleil.
	# Les uniformes source_color sont convertis en linéaire : ne pas les
	# abaisser à 0,7, ce qui rendait les portraits bien trop sombres.
	var ambient := Color(1.13,1.10,1.03).lerp(Color(1.16,1.15,1.20),darkness)
	ambient = ambient.lerp(Color(1.03,0.81,0.66),golden*0.42)
	var sun_energy := (0.28+golden*0.75)*(1.0-darkness)
	var lamp := 0.0
	for point in [Vector2(387,326),Vector2(1406,242),Vector2(1238,346),Vector2(1326,376),Vector2(854,351),Vector2(1004,351)]:
		var distance: float = position.distance_to(point)
		lamp = maxf(lamp,exp(-distance*distance/190000.0))
	lamp = maxf(lamp,1.0)*smoothstep(0.50,0.88,phase)
	player_light_pool.modulate.a = darkness
	light_material.set_shader_parameter("ambient",ambient)
	light_material.set_shader_parameter("sun_color",Color(1.0,0.95,0.76).lerp(Color(1.0,0.49,0.17),golden))
	light_material.set_shader_parameter("sun_energy",sun_energy)
	light_material.set_shader_parameter("lamp_energy",lamp)
	light_material.set_shader_parameter("moon_energy",darkness)
	light_material.set_shader_parameter("light_direction",(sun_position-position).normalized())
	shadow_length = lerpf(48.0,230.0,smoothstep(0.0,0.70,phase))*(1.0-darkness*0.90)
	var shadow_vector := Vector2(-0.83,0.56)*shadow_length
	var x_axis := Vector2(0.20,0.0)
	var y_axis := -shadow_vector/768.0
	projected_shadow.transform = Transform2D(x_axis,y_axis,-x_axis*256.0-y_axis*768.0)
	projected_shadow.modulate = Color(0.035,0.025,0.055,lerpf(0.40,0.12,darkness))
