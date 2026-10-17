# Physics demo: many kinds of shape in one world.
#
# Run it in a console: the Physics tab of the output shows the world.
# Circles, balls, rectangles, ellipses and regular polygons all fall, spin
# and push each other. Two fixed slopes (set_fixed) make a funnel; fixed
# shapes never move. Angles are in degrees.

world = Physics()
world.set_background("#f8f9fa")

# The funnel: a slope on each side.
left = world.add_rect(80, 150, 150, 8)
world.set_angle(left, 25)
world.set_fixed(left, True)
world.set_color(left, "#495057")
right = world.add_rect(320, 150, 150, 8)
world.set_angle(right, -25)
world.set_fixed(right, True)
world.set_color(right, "#495057")

colors = ["#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f08c00", "#e03131"]
state = {"made": 0}


# Adds the next kind of shape at (x, y): the kind goes round five in turn.
def add_shape(w, x, y):
    made = state["made"]
    kind = made % 5
    if kind == 0:
        shape = w.add_circle(x, y, 11)
    elif kind == 1:
        shape = w.add_ball(x, y, 10)
    elif kind == 2:
        shape = w.add_rect(x, y, 26, 16)
    elif kind == 3:
        shape = w.add_ellipse(x, y, 15, 8)
    else:
        sides = 3 + (made // 5) % 4
        shape = w.add_polygon(x, y, 12, sides)
        w.set_label(shape, str(sides))
    w.set_color(shape, colors[made % 6])
    w.set_angle(shape, made * 37)
    state["made"] = made + 1


def clicked(w, x, y):
    add_shape(w, x, y)
    print("Shapes:", w.get_count() - 2)


for i in range(15):
    add_shape(world, 60 + (i * 47) % 280, 10 + (i // 5) * 22)

world.on_click(clicked)
print("Circles, balls, rectangles, ellipses and polygons. Click to add another.")
