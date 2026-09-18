class Oops(Exception):
    pass
def f():
    raise Oops("custom failure")
f()
