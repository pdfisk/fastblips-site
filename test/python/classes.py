class Animal:
    def __init__(self, name):
        self.name = name
        self.sound = "..."
    def speak(self):
        return self.name + " says " + self.sound
class Dog(Animal):
    def __init__(self, name):
        Animal.__init__(self, name)
        self.sound = "woof"
    def fetch(self):
        return self.name + " fetches"
a = Animal("generic")
d = Dog("Rex")
print(a.speak(), d.speak(), d.fetch())
print(isinstance(d, Animal), isinstance(a, Dog), isinstance(d, (Dog, Animal)))
class Counter:
    total = 0
    def __init__(self):
        self.n = 0
    def inc(self, by=1):
        self.n += by
        return self
c = Counter()
c.inc().inc(5)
print(c.n, Counter.total)
m = c.inc
m(10)
print(c.n)
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def dist2(self):
        return self.x * self.x + self.y * self.y
pts = [Point(i, i + 1) for i in range(3)]
print([p.dist2() for p in pts])
print(type(d) == Dog)
