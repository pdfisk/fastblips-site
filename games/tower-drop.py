# Tower Drop - stack blocks as high as you can on a small platform.
#
# Tap where you want the next block to fall. Blocks come in different widths.
# A block that tumbles off the platform costs a life; lose three and the game
# is over (tap to start again). The platform shows your best height and lives.
#
# Made with: Physics (shapes that fall, bounce and rest), on_click, on_collide.
# Blocks are heavy and grippy on purpose, so a tidy tower really does stand.

W = 320
H = 480
PLATFORM_Y = 440
PLATFORM_TOP = PLATFORM_Y - 8
BLOCK_H = 24
COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2"]

world = Physics()
world.set_size(W, H)
world.set_background("#14161f")
world.set_walls(False)            # no side or bottom walls: blocks can fall away

state = {"seed": 1, "dropped": 0, "lives": 3, "best": 0, "over": False, "platform": 0}
blocks = {}                       # block id -> its height in the world, for blocks still on screen


def rand(n):
    state["seed"] = (state["seed"] * 16807) % 2147483647
    return state["seed"] % n


def banner():
    if state["over"]:
        text = "Game over - " + str(state["best"]) + "m - tap"
    else:
        text = str(state["best"]) + "m   lives " + str(state["lives"])
    world.set_label(state["platform"], text)


def build():
    world.clear()
    blocks.clear()
    state["dropped"] = 0
    state["lives"] = 3
    state["best"] = 0
    state["over"] = False
    plat = world.add_rect(W / 2, PLATFORM_Y, 130, 16)
    world.set_fixed(plat, True)
    world.set_friction(plat, 1.5)
    world.set_color(plat, "#ced4da")      # light, so its text can be read
    state["platform"] = plat
    banner()


def check():
    # Take off any block that has fallen away, lose a life for each, and work
    # out the height of the tower from the blocks that are standing still.
    for b in list(blocks.keys()):
        if world.get_y(b) > H + 20 or world.get_x(b) < -40 or world.get_x(b) > W + 40:
            world.remove_body(b)
            blocks.pop(b)
            state["lives"] = state["lives"] - 1
    top = PLATFORM_TOP
    for b in blocks.keys():
        if abs(world.get_vy(b)) < 15 and abs(world.get_vx(b)) < 15:
            t = world.get_y(b) - BLOCK_H / 2
            if t < top:
                top = t
    height = int((PLATFORM_TOP - top) / 10)
    if height > state["best"]:
        state["best"] = height
    if state["lives"] <= 0:
        state["over"] = True
    banner()


def hit(w, a, b):
    if not state["over"]:
        check()


def tapped(w, x, y):
    if state["over"]:
        build()
        return
    check()
    if state["over"]:
        return
    width = 50 + rand(5) * 10
    left = width / 2
    if x < left:
        x = left
    if x > W - left:
        x = W - left
    b = w.add_rect(x, 40, width, BLOCK_H)
    w.set_color(b, COLORS[state["dropped"] % 6])
    w.set_friction(b, 1.5)
    w.set_bounce(b, 0)
    blocks[b] = BLOCK_H
    state["dropped"] = state["dropped"] + 1


world.on_click(tapped)
world.on_collide(hit)
build()
