extends Node2D
## Personnage en pièces séparées, animé par des articulations et AnimationPlayer.
const ATLAS_PATH := "res://assets/characters/ranger-parts.png"
var atlas_path := ATLAS_PATH
var draw_contact_shadow := true
var atlas: Texture2D
var atlas_image: Image
var atlas_layout: Dictionary = {}
var rig: Node2D
var spine: Node2D
var head: Node2D
var left_arm: Node2D
var right_arm: Node2D
var left_forearm: Node2D
var right_forearm: Node2D
var left_thigh: Node2D
var right_thigh: Node2D
var left_calf: Node2D
var right_calf: Node2D
var animator: AnimationPlayer
var pieces: Array[Sprite2D] = []
var shadow_rig: Node2D
var pose_pairs: Array = []

func _ready() -> void:
 atlas = load(atlas_path)
 atlas_image = atlas.get_image()
 var metadata_path := atlas_path.get_basename()+".json"
 if FileAccess.file_exists(metadata_path):
  atlas_layout = JSON.parse_string(FileAccess.get_file_as_string(metadata_path))
 var contact := Polygon2D.new()
 var points := PackedVector2Array()
 for i in range(32):
  var angle := TAU*float(i)/32.0
  points.append(Vector2(cos(angle)*27.0,sin(angle)*7.0))
 contact.polygon = points
 contact.color = Color(0.02,0.02,0.035,0.30)
 contact.visible = draw_contact_shadow
 add_child(contact)
 rig = _joint("Rig",self,Vector2.ZERO)
 _piece("Cape",Vector2i(3,0),rig,Vector2(0,-114),64.0)
 var hips := _joint("Hips",rig,Vector2(0,-54))
 left_thigh = _piece("LeftThigh",Vector2i(0,3),hips,Vector2(-9,0),29.0)
 left_calf = _piece("LeftCalf",Vector2i(1,3),left_thigh,Vector2(0,26),29.0)
 right_thigh = _piece("RightThigh",Vector2i(2,3),hips,Vector2(9,0),29.0)
 right_calf = _piece("RightCalf",Vector2i(3,3),right_thigh,Vector2(0,26),29.0)
 _piece("Pelvis",Vector2i(2,0),hips,Vector2(0,-11),23.0)
 spine = _joint("Spine",rig,Vector2(0,-62))
 left_arm = _piece("LeftArm",Vector2i(0,1),spine,Vector2(-20,-44),29.0)
 left_forearm = _piece("LeftForearm",Vector2i(1,1),left_arm,Vector2(0,26),25.0)
 _piece("LeftHand",Vector2i(2,1),left_forearm,Vector2(0,23),11.0,0.6,0.04)
 right_arm = _piece("RightArm",Vector2i(0,2),spine,Vector2(20,-44),29.0)
 right_forearm = _piece("RightForearm",Vector2i(1,2),right_arm,Vector2(0,26),25.0)
 _piece("RightHand",Vector2i(2,2),right_forearm,Vector2(0,23),11.0,0.6,0.04)
 _piece("Chest",Vector2i(1,0),spine,Vector2(0,-51),53.0)
 head = _piece("Head",Vector2i(0,0),spine,Vector2(0,-52),31.0,0.8,1.0)
 _piece("Pouch",Vector2i(3,1),spine,Vector2(17,-1),17.0,0.6,0.2)
 atlas_image = null
 animator = AnimationPlayer.new()
 animator.name = "AnimationPlayer"
 add_child(animator)
 _build_animations()
 shadow_rig = rig.duplicate()
 shadow_rig.name = "ProjectedShadow"
 add_child(shadow_rig)
 move_child(shadow_rig,1)
 _pair_pose(rig,shadow_rig)
 set_shadow(45.0,0.30)
 animator.animation_finished.connect(func(state):
  if state == "greet": play_state("idle")
 )
 play_state("idle")

func _joint(label: String, parent: Node, at: Vector2) -> Node2D:
 var joint := Node2D.new()
 joint.name = label
 joint.position = at
 parent.add_child(joint)
 return joint

func _piece(label: String, cell: Vector2i, parent: Node, at: Vector2, length: float, _occupancy := 0.8, pivot := 0.04) -> Node2D:
 var joint := _joint(label,parent,at)
 var cell_size := Vector2(atlas.get_size())/4.0
 var texture := AtlasTexture.new()
 texture.atlas = atlas
 var cell_rect := Rect2i(Vector2(cell)*cell_size,cell_size)
 var used := atlas_image.get_region(cell_rect).get_used_rect()
 texture.region = Rect2(Vector2(cell_rect.position+used.position),Vector2(used.size))
 if atlas_layout.has("regions"):
  var bounds: Array = atlas_layout.regions[cell.y*4+cell.x]
  texture.region = Rect2(bounds[0],bounds[1],bounds[2],bounds[3])
  used = Rect2i(texture.region)
 texture.filter_clip = true
 var sprite := Sprite2D.new()
 sprite.name = "Art"
 sprite.texture = texture
 sprite.centered = false
 var widths := {"Head":27.0,"Chest":49.0,"Pelvis":40.0,"Cape":55.0,"LeftArm":13.0,"RightArm":13.0,"LeftForearm":10.0,"RightForearm":10.0,"LeftHand":8.0,"RightHand":8.0,"LeftThigh":17.0,"RightThigh":17.0,"LeftCalf":15.0,"RightCalf":15.0,"Pouch":11.0}
 var width: float = widths.get(label,20.0)
 sprite.scale = Vector2(width/maxf(used.size.x,1),length/maxf(used.size.y,1))
 sprite.position = Vector2(-width*0.5,-length*pivot)
 joint.add_child(sprite)
 pieces.append(sprite)
 return joint

func _keys(animation: Animation, node: Node, property: String, times: Array, values: Array) -> void:
 var path := NodePath(str(get_path_to(node))+":"+property)
 var index := animation.find_track(path,Animation.TYPE_VALUE)
 if index >= 0:
  animation.remove_track(index)
 index = animation.add_track(Animation.TYPE_VALUE)
 animation.track_set_path(index,path)
 for i in range(times.size()):
  animation.track_insert_key(index,times[i],values[i])
 animation.track_set_interpolation_type(index,Animation.INTERPOLATION_CUBIC)

func _base(length: float, looping := true) -> Animation:
 var animation := Animation.new()
 animation.length = length
 animation.loop_mode = Animation.LOOP_LINEAR if looping else Animation.LOOP_NONE
 for joint in [spine,head,left_arm,right_arm,left_forearm,right_forearm,left_thigh,right_thigh,left_calf,right_calf]:
  _keys(animation,joint,"rotation",[0.0,length],[0.0,0.0])
 _keys(animation,rig,"position",[0.0,length],[Vector2.ZERO,Vector2.ZERO])
 return animation

func _build_animations() -> void:
 var library := AnimationLibrary.new()
 var idle := _base(2.4)
 _keys(idle,spine,"rotation",[0.0,1.2,2.4],[-0.012,0.012,-0.012])
 _keys(idle,head,"rotation",[0.0,0.8,1.6,2.4],[0.0,0.025,-0.018,0.0])
 _keys(idle,left_forearm,"rotation",[0.0,1.2,2.4],[-0.12,-0.08,-0.12])
 _keys(idle,right_forearm,"rotation",[0.0,1.2,2.4],[0.10,0.14,0.10])
 library.add_animation("idle",idle)
 var walk := _base(0.9)
 _keys(walk,left_thigh,"rotation",[0.0,0.225,0.45,0.675,0.9],[-0.25,0.0,0.25,0.0,-0.25])
 _keys(walk,right_thigh,"rotation",[0.0,0.225,0.45,0.675,0.9],[0.25,0.0,-0.25,0.0,0.25])
 _keys(walk,left_calf,"rotation",[0.0,0.225,0.45,0.675,0.9],[0.05,0.44,0.04,0.02,0.05])
 _keys(walk,right_calf,"rotation",[0.0,0.225,0.45,0.675,0.9],[0.04,0.02,0.05,0.44,0.04])
 _keys(walk,left_arm,"rotation",[0.0,0.45,0.9],[0.28,-0.28,0.28])
 _keys(walk,right_arm,"rotation",[0.0,0.45,0.9],[-0.28,0.28,-0.28])
 _keys(walk,left_forearm,"rotation",[0.0,0.45,0.9],[-0.12,-0.24,-0.12])
 _keys(walk,right_forearm,"rotation",[0.0,0.45,0.9],[0.24,0.12,0.24])
 _keys(walk,rig,"position",[0.0,0.225,0.45,0.675,0.9],[Vector2.ZERO,Vector2(0,-2),Vector2.ZERO,Vector2(0,-2),Vector2.ZERO])
 library.add_animation("walk",walk)
 var greet := _base(2.8,false)
 _keys(greet,right_arm,"rotation",[0.0,0.6,2.2,2.8],[0.0,-2.2,-2.2,0.0])
 _keys(greet,right_forearm,"rotation",[0.0,0.6,1.0,1.4,1.8,2.2,2.8],[0.0,-0.2,0.45,-0.2,0.45,-0.2,0.0])
 _keys(greet,head,"rotation",[0.0,0.7,1.4,2.8],[0.0,-0.06,0.03,0.0])
 library.add_animation("greet",greet)
 var talk := _base(2.0)
 _keys(talk,right_arm,"rotation",[0.0,0.5,1.0,1.5,2.0],[-0.10,-0.28,-0.12,-0.24,-0.10])
 _keys(talk,right_forearm,"rotation",[0.0,0.5,1.0,1.5,2.0],[-0.20,-0.95,-0.45,-0.75,-0.20])
 _keys(talk,head,"rotation",[0.0,0.4,0.8,1.2,1.6,2.0],[0.0,0.045,-0.025,0.025,-0.02,0.0])
 library.add_animation("talk",talk)
 animator.add_animation_library("",library)

func play_state(state: String) -> void:
 if is_instance_valid(animator) and animator.has_animation(state):
  animator.play(state,0.15)

func _pair_pose(source: Node, destination: Node) -> void:
 for i in range(source.get_child_count()):
  var child := source.get_child(i)
  var copy := destination.get_child(i)
  if child is Node2D and copy is Node2D:
   pose_pairs.append([child,copy])
  if copy is Sprite2D:
   copy.material = null
  _pair_pose(child,copy)

func _process(_delta: float) -> void:
 for pair in pose_pairs:
  pair[1].transform = pair[0].transform

func set_shadow(length: float, opacity: float) -> void:
 if not is_instance_valid(shadow_rig): return
 var projection := Vector2(-0.83,0.56)*length
 shadow_rig.transform = Transform2D(Vector2.RIGHT,-projection/145.0,Vector2.ZERO)
 shadow_rig.modulate = Color(0.035,0.025,0.055,opacity)

func set_parts_material(value: Material) -> void:
 for sprite in pieces:
  sprite.material = value
