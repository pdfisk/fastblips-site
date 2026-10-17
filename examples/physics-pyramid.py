# Physics demo: knock down a pyramid of boxes.
#
# Run it in a console: the Physics tab of the output shows the world. The
# boxes are stacked six, five, four... high, and rest on each other thanks to
# friction. Click anywhere to throw a heavy ball at the pyramid from the
# left, aimed at the click: the faster it goes the harder it hits.

world = Physics()
world.set_background("#f1f3f5")

w = 34
h = 20
boxes = 0
for row in range(6):
    for col in range(6 - row):
        box = world.add_rect(200 - (5 - row) * w / 2 + col * w, 290 - h / 2 - row * h, w - 1, h - 1)
        if (row + col) % 2 == 0:
            world.set_color(box, "#f08c00")
        else:
            world.set_color(box, "#d9480f")
        world.set_friction(box, 0.7)
        boxes = boxes + 1

state = {"thrown": 0}


def throw(p, x, y):
    ball = p.add_ball(20, 200, 14)
    p.set_color(ball, "#1c7ed6")
    p.set_bounce(ball, 0.3)
    p.set_velocity(ball, (x - 20) * 3, (y - 200) * 3 - 150)
    state["thrown"] = state["thrown"] + 1
    print("Ball", state["thrown"])


world.on_click(throw)
print(boxes, "boxes. Click to throw a ball at the pyramid.")
