# Flood-It - fill the whole board with one colour in 22 moves or fewer.
#
# You own the blob of colour in the top left corner. Tap a colour (in the row
# at the bottom, or any square on the board) and the blob turns that colour
# and swallows every touching square of the same colour. Grow it to cover the
# board before you run out of moves.
#
# Made with: Canvas, on_click, lists of lists, and a fill that uses a stack.
# rand() is our own small seeded generator (MiniPy also has random() and
# randint(), but those differ every run); every round
# has a different seed, so every board is different.

W = 320
H = 480
SIZE = 12              # the board is SIZE by SIZE squares
CELL = 24
LEFT = 16
TOP = 100
LIMIT = 22             # moves allowed
COLORS = ["#e03131", "#f08c00", "#fcc419", "#2f9e44", "#1c7ed6", "#9c36b5"]
NAMES = ["red", "orange", "yellow", "green", "blue", "purple"]

canvas = Canvas()
canvas.set_size(W, H)
canvas.set_auto_update(False)

state = {"round": 1, "moves": 0, "seed": 1, "over": False, "won": False}
grid = []              # grid[row][column] is a colour number 0..5


def rand(n):
    state["seed"] = (state["seed"] * 16807) % 2147483647
    return state["seed"] % n


def new_game():
    state["seed"] = state["round"] * 97 + 5
    state["moves"] = 0
    state["over"] = False
    state["won"] = False
    while len(grid) > 0:
        grid.pop()
    for row in range(SIZE):
        line = []
        for col in range(SIZE):
            line.append(rand(6))
        grid.append(line)


def flood(new):
    # Recolour the blob that touches the top left corner. Returns False if
    # the colour is the one it already has (a wasted move is not counted).
    old = grid[0][0]
    if old == new:
        return False
    grid[0][0] = new
    todo = [[0, 0]]
    while len(todo) > 0:
        spot = todo.pop()
        for step in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
            r = spot[0] + step[0]
            c = spot[1] + step[1]
            if r >= 0 and r < SIZE and c >= 0 and c < SIZE:
                if grid[r][c] == old:
                    grid[r][c] = new
                    todo.append([r, c])
    return True


def all_one_colour():
    first = grid[0][0]
    for row in range(SIZE):
        for col in range(SIZE):
            if grid[row][col] != first:
                return False
    return True


def centred(y, text, size, k=0.29):
    canvas.set_font_size(size)
    canvas.text(W / 2 - len(str(text)) * size * k, y, text)


def draw():
    canvas.set_background("#14161f")
    canvas.clear()
    canvas.set_color("#f1f3f5")
    centred(16, "FLOOD-IT", 28, 0.34)
    left = LIMIT - state["moves"]
    canvas.set_color("#868e96")
    centred(58, "Moves left: " + str(left) + " of " + str(LIMIT), 16)
    centred(78, "Tap a colour to flood from the top left", 12)

    for row in range(SIZE):
        for col in range(SIZE):
            canvas.set_color(COLORS[grid[row][col]])
            canvas.fill_rect(LEFT + col * CELL, TOP + row * CELL, CELL - 1, CELL - 1)

    # the palette
    for i in range(6):
        canvas.set_color(COLORS[i])
        canvas.fill_circle(38 + i * 49, 430, 20)

    if state["over"]:
        canvas.set_color("#14161f")
        canvas.fill_rect(40, 180, 240, 96)
        if state["won"]:
            canvas.set_color("#69db7c")
            canvas.rect(40, 180, 240, 96)
            centred(196, "You flooded it!", 22)
            centred(232, "in " + str(state["moves"]) + " moves. Tap to play again", 13)
        else:
            canvas.set_color("#ff6b6b")
            canvas.rect(40, 180, 240, 96)
            centred(196, "Out of moves", 22)
            centred(232, "Tap for a new board", 14)
    canvas.update()


def pick_colour(x, y):
    # Which colour did the tap choose? -1 for none.
    if x >= LEFT and x < LEFT + SIZE * CELL and y >= TOP and y < TOP + SIZE * CELL:
        return grid[int((y - TOP) / CELL)][int((x - LEFT) / CELL)]
    for i in range(6):
        dx = x - (38 + i * 49)
        dy = y - 430
        if dx * dx + dy * dy <= 24 * 24:
            return i
    return -1


def tapped(c, x, y):
    if state["over"]:
        state["round"] = state["round"] + 1
        new_game()
    else:
        colour = pick_colour(x, y)
        if colour >= 0 and flood(colour):
            state["moves"] = state["moves"] + 1
            if all_one_colour():
                state["over"] = True
                state["won"] = True
            elif state["moves"] >= LIMIT:
                state["over"] = True
    draw()


canvas.on_click(tapped)
new_game()
draw()
