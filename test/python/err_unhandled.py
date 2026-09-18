def boom(x):
    return x + "a"
def mid(x):
    return boom(x)
print("before")
mid(1)
print("after")
