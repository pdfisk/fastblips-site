# Lights Out - a tap puzzle for phone or desktop.
#
# Tap a light to flip it AND its four neighbours. Turn every light off.
# Every level is built by pressing lights at random from a dark board, so
# it can always be solved. Tap "Restart" to retry, or tap anywhere after
# a win for the next level.
#
# Made with: Canvas (drawing), on_click (taps and mouse clicks).
# rand() below is a tiny seeded generator of our own (MiniPy also has random()
# and randint(), but those differ every run, and we want a repeatable puzzle).
# It is seeded from the level number: level 3 is the same puzzle every time.

W = 320
H = 480
N = 5                  # the board is N by N lights
CELL = 56
LEFT = 20              # where the board starts
TOP = 120

canvas = Canvas()
canvas.set_size(W, H)
canvas.set_auto_update(False)   # we call update() when a picture is finished

# A function cannot assign to a module-level name, so changing state lives
# in a dict (see examples/README.md).
state = {"level": 1, "moves": 0, "seed": 1, "solved": False}
lights = [0] * (N * N)          # 1 = on, 0 = off; index = row * N + column


def rand(n):
    # Park-Miller generator: a whole number from 0 to n-1.
    state["seed"] = (state["seed"] * 16807) % 2147483647
    return state["seed"] % n


def flip(row, col):
    # Flip one light, if (row, col) is on the board.
    if row >= 0 and row < N and col >= 0 and col < N:
        lights[row * N + col] = 1 - lights[row * N + col]


def press(row, col):
    flip(row, col)
    flip(row - 1, col)
    flip(row + 1, col)
    flip(row, col - 1)
    flip(row, col + 1)


def new_level():
    for i in range(N * N):
        lights[i] = 0
    state["seed"] = state["level"] * 7919 + 13
    for i in range(3 + state["level"]):
        n = rand(N * N)
        press(n // N, n % N)
    if sum(lights) == 0:
        press(2, 2)             # never start already solved
    state["moves"] = 0
    state["solved"] = False


def centred(y, text, size, k=0.29):
    # canvas.text puts the top left corner at (x, y), so work out x ourselves:
    # half the text's width, which is about k * size for each character
    # (CAPITALS are wider than lower case, so titles pass a bigger k).
    canvas.set_font_size(size)
    canvas.text(W / 2 - len(str(text)) * size * k, y, text)


def draw():
    canvas.set_background("#14161f")
    canvas.clear()
    canvas.set_color("#f1f3f5")
    centred(24, "LIGHTS OUT", 28, 0.34)
    canvas.set_color("#868e96")
    centred(64, "Level " + str(state["level"]) + "   Moves " + str(state["moves"]), 16)
    centred(88, "Turn every light off", 13)

    for row in range(N):
        for col in range(N):
            x = LEFT + col * CELL + CELL / 2
            y = TOP + row * CELL + CELL / 2
            if lights[row * N + col] == 1:
                canvas.set_color("#5c4a00")
                canvas.fill_circle(x, y, CELL / 2 - 2)      # glow
                canvas.set_color("#ffd43b")
                canvas.fill_circle(x, y, CELL / 2 - 8)
            else:
                canvas.set_color("#252a3a")
                canvas.fill_circle(x, y, CELL / 2 - 8)

    # restart button
    canvas.set_color("#252a3a")
    canvas.fill_rect(110, 430, 100, 34)
    canvas.set_color("#ced4da")
    centred(439, "Restart", 16)

    if state["solved"]:
        canvas.set_color("#14161f")
        canvas.fill_rect(30, 190, 260, 100)
        canvas.set_color("#ffd43b")
        canvas.rect(30, 190, 260, 100)
        centred(204, "Solved in " + str(state["moves"]) + " moves!", 20)
        canvas.set_color("#ced4da")
        centred(246, "Tap for level " + str(state["level"] + 1), 16)
    canvas.update()


def tapped(c, x, y):
    if state["solved"]:
        state["level"] = state["level"] + 1
        new_level()
    elif y >= 430 and x >= 110 and x <= 210:
        new_level()
    elif x >= LEFT and x < LEFT + N * CELL and y >= TOP and y < TOP + N * CELL:
        col = int((x - LEFT) / CELL)
        row = int((y - TOP) / CELL)
        press(row, col)
        state["moves"] = state["moves"] + 1
        if sum(lights) == 0:
            state["solved"] = True
    draw()


canvas.on_click(tapped)
new_level()
draw()
