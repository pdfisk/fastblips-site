' Physics demo: a tower that comes apart.
'
' Run it in a console: the Physics tab of the output shows the world. Five
' blocks are joined into one group, so the tower stands, and would fall, as
' one rigid thing. detach(block) takes a block out of the group, to be a
' shape on its own again with the same id, moving as it was; getPartCount
' says how many shapes a group still has. Click the right half to flick the
' top block off the tower. Click the left half to throw a ball at it.

Dim world = New Physics()
world.setBackground("#f1f3f5")

Dim block(4)
For i = 0 To 4
  block(i) = world.addRect(290, 288 - i * 24, 50, 22)
  If i Mod 2 = 0 Then
    world.setColor(block(i), "#d9480f")
  Else
    world.setColor(block(i), "#f08c00")
  End If
  world.setLabel(block(i), Str(i + 1))
Next
Dim tower = world.combine(block(0), block(1))
For i = 2 To 4
  world.attach(tower, block(i))
Next

Dim top = 4
world.onClick("Clicked")
Print "Five blocks, one group. Right half: flick off the top block. Left half: throw a ball."

Sub Clicked(w, x, y)
  If x >= 200 Then
    If top >= 1 Then
      w.detach(block(top))
      w.setVelocity(block(top), 160, -180)
      top = top - 1
      Print "Block " & Str(top + 2) & " is off. The tower has " & Str(w.getPartCount(tower)) & " blocks."
    Else
      Print "Only the bottom block is left."
    End If
  Else
    Dim ball = w.addBall(30, 200, 12)
    w.setColor(ball, "#1c7ed6")
    w.setVelocity(ball, (290 - 30) * 2.5, -250)
  End If
End Sub
