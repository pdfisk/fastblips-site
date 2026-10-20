' Physics demo: a pinball-style table with bumpers.
'
' Run it in a console: the Physics tab of the output shows the world. The
' bumpers and the two paddles are fixed shapes; the bumpers are very bouncy.
' onCollide calls a Sub whenever two shapes hit hard enough, with their ids;
' a side of the world is id 0. Click to drop another ball.

Dim world = New Physics()
world.setBackground("#212529")

' Three round bumpers, bouncy enough to kick a ball back.
Dim bumper(2)
For i = 0 To 2
  bumper(i) = world.addCircle(110 + i * 90, 110 + (i Mod 2) * 50, 22)
  world.setFixed(bumper(i), True)
  world.setBounce(bumper(i), 1)
  world.setColor(bumper(i), "#f03e3e")
Next

' Two paddles at the bottom, sloping in towards the middle.
Dim paddleA = world.addRect(110, 262, 90, 9)
world.setAngle(paddleA, 22)
world.setFixed(paddleA, True)
world.setColor(paddleA, "#adb5bd")
Dim paddleB = world.addRect(290, 262, 90, 9)
world.setAngle(paddleB, -22)
world.setFixed(paddleB, True)
world.setColor(paddleB, "#adb5bd")

Dim score = 0
world.onCollide("Hit")
world.onClick("Drop")
Drop(world, 200, 20)
Print "Click to drop another ball."

' Called with the ids of the two shapes that hit: score a point for a bumper.
Sub Hit(w, a, b)
  For i = 0 To 2
    If a = bumper(i) Or b = bumper(i) Then
      score = score + 10
      w.setColor(bumper(i), "#ffd43b")
      Print "Bumper! Score " & score
    End If
  Next
End Sub

Sub Drop(w, x, y)
  Dim ball = w.addBall(x, y, 9)
  w.setColor(ball, "#dee2e6")
  w.setBounce(ball, 0.7)
  w.setVelocity(ball, 30, 0)
End Sub
