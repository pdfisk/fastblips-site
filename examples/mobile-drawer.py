# A mobile drawer menu: Drawer, NavigationBar and Button.
#
#   Drawer  a panel that slides in over the page from an edge, with the page behind
#           it dimmed. set_open / toggle / is_open, set_side("left", "right", "top"
#           or "bottom"), set_panel_size, set_timeout(seconds). It covers its whole
#           container (a Drawer starts with fill()), so it is made after the page
#           and sits on top of it. Its children are placed by a layout (vbox at
#           first), as a Composite's are. on_change is called with the drawer and
#           whether it is open now, whoever changed it.
#
# Tap Open... and the drawer slides in. Its menu chooses the side it comes from.
# It stays open for 5 seconds (each tap in it starts the 5 seconds again), or
# until you tap outside it or tap Close. (The dimmed page covers the
# NavigationBar too, so a drawer needs a way out of its own: Close.) Made for a
# phone-sized window, about 360 by 640.

phone = Composite()
phone.fill()
phone.set_layout("vbox")

bar = NavigationBar("Drawer")
bar.set_id("bar")
bar.set_back_text("Open...")
phone.add(bar)

# --- the page
page = VPanel()
page.set_flex(1)
page.set_padding(12)
page.set_spacing(10)
phone.add(page)

page.add(Label("Tap Open... to open the drawer."))
page.add(Label("Its menu chooses the side it comes from."))

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
menu.set_timeout(5)        # closes by itself after 5 seconds unused

heading = Label("Comes in from the")
heading.set_height(32)
menu.add(heading)
for edge in ["Left", "Right", "Top", "Bottom"]:
    item = Button(edge)
    item.set_id("side-" + edge.lower())
    item.set_height(36)
    menu.add(item)
menu.add(Spacer())
close = Button("Close")
close.set_id("close")
close.set_height(36)
menu.add(close)


# Choosing a side moves the drawer there; it stays open.
def choose_side(button):
    edge = button.get_text().lower()
    menu.set_side(edge)
    if edge == "top" or edge == "bottom":
        menu.set_panel_size(260)
    else:
        menu.set_panel_size(240)
    status.set_text("The drawer is open, on the " + edge)


for item in menu.find_by_class("Button"):
    if item.get_id().startswith("side-"):
        item.on_click(choose_side)


def close_menu(button):
    menu.set_open(False)


# Called with the drawer and whether it is open now, whoever opened or closed it.
def drawn(widget, is_open):
    if is_open:
        bar.set_back_text("Close...")
        status.set_text("The drawer is open, on the " + menu.get_side())
    else:
        bar.set_back_text("Open...")
        status.set_text("The drawer is closed")


# A handler is a function of the program's own: a widget's method will not do.
def toggle_menu():
    menu.toggle()


bar.on_back(toggle_menu)
menu.on_change(drawn)
close.on_click(close_menu)
