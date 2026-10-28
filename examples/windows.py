# Windows: Window, its ButtonBar, and the Viewport.
#
#   Window     a floating window with a title bar, one content widget and a
#              ButtonBar along the bottom. open() shows it, close() hides it,
#              maximize() / restore() change its size; on_close hears it close,
#              whoever closed it. A Window cannot go inside another widget.
#   Viewport   the program's screen: set_background paints it
#
# A new window is open. It is open while get_parent() says the Viewport, and closed
# (None) after close(); closing and opening do not lose its content: it is the same
# window. Run it from a launch window.

vp = Viewport()

page = VPanel()
page.fill()
page.set_padding(8)
page.set_spacing(6)

status = Label("Open a window")
status.set_id("status")
status.set_height(24)
page.add(status)

history = ListPanel()
history.set_id("history")
history.set_empty_text("(nothing yet)")
history.set_flex(1)
page.add(history)


def note(text):
    history.add_item(text)
    history.select(history.get_count() - 1)
    status.set_text(text)


# --- Notes: a text window with Clear and Close in its button bar
notes = Window("Notes")
notes.set_id("notes")
notes.set_bounds(30, 190, 260, 160)
notes_text = TextPanel("Write something.")
notes_text.set_id("notes-text")
notes.set_content(notes_text)
clear_notes = notes.get_button_bar().add_button("Clear")
clear_notes.set_id("clear-notes")
close_notes = notes.get_button_bar().add_button("Close")
close_notes.set_id("close-notes")

# --- Palette: buttons that paint the screen
palette = Window("Palette")
palette.set_id("palette")
palette.set_bounds(310, 190, 150, 160)
swatches = VPanel()
swatches.set_padding(6)
swatches.set_spacing(6)
palette.set_content(swatches)
colours = [["Rose", "#f4cccc"], ["Mint", "#d9ead3"], ["Sky", "#cfe2f3"], ["Plain", "#ffffff"]]
for pair in colours:
    swatch = Button(pair[0])
    swatch.set_id("swatch-" + pair[0].lower())
    swatches.add(swatch)


def paint(button):
    for pair in colours:
        if pair[0] == button.get_text():
            vp.set_background(pair[1])
            note("The screen is " + pair[0])


for swatch in swatches.find_by_class("Button"):
    swatch.on_click(paint)


def clear_text(button):
    notes_text.set_text("")
    note("Notes cleared")


def hide_notes(button):
    notes.close()


# Called with the window, however it was closed.
def closed(window):
    note(window.get_title() + " closed")


clear_notes.on_click(clear_text)
close_notes.on_click(hide_notes)
notes.on_close(closed)
palette.on_close(closed)

# --- the controls, on the screen
controls = HPanel()
controls.set_height(32)
controls.set_spacing(6)
page.add(controls)


def open_notes(button):
    notes.open()
    note("Notes opened")


def open_palette(button):
    palette.open()
    note("Palette opened")


def maximize_notes(button):
    if notes.is_maximized():
        notes.restore()
        button.set_text("Maximize notes")
        note("Notes restored")
    else:
        notes.maximize()
        button.set_text("Restore notes")
        note("Notes maximized")


def close_all(button):
    notes.close()
    palette.close()


for caption, handler, ident in [["Open notes", open_notes, "open-notes"], ["Open palette", open_palette, "open-palette"],
                                ["Maximize notes", maximize_notes, "maximize"], ["Close all", close_all, "close-all"]]:
    b = Button(caption)
    b.set_id(ident)
    b.set_width(110)
    b.on_click(handler)
    controls.add(b)
controls.add(Spacer())
