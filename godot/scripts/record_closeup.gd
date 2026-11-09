extends SceneTree
var scene: Node2D
var frame := 0
func _initialize() -> void:
 call_deferred("start")
func start() -> void:
 scene = load("res://scenes/village.tscn").instantiate()
 root.add_child(scene)
 scene.camera.position = scene.characters[3].position + Vector2(0,-75)
 scene.camera.zoom = Vector2(2.8,2.8)
 scene.select_player("demo-3")
func _process(_delta: float) -> bool:
 if not is_instance_valid(scene): return false
 frame += 1
 if frame == 120:
  scene.select_player("demo-1")
  var tween = scene.create_tween()
  tween.tween_property(scene.camera,"position",scene.characters[1].position + Vector2(0,-75),1.0).set_trans(Tween.TRANS_SINE)
 return false
