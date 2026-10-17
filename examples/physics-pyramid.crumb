' Physics demo: knock down a pyramid of boxes.
'
' Run it in a console: the Physics tab of the output shows the world. The
' boxes are stacked six, five, four... high, and rest on each other thanks to
' friction. Click anywhere to throw a heavy ball at the pyramid from the
' left, aimed at the click: the faster it goes the harder it hits.

Dim world = New Physics()
world.setBackground("#f1f3f5")

Dim w = 34
Dim h = 20
Dim boxes = 0
For row = 0 To 5
  For col = 0 To 5 - row
    Dim box = world.addRect(200 - (5 - row) * w / 2 + col * w, 290 - h / 2 - row * h, w - 1, h - 1)
    world.setColor(box, "#d9480f")
    If (row + col) Mod 2 = 0 Then world.setColor(box, "#f08c00")
    world.setFriction(box, 0.7)
    boxes = boxes + 1
  Next
Next

Dim thrown = 0
world.onClick("Throw")
Print Str(boxes) & " boxes. Click to throw a ball at the pyramid."

Sub Throw(p, x, y)
  Dim ball = p.addBall(20, 200, 14)
  p.setColor(ball, "#1c7ed6")
  p.setBounce(ball, 0.3)
  p.setVelocity(ball, (x - 20) * 3, (y - 200) * 3 - 150)
  thrown = thrown + 1
  Print "Ball " & Str(thrown)
End Sub
