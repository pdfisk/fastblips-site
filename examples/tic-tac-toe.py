# Tic-tac-toe for two players, on the Board.
#
# Run it in a console (the Board tab of the output shows it), from a launch
# window, or as a page. Board() is the program's board: a grid of cells that
# hold text. Rows and columns count from 0, from the top left.

board = Board()
board.set_size(3, 3)
board.set_checkered(False)
board.set_square_cells(True)

game = {"turn": "X", "moves": 0, "over": False}


# True if the three cells from (row, column), stepping by (dr, dc), all hold
# mark. A winning line is given a green background.
def line(mark, row, column, dr, dc):
    for i in range(3):
        if board.get_text(row + i * dr, column + i * dc) != mark:
            return False
    for i in range(3):
        board.set_background(row + i * dr, column + i * dc, "#9acd32")
    return True


def wins(mark):
    for i in range(3):
        if line(mark, i, 0, 0, 1) or line(mark, 0, i, 1, 0):
            return True
    return line(mark, 0, 0, 1, 1) or line(mark, 0, 2, 1, -1)


def new_game():
    board.clear()
    game["turn"] = "X"
    game["moves"] = 0
    game["over"] = False
    print("X to move: click a square.")


# Each click on a cell calls this function with the board, the row and the
# column.
def cell_clicked(b, row, column):
    if game["over"]:
        new_game()
    elif b.get_text(row, column) == "":
        turn = game["turn"]
        b.set_text(row, column, turn)
        if turn == "O":
            b.set_color(row, column, "#c03030")
        game["moves"] = game["moves"] + 1
        if wins(turn):
            print(turn + " wins! Click the board to play again.")
            game["over"] = True
        elif game["moves"] == 9:
            print("A draw. Click the board to play again.")
            game["over"] = True
        else:
            if turn == "X":
                game["turn"] = "O"
            else:
                game["turn"] = "X"
            print(game["turn"] + " to move.")


board.on_click(cell_clicked)
print("X to move: click a square.")
