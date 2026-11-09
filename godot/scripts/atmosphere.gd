extends Node2D
## Lanternes et particules décoratives, indépendantes des rôles.
var clock := 0.0
var animated := true
var night_amount := 1.0
var foreground := false
const TORCHES := [Vector2(854, 351), Vector2(1004, 351)]
const LANTERNS := [Vector2(387, 326), Vector2(1406, 242), Vector2(1238, 346), Vector2(1326, 376)]

func _process(delta: float) -> void:
	if animated:
		clock += delta
		queue_redraw()

func _draw() -> void:
	if not foreground:
		return
	# Le décor contient déjà les halos localisés des vraies sources.
	# Garder seulement quelques étincelles sur les deux braseros.
	for i in range(TORCHES.size()):
		var p: Vector2 = TORCHES[i]
		for spark in range(5):
			var seed_value := float(i * 7 + spark)
			var travel := fposmod(clock * (0.24 + spark * 0.03) + seed_value * 0.17, 1.0)
			var drift := sin(clock * 0.9 + seed_value) * 15.0 + travel * 14.0
			var pos := p + Vector2(drift, -travel * 110.0)
			draw_circle(pos, 1.2 + (1.0 - travel), Color(1.0, 0.60, 0.24, sin(travel * PI) * 0.65 * night_amount), true, -1.0, true)
