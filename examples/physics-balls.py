# Physics demo: bouncing balls.
#
# Run it in a console: the Physics tab of the output shows the world.
# Physics() is the program's world, 400 units wide and 300 high with (0, 0)
# at the top left and y pointing down. Every shape you add gets an id, which
# the other methods take. Gravity pulls shapes down, and the sides of the
# world are solid.

world = Physics()
colors = ["#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f08c00", "#e03131"]

# Twelve balls of different sizes and bounciness, in rows near the top.
# set_bounce is how much speed a ball keeps in a bounce: 0 stops dead, 1 keeps it all.
for i in range(12):
    ball = world.add_ball(30 + i * 30, 30 + (i % 3) * 28, 8 + (i % 4) * 3)
    world.set_color(ball, colors[i % 6])
    world.set_bounce(ball, 0.45 + (i % 5) * 0.12)

state = {"count": 12}


# A click calls this function with the world and the place that was clicked.
def add_ball(w, x, y):
    n = state["count"]
    ball = w.add_ball(x, y, 8 + (n % 5) * 3)
    w.set_color(ball, colors[n % 6])
    w.set_bounce(ball, 0.6 + (n % 4) * 0.1)
    w.set_velocity(ball, (n % 7) * 40 - 120, -200)
    state["count"] = n + 1
    print("Balls:", w.get_count())


world.on_click(add_ball)
print("Twelve balls. Click the world to drop another.")
