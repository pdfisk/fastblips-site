# A gallery of the eight layouts a Composite can use: basic, canvas, grow,
# hbox, vbox, dock, flow and grid, one to a tab. (layouts-tour.py shows several
# of them working together in an app; here each stands alone.)
#
# A Composite places its children with a layout: set_layout(name), then the
# layout's settings on the Composite (set_spacing, set_content_align,
# set_column_flex ...) and each child's own place in it (set_edge, set_cell,
# set_span, set_align, set_canvas_bounds, set_flex, set_width ...).
# Resize the window to see what each layout does with the space.

PALETTE = ["#ffd966", "#9fc5e8", "#b6d7a8", "#f4cccc", "#d9d2e9", "#fce5cd", "#d0e0e3", "#ead1dc"]
count = {"n": 0}


# A coloured label, to have something to place. Each is a new colour.
def chip(text):
    label = Label(text)
    label.set_background(PALETTE[count["n"] % len(PALETTE)])
    label.set_color("#202020")
    count["n"] += 1
    return label


page = VPanel()
page.fill()
page.set_padding(6)
page.set_spacing(6)

about = Label("")
about.set_id("about")
about.set_height(24)
page.add(about)

tabs = TabPanel()
tabs.set_id("tabs")
tabs.set_flex(1)
page.add(tabs)

notes = {}


def new_tab(name, layout, text):
    stage = Composite()
    stage.set_id("tab-" + name)
    stage.set_layout(layout)
    stage.set_padding(6)
    tabs.add_tab(name, stage)
    notes[name] = text
    return stage


# --- basic: each child sits where its own box says
basic = new_tab("basic", "basic", "basic: children sit where set_bounds / set_left / set_top put them")
for i in range(3):
    c = chip("child " + str(i + 1))
    c.set_bounds(10 + i * 50, 10 + i * 30, 110, 40)
    basic.add(c)

# --- canvas: by distance from the edges, in pixels or percentages
canvas = new_tab("canvas", "canvas", "canvas: set_canvas_bounds(left, top, right, bottom, width, height), each '', pixels or a percentage")
corner = chip("10, 10")
corner.set_canvas_bounds("10", "10", "", "", "100", "30")
far = chip("10 from the bottom right")
far.set_canvas_bounds("", "", "10", "10", "170", "30")
middle = chip("a quarter in, half the size")
middle.set_canvas_bounds("25%", "25%", "", "", "50%", "50%")
for c in [corner, far, middle]:
    canvas.add(c)

# --- grow: every child fills the area, less its margin
grow = new_tab("grow", "grow", "grow: every child fills the area, less its margin")
filler = chip("I fill the area")
filler.set_margin(12)
grow.add(filler)

# --- hbox: a row. A fixed width, shares of what is left, the width it asks for
row = new_tab("hbox", "hbox", "hbox: fixed, flex (shared out 1 : 2) and natural widths; set_align places a child across the row")
row.set_spacing(6)
fixed = chip("fixed 90")
fixed.set_width(90)
one = chip("flex 1")
one.set_flex(1)
two = chip("flex 2")
two.set_flex(2)
mid = chip("middle")
mid.set_align("", "middle")
for c in [fixed, one, two, mid]:
    row.add(c)

# --- vbox: a column. The same down, with the group pushed to the bottom
column = new_tab("vbox", "vbox", "vbox: a column; set_content_align puts the group at the bottom, set_align centres across")
column.set_spacing(6)
column.set_content_align("", "bottom")
for i in range(3):
    c = chip("row " + str(i + 1))
    c.set_height(30)
    column.add(c)
column.get_child(1).set_width(120)
column.get_child(1).set_align("center", "")

# --- dock: edges, in the order added; the centre takes what is left
dock = new_tab("dock", "dock", "dock: set_edge('north', 'south', 'west', 'east' or 'center')")
dock.set_spacing(6)
for edge in ["north", "south", "west", "east", "center"]:
    c = chip(edge)
    c.set_edge(edge)
    c.set_height(30)
    c.set_width(90)
    dock.add(c)

# --- flow: side by side, wrapping onto a new line, like words
flow = new_tab("flow", "flow", "flow: children wrap onto new lines; set_content_align('center') centres each line")
flow.set_spacing_x(6)
flow.set_spacing_y(6)
flow.set_content_align("center", "")
words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
for word in words:
    c = chip(word)
    c.set_width(60 + len(word) * 8)
    flow.add(c)

# --- grid: rows and columns, with spans, flex and alignment
grid = new_tab("grid", "grid", "grid: set_cell(row, column), set_span(rows, columns), set_column_flex, set_row_flex")
grid.set_spacing(6)
grid.set_column_flex(1, 1)
grid.set_row_flex(1, 1)
head = chip("header: a span of 3 columns")
head.set_cell(0, 0)
head.set_span(1, 3)
grid.add(head)
side = chip("side")
side.set_cell(1, 0)
grid.add(side)
body = chip("body: column 1 and row 1 share what is left")
body.set_cell(1, 1)
grid.add(body)
extra = chip("extra")
extra.set_cell(1, 2)
extra.set_align("right", "top")
grid.add(extra)
foot = chip("footer: 3 columns")
foot.set_cell(2, 0)
foot.set_span(1, 3)
grid.add(foot)


def tab_changed(widget, index):
    about.set_text(notes[widget.get_selected_text()])


tabs.on_select(tab_changed)
tab_changed(tabs, 0)
