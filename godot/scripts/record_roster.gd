extends SceneTree
## Galerie des 20 personnages : 12 s à 30 FPS, --quit-after 360.
var scene: Node2D
var frame := 0
func _initialize() -> void:
 call_deferred("start")
func start() -> void:
 scene = load("res://scenes/roster.tscn").instantiate()
 root.add_child(scene)
func _process(_delta: float) -> bool:
 if not is_instance_valid(scene): return false
 frame += 1
 if frame == 60: scene.play_all("walk")
 if frame == 150: scene.play_all("greet")
 if frame == 270: scene.play_all("talk")
 return false
