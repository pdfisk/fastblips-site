# The Viewport, ids and finding widgets, and saving a screen as JSON.
#
#   Viewport()              the program's screen: always the same object, the root
#                           of every widget it shows
#   set_id / get_id         a name for a widget
#   find_by_id / find_by_class   find widgets inside a container (or the Viewport)
#   get_parent              the container a widget is in (the Viewport, for a
#                           widget on the screen)
#   to_json / from_json     the whole screen as JSON text, and back
#   save / load / load_composite   the same, kept in the database by name (they
#                           need you to be signed in; see the comments at the end)
#
# from_json REPLACES every widget with new ones built from the text, and wires
# each saved handler name to the program's function of that name. A variable
# that held an old widget now holds one that is gone, so after a restore, find
# widgets by id again: that is what show() and the handlers below do.

vp = Viewport()

page = VPanel()
page.set_id("page")
page.fill()
page.set_padding(8)
page.set_spacing(6)

title = Label("The Viewport and its widgets")
title.set_id("title")
title.set_height(24)
page.add(title)

counter = Label("Count: 0")
counter.set_id("counter")
counter.set_height(24)
page.add(counter)

status = Label("Press a button")
status.set_id("status")
status.set_height(24)
page.add(status)

snapshot = {"json": ""}


def show(text):
    vp.find_by_id("status").set_text(text)


# The count is in the label's text, so a snapshot of the screen holds it.
def increase():
    label = vp.find_by_id("counter")
    label.set_text("Count: " + str(int(label.get_text().split(": ")[1]) + 1))


def take_snapshot():
    snapshot["json"] = vp.to_json()
    show("Snapshot of " + str(len(snapshot["json"])) + " characters")


def restore_snapshot():
    if snapshot["json"] == "":
        show("Take a snapshot first")
        return
    vp.from_json(snapshot["json"])
    show("Restored: the widgets are new, the handlers are wired again")


def count_buttons():
    show(str(len(vp.find_by_class("Button"))) + " buttons, " + str(len(vp.find_by_class("Label"))) + " labels")


def who_is_my_parent():
    parent = vp.find_by_id("counter").get_parent()
    if parent is vp:
        show("The counter is on the Viewport")
    elif parent is vp.find_by_id("page"):
        show("The counter is in the page, which is on the Viewport: " + str(vp.get_count()) + " widget(s) there")
    else:
        show("The counter is somewhere else")


# Hides every label whose id starts with "note-", or shows them again.
def toggle_notes():
    for label in vp.find_by_class("Label"):
        if label.get_id().startswith("note-"):
            label.set_visible(not label.is_visible())


for i in range(2):
    note = Label("A note, " + str(i + 1))
    note.set_id("note-" + str(i + 1))
    note.set_height(22)
    page.add(note)

buttons = VPanel()
buttons.set_spacing(6)
page.add(buttons)
for caption, handler, ident in [["Increase", increase, "increase"], ["Take a snapshot", take_snapshot, "snapshot"],
                                ["Restore the snapshot", restore_snapshot, "restore"], ["Count buttons and labels", count_buttons, "count"],
                                ["Who is the counter's parent?", who_is_my_parent, "parent"], ["Hide / show the notes", toggle_notes, "notes"]]:
    b = Button(caption)
    b.set_id(ident)
    b.set_height(30)
    b.on_click(handler)
    buttons.add(b)

# In a program that has signed in, vp.save("my-screen") keeps this screen in the
# database and vp.load("my-screen") brings it back; any widget's
# save_composite("name") keeps just that widget and what is in it, and
# vp.load_composite("name") builds a copy on the screen and returns its root.
