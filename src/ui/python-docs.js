// The documentation of the Python that FastBlips runs (MiniPy), for the Help
// menu (windows/python-help-window.js). No DOM here, so it is tested under Node.
//
// The text is written here, but it cannot drift from the language unnoticed
// (test/python-help.test.js):
//   - every example with an `output` is run, and must print exactly that;
//   - every "not supported" entry is run, and must still fail;
//   - every built-in function, exception and list, dict and str method must
//     be mentioned in its section.
// So when the language gains a feature, a test fails until this text is updated.
//
// A section is { label, parts }. A part is a paragraph (a string), an example
// { code, output } (output: the lines it prints; screen: true for a program
// that needs a window, which is compiled but not run), or an unsupported
// entry { unsupported: { what, code, instead } }.

const ex = (code, output) => ({ code: code.trim(), output });
const screen = (code) => ({ code: code.trim(), screen: true });
const no = (what, code, instead) => ({ unsupported: { what, code: code.trim(), instead } });

export const PYTHON_DOCS = [
  {
    label: 'Getting started',
    parts: [
      String.raw`MiniPy is the Python that runs in FastBlips: a subset of Python 3 with the
same indentation rules and # comments, and most everyday statements. There is
nothing to import: print, the widgets (Label, Button, ...), Canvas, Physics,
Board and the random functions are all built in.

Running a program
  Run, in a Python console, runs the program and shows what it prints in the
  Text tab of the output. A console has only a Board, a Canvas and a Physics
  to draw on, and it dims its output while a program runs. A program that makes
  any other widget (a Label, a Button, ...), or that you want to see in full
  colour, runs from the console's Launch menu: Desktop or Mobile, a window of
  that shape.

How a program runs
  The code at the left margin runs once, from the first line to the last. If it
  registered a handler (button.on_click(f), canvas.on_click(f), ...) the program
  then stays alive and calls the handler each time the event happens, until you
  press Reset or close its window. A program with no handlers ends when its
  last line has run. See "Events and handlers".

Output
  print(...) writes a line to the program's output. transcript(...) takes the
  same arguments but writes to the Transcript window instead.

Mistakes
  A mistake in the form of the program (a missing colon, a bad indent) is
  reported with its line number, all together, before anything runs.
  A mistake while it runs stops that program and reports the line and the chain
  of calls that led to it, for example:
    tally.py:2: ValueError: invalid literal for int() with base 10: "abc"`,
    ],
  },
  {
    label: 'Values and operators',
    parts: [
      String.raw`The kinds of value are int (any size), float, bool (True, False), None, str,
list, tuple, dict and range. A name is made by assigning to it: x = 5.
x += 1 (and -=, *=, /=, //=, %=) changes it. A tuple can be taken apart in one
assignment, which also swaps two names: a, b = b, a.

Operators, tightest first:
  **                 power (an int to an int stays an int, however large)
  -x  +x             negative, positive
  *  /  //  %        times; divide (always a float); divide rounding down; remainder
  +  -               add, subtract (+ also joins strings, lists and tuples)
  < <= > >= == != in not in is is not
                     compare; a chain such as 1 < x < 5 works
  not  and  or       and/or give one of their operands, and stop early

False, 0, 0.0, "", None and empty lists, tuples and dicts count as false in an if
or while; everything else counts as true.`,
      ex(`print(7 / 2, 7 // 2, -7 // 2, 7 % 3, -7 % 3, 2 ** 10)`, ['3.5 3 -4 1 2 1024']),
      ex(`print(2 ** 100)`, ['1267650600228229401496703205376']),
      ex(`print(1 < 2 < 3, 1 == 1.0, "a" < "b", not 0, 5 > 3 and 2 > 1, 0 or "x")`, ['True True True True True x']),
      String.raw`Converting: int(x) (a float is cut towards zero; int("12") reads text),
float(x), str(x), bool(x), list(x), tuple(x), dict(x).`,
      ex(`print(int("42") + 1, int(3.9), int(-3.9), float("1.5"), str(7) + "x", bool([]))`, ['43 3 -3 1.5 7x False']),
      ex(`print(0.1 + 0.2, 1.0, 1e21)`, ['0.30000000000000004 1.0 1e+21']),
      ex(`a, b = 1, 2
a, b = b, a
print(a, b)`, ['2 1']),
    ],
  },
  {
    label: 'Strings',
    parts: [
      String.raw`Write a string in "double" or 'single' quotes. Inside one, \n is a new line,
\t a tab, \\ a backslash, \" a double quote. A string on one line only (no
triple-quoted strings). Characters count from 0; negative counts from the end;
s[a:b] and s[a:b:step] take a slice. + joins, * repeats, in tests for a piece,
len(s) is the length.

f-strings put values in text: f"{name} has {n + 1}" evaluates what is in the
braces. Write {{ and }} for literal braces.

Methods of a string:
  upper()  lower()  strip()  lstrip()  rstrip()
  split(sep)         pieces as a list; split() with no argument splits on spaces
  join(list)         "-".join(["a", "b"]) is "a-b"
  replace(old, new)
  startswith(text)  endswith(text)
  find(text)         where it starts, or -1
  count(text)
  isdigit()  isalpha()
  format(...)        replaces each plain {} with the next argument`,
      ex(`s = "Hello, World"
print(len(s), s[0], s[-1], s[7:], s.upper(), s.find("World"), "lo" in s)`, ['12 H d World HELLO, WORLD 7 True']),
      ex(`name = "Ann"
n = 3
print(f"{name} has {n + 1} items")`, ['Ann has 4 items']),
      ex(`print("a,b,c".split(","), "-".join(["x", "y"]), "  pad ".strip(), "aXb".replace("X", "-"))`, ["['a', 'b', 'c'] x-y pad a-b"]),
    ],
  },
  {
    label: 'Lists, tuples and dicts',
    parts: [
      String.raw`A list is [1, 2, 3]: ordered, and changeable. Items count from 0 (negative from
the end). x[i] = v sets one, del x[i] removes one, x[a:b] and x[a:b:step] slice,
x[::-1] reverses a copy, + joins, * repeats, in tests. Two names for one list are
one list: b = a does not copy (use a.copy()).

Methods of a list:
  append(v)  extend(list)  insert(i, v)  pop()  pop(i)  remove(v)
  index(v)  count(v)  reverse()  sort()  clear()  copy()
sort() changes the list in place and takes no arguments; sorted(x) gives a new
sorted list. A list comprehension builds a list: [i * i for i in range(5)], with
one optional "if" at the end.`,
      ex(`x = [3, 1, 2]
x.append(5)
x.sort()
print(x, x[-1], x[1:3], x[::-1], len(x), 2 in x)`, ['[1, 2, 3, 5] 5 [2, 3] [5, 3, 2, 1] 4 True']),
      ex(`print([i * i for i in range(6) if i % 2 == 0], [[0] * 2 for i in range(2)])`, ['[0, 4, 16] [[0, 0], [0, 0]]']),
      String.raw`A tuple, (1, 2), is like a list that cannot be changed. (1,) is a tuple of one.

A dict is {"a": 1}: keys (numbers, strings or tuples) to values. d[k] reads
(a missing key is a KeyError), d[k] = v sets, del d[k] removes, k in d tests for
a key, len(d) counts. A for loop over a dict gives its keys, in the order they
were added.

Methods of a dict:
  get(k)  get(k, default)  keys()  values()  items()  pop(k)
  update(other)  setdefault(k, v)  clear()  copy()
keys(), values() and items() are lists (items is a list of (key, value) tuples).`,
      ex(`ages = {"ann": 31, "bob": 27}
ages["cy"] = 40
for name in ages:
    print(name, ages[name])
print(ages.get("zed", 0), "bob" in ages, len(ages))`, ['ann 31', 'bob 27', 'cy 40', '0 True 3']),
      ex(`for k, v in {"a": 1, "b": 2}.items():
    print(k, v)`, ['a 1', 'b 2']),
    ],
  },
  {
    label: 'Control flow',
    parts: [
      String.raw`  if / elif / else        choose
  while condition:        repeat while it is true
  for x in sequence:      repeat for each item of a list, tuple, string, dict
                          (its keys) or range
  break  continue  pass   leave the loop; skip to the next time round; do nothing
range(stop), range(start, stop) and range(start, stop, step) count up or
down, stopping before stop.`,
      ex(`total = 0
for i in range(1, 6):
    if i == 3:
        continue
    total += i
print(total)
n = 0
while True:
    n += 1
    if n >= 3:
        break
print(n, list(range(3, 0, -1)))`, ['12', '3 [3, 2, 1]']),
      ex(`x = 3
if x > 5:
    print("big")
elif x > 2:
    print("medium")
else:
    print("small")`, ['medium']),
    ],
  },
  {
    label: 'Functions',
    parts: [
      String.raw`def name(a, b=2): defines a function; b has a default. return gives a value (a
function that does not return gives None). Call it with the arguments in order:
name(1) or name(1, 5); keyword arguments (name(b=5)) are not supported. A function
can call itself; going too deep is a RecursionError. Functions are values: pass
one to on_click as on_click(my_function), without parentheses.

A function can read a name made at the left margin, but it cannot assign to
one: count += 1 inside a function is an error. Keep state that functions change
in a list or a dict, which they can change without assigning to the name.
A function inside a function cannot see the outer function's names: pass what it
needs as arguments.`,
      ex(`def area(w, h=1):
    return w * h

def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(area(3), area(3, 4), fact(10))`, ['3 12 3628800']),
      ex(`state = {"count": 0}

def bump():
    state["count"] += 1

bump()
bump()
print(state["count"])`, ['2']),
    ],
  },
  {
    label: 'Classes',
    parts: [
      String.raw`class Name: groups data and functions. __init__(self, ...) sets a new object up;
every method takes self first. Make an object with Name(...). An object can be
given attributes at any time: obj.x = 3. class Dog(Animal): inherits from one
class; to run the parent's method, call it by name with self:
Animal.__init__(self, name). isinstance(obj, Class) tests for a class and its
parents.

A value set in the class body (x = 5) is shared by every object and can be read
as Name.x or self.x, but it cannot be assigned from outside the class's own
objects: Name.x += 1 is an error. Keep counters like that in a list or dict.`,
      ex(`class Animal:
    def __init__(self, name):
        self.name = name
        self.sound = "..."
    def speak(self):
        return self.name + " says " + self.sound

class Dog(Animal):
    def __init__(self, name):
        Animal.__init__(self, name)
        self.sound = "woof"

d = Dog("Rex")
print(d.speak(), isinstance(d, Animal))`, ['Rex says woof True']),
    ],
  },
  {
    label: 'Errors',
    parts: [
      String.raw`try: / except: / else: / finally: catch mistakes. except (ValueError, TypeError)
as e: catches either and names it e (print(e) shows the message). A bare except:
catches everything, and so does except Exception. raise ValueError("text")
makes one; a bare raise inside an except passes the same error on. Make your
own kind with class MyError(Exception): pass.

The kinds: Exception, TypeError, ValueError, ZeroDivisionError, IndexError,
KeyError, AttributeError, NameError, RuntimeError, RecursionError, OSError.
A mistake that is not caught stops the program and is reported with its line.`,
      ex(`def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None
    finally:
        print("checked")

print(safe_div(6, 3), safe_div(1, 0))`, ['checked', 'checked', '2.0 None']),
      ex(`class TooBig(Exception):
    pass

try:
    raise TooBig("over 10")
except TooBig as e:
    print("caught", e)`, ['caught over 10']),
      ex(`for text in ["12", "x"]:
    try:
        print(int(text) + 1)
    except ValueError:
        print("not a number:", text)`, ['13', 'not a number: x']),
    ],
  },
  {
    label: 'Built-in functions',
    parts: [
      String.raw`  print(a, b, ...)      write the values, with spaces between, on one line
  len(x)                 the length of a string, list, tuple, dict or range
  range(...)             see Control flow
  int(x)  float(x)  str(x)  bool(x)  list(x)  tuple(x)  dict(x)
  abs(x)                 without the sign
  min(a, b, ...)  max(a, b, ...)   also min(list) and max(list)
  sum(list)  sum(list, start)
  sorted(x)              a new sorted list
  type(obj)              the class of an object made from a class
  isinstance(obj, Class)  also isinstance(obj, (Class1, Class2))
  dir()  dir(obj)        the names in scope, or an object's attributes
  sleep(seconds)         pause (0.5 is half a second); other programs keep running
  transcript(a, b, ...)  like print, but to the Transcript window
  fetch(url)             see Web requests
  random()  randint(a, b)  choice(seq)  shuffle(list)   see Random numbers`,
    ],
  },
  {
    label: 'Random numbers',
    parts: [
      String.raw`  random()           a float, at least 0 and below 1
  randint(a, b)      a whole number from a to b, both included
  choice(seq)        one item of a list, tuple or string
  shuffle(list)      puts a list in a random order, in place
These give different answers each run. For a sequence that repeats (a puzzle with
a level number, say), make your own generator from a seed:`,
      ex(`dice = randint(1, 6)
print(1 <= dice <= 6)
cards = [1, 2, 3, 4]
shuffle(cards)
print(sorted(cards), choice(["only"]))`, ['True', '[1, 2, 3, 4] only']),
      ex(`seed = {"n": 1}

def rand(n):
    seed["n"] = (seed["n"] * 16807) % 2147483647
    return seed["n"] % n

print(rand(10), rand(10), rand(10))`, ['7 9 3']),
    ],
  },
  {
    label: 'Events and handlers',
    parts: [
      String.raw`A widget calls a function of yours when something happens: button.on_click(f),
list.on_select(f), text.on_change(f), canvas.on_click(f), world.on_collide(f), ...
Pass the function itself. It must be a function of the program (def), not a
method of an object.

The function takes as many of (widget, value) as it wants: def go(): and
def picked(widget, index): both work. What the value is depends on the event
(the row for on_select, the new text for on_change, x and y for a Canvas click:
def tapped(canvas, x, y):). Help > Widget Documentation lists each one.

Handlers run when the program is idle: after its last line has run, and between
other handlers. An event that happens while a handler is running waits its turn.
So a program stuck in a loop (while True:) never runs its handlers; see
"Drawing and games" for how to make a game with a loop. As functions cannot assign
to names at the left margin, keep what a handler changes in a dict or list, or in
the widgets themselves.`,
      screen(`count = {"n": 0}
label = Label("Clicks: 0")
button = Button("Click me")
button.set_top(40)

def clicked(b):
    count["n"] += 1
    label.set_text("Clicks: " + str(count["n"]))

button.on_click(clicked)`),
    ],
  },
  {
    label: 'Drawing and games',
    parts: [
      String.raw`Three surfaces can be drawn on, each made by calling its name and each in snake_case:
  Canvas()   2D (and simple 3D) drawing: lines, rectangles, circles, text
  Physics()  shapes that fall, bounce and push each other
  Board()    a grid of cells that hold text, for board games
Help > Widget Documentation lists every method of each. In short:

Canvas: 400 by 300 units until set_size(w, h); (0, 0) is the top left and it is scaled to
fit the window. set_color(c), set_background(c) take any CSS colour ("red",
"#336"). clear(), fill_rect(x, y, w, h), fill_circle(x, y, r), line(x1, y1, x2, y2),
text(x, y, t) (x, y is the top left of the text), set_font_size(n), set_line_width(n).
on_click(f) calls f(canvas, x, y); on_key(f) calls f(canvas, key); is_key_down("left")
says whether a key is held; get_mouse_x(), get_mouse_y().
Physics: add_circle, add_ball, add_rect (each returns an id), set_fixed(id, True) for a platform,
set_color, set_bounce, set_label, get_x, get_y, remove_body; on_click(f) calls
f(world, x, y); on_collide(f) calls f(world, id_a, id_b). The world keeps moving by
itself after your program's last line.
Board: set_size(rows, cols), set_text(r, c, t), on_click(f) calls f(board, row, col).

Two ways to make a game:

1. Click-driven. Draw the picture in a function, and call it from your click
   handler. It works with a mouse and with a finger, and is what to use for
   puzzles and turn-based games, and for phones.`,
      screen(`canvas = Canvas()
dots = []

def draw():
    canvas.set_background("#14161f")
    canvas.clear()
    canvas.set_color("orange")
    for d in dots:
        canvas.fill_circle(d[0], d[1], 12)
    canvas.set_color("white")
    canvas.text(10, 10, "Dots: " + str(len(dots)))

def tapped(c, x, y):
    dots.append([x, y])
    draw()

canvas.on_click(tapped)
draw()`),
      String.raw`2. A loop. Redraw many times a second inside while True:, turning automatic
   updates off and calling update() when the picture is finished, and read the
   keyboard with is_key_down. A loop blocks handlers, so clicks and taps are not
   seen: use keys on the desktop. (Click the canvas once first to give it the keyboard.)`,
      screen(`canvas = Canvas()
canvas.set_auto_update(False)
x = 200
while True:
    if canvas.is_key_down("left"):
        x -= 4
    if canvas.is_key_down("right"):
        x += 4
    canvas.set_background("black")
    canvas.clear()
    canvas.set_color("white")
    canvas.fill_circle(x, 150, 20)
    canvas.update()
    sleep(0.02)`),
    ],
  },
  {
    label: 'Web requests',
    parts: [
      String.raw`fetch(url) reads a web address (http or https) and waits for the answer; other
programs keep running meanwhile. JSON comes back already unpacked, as dicts, lists,
str, int, float, bool and None; anything else comes back as a str. A request that
fails (no network, an error status such as 404, or a site that does not allow
requests from web pages) raises OSError, which try / except can catch.`,
      screen(`try:
    data = fetch("https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current_weather=true")
    print(data["current_weather"]["temperature"])
except OSError:
    print("could not reach the weather service")`),
    ],
  },
  {
    label: 'Differences from Python',
    parts: [
      String.raw`Things that look like Python but behave differently here. Each is checked by a
test, so this list is kept honest.`,
      String.raw`f-strings and format ignore format specs such as :.2f. To round, do the sum yourself:`,
      ex(`print(f"{3.14159:.2f}")
print(int(3.14159 * 100 + 0.5) / 100)
print("{} + {}".format(1, 2))`, ['3.14159', '3.14', '1 + 2']),
      String.raw`isinstance works for classes you define, not for int, str and so on:`,
      ex(`print(isinstance(1, int))`, ['False']),
      String.raw`print shows an object as <ClassName object>; the special methods __str__,
__repr__ and __eq__ are not used. The message of a KeyError is the key without quotes:`,
      ex(`class A:
    pass

print(A())
try:
    {}["k"]
except KeyError as e:
    print(e)`, ['<A object>', 'k']),
    ],
  },
  {
    label: 'Not supported',
    parts: [
      String.raw`MiniPy is a small Python. These are not there yet. Each is shown with what to
write instead, and each is checked by a test, so a feature that arrives will be
noticed and this list updated.`,
      no('conditional expression', `x = 1 if ok else 2`, 'use an if / else statement'),
      no('keyword arguments in a call', `print(sorted([2, 1], reverse=True))`, 'pass arguments in order; for a descending sort, sort() then reverse()'),
      no('*args and **kwargs', `def f(*args):\n    pass`, 'take a list as one argument'),
      no('unpacking with *', `a, *rest = [1, 2, 3]`, 'use slices: rest = items[1:]'),
      no('lambda', `f = lambda x: x + 1`, 'write a def'),
      no('global and nonlocal', `def f():\n    global n\n    n = 1`, 'keep state in a dict or list'),
      no('names of an enclosing function', `def outer():\n    n = 1\n    def inner():\n        return n\n    return inner()\nouter()`, 'pass n to inner as an argument'),
      no('import (and so math, time, ...)', `import math`, 'random functions are built in; write what else you need, such as a square root'),
      no('generators (yield)', `def g():\n    yield 1`, 'build and return a list'),
      no('with', `with open("f") as f:\n    pass`, 'there are no files'),
      no('assert', `assert 1 == 1`, 'if not condition: raise ValueError("text")'),
      no('decorators (@)', `class A:\n    @staticmethod\n    def f():\n        return 1`, 'write a plain function'),
      no('; between statements', `x = 5; y = 6`, 'one statement to a line'),
      no('\\ to continue a line', `x = 1 + \\\n    2`, 'put the whole expression in brackets (...) to carry it over lines'),
      no('triple-quoted strings', `s = """one\ntwo"""`, 'join lines with +'),
      no('dict and set comprehensions', `d = {k: 1 for k in [1, 2]}`, 'build the dict in a for loop'),
      no('a comprehension with two for or two if', `[(i, j) for i in range(2) for j in range(2)]`, 'use nested for loops'),
      no('**=', `x = 2\nx **= 2`, 'x = x ** 2'),
      no('1_000 (underscores in numbers)', `x = 1_000`, 'write 1000'),
      no('% formatting', `print("%d items" % 3)`, 'use an f-string: f"{n} items"'),
      no('!r and ! conversions in f-strings', `x = "a"\nprint(f"{x!r}")`, 'use repr-like text yourself'),
      no('super()', `class A:\n    def f(self):\n        return 1\nclass B(A):\n    def f(self):\n        return super().f()\nB().f()`, 'call the parent by name: A.f(self)'),
      no('assigning to a class attribute', `class C:\n    n = 0\nC.n += 1`, 'keep shared counters in a list or dict'),
      no('x.__name__ and __name__', `print(__name__)`, 'not needed: a program just runs'),
      String.raw`Not built in, so using one is a NameError: round, enumerate, zip, map, filter, any, all,
reversed, set, frozenset, pow, divmod, chr, ord, input, open, repr, hasattr, getattr,
setattr, callable, id, hash, iter, next, super. Instead of enumerate, loop over
range(len(items)); instead of round(x), int(x + 0.5) for positive numbers.
Not methods of a string: title, capitalize, zfill, ljust, rjust, center, index,
splitlines, isupper, islower.`,
    ],
  },
  {
    label: 'Example programs',
    parts: [
      String.raw`Word counts, using a dict:`,
      ex(`text = "the cat and the hat and the bat"
counts = {}
for word in text.split():
    counts[word] = counts.get(word, 0) + 1
for word in sorted(counts.keys()):
    print(word, counts[word])`, ['and 2', 'bat 1', 'cat 1', 'hat 1', 'the 3']),
      String.raw`FizzBuzz:`,
      ex(`for n in range(1, 16):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)`, ['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz']),
      String.raw`Primes, by sieve:`,
      ex(`limit = 30
is_prime = [True] * (limit + 1)
is_prime[0] = False
is_prime[1] = False
for i in range(2, limit + 1):
    if is_prime[i]:
        for j in range(i * i, limit + 1, i):
            is_prime[j] = False
print([i for i in range(limit + 1) if is_prime[i]])`, ['[2, 3, 5, 7, 11, 13, 17, 19, 23, 29]']),
      String.raw`A class with an error:`,
      ex(`class Account:
    def __init__(self, balance):
        self.balance = balance
    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("not enough money")
        self.balance -= amount
        return self.balance

acct = Account(100)
print(acct.withdraw(30))
try:
    acct.withdraw(500)
except ValueError as e:
    print("refused:", e)`, ['70', 'refused: not enough money']),
    ],
  },
];

// ---- text ------------------------------------------------------------------

const indent = (text, by) => text.split('\n').map((line) => (line ? by + line : line)).join('\n');

/** The text of one part: a paragraph, an example with its output, or a "not supported" entry. */
function renderPart(part) {
  if (typeof part === 'string') return part;
  if (part.unsupported) {
    const { code, instead } = part.unsupported;
    return `${indent(code, '    ')}\n      instead: ${instead}`;
  }
  const lines = [`Example:\n${indent(part.code, '    ')}`];
  if (part.output) lines.push(`Prints:\n${indent(part.output.join('\n'), '    ')}`);
  return lines.join('\n');
}

/** The text of a section: its title, underlined, then its parts. */
export function describeSection(section) {
  const title = `${section.label}\n${'='.repeat(section.label.length)}`;
  return [title, ...section.parts.map(renderPart)].join('\n\n') + '\n';
}

/** The entries of the Python Documentation window: [{ label, text }], in order. */
export function pythonHelpEntries() {
  return PYTHON_DOCS.map((section) => ({ label: section.label, text: describeSection(section) }));
}

/** Every example and every unsupported entry, with the section it is in, for the tests. */
export function allParts() {
  return PYTHON_DOCS.flatMap((section) => section.parts
    .filter((part) => typeof part !== 'string')
    .map((part) => ({ section: section.label, ...part })));
}
