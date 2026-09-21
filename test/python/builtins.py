print(__builtins__)
print(__builtins__.__name__)
print(__builtins__.len([1, 2, 3]))
names = dir(__builtins__)
print("print" in names, "ValueError" in names, "dir" in names, "__builtins__" in names)
print(__builtins__.ValueError is ValueError)

def print(msg):
    __builtins__.print("wrapped:", msg)

print("hello")
