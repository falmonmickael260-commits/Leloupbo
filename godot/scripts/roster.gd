extends Node2D
const Catalog = preload("res://scripts/character_catalog.gd")
const Character = preload("res://scripts/articulated_villager.gd")
var characters: Array[Node2D] = []
var status: Label

func _ready() -> void:
 var backdrop := ColorRect.new()
 backdrop.color = Color("18202b")
 backdrop.size = Vector2(1500,844)
 add_child(backdrop)
 var heading := Label.new()
 heading.position = Vector2(60,20)
 heading.text = "LES HABITANTS DE LA MEUTE NOIRE"
 heading.add_theme_font_size_override("font_size",32)
 heading.add_theme_color_override("font_color",Color("e6c892"))
 add_child(heading)
 for i in range(Catalog.ENTRIES.size()):
  var entry: Dictionary = Catalog.ENTRIES[i]
  var actor := Character.new()
  actor.atlas_path = "res://assets/characters/rigs/%s.png" % entry.id
  actor.position = Vector2(160+(i%5)*295,245+int(i/5)*165)
  actor.scale = Vector2.ONE*0.84
  add_child(actor)
  actor.animator.seek(float(i)*0.11,true)
  characters.append(actor)
  var name_label := Label.new()
  name_label.position = actor.position+Vector2(-125,6)
  name_label.size.x = 250
  name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
  name_label.text = entry.name
  name_label.add_theme_font_size_override("font_size",18)
  add_child(name_label)
 var bar := HBoxContainer.new()
 bar.position = Vector2(60,795)
 bar.add_theme_constant_override("separation",18)
 add_child(bar)
 for pair in [["Repos","idle"],["Marche","walk"],["Salut","greet"],["Parole","talk"]]:
  var button := Button.new()
  button.text = pair[0]
  button.custom_minimum_size = Vector2(135,34)
  var state: String = pair[1]
  button.pressed.connect(func(): play_all(state))
  bar.add_child(button)
 status = Label.new()
 status.text = "20 apparences · Repos"
 status.position = Vector2(940,800)
 status.add_theme_color_override("font_color",Color("e6c892"))
 add_child(status)

func play_all(state: String) -> void:
 for i in range(characters.size()):
  characters[i].play_state(state)
  if state != "greet":
   characters[i].animator.seek(float(i)*0.07,true)
 if is_instance_valid(status):
  status.text = "20 apparences · "+{"idle":"Repos","walk":"Marche","greet":"Salut","talk":"Parole"}.get(state,state)
