# Animated cars: small drawing classes combined into bigger ones.
#
#   Circle, Line, Box   simple shapes that remember where they are and how they
#                       look, and draw themselves on the canvas
#   Wheel               one Circle for the tyre, one for the hub and a ring,
#                       plus a Line for each spoke; spin() turns the spokes
#   Car                 a body made of Boxes and two Wheels; drive() moves the
#                       car and turns each wheel by exactly the distance driven
#
# Run it in a console (the Canvas tab of the output shows it), from a launch
# window, or as a page. The program never ends: Reset (or Run again) stops it.
# Click the canvas to give it the keyboard, then press space to add a car.
#
# MiniPy has no math library, so sine() and cosine() are written out below.
# Angles are in radians. On the canvas y points down, so a growing angle turns
# a wheel clockwise, which is how a wheel rolling to the right turns.

PI = 3.141592653589793
TWO_PI = 6.283185307179586


def sine(a):
    # Bring a into -PI..PI, then add up the Taylor series.
    a = a - TWO_PI * int(a / TWO_PI)
    if a > PI:
        a = a - TWO_PI
    if a < -PI:
        a = a + TWO_PI
    term = a
    total = a
    for n in range(1, 9):
        term = -term * a * a / ((2 * n) * (2 * n + 1))
        total = total + term
    return total


def cosine(a):
    return sine(a + PI / 2)


# ---------------------------------------------------------------- shapes

class Circle:
    def __init__(self, x, y, r, color, filled):
        self.x = x
        self.y = y
        self.r = r
        self.color = color
        self.filled = filled

    def move_to(self, x, y):
        self.x = x
        self.y = y

    def draw(self, c):
        c.set_color(self.color)
        if self.filled:
            c.fill_circle(self.x, self.y, self.r)
        else:
            c.circle(self.x, self.y, self.r)


class Line:
    def __init__(self, x1, y1, x2, y2, color, width):
        self.x1 = x1
        self.y1 = y1
        self.x2 = x2
        self.y2 = y2
        self.color = color
        self.width = width

    def set_points(self, x1, y1, x2, y2):
        self.x1 = x1
        self.y1 = y1
        self.x2 = x2
        self.y2 = y2

    def draw(self, c):
        c.set_color(self.color)
        c.set_line_width(self.width)
        c.line(self.x1, self.y1, self.x2, self.y2)


class Box:
    # A filled rectangle, placed by its top left corner.
    def __init__(self, x, y, w, h, color):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.color = color

    def draw(self, c):
        c.set_color(self.color)
        c.fill_rect(self.x, self.y, self.w, self.h)


# ---------------------------------------------------------------- Wheel

class Wheel:
    # A wheel is made of widgets: a tyre Circle, a rim Circle, a hub Circle
    # and one Line per spoke.
    def __init__(self, x, y, r, spokes, color):
        self.x = x
        self.y = y
        self.r = r
        self.angle = 0.0
        self.tyre = Circle(x, y, r, "#222222", True)
        self.rim = Circle(x, y, r * 0.72, color, False)
        self.hub = Circle(x, y, r * 0.18, color, True)
        self.spokes = []
        for i in range(spokes):
            self.spokes.append(Line(x, y, x, y, color, 2))
        self.layout()

    def move_to(self, x, y):
        self.x = x
        self.y = y
        self.tyre.move_to(x, y)
        self.rim.move_to(x, y)
        self.hub.move_to(x, y)
        self.layout()

    def spin(self, radians):
        self.angle = self.angle + radians
        self.layout()

    # Point each spoke from the hub out to the rim, evenly spaced round the
    # wheel and turned by the wheel's angle.
    def layout(self):
        count = len(self.spokes)
        reach = self.r * 0.72
        for i in range(count):
            a = self.angle + i * TWO_PI / count
            self.spokes[i].set_points(self.x, self.y,
                                      self.x + reach * cosine(a),
                                      self.y + reach * sine(a))

    def draw(self, c):
        self.tyre.draw(c)
        self.rim.draw(c)
        for spoke in self.spokes:
            spoke.draw(c)
        self.hub.draw(c)


# ---------------------------------------------------------------- Car

class Car:
    # (x, ground) is where the car's front-to-back middle meets the road, so
    # the wheels' lowest points touch the line y = ground.
    def __init__(self, x, ground, length, wheel_r, spokes, color, speed):
        self.x = x
        self.ground = ground
        self.length = length
        self.speed = speed
        self.wheel_r = wheel_r
        self.parts = []
        axle = ground - wheel_r
        self.axle = axle
        self.front = Wheel(x, axle, wheel_r, spokes, "#d9d9d9")
        self.back = Wheel(x, axle, wheel_r, spokes, "#d9d9d9")

        body_h = wheel_r * 1.4
        cab_h = wheel_r * 1.1
        # The parts are stored at offsets from x so move_to() can shift them.
        self.body = Box(0, axle - body_h, length, body_h, color)
        self.cab = Box(0, axle - body_h - cab_h, length * 0.5, cab_h, color)
        self.window = Box(0, axle - body_h - cab_h * 0.85, length * 0.4, cab_h * 0.6, "#bfe3f5")
        self.light = Box(0, axle - body_h * 0.8, length * 0.06, body_h * 0.3, "#ffe066")
        self.parts = [self.body, self.cab, self.window, self.light]
        self.move_to(x)

    def move_to(self, x):
        self.x = x
        self.body.x = x
        self.cab.x = x + self.length * 0.18
        self.window.x = x + self.length * 0.23
        self.light.x = x + self.length * 0.93
        self.back.move_to(x + self.length * 0.22, self.axle)
        self.front.move_to(x + self.length * 0.78, self.axle)

    # Drive for dt seconds. A wheel that rolls without slipping turns by
    # distance / radius radians.
    def drive(self, dt, wrap_at):
        distance = self.speed * dt
        self.move_to(self.x + distance)
        turn = distance / self.wheel_r
        self.back.spin(turn)
        self.front.spin(turn)
        if self.x > wrap_at:
            self.move_to(-self.length - 10)

    def draw(self, c):
        for part in self.parts:
            part.draw(c)
        self.back.draw(c)
        self.front.draw(c)


# ---------------------------------------------------------------- the scene

canvas = Canvas()
canvas.set_auto_update(False)
canvas.set_background("#8ecae6")
W = canvas.get_width()
H = canvas.get_height()

# Roads are Line widgets too: one thick grey line per lane, with a pale edge.
LANES = [100, 185, 270]
roads = []
for ground in LANES:
    roads.append(Line(0, ground + 3, W, ground + 3, "#555555", 6))

cars = []
cars.append(Car(30,  LANES[0], 80, 13, 6, "#e63946", 110))
cars.append(Car(220, LANES[0], 60, 10, 5, "#ffb703", 70))
cars.append(Car(100, LANES[1], 96, 17, 8, "#2a9d8f", 55))
cars.append(Car(300, LANES[2], 70, 11, 4, "#9b5de5", 150))
cars.append(Car(60,  LANES[2], 84, 15, 10, "#1d3557", 90))

COLORS = ["#f15bb5", "#00bbf9", "#fb8500", "#80b918", "#7209b7"]
added = 0
space_was_down = False


# A new car off the left edge, in the next lane in turn.
def add_car(n):
    cars.append(Car(-100, LANES[n % 3], 66 + (n % 3) * 12, 10 + (n % 4) * 2, 5 + n % 5,
                    COLORS[n % 5], 60 + (n * 37) % 100))
    print("Cars:", len(cars))


print("Cars driving. Click the canvas, then press space to add a car. Reset stops it.")

DT = 0.03
while True:
    canvas.clear()
    # the sun is a plain Circle shape too
    canvas.set_color("#ffd166")
    canvas.fill_circle(350, 40, 22)
    for road in roads:
        road.draw(canvas)
    for car in cars:
        car.drive(DT, W)
        car.draw(canvas)
    canvas.update()
    # Handlers cannot run while this loop does, so ask for the key instead.
    space_is_down = canvas.is_key_down("space")
    if space_is_down and not space_was_down:
        add_car(added)
        added = added + 1
    space_was_down = space_is_down
    sleep(DT)
