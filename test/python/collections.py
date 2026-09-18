xs = [3, 1, 2]
xs.append(5)
xs.insert(0, 9)
print(xs, len(xs), xs[1:3], sorted(xs), min(xs), max(xs), sum(xs))
xs.sort()
print(xs, xs.pop(), xs.index(3), xs.count(1))
xs.reverse()
print(xs)
t = (1, "a", 2.5)
print(t, len(t), t[1], (7,), ())
a, b, c = t
print(a, b, c)
d = {"one": 1, "two": 2}
d["three"] = 3
print(d, d["two"], d.get("four"), d.get("four", 0), len(d))
print(list(d.keys()), list(d.values()), list(d.items()))
del d["one"]
print(d, "two" in d, "one" in d)
print([x * x for x in range(6) if x % 2 == 0])
print(list(range(3)), list(range(2, 10, 3)), list(range(5, 0, -2)))
m = [[1, 2], [3, 4]]
m[1][0] = 30
print(m, m[1][0])
print([1, 2] + [3], [0] * 3, (1, 2) + (3,), [1, 2] == [1, 2], (1, 2) != (1, 3))
print(d == {"two": 2, "three": 3}, {1: "a"}[1.0], sum([1.5, 2]))
print(list("abc"), tuple([1, 2]), dict({"k": 1}))
