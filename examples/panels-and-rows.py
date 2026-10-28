# Panels: Panel, HPanel, VPanel and Spacer, and how a widget is sized and placed.
#
#   Panel   its children sit where the program puts them: set_left, set_top,
#           set_bounds
#   HPanel  a row; VPanel a column. Each child is as big along it as, in order:
#           the size fixed with set_width / set_height, a share of what is left
#           given by set_flex, the size it asks for. Across, it fills.
#   Spacer  empty space that takes what is left over
#
# Every widget also has a margin (clear space around it), a border and padding
# (space inside the border): set_margin, set_border_width, set_padding.
# Run it from a launch window.

page = VPanel()
page.fill()
page.set_padding(8)
page.set_spacing(8)

status = Label("Press a button")
status.set_id("status")
status.set_height(24)
page.add(status)


# A coloured label, to have something to see.
def chip(text, colour):
    label = Label(text)
    label.set_background(colour)
    label.set_color("#202020")
    return label


# --- Panel: free placement, with a border and a background
free = Panel()
free.set_id("free")
free.set_height(110)
free.set_border_width(1)
free.set_border_color("#888888")
free.set_background("#fafafa")
page.add(free)

dots = [chip("A", "#ffd966"), chip("B", "#9fc5e8"), chip("C", "#b6d7a8")]
spots = [[10, 10], [110, 40], [210, 70]]
for i in range(3):
    dots[i].set_id("dot-" + str(i))
    dots[i].set_bounds(spots[i][0], spots[i][1], 80, 24)
    free.add(dots[i])

turn = {"n": 0}


# Move each chip to the next spot.
def shuffle(button):
    turn["n"] += 1
    for i in range(3):
        spot = spots[(i + turn["n"]) % 3]
        dots[i].set_left(spot[0])
        dots[i].set_top(spot[1])
    status.set_text("A is at " + str(dots[0].get_left()) + ", " + str(dots[0].get_top()))


# --- HPanel: a fixed width, then shares of what is left (1 : 2 : 1)
row = HPanel()
row.set_id("row")
row.set_height(44)
row.set_spacing(6)
row.set_padding(6)
row.set_border_width(1)
row.set_border_color("#888888")
page.add(row)

fixed = chip("fixed 80", "#f4cccc")
fixed.set_width(80)
narrow = chip("flex 1", "#ffd966")
narrow.set_flex(1)
wide = chip("flex 2", "#9fc5e8")
wide.set_flex(2)
wide.set_margin(4)
last = chip("flex 1", "#b6d7a8")
last.set_flex(1)
for w in [fixed, narrow, wide, last]:
    row.add(w)
narrow.set_id("narrow")
wide.set_id("wide")
last.set_id("last")

# --- VPanel: the same down a column, with a Spacer
column = VPanel()
column.set_id("column")
column.set_height(110)
column.set_spacing(4)
column.set_border_width(1)
column.set_border_color("#888888")
page.add(column)

top = chip("height 24", "#f4cccc")
top.set_height(24)
middle = chip("flex 1", "#ffd966")
middle.set_id("middle")
middle.set_flex(1)
column.add(top)
column.add(middle)
column.add(Spacer())

# A chip that can be moved from the row to the column and back: a widget is
# in one container at a time, and add() moves it.
mover = chip("move me", "#d9d2e9")
mover.set_id("mover")
mover.set_width(80)
row.add(mover)


def measure(button):
    status.set_text("row: " + str(narrow.get_width()) + " / " + str(wide.get_width()) + " / " + str(last.get_width())
                    + "   middle height: " + str(middle.get_height()))


def hide_wide(button):
    wide.set_visible(not wide.is_visible())
    if wide.is_visible():
        button.set_text("Hide flex 2")
    else:
        button.set_text("Show flex 2")


def move(button):
    if mover.get_parent() is row:
        column.add(mover)
        status.set_text("The chip is in the column")
    else:
        row.add(mover)
        status.set_text("The chip is in the row")


buttons = HPanel()
buttons.set_height(32)
buttons.set_spacing(6)
page.add(buttons)
for caption, handler, ident in [["Shuffle", shuffle, "shuffle"], ["Measure", measure, "measure"],
                                ["Hide flex 2", hide_wide, "hide"], ["Move chip", move, "move"]]:
    b = Button(caption)
    b.set_id(ident)
    b.set_width(100)
    b.on_click(handler)
    buttons.add(b)
buttons.add(Spacer())
