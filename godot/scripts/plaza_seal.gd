extends Node
## Pilote la lumière de la griffe gravée dans le décor, sans objet ajouté au sol.
var ignition := 0.0
var clock := 0.0
var reduced_motion := false
var transition: Tween
var effect: ShaderMaterial

func attach_to(background: Sprite2D) -> void:
 effect = ShaderMaterial.new()
 effect.shader = preload("res://scripts/plaza_seal.gdshader")
 background.material = effect
 _sync_effect()

func set_night(value: bool, instant := false) -> void:
 if transition:
  transition.kill()
 var target := 1.0 if value else 0.0
 if instant or reduced_motion:
  ignition = target
  _sync_effect()
 else:
  transition = create_tween()
  transition.tween_property(self, "ignition", target, 1.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _process(delta: float) -> void:
 if not reduced_motion:
  clock += delta
 _sync_effect()

func _sync_effect() -> void:
 if not is_instance_valid(effect):
  return
 effect.set_shader_parameter("ignition", ignition)
 effect.set_shader_parameter("clock", clock)
 effect.set_shader_parameter("pulse_enabled", not reduced_motion)
