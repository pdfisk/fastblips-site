' Physics demo: bouncing balls.
'
' Run it in a console: the Physics tab of the output shows the world. New
' Physics() is the program's world, 400 units wide and 300 high with (0, 0)
' at the top left and y pointing down. Every shape you add gets an id, which
' the other methods take. Gravity pulls shapes down, and the sides of the
' world are solid.

Dim world = New Physics()
Dim colors(5)
colors(0) = "#e8590c"
colors(1) = "#1c7ed6"
colors(2) = "#2f9e44"
colors(3) = "#ae3ec9"
colors(4) = "#f08c00"
colors(5) = "#e03131"

' Twelve balls of different sizes and bounciness, in rows near the top.
' setBounce is how much speed a ball keeps in a bounce: 0 stops dead, 1 keeps it all.
For i = 0 To 11
  Dim ball = world.addBall(30 + i * 30, 30 + (i Mod 3) * 28, 8 + (i Mod 4) * 3)
  world.setColor(ball, colors(i Mod 6))
  world.setBounce(ball, 0.45 + (i Mod 5) * 0.12)
Next

Dim count = 12
world.onClick("AddBall")
Print "Twelve balls. Click the world to drop another."

' A click calls this Sub with the world and the place that was clicked.
Sub AddBall(w, x, y)
  Dim ball = w.addBall(x, y, 8 + (count Mod 5) * 3)
  w.setColor(ball, colors(count Mod 6))
  w.setBounce(ball, 0.6 + (count Mod 4) * 0.1)
  w.setVelocity(ball, (count Mod 7) * 40 - 120, -200)
  count = count + 1
  Print "Balls: " & Str(w.getCount())
End Sub
