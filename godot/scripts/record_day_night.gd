extends SceneTree
## Capturer 24 s à 30 FPS : jour, coucher du soleil de 3 à 15 s, puis nuit.
var scene: Node2D
var frame := 0

func _initialize() -> void:
	call_deferred("start")

func start() -> void:
	scene = load("res://scenes/village.tscn").instantiate()
	root.add_child(scene)
	scene.set_night(false, true)

func _process(_delta: float) -> bool:
	if not is_instance_valid(scene):
		return false
	frame += 1
	if frame == 90:
		scene.set_night(true)
	if frame == 540:
		scene.select_player("demo-3")
	if frame == 630:
		scene.select_player("demo-1")
	return false
