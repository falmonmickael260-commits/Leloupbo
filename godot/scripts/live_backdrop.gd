extends Node2D
## Décor uniquement : les personnages et TOUTES les commandes restent dans l'interface Web existante.
var village: Node2D
var callback: JavaScriptObject
var bridge: JavaScriptObject
var people := {}

func _ready() -> void:
 Engine.max_fps = 30
 village = preload("res://scenes/village.tscn").instantiate()
 village.backdrop_only = true
 add_child(village)
 village.camera.zoom = Vector2.ONE
 village.set_night(false,true)
 if OS.has_feature("web"):
  bridge = JavaScriptBridge.get_interface("MeuteBackdrop")
  if bridge != null:
   callback = JavaScriptBridge.create_callback(_receive)
   bridge.subscribe(callback)

func _exit_tree() -> void:
 if bridge != null:
  bridge.unsubscribe()

func _receive(args: Array) -> void:
 if args.is_empty(): return
 var state = JSON.parse_string(str(args[0]))
 if not state is Dictionary: return
 var active: bool = state.get("active",true)
 village.visible = active
 village.process_mode = Node.PROCESS_MODE_INHERIT if active else Node.PROCESS_MODE_DISABLED
 Engine.max_fps = 30 if active and state.get("mode","") == "running" else 3
 var phase := clampf(float(state.get("phase",0.0)),0.0,1.0)
 var reduced: bool = state.get("reduced",false)
 village.reduced_motion = reduced
 village.plaza_seal.reduced_motion = reduced
 village.atmosphere.animated = not reduced
 village.night_amount = phase
 var seen := {}
 for player in state.get("players",[]):
  var id: String = str(player.get("id",""))
  var avatar: String = str(player.get("avatar",""))
  if id.is_empty(): continue
  seen[id] = true
  var item: Node2D = people.get(id)
  if item != null and item.get_meta("avatar") != avatar:
   item.queue_free()
   people.erase(id)
   item = null
  if item == null:
   # Les anciens avatars SVG restent intégralement rendus par le navigateur.
   if not avatar.begins_with("v-") or not ResourceLoader.exists("res://assets/characters/%s.png" % avatar): continue
   item = preload("res://scripts/villager.gd").new()
   village.actor_layer.add_child(item)
   item.setup(id,"",avatar,0)
   item.set_meta("avatar",avatar)
   item.portrait.visible = false
   item.shadow.visible = false
   for child in item.get_children():
    if child is Button: child.visible = false
    if child is Area2D: child.input_pickable = false
   people[id] = item
   village.characters.append(item)
  item.position = Vector2(float(player.get("x",0.0))/1.024,(float(player.get("y",160.0))-160.0)/1.024)
  var scale_factor := float(player.get("k",1.0))
  item.scale = Vector2(0.954,1.055)*scale_factor
  item.projected_shadow.visible = bool(player.get("alive",true))
  item.player_light_pool.visible = bool(player.get("alive",true))
  item.animated = not reduced
 for id in people.keys():
  if not seen.has(id):
   var item: Node2D = people[id]
   village.characters.erase(item)
   item.queue_free()
   people.erase(id)
 village._apply_lighting()
