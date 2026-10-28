# Pocket Notes: a small phone app that uses the mobile widgets together.
#
#   NavigationBar  the title bar; its back button opens the menu, its action
#                  button changes with the page
#   Stack          the pages: Welcome, Notes and Settings
#   Drawer         the menu that slides in over whichever page is showing
#   Carousel       the Welcome page's introduction, swiped or stepped through
#   Image          the logo (carried inside the program as a data: address)
#   ListPanel, TextField, CheckGroupBox, RadioGroupBox, SelectBox, Button, Label
#                  the notes and the settings
#
# Everything the bar says goes through show(). Made for a phone-sized window, about
# 360 by 640.

# The logo, as a data: address (an SVG, encoded as text).
LOGO = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiIgdmlld0JveD0iMCAwIDk2IDk2Ij48cmVjdCB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHJ4PSIyMCIgZmlsbD0iI2M4OTIzYSIvPjxjaXJjbGUgY3g9IjQ4IiBjeT0iNDgiIHI9IjI2IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iNDgiIGN5PSI0OCIgcj0iMTIiIGZpbGw9IiM0YTMzMTkiLz48L3N2Zz4="

vp = Viewport()
PAGES = ["Welcome", "Notes", "Settings"]
WELCOME, NOTES, SETTINGS = 0, 1, 2
here = {"page": 0}

phone = Composite()
phone.fill()
phone.set_layout("vbox")

bar = NavigationBar("Welcome")
bar.set_id("bar")
bar.set_back_text("Menu")
phone.add(bar)

pages = Stack()
pages.set_id("pages")
pages.set_flex(1)
phone.add(pages)

# --- page 0, Welcome: the logo, a swipeable introduction, and a button
welcome = VPanel()
welcome.set_padding(12)
welcome.set_spacing(8)
logo = Image(LOGO)
logo.set_alt("Pocket Notes")
logo.set_height(96)
greeting = Label("Welcome to Pocket Notes")
greeting.set_id("greeting")
greeting.set_height(28)
intro = Carousel()
intro.set_id("intro")
intro.set_flex(1)
tips = ["Write a note in one tap.", "Swipe, or use the menu, to move around.", "Change how it looks in Settings."]
for tip in tips:
    card = VPanel()
    card.set_padding(16)
    card.add(Label(tip))
    intro.add(card)
go = Button("Next")
go.set_id("go")
go.set_height(36)
for w in [logo, greeting, intro, go]:
    welcome.add(w)
pages.add(welcome)

# --- page 1, Notes: a list, and a field to add to it
notes_page = VPanel()
notes_page.set_padding(8)
notes_page.set_spacing(6)
notes = ListPanel()
notes.set_id("notes")
notes.set_empty_text("(no notes yet)")
notes.set_flex(1)
add_row = HPanel()
add_row.set_height(32)
add_row.set_spacing(6)
entry = TextField("")
entry.set_id("entry")
entry.set_placeholder("A new note")
entry.set_flex(1)
add = Button("Add")
add.set_id("add")
add.set_width(60)
add_row.add(entry)
add_row.add(add)
notes_page.add(notes)
notes_page.add(add_row)
pages.add(notes_page)

# --- page 2, Settings: a name, a reminder, a look
settings = VPanel()
settings.set_padding(8)
settings.set_spacing(8)
name = TextField("")
name.set_id("name")
name.set_placeholder("Your name")
name.set_height(30)
reminders = CheckGroupBox("Remind me")
reminders.set_id("reminders")
reminders.set_height(70)
often = SelectBox()
often.set_id("often")
often.add_item("every hour")
often.add_item("every day")
reminders.add(often)
reminders.set_checked(False)     # a check box starts checked; reminders start off
look = HPanel()
look.set_height(70)
look.set_spacing(8)
light = RadioGroupBox("Light")
light.set_id("light")
light.set_flex(1)
dark = RadioGroupBox("Dark")
dark.set_id("dark")
dark.set_flex(1)
look.add(light)
look.add(dark)
light.set_checked(True)
summary = Label("")
summary.set_id("summary")
summary.set_height(26)
for w in [name, reminders, look, summary]:
    settings.add(w)
pages.add(settings)

# --- the menu, made last so that it is on top
menu = Drawer()
menu.set_id("menu")
menu.set_panel_size(220)
menu.set_padding(8)
menu.set_spacing(6)
heading = Label("Pocket Notes")
heading.set_height(32)
menu.add(heading)
for i in range(3):
    entry_button = Button(PAGES[i])
    entry_button.set_id("menu-" + PAGES[i].lower())
    entry_button.set_height(36)
    menu.add(entry_button)
menu.add(Spacer())
close = Button("Close")
close.set_id("close")
close.set_height(36)
menu.add(close)


# Shows a page, and sets the bar to match.
def show(page):
    here["page"] = page
    pages.select(page)
    bar.set_title(PAGES[page])
    if page == NOTES:
        bar.set_action_text("Clear")
        bar.set_title("Notes (" + str(notes.get_count()) + ")")
    elif page == SETTINGS:
        bar.set_action_text("Reset")
    else:
        bar.set_action_text("")


def menu_choice(button):
    show(PAGES.index(button.get_text()))
    menu.set_open(False)


for button in menu.find_by_class("Button"):
    if button.get_id().startswith("menu-"):
        button.on_click(menu_choice)


def close_menu(button):
    menu.set_open(False)


def toggle_menu():
    menu.toggle()


# The introduction: Next steps through it, and the last step leaves for the notes.
def step(button):
    if intro.get_selected_index() < intro.get_count() - 1:
        intro.select_next()
    else:
        show(NOTES)


def intro_changed(widget, index):
    if index == widget.get_count() - 1:
        go.set_text("Get started")
    else:
        go.set_text("Next")


def add_note():
    text = entry.get_text().strip()
    if text == "":
        return
    notes.add_item(text)
    entry.set_text("")
    bar.set_title("Notes (" + str(notes.get_count()) + ")")


def bar_action():
    if here["page"] == NOTES:
        notes.clear()
        bar.set_title("Notes (0)")
    elif here["page"] == SETTINGS:
        name.set_text("")
        reminders.set_checked(False)
        light.set_checked(True)
        often.select(0)
        update_summary()


def update_summary():
    text = "Look: "
    if dark.is_checked():
        text = text + "dark"
        vp.set_background("#444444")
    else:
        text = text + "light"
        vp.set_background("#ffffff")
    if reminders.is_checked():
        text = text + ", reminders " + often.get_selected_text()
    summary.set_text(text)
    if name.get_text().strip() != "":
        greeting.set_text("Welcome, " + name.get_text().strip())
    else:
        greeting.set_text("Welcome to Pocket Notes")


go.on_click(step)
intro.on_select(intro_changed)
add.on_click(add_note)
entry.on_submit(add_note)
bar.on_back(toggle_menu)
bar.on_action(bar_action)
close.on_click(close_menu)
name.on_change(update_summary)
reminders.on_change(update_summary)
often.on_select(update_summary)
light.on_change(update_summary)
intro_changed(intro, 0)
show(WELCOME)
update_summary()
