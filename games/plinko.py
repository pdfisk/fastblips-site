# Plinko - drop 10 balls through the pegs and chase the big scores.
#
# Tap near the top to drop a ball where you tapped. Balls bounce down through
# the pegs into a slot; the number at the bottom is what you score. If a ball
# gets stuck, tap right on it to give it a nudge. After the last ball, tap to
# play again.
#
# Made with: Physics (fixed pegs, bouncy balls), on_click, on_collide.
# The slot floors are fixed shapes; on_collide tells us which ball hit which.

W = 320
H = 480
SLOT_COUNT = 6
SLOT_W = W / SLOT_COUNT
SLOT_VALUES = [100, 10, 50, 50, 10, 100]
FLOOR_Y = 462
BALLS = 10

world = Physics()
world.set_size(W, H)
world.set_background("#14161f")
world.set_gravity(0, 700)

state = {"left": BALLS, "score": 0, "bar": 0, "seed": 7, "over": False}
balls = {}          # ids of the balls in play
floors = {}         # id of a slot floor -> the points it is worth


def rand(n):
    state["seed"] = (state["seed"] * 16807) % 2147483647
    return state["seed"] % n


def banner():
    if state["over"] and len(balls) == 0:
        text = "Final score " + str(state["score"]) + " - tap to play again"
    else:
        text = "Balls " + str(state["left"]) + "   Score " + str(state["score"])
    world.set_label(state["bar"], text)


def build():
    world.clear()
    balls.clear()
    floors.clear()
    state["left"] = BALLS
    state["score"] = 0
    state["over"] = False
    bar = world.add_rect(W / 2, 12, W, 22)
    world.set_fixed(bar, True)
    world.set_color(bar, "#ced4da")          # light, so its text can be read
    state["bar"] = bar
    # rows of pegs, every other row shifted half a step
    for row in range(8):
        y = 110 + row * 38
        offset = 0
        count = 7
        if row % 2 == 1:
            offset = SLOT_W / 2
            count = 6
        for i in range(count):
            peg = world.add_circle(offset + i * SLOT_W, y, 5)
            world.set_fixed(peg, True)
            world.set_bounce(peg, 0.5)
            world.set_color(peg, "#adb5bd")
    # slot dividers and the floor of each slot
    for i in range(SLOT_COUNT + 1):
        wall = world.add_rect(i * SLOT_W, 430, 4, 64)
        world.set_fixed(wall, True)
        world.set_color(wall, "#868e96")
    for i in range(SLOT_COUNT):
        value = SLOT_VALUES[i]
        floor = world.add_rect(i * SLOT_W + SLOT_W / 2, FLOOR_Y, SLOT_W - 4, 10)
        world.set_fixed(floor, True)
        if value >= 100:
            world.set_color(floor, "#ffd43b")
        elif value >= 50:
            world.set_color(floor, "#69db7c")
        else:
            world.set_color(floor, "#4dabf7")
        world.set_label(floor, str(value))
        floors[floor] = value
    banner()


def landed(ball, floor):
    state["score"] = state["score"] + floors[floor]
    world.remove_body(ball)
    balls.pop(ball)
    banner()


def hit(w, a, b):
    if a in balls and b in floors:
        landed(a, b)
    elif b in balls and a in floors:
        landed(b, a)


def tapped(w, x, y):
    if state["over"] and len(balls) == 0:
        build()
        return
    near = w.body_at(x, y)
    if near in balls:
        w.apply_impulse(near, (rand(5) - 2) * 40, -60)       # a nudge
        return
    if state["left"] <= 0:
        return
    if x < 14:
        x = 14
    if x > W - 14:
        x = W - 14
    ball = w.add_ball(x, 44, 7)
    w.set_bounce(ball, 0.45)
    w.set_color(ball, "#ff8787")
    w.set_velocity(ball, rand(21) - 10, 0)      # a tiny sideways push, so no two drops match
    balls[ball] = True
    state["left"] = state["left"] - 1
    if state["left"] == 0:
        state["over"] = True
    banner()


world.on_click(tapped)
world.on_collide(hit)
build()
