# A tour of the widgets in MiniPy: the same classes and methods as Crumb's
# (examples/widget-tour.bas), spelled the Python way. Run it from a
# launch window (a Python console's Launch menu).

page = VPanel()
page.fill()
page.set_padding(4)
page.set_spacing(4)

title = Label("Widget tour: add some items, then pick one")
page.add(title)

toolbar = HPanel()
toolbar.set_spacing(4)
page.add(toolbar)
add_button = Button("Add item")
toolbar.add(add_button)
toolbar.add(Spacer())

split = HSplitPanel()
split.set_flex(1)
split.set_position(0.35)
page.add(split)
items = ListPanel()
items.set_empty_text("(no items yet)")
split.set_first(items)
notes = TextPanel("Type here. Ctrl+Enter copies the text to the title.")
split.set_second(notes)

box = Window("About")
box.set_content(Label("Made with FastBlips widgets"))
box.set_bounds(120, 120, 280, 140)
ok = box.get_button_bar().add_button("OK")

def add_item():
    items.add_item("Item " + str(items.get_count() + 1))

def picked(w, index):
    if index >= 0:
        title.set_text("Picked " + w.get_item(index))

def submitted(w):
    title.set_text(w.get_text())

def close_box():
    box.close()

add_button.on_click(add_item)
items.on_select(picked)
notes.on_submit(submitted)
ok.on_click(close_box)
