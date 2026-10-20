' Physics demo: composite shapes.
'
' Run it in a console: the Physics tab of the output shows the world. Shapes
' are joined into one rigid body with combine(a, b), which returns the id of
' a new group (attach(group, shape) adds one more). A group falls, tumbles
' and collides as a single thing, with one mass and one centre of mass: a
' dumbbell tips over, a rocket lands on its fins. The shapes keep their own
' ids, colours and labels. Click to drop the next kind of composite.

Dim world = New Physics()
Dim made = 0

Sub Dumbbell(w, x, y)
  Dim a = w.addBall(x - 22, y, 12)
  Dim b = w.addBall(x + 22, y, 12)
  Dim bar = w.addRect(x, y, 44, 6)
  w.setColor(a, "#1c7ed6")
  w.setColor(b, "#1c7ed6")
  w.setColor(bar, "#868e96")
  Dim g = w.combine(a, bar)
  w.attach(g, b)
End Sub

Sub Snowman(w, x, y)
  Dim legs = w.addBall(x, y + 20, 16)
  Dim chest = w.addBall(x, y, 12)
  Dim head = w.addBall(x, y - 17, 8)
  w.setColor(legs, "#f1f3f5")
  w.setColor(chest, "#f1f3f5")
  w.setColor(head, "#f1f3f5")
  w.setLabel(head, ":)")
  Dim g = w.combine(legs, chest)
  w.attach(g, head)
End Sub

Sub Plus(w, x, y)
  Dim h = w.addRect(x, y, 44, 12)
  Dim v = w.addRect(x, y, 12, 44)
  w.setColor(h, "#e03131")
  w.setColor(v, "#e03131")
  Dim g = w.combine(h, v)
End Sub

Sub Rocket(w, x, y)
  Dim body = w.addRect(x, y, 16, 40)
  Dim nose = w.addPolygon(x, y - 28, 10, 3)
  Dim fin1 = w.addRect(x - 12, y + 14, 8, 16)
  Dim fin2 = w.addRect(x + 12, y + 14, 8, 16)
  w.setColor(body, "#dee2e6")
  w.setColor(nose, "#e8590c")
  w.setColor(fin1, "#e8590c")
  w.setColor(fin2, "#e8590c")
  Dim g = w.combine(body, nose)
  w.attach(g, fin1)
  w.attach(g, fin2)
End Sub

Sub Wheel(w, x, y)
  Dim rim = w.addCircle(x, y, 18)
  Dim s1 = w.addRect(x, y, 34, 5)
  Dim s2 = w.addRect(x, y, 5, 34)
  w.setColor(rim, "#2f9e44")
  w.setColor(s1, "#f08c00")
  w.setColor(s2, "#f08c00")
  Dim g = w.combine(rim, s1)
  w.attach(g, s2)
End Sub

' Adds the next kind of composite at (x, y): five kinds, in turn.
Sub Make(w, x, y)
  Dim kind = made Mod 5
  If kind = 0 Then
    Dumbbell(w, x, y)
  ElseIf kind = 1 Then
    Snowman(w, x, y)
  ElseIf kind = 2 Then
    Plus(w, x, y)
  ElseIf kind = 3 Then
    Rocket(w, x, y)
  Else
    Wheel(w, x, y)
  End If
  made = made + 1
End Sub

Sub Clicked(w, x, y)
  Make(w, x, y)
  Print "Bodies: " & Str(w.getCount())
End Sub

For i = 0 To 4
  Make(world, 50 + i * 75, 50)
Next

world.onClick("Clicked")
Print "Dumbbell, snowman, plus, rocket and wheel. Click to add another."
