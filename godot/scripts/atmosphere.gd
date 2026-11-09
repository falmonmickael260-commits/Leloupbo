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
	for p in LANTERNS:
		var shimmer := 1.0 + sin(clock * 3.4 + p.x) * 0.06
		for layer in range(4, 0, -1):
			draw_circle(p, layer * 9.0 * shimmer, Color(1.0, 0.55, 0.16, 0.015 * night_amount))
	for i in range(TORCHES.size()):
		var p: Vector2 = TORCHES[i]
		var flicker := 1.0 + 0.09 * sin(clock * 10.3 + i * 4.0) + 0.04 * sin(clock * 23.0 + i)
		for layer in range(6, 0, -1):
			draw_circle(p, float(layer) * 11.0 * flicker, Color(1.0, 0.43, 0.13, 0.012 * night_amount))
		for spark in range(5):
			var seed_value := float(i * 7 + spark)
			var travel := fposmod(clock * (0.24 + spark * 0.03) + seed_value * 0.17, 1.0)
			var drift := sin(clock * 0.9 + seed_value) * 15.0 + travel * 14.0
			var pos := p + Vector2(drift, -travel * 110.0)
			draw_circle(pos, 1.2 + (1.0 - travel), Color(1.0, 0.60, 0.24, sin(travel * PI) * 0.85))
	for i in range(22):
		var k := float(i)
		var p := Vector2(fposmod(k * 137.0 + clock * 9.0, 1560.0) - 30.0, 590.0 + sin(k * 5.4 + clock * 0.5) * 110.0)
		var brightness := (0.5 + 0.5 * sin(clock * 1.7 + k)) * 0.65 * night_amount
		draw_circle(p, 5.0, Color(0.78, 0.85, 1.0, brightness * 0.06))
		draw_circle(p, 1.3, Color(0.90, 0.89, 0.65, brightness))
