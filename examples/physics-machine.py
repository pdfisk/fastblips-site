# Physics demo: a machine of animated composites.
#
# Run it in a console: the Physics tab of the output shows the world. A
# fixed body does not fall or get pushed, but it can still move by itself:
# give it a spin (set_spin) and it turns like a windmill, or an animation
# (oscillate swings it back and forth for ever; move_to, rotate_to and
# scale_to carry out one smooth move) and it pushes everything it meets. Here
# a three-bladed windmill, a lift and a sweeper are fixed composites.
# Click to make the blob of balls grow and shrink (scale_to), and to drop
# more balls.

world = Physics()
world.set_background("#f8f9fa")

# The windmill: a hub and three blades joined into one group, fixed, and spun.
hub = world.add_circle(130, 170, 9)
mill = world.combine(hub, world.add_rect(130, 170, 100, 7))
for i in range(1, 3):
    blade = world.add_rect(130, 170, 100, 7)
    world.set_angle(blade, i * 60)
    world.attach(mill, blade)
world.set_color(mill, "#495057")
world.set_fixed(mill, True)
world.set_spin(mill, 70)

# The lift: a platform that swings up and down 60 units, once every four seconds.
lift = world.add_rect(290, 150, 70, 8)
world.set_color(lift, "#1c7ed6")
world.set_fixed(lift, True)
world.oscillate(lift, 0, 60, 0, 4)

# The sweeper: a rod on the floor that sweeps to and fro.
sweeper = world.add_rect(200, 288, 12, 24)
world.set_color(sweeper, "#e03131")
world.set_fixed(sweeper, True)
world.oscillate(sweeper, 90, 0, 0, 5)

# The blob: three balls joined, which grows and shrinks when you click.
blob = world.add_group(60, 240)
for i in range(3):
    b = world.add_ball(48 + i * 14, 240 - (i % 2) * 10, 9)
    world.set_color(b, "#ae3ec9")
    world.attach(blob, b)
world.set_fixed(blob, True)

for i in range(20):
    ball = world.add_ball(30 + (i * 53) % 340, 20 + (i // 7) * 20, 7)
    world.set_color(ball, "#f08c00")


def clicked(w, x, y):
    if w.get_scale(blob) < 1.5:
        w.scale_to(blob, 2.5, 1.5)
    else:
        w.scale_to(blob, 1, 1.5)
    ball = w.add_ball(x, 20, 7)
    w.set_color(ball, "#f08c00")
    print("Bodies:", w.get_count())


world.on_click(clicked)
print("Click: the blob grows or shrinks, and more balls fall.")
