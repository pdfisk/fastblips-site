' Physics demo: gravity that follows your clicks.
'
' Run it in a console: the Physics tab of the output shows the world. Click
' the world and gravity points towards the click, so the shapes slide and
' pile up against that side. setGravity takes the pull along x and along y
' (900 straight down is the usual). Click the middle to let go of gravity.

Dim world = New Physics()
world.setBackground("#e7f5ff")

For i = 0 To 8
  Dim ball = world.addBall(60 + i * 35, 60 + (i Mod 3) * 30, 12)
  world.setColor(ball, "#1c7ed6")
  Dim box = world.addRect(70 + i * 35, 200 - (i Mod 3) * 30, 22, 22)
  world.setColor(box, "#f08c00")
  Dim tri = world.addPolygon(80 + i * 30, 130, 13, 3)
  world.setColor(tri, "#2f9e44")
Next

world.onClick("Pull")
Print "Click: gravity pulls towards the click. Click the middle for none."

Sub Pull(w, x, y)
  Dim dx = x - 200
  Dim dy = y - 150
  Dim length = Sqr(dx * dx + dy * dy)
  If length < 20 Then
    w.setGravity(0, 0)
    Print "No gravity"
  Else
    w.setGravity(dx / length * 900, dy / length * 900)
    Print "Gravity towards (" & Str(Int(x)) & ", " & Str(Int(y)) & ")"
  End If
End Sub
