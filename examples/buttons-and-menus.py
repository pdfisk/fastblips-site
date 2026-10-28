# Buttons and menus: Button, SplitButton, Menu, ButtonBar, Spacer and Window.
#
#   Button       on_click, set_enabled, set_text
#   SplitButton  a button with a menu behind an arrow: on_click is the button,
#                add_item the menu
#   Menu         a drop-down of items: add_item, add_separator, clear
#   ButtonBar    a row of buttons: add_button returns the new Button
#   Window       a floating window with its own ButtonBar (the answer to a question)
#
# Run it from a launch window (a Python console's Launch menu). Every widget
# that does something has an id, so a test can find it (see test/widget-examples.test.js).

page = VPanel()
page.fill()
page.set_padding(8)
page.set_spacing(8)

status = Label("Click something")
status.set_id("status")
page.add(status)

# State a handler changes lives in a dict: a function cannot assign to a
# module-level name, but it can change what a name refers to.
state = {"hellos": 0, "recent": 0}


# --- Button: a click, and a button that can be switched off and on
row = HPanel()
row.set_spacing(8)
row.set_height(32)
page.add(row)

hello = Button("Hello")
hello.set_id("hello")
hello.set_width(90)
row.add(hello)

toggle = Button("Disable Hello")
toggle.set_id("toggle")
toggle.set_width(130)
row.add(toggle)
row.add(Spacer())


def say_hello(button):
    state["hellos"] += 1
    status.set_text("Hello pressed " + str(state["hellos"]) + " time(s)")


def switch(button):
    if hello.is_enabled():
        hello.set_enabled(False)
        button.set_text("Enable Hello")
    else:
        hello.set_enabled(True)
        button.set_text("Disable Hello")


hello.on_click(say_hello)
toggle.on_click(switch)


# --- SplitButton and Menu: the same kind of choice, two ways
row2 = HPanel()
row2.set_spacing(8)
row2.set_height(32)
page.add(row2)


def saved(button):
    status.set_text("Saved")


# An item's handler is called with the widget and the item's label.
def chose(widget, label):
    status.set_text("Chose " + label)


save = SplitButton("Save")
save.set_id("save")
save.set_width(130)
save.on_click(saved)
save.add_item("Save As...", chose)
save.add_separator()
save.add_item("Save a copy", chose)
row2.add(save)

file_menu = Menu("File")
file_menu.set_id("file")
file_menu.set_width(80)
file_menu.add_item("New", chose)
file_menu.add_item("Open", chose)
file_menu.add_separator()
file_menu.add_item("Quit", chose)
row2.add(file_menu)

# A menu's items can change while the program runs.
recent = Menu("Recent")
recent.set_id("recent")
recent.set_width(90)
row2.add(recent)
row2.add(Spacer())


def remember(button):
    state["recent"] += 1
    recent.add_item("Document " + str(state["recent"]), chose)
    status.set_text(str(state["recent"]) + " recent item(s)")


def forget(button):
    recent.clear()
    state["recent"] = 0
    status.set_text("Recent list cleared")


row3 = HPanel()
row3.set_spacing(8)
row3.set_height(32)
page.add(row3)
remember_button = Button("Add a recent item")
remember_button.set_id("remember")
remember_button.set_width(150)
forget_button = Button("Clear recent")
forget_button.set_id("forget")
forget_button.set_width(110)
remember_button.on_click(remember)
forget_button.on_click(forget)
row3.add(remember_button)
row3.add(forget_button)
row3.add(Spacer())


# --- ButtonBar: a row of buttons in a bar, as at the foot of a window
bar = ButtonBar()
bar.set_height(32)
page.add(bar)


def picked(button):
    status.set_text("Pressed " + button.get_text())


for name in ["Left", "Centre", "Right"]:
    b = bar.add_button(name)
    b.set_id("bar-" + name.lower())
    b.on_click(picked)


# --- Window: a question with its own ButtonBar, shown and hidden
ask = Window("Delete everything?")
ask.set_id("ask")
ask.set_content(Label("This cannot be undone."))
ask.set_bounds(60, 60, 260, 120)
yes = ask.get_button_bar().add_button("Delete")
yes.set_id("yes")
no = ask.get_button_bar().add_button("Cancel")
no.set_id("no")
ask.close()


def open_question(button):
    ask.open()


def answered(button):
    status.set_text(button.get_text() + " chosen")
    ask.close()


question = Button("Delete...")
question.set_id("question")
question.set_width(100)
question.on_click(open_question)
yes.on_click(answered)
no.on_click(answered)
page.add(question)
