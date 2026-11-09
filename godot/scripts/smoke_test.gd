extends SceneTree
## Vérifie le chargement réel de la scène et ses interactions, sans serveur.
var failures := 0

func _initialize() -> void:
	call_deferred("run")

func check(value: bool, message: String) -> void:
	if not value:
		failures += 1
		push_error(message)

func run() -> void:
	var scene = load("res://scenes/village.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	check(scene.characters.size() == 8, "Huit personnages doivent être chargés")
	var character = scene.characters[0]
	var rest_position: Vector2 = character.portrait.position
	character._process(0.4)
	check(character.portrait.position == rest_position, "Le personnage ne doit pas être déformé ni déplacé")
	check(character.portrait.texture != null, "L'illustration doit être affichée directement")
	check(character.portrait.visible, "Les personnages d'origine doivent être visibles")
	check(character.portrait.texture.resource_path == "res://assets/characters/v-forgeron.png", "Le personnage doit utiliser l'illustration d'origine")
	check(character.find_children("*","AnimationPlayer",true,false).is_empty(), "Les nouvelles animations articulées ne doivent pas être chargées")
	var atmosphere_clock: float = scene.atmosphere.clock
	scene.atmosphere._process(0.2)
	check(scene.atmosphere.clock > atmosphere_clock, "Les effets d'ambiance doivent être animés")
	scene.characters[2].selected.emit("demo-2")
	check(scene.selected_id == "demo-2", "La sélection doit remonter à la scène")
	check(scene.characters[2].ring.visible, "Le personnage sélectionné doit être indiqué")
	check(not scene.characters[0].ring.visible, "Les autres personnages ne sont pas sélectionnés")
	scene.set_night(false, true)
	check(scene.lights.modulate.a == 0.0, "Les lumières doivent disparaître le jour")
	check(is_zero_approx(scene.plaza_seal.ignition), "La griffe doit être éteinte le jour")
	check(scene.background.material == scene.plaza_seal.effect, "La griffe doit être intégrée au décor du salon")
	var day_shadow: float = character.shadow_length
	check(character.projected_shadow.texture == character.portrait.texture, "L'ombre doit suivre la silhouette du personnage")
	scene.set_night(true,false,2.0)
	await create_timer(0.7).timeout
	check(scene.night_amount > 0.0 and scene.night_amount < 1.0, "La lumière du soleil doit évoluer progressivement")
	check(character.shadow_length > day_shadow, "Les ombres doivent s'allonger au coucher du soleil")
	check(is_zero_approx(scene.plaza_seal.ignition), "La griffe doit attendre la fin du crépuscule")
	check(character.light_material.get_shader_parameter("sun_color").g < 0.95, "Le soleil doit réchauffer les personnages")
	await create_timer(1.0).timeout
	check(scene.plaza_seal.ignition > 0.0 and scene.plaza_seal.ignition < 1.0, "La griffe doit s'allumer progressivement")
	await create_timer(0.5).timeout
	check(is_equal_approx(scene.lights.modulate.a, 0.65), "La transition de nuit doit aboutir")
	check(is_equal_approx(scene.plaza_seal.ignition, 1.0), "La griffe doit finir son allumage")
	check(character.light_material.get_shader_parameter("lamp_energy") > 0.0, "Les lanternes doivent éclairer les personnages la nuit")
	for person in scene.characters:
		check(person.light_material.get_shader_parameter("ambient").g > 1.14, "L'éclairage ambiant des visages doit rester fort toute la nuit")
		check(person.light_material.get_shader_parameter("lamp_energy") >= 1.0, "L'éclairage des lanternes doit rester fort sur chaque personnage")
	await create_timer(0.5).timeout
	check(character.light_material.get_shader_parameter("lamp_energy") >= 1.0, "La lumière des lanternes ne doit pas s'éteindre après la transition")
	scene.set_reduced_motion(true)
	check(not scene.characters[0].animated, "Les mouvements réduits doivent arrêter l'animation")
	await process_frame
	await process_frame
	var pose: Vector2 = scene.characters[0].portrait.scale
	var frozen_clock: float = scene.clock
	var frozen_atmosphere: float = scene.atmosphere.clock
	var frozen_seal: float = scene.plaza_seal.clock
	await process_frame
	await process_frame
	check(scene.characters[0].portrait.scale.is_equal_approx(pose), "La pose doit rester stable")
	check(is_equal_approx(scene.clock, frozen_clock), "La brume doit s'arrêter en mouvements réduits")
	check(is_equal_approx(scene.atmosphere.clock, frozen_atmosphere), "Les particules et lanternes doivent s'arrêter")
	check(is_equal_approx(scene.plaza_seal.clock, frozen_seal), "La pulsation de la griffe doit s'arrêter")
	check(scene.plaza_seal.effect.get_shader_parameter("pulse_enabled") == false, "La lumière doit rester fixe en mouvements réduits")
	check(scene.camera.offset == Vector2.ZERO, "La caméra doit être fixe en mouvements réduits")
	check(is_zero_approx(float(scene.fog_material.get_shader_parameter("strength"))), "Aucun voile lumineux ne doit éclairer tout le sol")
	var live = load("res://scenes/live_backdrop.tscn").instantiate()
	root.add_child(live)
	await process_frame
	live._receive([JSON.stringify({"active":true,"mode":"running","phase":1.0,"players":[{"id":"p1","avatar":"v-forgeron","x":300,"y":600,"k":1.0,"alive":true}]})])
	check(live.people.has("p1"), "Le décor doit suivre le siège public du joueur")
	check(not live.people["p1"].player_light_pool.visible, "Le joueur ne doit pas émettre de lumière sur le sol")
	live.queue_free()
	print("GODOT_SMOKE: %d erreur(s)" % failures)
	scene.queue_free()
	await process_frame
	quit(1 if failures else 0)
