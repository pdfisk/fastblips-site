class Animal:
    kind = "animal"
    def speak(self):
        return "..."

class Dog(Animal):
    def __init__(self, name):
        self.name = name
    def fetch(self):
        return self.name + " fetches"

def inner(a, b):
    c = a + b
    return dir()

d = Dog("Rex")
print(dir(d))
print(dir(Dog))
print(dir([]))
print(dir({}))
print(dir("s"))
print(dir(5))
print(inner(1, 2))
x = 1
print(dir())
e = ValueError("bad")
print(dir(e))
