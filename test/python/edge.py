def find(xs, target):
    for i in range(len(xs)):
        try:
            if xs[i] == target:
                break
        except TypeError:
            pass
    else:
        return -1
    return i
print(find([4, 5, 6], 5), find([4, 5], 9))
def safe_items(d, keys):
    out = []
    for k in keys:
        try:
            out.append(d[k])
        except KeyError:
            continue
    return out
print(safe_items({"a": 1, "c": 3}, ["a", "b", "c"]))
def loop_return():
    for i in range(10):
        try:
            if i == 3:
                return i * 100
        finally:
            pass
    return None
print(loop_return())
def squares():
    return [n * n for n in range(4)]
n = "module n"
print(squares(), n)
def use_before():
    try:
        print(x)
        x = 1
    except NameError as e:
        print("NameError", e)
use_before()
class Cfg:
    missing = None
    count = 0
print(Cfg.missing, Cfg.count)
try:
    raise ValueError
except ValueError as e:
    print("bare class raised", type(e) == ValueError)
def deep(n):
    if n == 0:
        return 0
    return 1 + deep(n - 1)
print(deep(500))
total = 0
for i in range(100000):
    total += i
print(total)
a = [1, 2, 3]
b = a
b.append(4)
print(a is b, a == [1, 2, 3, 4], None is None, a is not None)
t = (1, (2, 3))
x, (y, z) = t
print(x, y, z)
d = {(1, 2): "pair", 3: "three"}
print(d[(1, 2)], d[3.0])
print(sorted([3, 1, 2]) == [1, 2, 3], [3, 1] < [3, 2], "abc" < "abd", (1, 2) <= (1, 2))
print(10 / 4, 10 // 4, -10 // 4, 10 % -4, 2 ** 0.5)
print(int(True), float(True), str(None), bool(""), bool([0]))
print(max([1, 5, 3]), min(4, 2, 8), sum(range(101)), abs(-7))
print("{} + {} = {}".format(1, 2, 3))
s = "hello world"
print(s.split(), s.count("o"), s.upper().lower() == s)
def kw(a, b=2, c=3):
    return a + b + c
print(kw(1), kw(1, 10), kw(1, 10, 100))
print(len({}), len([]), len(""), len(range(5, 10)), list(range(10, 0, -3)))
print(3 in range(5), 7 in range(0, 10, 2), 8 in range(0, 10, 2))
print(-7 // 2, -7 % 2, 7 // -2, 7 % -2, -7.0 // 2, -7.0 % 2)
print(1e300 * 1e10, -1e300 * 1e10, 0.1 * 3, 1 / 3)
