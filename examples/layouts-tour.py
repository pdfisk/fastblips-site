# The layouts of a Composite: each layout is one way of placing its children.
# A Composite starts as "basic" (children sit where setLeft / setTop put them);
# set_layout picks another, and each widget says where it sits in it.

vp = Viewport()
vp.set_background("#f4f4f4")

# --- hbox / vbox: a row or a column; flex shares out the space left over
page = Composite()
page.fill()
page.set_layout("vbox")
page.set_padding(8)
page.set_spacing(8)
vp.add(page)

toolbar = Composite()
toolbar.set_layout("hbox")
toolbar.set_spacing(6)
toolbar.set_height(32)
toolbar.set_content_align("right", "")    # the buttons sit at the right
for title in ["New", "Open", "Save"]:
    toolbar.add(Button(title))
page.add(toolbar)

# --- grid: rows and columns; cells, spans, flex and alignment
form = Composite()
form.set_layout("grid")
form.set_spacing(6)
form.set_column_flex(1, 1)               # the second column takes the spare width
page.add(form)

name_label = Label("Name")
name = TextPanel("")
name.set_height(24)
form.add(name_label)
form.add(name)
name.set_cell(0, 1)

notes_label = Label("Notes")
notes = TextPanel("")
form.add(notes_label)
form.add(notes)
notes_label.set_cell(1, 0)
notes_label.set_align("left", "top")     # not stretched across its cell
notes.set_cell(1, 1)
form.set_row_flex(1, 1)                  # the notes row takes the spare height
form.set_flex(1)

# --- dock: edges around a middle
frame = Composite()
frame.set_layout("dock")
frame.set_height(120)
page.add(frame)
for edge in ["north", "south", "west", "east", "center"]:
    part = Label(edge)
    part.set_background("white")
    part.set_height(24)
    part.set_width(70)
    frame.add(part)
    part.set_edge(edge)

# --- stack: one child at a time
pages = Stack()
pages.set_height(40)
page.add(pages)
for text in ["First page", "Second page", "Third page"]:
    pages.add(Label(text))

def next_page(button):
    pages.select_next()

more = Button("Next page")
more.on_click(next_page)
toolbar.add(more)
