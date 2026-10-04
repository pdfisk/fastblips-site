# Canvas demo: a bar chart, then a turning 3D scene.
#
# Run it in a console (the Canvas tab of the output shows it), from a launch
# window, or as a page. Canvas() is the program's canvas. Its drawing is 400
# units wide and 300 high, with (0, 0) at the top left; in 3D, x is to the
# right, y is up and z is toward you.

canvas = Canvas()
sales = [12, 19, 7, 23, 15, 28]

# ---- 2D: a bar chart of some numbers
canvas.set_font_size(16)
canvas.text(20, 12, "Sales by month - click to see it in 3D")
canvas.line(30, 260, 380, 260)
canvas.line(30, 50, 30, 260)
canvas.set_font_size(12)
for i in range(6):
    tall = sales[i] * 7
    canvas.set_color("#3a6db0")
    canvas.fill_rect(45 + i * 56, 260 - tall, 40, tall)
    canvas.set_color("black")
    canvas.text(57 + i * 56, 242 - tall, sales[i])
    canvas.text(60 + i * 56, 266, i + 1)


# The same numbers as blocks standing on a floor. The shapes are given once;
# moving the camera round them (orbit) and calling update() redraws them.
# This function never ends, so the program handles no more events: Reset (or
# Run again) stops it.
def clicked(c, x, y):
    print("Turning. Reset (or Run again) stops it.")
    c.set_auto_update(False)
    c.set_background("#1b1e23")
    c.clear()
    c.set_color("#555a66")
    for i in range(-4, 5):
        c.line3d(i, 0, -2, i, 0, 2)
    for i in range(-2, 3):
        c.line3d(-4, 0, i, 4, 0, i)
    for i in range(6):
        h = sales[i] / 7
        c.set_color("#4f8fe0")
        c.fill_box3d(i * 1.2 - 3, h / 2, 0, 0.8, h, 0.8)
    c.look_at(0, 1.5, 0)
    angle = 0
    while True:
        c.orbit(angle, 4, 9)
        c.update()
        angle = angle + 2
        sleep(0.03)


canvas.on_click(clicked)
print("Click the chart to see it in 3D.")
