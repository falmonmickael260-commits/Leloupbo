extends Node2D
## Démonstration du rig articulé sur la place du village.
var village: Node2D
var hero: Node2D
var elapsed := 0.0
var current_state := ""

func _ready() -> void:
	village = load("res://scenes/village.tscn").instantiate()
	add_child(village)
	village.set_night(false,true)
	for person in village.characters:
		person.visible = false
	hero = preload("res://scripts/articulated_villager.gd").new()
	hero.position = Vector2(640,715)
	hero.scale = Vector2.ONE*1.25
	village.world.add_child(hero)
	village.world.move_child(hero,village.world.get_child_count()-2)
	village.camera.zoom = Vector2(1.8,1.8)
	village.camera.position = Vector2(640,590)
	village.detail.text = "Éloi · repos"
	current_state = "idle"

func _process(delta: float) -> void:
	if not is_instance_valid(hero): return
	elapsed += delta
	var state := "idle"
	var label := "Éloi · repos"
	if elapsed >= 2.0 and elapsed < 7.0:
		state = "walk"
		label = "Éloi · marche"
		hero.position.x = lerpf(640.0,860.0,(elapsed-2.0)/5.0)
	elif elapsed >= 7.0 and elapsed < 10.0:
		state = "greet"
		label = "Éloi · salut"
	elif elapsed >= 10.0 and elapsed < 14.0:
		state = "talk"
		label = "Éloi · prise de parole"
	if state != current_state:
		hero.play_state(state)
		current_state = state
	village.camera.position.x = hero.position.x
	village.detail.text = label
