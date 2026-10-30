# Connect Four against the computer.
#
# You are red and go first; tap a column to drop a disc into it. Get four in a
# row - across, up and down, or diagonal - before the computer does. After a
# game, tap anywhere to play again; the computer goes first every other game.
#
# Made with: Canvas, on_click, a little animation with sleep(), and a small
# look-ahead search (negamax with alpha-beta cutting) for the computer.

W = 320
H = 480
COLS = 7
ROWS = 6
CELL = 40
LEFT = 20
TOP = 130
DEPTH = 4              # how many moves ahead the computer looks

canvas = Canvas()
canvas.set_size(W, H)
canvas.set_auto_update(False)

# board[row][col]: 0 empty, 1 you (red), 2 the computer (yellow); row 0 is the top.
board = []
for r in range(ROWS):
    board.append([0] * COLS)

state = {"games": 0, "over": False, "message": "", "win": []}
ORDER = [3, 2, 4, 1, 5, 0, 6]      # try the middle columns first
LINES = []                          # every group of four squares, built once
AT = []                             # AT[row * COLS + col]: the groups that pass through that square


def build_lines():
    for r in range(ROWS):
        for c in range(COLS):
            for d in [[0, 1], [1, 0], [1, 1], [1, -1]]:
                er = r + 3 * d[0]
                ec = c + 3 * d[1]
                if er >= 0 and er < ROWS and ec >= 0 and ec < COLS:
                    line = []
                    for k in range(4):
                        line.append([r + k * d[0], c + k * d[1]])
                    LINES.append(line)
    for i in range(ROWS * COLS):
        AT.append([])
    for line in LINES:
        for spot in line:
            AT[spot[0] * COLS + spot[1]].append(line)


def lowest_empty(col):
    for r in range(ROWS - 1, -1, -1):
        if board[r][col] == 0:
            return r
    return -1


def wins_at(r, c, player):
    # Does the disc just placed at (r, c) complete four for player? Only the
    # groups of four that pass through that square can have changed.
    for line in AT[r * COLS + c]:
        n = 0
        for spot in line:
            if board[spot[0]][spot[1]] == player:
                n = n + 1
        if n == 4:
            return True
    return False


def winning_line(player):
    for line in LINES:
        n = 0
        for spot in line:
            if board[spot[0]][spot[1]] == player:
                n = n + 1
        if n == 4:
            return line
    return []


def board_full():
    for c in range(COLS):
        if board[0][c] == 0:
            return False
    return True


def evaluate(player):
    # How good is the board for player? One pass over every group of four:
    # groups only one side can still use are worth points to that side, and
    # the middle column is worth a little.
    other = 3 - player
    total = 0
    for r in range(ROWS):
        if board[r][3] == player:
            total = total + 3
        elif board[r][3] == other:
            total = total - 3
    for line in LINES:
        mine = 0
        theirs = 0
        for spot in line:
            v = board[spot[0]][spot[1]]
            if v == player:
                mine = mine + 1
            elif v == other:
                theirs = theirs + 1
        if theirs == 0:
            if mine == 3:
                total = total + 6
            elif mine == 2:
                total = total + 2
        elif mine == 0:
            if theirs == 3:
                total = total - 7
            elif theirs == 2:
                total = total - 2
    return total


def negamax(player, depth, alpha, beta):
    # Best score the player to move can force, looking depth moves ahead.
    if depth == 0:
        return evaluate(player)
    best = -100000
    moved = False
    for c in ORDER:
        r = lowest_empty(c)
        if r >= 0:
            moved = True
            board[r][c] = player
            if wins_at(r, c, player):
                v = 1000 + depth              # winning sooner is better
            else:
                v = -negamax(3 - player, depth - 1, -beta, -alpha)
            board[r][c] = 0
            if v > best:
                best = v
            if best > alpha:
                alpha = best
            if alpha >= beta:
                break
    if not moved:
        return 0                              # a full board is a draw
    return best


def computer_move():
    best = -100000
    pick = 3
    for c in ORDER:
        r = lowest_empty(c)
        if r >= 0:
            board[r][c] = 2
            if wins_at(r, c, 2):
                v = 100000
            else:
                v = -negamax(1, DEPTH - 1, -100000, 100000)
            board[r][c] = 0
            if v > best:
                best = v
                pick = c
    return pick


def centred(y, text, size, k=0.29):
    canvas.set_font_size(size)
    canvas.text(W / 2 - len(str(text)) * size * k, y, text)


def disc_colour(v):
    if v == 1:
        return "#ff6b6b"
    return "#ffd43b"


def draw(falling_x, falling_y, falling_player):
    canvas.set_background("#14161f")
    canvas.clear()
    canvas.set_color("#f1f3f5")
    centred(20, "CONNECT FOUR", 28, 0.34)
    canvas.set_color("#ced4da")
    centred(64, state["message"], 16)
    if falling_player > 0:
        canvas.set_color(disc_colour(falling_player))
        canvas.fill_circle(falling_x, falling_y, CELL / 2 - 4)
    canvas.set_color("#1c4fa1")
    canvas.fill_rect(LEFT - 6, TOP - 6, COLS * CELL + 12, ROWS * CELL + 12)
    for r in range(ROWS):
        for c in range(COLS):
            x = LEFT + c * CELL + CELL / 2
            y = TOP + r * CELL + CELL / 2
            if board[r][c] == 0:
                canvas.set_color("#14161f")
            else:
                canvas.set_color(disc_colour(board[r][c]))
            canvas.fill_circle(x, y, CELL / 2 - 4)
    for spot in state["win"]:
        canvas.set_color("#ffffff")
        canvas.circle(LEFT + spot[1] * CELL + CELL / 2, TOP + spot[0] * CELL + CELL / 2, CELL / 2 - 2)
    if state["over"]:
        canvas.set_color("#868e96")
        centred(410, "Tap to play again", 16)
    canvas.update()


def drop(col, player):
    # Animate a disc falling, then put it on the board. Returns the row.
    row = lowest_empty(col)
    x = LEFT + col * CELL + CELL / 2
    target = TOP + row * CELL + CELL / 2
    y = TOP - CELL
    speed = 4
    while y < target:
        draw(x, y, player)
        y = y + speed
        speed = speed + 1.5
        sleep(0.016)
    board[row][col] = player
    return row


def finish_if_over(player):
    line = winning_line(player)
    if len(line) > 0:
        state["win"] = line
        state["over"] = True
        if player == 1:
            state["message"] = "You win!"
        else:
            state["message"] = "The computer wins"
        return True
    if board_full():
        state["over"] = True
        state["message"] = "A draw"
        return True
    return False


def computer_turn():
    state["message"] = "Thinking..."
    draw(0, 0, 0)
    col = computer_move()
    drop(col, 2)
    if not finish_if_over(2):
        state["message"] = "Your move (red) - tap a column"


def new_game():
    for r in range(ROWS):
        for c in range(COLS):
            board[r][c] = 0
    state["over"] = False
    state["win"] = []
    state["message"] = "Your move (red) - tap a column"
    if state["games"] % 2 == 1:
        computer_turn()
    state["games"] = state["games"] + 1
    draw(0, 0, 0)


def tapped(cv, x, y):
    if state["over"]:
        new_game()
        return
    col = int((x - LEFT) / CELL)
    if x < LEFT or col >= COLS or lowest_empty(col) < 0:
        return
    drop(col, 1)
    if not finish_if_over(1):
        computer_turn()
    draw(0, 0, 0)


build_lines()
canvas.on_click(tapped)
state["games"] = 0
new_game()
