def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)
print(fact(10), fact(25))
def greet(name, greeting="Hello", punct="!"):
    return greeting + ", " + name + punct
print(greet("Ada"), greet("Bob", "Hi"), greet("Cy", "Yo", "?"))
def nothing():
    pass
print(nothing())
counter = 0
def bump():
    return counter + 1
print(bump())
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
print([fib(i) for i in range(12)], fib(90))
f = fact
print(f(5))
def apply(fn, v):
    return fn(v)
print(apply(fact, 6), apply(len, "four"))
def outer():
    def inner(x):
        return x * 2
    return inner(21)
print(outer())
