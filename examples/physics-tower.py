# Physics demo: a tower that comes apart.
#
# Run it in a console: the Physics tab of the output shows the world. Five
# blocks are joined into one group, so the tower stands, and would fall, as
# one rigid thing. detach(block) takes a block out of the group, to be a
# shape on its own again with the same id, moving as it was; get_part_count
# says how many shapes a group still has. Click the right half to flick the
# top block off the tower. Click the left half to throw a ball at it.

world = Physics()
world.set_background("#f1f3f5")

blocks = []
for i in range(5):
    b = world.add_rect(290, 288 - i * 24, 50, 22)
    if i % 2 == 0:
        world.set_color(b, "#d9480f")
    else:
        world.set_color(b, "#f08c00")
    world.set_label(b, str(i + 1))
    blocks.append(b)
tower = world.combine(blocks[0], blocks[1])
for b in blocks[2:]:
    world.attach(tower, b)

state = {"top": 4}


def clicked(w, x, y):
    if x >= 200:
        top = state["top"]
        if top >= 1:
            w.detach(blocks[top])
            w.set_velocity(blocks[top], 160, -180)
            state["top"] = top - 1
            print("Block", top + 1, "is off. The tower has", w.get_part_count(tower), "blocks.")
        else:
            print("Only the bottom block is left.")
    else:
        ball = w.add_ball(30, 200, 12)
        w.set_color(ball, "#1c7ed6")
        w.set_velocity(ball, (290 - 30) * 2.5, -250)


world.on_click(clicked)
print("Five blocks, one group. Right half: flick off the top block. Left half: throw a ball.")
