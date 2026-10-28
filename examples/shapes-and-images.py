# Shapes and images: Ellipse, RoundedRect and Image.
#
#   Ellipse / RoundedRect  a filled shape with an outline: set_background is the
#                          fill, set_color the outline, set_border_width how thick;
#                          a RoundedRect has set_radius. An Ellipse as wide as it
#                          is high is a circle. Both take clicks.
#   Image                  a picture from an http(s) address or a data:image/ URI.
#                          set_fit says how it fills its box: contain, cover, fill,
#                          none or scale-down. It loads in the background:
#                          on_load and on_error say how it went, and until then it
#                          asks for 100 by 100.
#
# The pictures here are small SVGs carried inside the program as data: addresses,
# so they need no network; the second Image points at an address that does not
# exist, to show on_error. Run it from a launch window.

# Three little pictures, as data: addresses (SVGs, encoded as text).
SUNRISE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzAwIDE4MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZmZiMzQ3Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmY2ZjYxIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIxODAiIGZpbGw9InVybCgjZykiLz48Y2lyY2xlIGN4PSIxNTAiIGN5PSIxMjAiIHI9IjQyIiBmaWxsPSIjZmZmM2IwIi8+PHJlY3QgeT0iMTMyIiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ4IiBmaWxsPSIjNmI0ZjJhIi8+PC9zdmc+"

FOREST = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzAwIDE4MCI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIxODAiIGZpbGw9IiNjZmU4Y2YiLz48cG9seWdvbiBwb2ludHM9IjQwLDE1MCA4MCw2MCAxMjAsMTUwIiBmaWxsPSIjMmY3ZDNhIi8+PHBvbHlnb24gcG9pbnRzPSIxMTAsMTUwIDE2MCw0MCAyMTAsMTUwIiBmaWxsPSIjM2I4ZjQ2Ii8+PHBvbHlnb24gcG9pbnRzPSIxOTAsMTUwIDIzNSw3NSAyODAsMTUwIiBmaWxsPSIjMmY3ZDNhIi8+PHJlY3QgeT0iMTUwIiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwIiBmaWxsPSIjNGE3YzNhIi8+PC9zdmc+"

OCEAN = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzAwIDE4MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjNGZjM2Y3Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDE1NzliIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIxODAiIGZpbGw9InVybCgjZykiLz48cGF0aCBkPSJNMCAxMTAgUTM3IDkwIDc1IDExMCBUMTUwIDExMCBUMjI1IDExMCBUMzAwIDExMCBWMTgwIEgwIFoiIGZpbGw9IiMwMjc3YmQiIGZpbGwtb3BhY2l0eT0iLjYiLz48cGF0aCBkPSJNMCAxNDAgUTM3IDEyMCA3NSAxNDAgVDE1MCAxNDAgVDIyNSAxNDAgVDMwMCAxNDAgVjE4MCBIMCBaIiBmaWxsPSIjMDE1NzliIiBmaWxsLW9wYWNpdHk9Ii43Ii8+PC9zdmc+"

page = VPanel()
page.fill()
page.set_padding(8)
page.set_spacing(8)

status = Label("Click a shape, change the fit")
status.set_id("status")
status.set_height(24)
page.add(status)

# --- shapes: click the circle for a new fill, the rectangle for a new corner
shapes = HPanel()
shapes.set_height(96)
shapes.set_spacing(12)
page.add(shapes)

circle = Ellipse()
circle.set_id("circle")
circle.set_width(88)
circle.set_background("#ffd966")
circle.set_color("#7f6000")
shapes.add(circle)

card = RoundedRect()
card.set_id("card")
card.set_width(140)
card.set_background("#9fc5e8")
card.set_color("#0b5394")
card.set_radius(16)
shapes.add(card)

oval = Ellipse()
oval.set_id("oval")
oval.set_width(120)
oval.set_background("#b6d7a8")
oval.set_color("#38761d")
oval.set_border_width(6)
shapes.add(oval)
shapes.add(Spacer())

fills = ["#ffd966", "#f4cccc", "#d9d2e9", "#b6d7a8"]
radii = [0, 16, 32, 48]
turn = {"fill": 0, "radius": 1}


def next_fill(shape):
    turn["fill"] = (turn["fill"] + 1) % len(fills)
    shape.set_background(fills[turn["fill"]])
    status.set_text("The circle is filled " + fills[turn["fill"]])


def next_radius(shape):
    turn["radius"] = (turn["radius"] + 1) % len(radii)
    shape.set_radius(radii[turn["radius"]])
    status.set_text("Corner radius " + str(shape.get_radius()))


def thicker(shape):
    shape.set_border_width((shape.get_border_width() + 2) % 12)
    status.set_text("Outline " + str(shape.get_border_width()) + " pixels")


circle.on_click(next_fill)
card.on_click(next_radius)
oval.on_click(thicker)

# --- an Image, and how it fits its box
pictures = [["Sunrise", SUNRISE], ["Forest", FOREST], ["Ocean", OCEAN]]

view = HPanel()
view.set_flex(1)
view.set_spacing(8)
page.add(view)

picture = Image(SUNRISE)
picture.set_id("picture")
picture.set_alt("A sunrise")
picture.set_flex(1)
picture.set_border_width(1)
picture.set_border_color("#999999")
picture.set_background("#eeeeee")
view.add(picture)

# An address that is not there: the picture cannot load, and on_error hears it.
missing = Image("https://example.invalid/missing.png")
missing.set_id("missing")
missing.set_alt("(missing)")
missing.set_width(90)
missing.set_border_width(1)
missing.set_border_color("#cc0000")
view.add(missing)


# Called with the image, once its picture has loaded or failed.
def loaded(image):
    status.set_text("Loaded: " + str(image.get_natural_width()) + " x " + str(image.get_natural_height()) + " pixels")


def failed(image):
    status.set_text("The second picture could not be loaded")


picture.on_load(loaded)
missing.on_error(failed)

controls = HPanel()
controls.set_height(28)
controls.set_spacing(8)
page.add(controls)

fit = SelectBox()
fit.set_id("fit")
fit.set_width(130)
for how in ["contain", "cover", "fill", "none", "scale-down"]:
    fit.add_item(how)
controls.add(fit)


def fit_chosen(box, index):
    picture.set_fit(box.get_selected_text())
    status.set_text("Fit: " + picture.get_fit())


fit.on_select(fit_chosen)

swap = Button("Next picture")
swap.set_id("swap")
swap.set_width(110)
controls.add(swap)
controls.add(Spacer())

shown = {"i": 0}


def next_picture(button):
    shown["i"] = (shown["i"] + 1) % len(pictures)
    picture.set_source(pictures[shown["i"]][1])
    picture.set_alt("A " + pictures[shown["i"]][0].lower())
    status.set_text(pictures[shown["i"]][0])


swap.on_click(next_picture)
