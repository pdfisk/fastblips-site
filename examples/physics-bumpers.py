# Physics demo: a pinball-style table with bumpers.
#
# Run it in a console: the Physics tab of the output shows the world. The
# bumpers and the two paddles are fixed shapes; the bumpers are very bouncy.
# on_collide calls a function whenever two shapes hit hard enough, with their
# ids; a side of the world is id 0. Click to drop another ball.

world = Physics()
world.set_background("#212529")

# Three round bumpers, bouncy enough to kick a ball back.
bumpers = []
for i in range(3):
    b = world.add_circle(110 + i * 90, 110 + (i % 2) * 50, 22)
    world.set_fixed(b, True)
    world.set_bounce(b, 1)
    world.set_color(b, "#f03e3e")
    bumpers.append(b)

# Two paddles at the bottom, sloping in towards the middle.
paddle_a = world.add_rect(110, 262, 90, 9)
world.set_angle(paddle_a, 22)
world.set_fixed(paddle_a, True)
world.set_color(paddle_a, "#adb5bd")
paddle_b = world.add_rect(290, 262, 90, 9)
world.set_angle(paddle_b, -22)
world.set_fixed(paddle_b, True)
world.set_color(paddle_b, "#adb5bd")

state = {"score": 0}


# Called with the ids of the two shapes that hit: score a point for a bumper.
def hit(w, a, b):
    for bumper in bumpers:
        if a == bumper or b == bumper:
            state["score"] = state["score"] + 10
            w.set_color(bumper, "#ffd43b")
            print("Bumper! Score", state["score"])


def drop(w, x, y):
    ball = w.add_ball(x, y, 9)
    w.set_color(ball, "#dee2e6")
    w.set_bounce(ball, 0.7)
    w.set_velocity(ball, 30, 0)


world.on_collide(hit)
world.on_click(drop)
drop(world, 200, 20)
print("Click to drop another ball.")
