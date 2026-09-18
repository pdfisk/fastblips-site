for i in range(1, 16):
    if i % 15 == 0:
        print("FizzBuzz")
    elif i % 3 == 0:
        print("Fizz")
    elif i % 5 == 0:
        print("Buzz")
    else:
        print(i)
n = 0
while True:
    n += 1
    if n < 3:
        continue
    if n > 5:
        break
    print("n", n)
for x in [1, 2, 3]:
    if x == 10:
        break
else:
    print("no break")
k = 0
while k < 2:
    k += 1
else:
    print("while else", k)
for ch in "hi":
    print(ch)
for key in {"a": 1, "b": 2}:
    print(key)
for p, q in [(1, 2), (3, 4)]:
    print(p + q)
print(1 < 2 < 3, 3 > 2 > 2, 1 < 3 > 2)
print(0 or "x", "" or [] or 5, 1 and 0, 2 and 3, None or None, not 0, not [1])
if []:
    print("empty is true")
elif {}:
    print("dict")
else:
    print("falsy containers")
