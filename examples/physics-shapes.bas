' Physics demo: many kinds of shape in one world.
'
' Run it in a console: the Physics tab of the output shows the world.
' Circles, balls, rectangles, ellipses and regular polygons all fall, spin
' and push each other. Two fixed slopes (setFixed) make a funnel; fixed shapes
' never move. Angles are in degrees.

Dim world = New Physics()
world.setBackground("#f8f9fa")

' The funnel: a slope on each side.
Dim left = world.addRect(80, 150, 150, 8)
world.setAngle(left, 25)
world.setFixed(left, True)
world.setColor(left, "#495057")
Dim right = world.addRect(320, 150, 150, 8)
world.setAngle(right, -25)
world.setFixed(right, True)
world.setColor(right, "#495057")

Dim colors(5)
colors(0) = "#e8590c"
colors(1) = "#1c7ed6"
colors(2) = "#2f9e44"
colors(3) = "#ae3ec9"
colors(4) = "#f08c00"
colors(5) = "#e03131"

Dim made = 0
For i = 0 To 14
  AddShape(world, 60 + (i * 47) Mod 280, 10 + (i \ 5) * 22)
Next

world.onClick("Clicked")
Print "Circles, balls, rectangles, ellipses and polygons. Click to add another."

Sub Clicked(w, x, y)
  AddShape(w, x, y)
  Print "Shapes: " & Str(w.getCount() - 2)
End Sub

' Adds the next kind of shape at (x, y): the kind goes round five in turn.
Sub AddShape(w, x, y)
  Dim kind = made Mod 5
  Dim id = 0
  If kind = 0 Then
    id = w.addCircle(x, y, 11)
  ElseIf kind = 1 Then
    id = w.addBall(x, y, 10)
  ElseIf kind = 2 Then
    id = w.addRect(x, y, 26, 16)
  ElseIf kind = 3 Then
    id = w.addEllipse(x, y, 15, 8)
  Else
    Dim sides = 3 + (made \ 5) Mod 4
    id = w.addPolygon(x, y, 12, sides)
    w.setLabel(id, Str(sides))
  End If
  w.setColor(id, colors(made Mod 6))
  w.setAngle(id, made * 37)
  made = made + 1
End Sub
