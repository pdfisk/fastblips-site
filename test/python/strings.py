s = "Hello, World"
print(s.upper(), s.lower(), len(s))
print(s[0], s[-1], s[0:5], s[7:], s[::-1], s[::2])
print("a,b,c".split(","), "  pad  ".strip() + "|", "-".join(["x", "y", "z"]))
print("abc" * 3, 2 * "ab", "b" in "abc", "z" not in "abc")
print(s.replace("World", "There"), s.startswith("Hell"), s.endswith("x"), s.find("o"))
name = "Ada"
n = 3
print(f"{name} has {n} items, {n * 2.5} total, {[1, 2]}")
print("x={}, y={}".format(1, "two"))
