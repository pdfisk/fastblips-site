# Physics demo: gravity that follows your clicks.
#
# Run it in a console: the Physics tab of the output shows the world. Click
# the world and gravity points towards the click, so the shapes slide and
# pile up against that side. set_gravity takes the pull along x and along y
# (900 straight down is the usual). Click the middle to let go of gravity.

world = Physics()
world.set_background("#e7f5ff")

for i in range(9):
    ball = world.add_ball(60 + i * 35, 60 + (i % 3) * 30, 12)
    world.set_color(ball, "#1c7ed6")
    box = world.add_rect(70 + i * 35, 200 - (i % 3) * 30, 22, 22)
    world.set_color(box, "#f08c00")
    tri = world.add_polygon(80 + i * 30, 130, 13, 3)
    world.set_color(tri, "#2f9e44")


def pull(w, x, y):
    dx = x - 200
    dy = y - 150
    length = (dx * dx + dy * dy) ** 0.5
    if length < 20:
        w.set_gravity(0, 0)
        print("No gravity")
    else:
        w.set_gravity(dx / length * 900, dy / length * 900)
        print("Gravity towards", x, y)


world.on_click(pull)
print("Click: gravity pulls towards the click. Click the middle for none.")
