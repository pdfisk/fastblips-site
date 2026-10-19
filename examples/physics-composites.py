# Physics demo: composite shapes.
#
# Run it in a console: the Physics tab of the output shows the world. Shapes
# are joined into one rigid body with combine(a, b), which returns the id of
# a new group (attach(group, shape) adds one more). A group falls, tumbles
# and collides as a single thing, with one mass and one centre of mass: a
# dumbbell tips over, a rocket lands on its fins. The shapes keep their own
# ids, colours and labels. Click to drop the next kind of composite.

world = Physics()
state = {"made": 0}


def dumbbell(w, x, y):
    a = w.add_ball(x - 22, y, 12)
    b = w.add_ball(x + 22, y, 12)
    bar = w.add_rect(x, y, 44, 6)
    w.set_color(a, "#1c7ed6")
    w.set_color(b, "#1c7ed6")
    w.set_color(bar, "#868e96")
    g = w.combine(a, bar)
    w.attach(g, b)


def snowman(w, x, y):
    legs = w.add_ball(x, y + 20, 16)
    chest = w.add_ball(x, y, 12)
    head = w.add_ball(x, y - 17, 8)
    for part in (legs, chest, head):
        w.set_color(part, "#f1f3f5")
    w.set_label(head, ":)")
    g = w.combine(legs, chest)
    w.attach(g, head)


def plus(w, x, y):
    h = w.add_rect(x, y, 44, 12)
    v = w.add_rect(x, y, 12, 44)
    w.set_color(h, "#e03131")
    w.set_color(v, "#e03131")
    w.combine(h, v)


def rocket(w, x, y):
    body = w.add_rect(x, y, 16, 40)
    nose = w.add_polygon(x, y - 28, 10, 3)
    fin1 = w.add_rect(x - 12, y + 14, 8, 16)
    fin2 = w.add_rect(x + 12, y + 14, 8, 16)
    w.set_color(body, "#dee2e6")
    for part in (nose, fin1, fin2):
        w.set_color(part, "#e8590c")
    g = w.combine(body, nose)
    w.attach(g, fin1)
    w.attach(g, fin2)


def wheel(w, x, y):
    rim = w.add_circle(x, y, 18)
    s1 = w.add_rect(x, y, 34, 5)
    s2 = w.add_rect(x, y, 5, 34)
    w.set_color(rim, "#2f9e44")
    w.set_color(s1, "#f08c00")
    w.set_color(s2, "#f08c00")
    g = w.combine(rim, s1)
    w.attach(g, s2)


KINDS = [dumbbell, snowman, plus, rocket, wheel]


# Adds the next kind of composite at (x, y): five kinds, in turn.
def make(w, x, y):
    KINDS[state["made"] % 5](w, x, y)
    state["made"] = state["made"] + 1


def clicked(w, x, y):
    make(w, x, y)
    print("Bodies:", w.get_count())


for i in range(5):
    make(world, 50 + i * 75, 50)

world.on_click(clicked)
print("Dumbbell, snowman, plus, rocket and wheel. Click to add another.")
