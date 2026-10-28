# A mobile photo gallery: Carousel, Image and NavigationBar.
#
#   Carousel       pages the user swipes between, with a row of dots. Every child
#                  is a page and fills it. select(i), select_next() and
#                  select_previous() do the same from code (and stop at the ends);
#                  on_select is called with the carousel and the page number,
#                  whoever changed it. set_dots(False) hides the dots.
#   Image          here a picture carried inside the program as a data: address
#   NavigationBar  the title bar; its action button turns the dots off and on
#
# Swipe, tap the dots, or use the buttons. Made for a phone-sized window, about
# 360 by 640.

# Three little pictures, as data: addresses (SVGs, encoded as text).
SUNRISE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzAwIDE4MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZmZiMzQ3Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmY2ZjYxIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIxODAiIGZpbGw9InVybCgjZykiLz48Y2lyY2xlIGN4PSIxNTAiIGN5PSIxMjAiIHI9IjQyIiBmaWxsPSIjZmZmM2IwIi8+PHJlY3QgeT0iMTMyIiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ4IiBmaWxsPSIjNmI0ZjJhIi8+PC9zdmc+"

FOREST = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzAwIDE4MCI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIxODAiIGZpbGw9IiNjZmU4Y2YiLz48cG9seWdvbiBwb2ludHM9IjQwLDE1MCA4MCw2MCAxMjAsMTUwIiBmaWxsPSIjMmY3ZDNhIi8+PHBvbHlnb24gcG9pbnRzPSIxMTAsMTUwIDE2MCw0MCAyMTAsMTUwIiBmaWxsPSIjM2I4ZjQ2Ii8+PHBvbHlnb24gcG9pbnRzPSIxOTAsMTUwIDIzNSw3NSAyODAsMTUwIiBmaWxsPSIjMmY3ZDNhIi8+PHJlY3QgeT0iMTUwIiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwIiBmaWxsPSIjNGE3YzNhIi8+PC9zdmc+"

OCEAN = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMzAwIDE4MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjNGZjM2Y3Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDE1NzliIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIxODAiIGZpbGw9InVybCgjZykiLz48cGF0aCBkPSJNMCAxMTAgUTM3IDkwIDc1IDExMCBUMTUwIDExMCBUMjI1IDExMCBUMzAwIDExMCBWMTgwIEgwIFoiIGZpbGw9IiMwMjc3YmQiIGZpbGwtb3BhY2l0eT0iLjYiLz48cGF0aCBkPSJNMCAxNDAgUTM3IDEyMCA3NSAxNDAgVDE1MCAxNDAgVDIyNSAxNDAgVDMwMCAxNDAgVjE4MCBIMCBaIiBmaWxsPSIjMDE1NzliIiBmaWxsLW9wYWNpdHk9Ii43Ii8+PC9zdmc+"

slides = [["Sunrise", SUNRISE], ["Forest", FOREST], ["Ocean", OCEAN]]

phone = Composite()
phone.fill()
phone.set_layout("vbox")

bar = NavigationBar("Gallery")
bar.set_id("bar")
bar.set_action_text("Dots off")
phone.add(bar)

gallery = Carousel()
gallery.set_id("gallery")
gallery.set_flex(1)
phone.add(gallery)

# Each page is a picture above its caption.
for slide in slides:
    page = VPanel()
    page.set_padding(10)
    page.set_spacing(6)
    picture = Image(slide[1])
    picture.set_alt(slide[0])
    picture.set_flex(1)
    caption = Label(slide[0])
    caption.set_height(26)
    page.add(picture)
    page.add(caption)
    gallery.add(page)

# --- below the gallery: where we are, and the same moves as buttons
footer = HPanel()
footer.set_height(44)
footer.set_padding(6)
footer.set_spacing(8)
phone.add(footer)

previous = Button("Previous")
previous.set_id("previous")
previous.set_width(90)
following = Button("Next")
following.set_id("next")
following.set_width(90)
where = Label("")
where.set_id("where")
where.set_flex(1)
footer.add(previous)
footer.add(where)
footer.add(following)


# Called with the carousel and the number of the page now showing (from 0).
def showing(widget, index):
    where.set_text(slides[index][0] + " (" + str(index + 1) + " of " + str(len(slides)) + ")")
    previous.set_enabled(index > 0)
    following.set_enabled(index < len(slides) - 1)


def go_previous(button):
    gallery.select_previous()


def go_next(button):
    gallery.select_next()


def toggle_dots():
    gallery.set_dots(not gallery.is_dots())
    if gallery.is_dots():
        bar.set_action_text("Dots off")
    else:
        bar.set_action_text("Dots on")


gallery.on_select(showing)
previous.on_click(go_previous)
following.on_click(go_next)
bar.on_action(toggle_dots)
showing(gallery, 0)
