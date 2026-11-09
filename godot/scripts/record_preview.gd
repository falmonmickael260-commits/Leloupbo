extends SceneTree
## Enregistre la vraie scène : nuit, sélection, jour puis retour à la nuit.
## Usage : godot --path godot --script res://scripts/record_preview.gd
##   --write-movie /chemin/apercu.avi --fixed-fps 30 --quit-after 480
var scene: Node2D
var frame := 0

func _initialize() -> void:
	call_deferred("start")

func start() -> void:
	scene = load("res://scenes/village.tscn").instantiate()
	root.add_child(scene)

func _process(_delta: float) -> bool:
	if not is_instance_valid(scene):
		return false
	frame += 1
	if frame == 30:
		scene.select_player("demo-3")
	if frame == 100:
		scene.select_player("demo-1")
	if frame == 180:
		scene.set_night(false,false,3.0)
	if frame == 240:
		scene.select_player("demo-6")
	if frame == 330:
		scene.set_night(true,false,3.0)
	if frame == 400:
		scene.select_player("demo-2")
	return false
