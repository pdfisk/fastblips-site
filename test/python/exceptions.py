def div(a, b):
    try:
        return a // b
    except ZeroDivisionError as e:
        print("caught:", e)
        return None
    finally:
        print("finally", a, b)
print(div(7, 2))
print(div(1, 0))
try:
    [1, 2][5]
except IndexError as e:
    print("IndexError:", e)
try:
    {}["k"]
except KeyError:
    print("KeyError")
try:
    undefined_name
except NameError as e:
    print("NameError:", e)
try:
    1 + "a"
except TypeError as e:
    print("TypeError:", e)
class MyError(Exception):
    pass
def risky(n):
    if n > 2:
        raise MyError("too big: " + str(n))
    return n
for i in range(5):
    try:
        print(risky(i))
    except MyError as e:
        print("MyError", e)
        break
def nested():
    try:
        try:
            raise ValueError("inner")
        except TypeError:
            print("wrong handler")
    except ValueError as e:
        print("outer got", e)
        try:
            raise
        except ValueError:
            print("re-raised")
nested()
def ret_finally():
    try:
        return "from try"
    finally:
        print("cleanup")
print(ret_finally())
try:
    try:
        raise KeyError("x")
    finally:
        print("inner finally")
except KeyError:
    print("propagated through finally")
try:
    raise Exception("plain")
except (TypeError, Exception) as e:
    print("tuple match", e)
try:
    int("nope")
except ValueError:
    print("bad int")
else:
    print("no")
try:
    pass
except Exception:
    print("never")
else:
    print("else ran")
