extends SceneTree
const Character = preload("res://scripts/articulated_villager.gd")
const Catalog = preload("res://scripts/character_catalog.gd")
var failures := 0
func _initialize() -> void:
 call_deferred("run")
func check(value: bool, message: String) -> void:
 if not value:
  failures += 1
  push_error(message)
func run() -> void:
 var ids := {}
 for entry in Catalog.ENTRIES:
  check(not ids.has(entry.id),"Apparence dupliquée : "+entry.id)
  ids[entry.id] = true
  var path := "res://assets/characters/rigs/%s.png" % entry.id
  check(ResourceLoader.exists(path),"Atlas manquant : "+entry.id)
  if not ResourceLoader.exists(path): continue
  var actor := Character.new()
  actor.atlas_path = path
  root.add_child(actor)
  check(actor.pieces.size() == 15,"Pièces articulées incomplètes : "+entry.id)
  for sprite in actor.pieces:
   check(sprite.texture.region.size.x > 0 and sprite.texture.region.size.y > 0,"Pièce vide : "+entry.id)
  for state in ["idle","walk","greet","talk"]:
   check(actor.animator.has_animation(state),"Animation manquante : "+state)
  var image: Texture2D = actor.pieces[0].texture
  actor.animator.play("greet",0.0)
  actor.animator.seek(1.0,true)
  check(actor.right_arm.rotation < -1.5,"Le bras doit se lever pour saluer : "+entry.id)
  check(actor.pieces[0].texture == image,"Les textures ne doivent pas être déformées")
  actor.animator.play("walk",0.0)
  actor.animator.seek(0.1,true)
  var pose: float = actor.left_thigh.rotation
  actor.animator.seek(0.5,true)
  check(not is_equal_approx(actor.left_thigh.rotation,pose),"Les jambes doivent marcher : "+entry.id)
  actor.set_shadow(150,0.35)
  actor._process(0.0)
  check(actor.pose_pairs.size() >= 15,"L'ombre doit suivre les articulations")
  actor.queue_free()
  await process_frame
 check(ids.size() == 20,"La troupe doit contenir vingt apparences distinctes")
 print("RIG_TEST: %d apparences, %d erreur(s)" % [ids.size(),failures])
 quit(1 if failures else 0)
