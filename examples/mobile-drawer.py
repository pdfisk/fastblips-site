# A mobile drawer menu: Drawer, NavigationBar, SelectBox and Button.
#
#   Drawer  a panel that slides in over the page from an edge, with the page behind
#           it dimmed. set_open / toggle / is_open, set_side("left", "right", "top"
#           or "bottom"), set_panel_size, set_dismiss_on_tap. It covers its whole
#           container (a Drawer starts with fill()), so it is made after the page
#           and sits on top of it. Its children are placed by a layout (vbox at
#           first), as a Composite's are. on_change is called with the drawer and
#           whether it is open now, whoever changed it.
#
# Tap Menu, choose an item, or leave by tapping the dimmed page, swiping the panel
# toward its edge, pressing Escape or the Close button. (The dimmed page covers the
# NavigationBar too, so a drawer needs a way out of its own: Close.) Made for a
# phone-sized window, about 360 by 640.

phone = Composite()
phone.fill()
phone.set_layout("vbox")

bar = NavigationBar("Home")
bar.set_id("bar")
bar.set_back_text("Menu")
phone.add(bar)

# --- the page
page = VPanel()
page.set_flex(1)
page.set_padding(12)
page.set_spacing(10)
phone.add(page)

title = Label("Home")
title.set_id("page-title")
title.set_height(32)
page.add(title)
page.add(Label("Tap Menu to open the drawer."))

side_row = HPanel()
side_row.set_height(30)
side_row.set_spacing(8)
page.add(side_row)
side_row.add(Label("Comes in from the"))
side = SelectBox()
side.set_id("side")
side.set_width(110)
for edge in ["left", "right", "top", "bottom"]:
    side.add_item(edge)
side_row.add(side)
side_row.add(Spacer())

dismiss = Button("Close on tap outside: on")
dismiss.set_id("dismiss")
dismiss.set_height(32)
page.add(dismiss)

status = Label("The drawer is closed")
status.set_id("status")
status.set_height(26)
page.add(status)
page.add(Spacer())

# --- the drawer: made last, so it is on top of the page
menu = Drawer()
menu.set_id("drawer")
menu.set_panel_size(240)
menu.set_padding(8)
menu.set_spacing(6)

heading = Label("Menu")
heading.set_height(32)
menu.add(heading)
for name in ["Home", "Profile", "Settings", "Help"]:
    item = Button(name)
    item.set_id("item-" + name.lower())
    item.set_height(36)
    menu.add(item)
menu.add(Spacer())
close = Button("Close")
close.set_id("close")
close.set_height(36)
menu.add(close)


def choose(button):
    title.set_text(button.get_text())
    bar.set_title(button.get_text())
    menu.set_open(False)


for item in menu.find_by_class("Button"):
    if item.get_id().startswith("item-"):
        item.on_click(choose)


def close_menu(button):
    menu.set_open(False)


# Called with the drawer and whether it is open now.
def drawn(widget, is_open):
    if is_open:
        bar.set_back_text("Close")
        status.set_text("The drawer is open")
    else:
        bar.set_back_text("Menu")
        status.set_text("The drawer is closed")


def side_chosen(box, index):
    menu.set_side(box.get_selected_text())
    if index >= 2:
        menu.set_panel_size(180)
    else:
        menu.set_panel_size(240)


def toggle_dismiss(button):
    menu.set_dismiss_on_tap(not menu.is_dismiss_on_tap())
    if menu.is_dismiss_on_tap():
        button.set_text("Close on tap outside: on")
    else:
        button.set_text("Close on tap outside: off")


# A handler is a function of the program's own: a widget's method will not do.
def toggle_menu():
    menu.toggle()


bar.on_back(toggle_menu)
menu.on_change(drawn)
close.on_click(close_menu)
side.on_select(side_chosen)
dismiss.on_click(toggle_dismiss)
