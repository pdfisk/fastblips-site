' Physics demo: a machine of animated composites.
'
' Run it in a console: the Physics tab of the output shows the world. A
' fixed body does not fall or get pushed, but it can still move by itself:
' give it a spin (setSpin) and it turns like a windmill, or an animation
' (oscillate swings it back and forth for ever; moveTo, rotateTo and scaleTo
' carry out one smooth move) and it pushes everything it meets. Here a
' three-bladed windmill, a lift and a sweeper are fixed composites.
' Click to make the blob of balls grow and shrink (scaleTo), and to drop
' more balls.

Dim world = New Physics()
world.setBackground("#f8f9fa")

' The windmill: a hub and three blades joined into one group, fixed, and spun.
Dim hub = world.addCircle(130, 170, 9)
Dim mill = world.combine(hub, world.addRect(130, 170, 100, 7))
For i = 1 To 2
  Dim blade = world.addRect(130, 170, 100, 7)
  world.setAngle(blade, i * 60)
  world.attach(mill, blade)
Next
world.setColor(mill, "#495057")
world.setFixed(mill, True)
world.setSpin(mill, 70)

' The lift: a platform that swings up and down 60 units, once every four seconds.
Dim lift = world.addRect(290, 150, 70, 8)
world.setColor(lift, "#1c7ed6")
world.setFixed(lift, True)
world.oscillate(lift, 0, 60, 0, 4)

' The sweeper: a rod on the floor that sweeps to and fro.
Dim sweeper = world.addRect(200, 288, 12, 24)
world.setColor(sweeper, "#e03131")
world.setFixed(sweeper, True)
world.oscillate(sweeper, 90, 0, 0, 5)

' The blob: three balls joined, which grows and shrinks when you click.
Dim blob = world.addGroup(60, 240)
For i = 0 To 2
  Dim b = world.addBall(48 + i * 14, 240 - (i Mod 2) * 10, 9)
  world.setColor(b, "#ae3ec9")
  world.attach(blob, b)
Next
world.setFixed(blob, True)

For i = 0 To 19
  Dim ball = world.addBall(30 + (i * 53) Mod 340, 20 + (i \ 7) * 20, 7)
  world.setColor(ball, "#f08c00")
Next

world.onClick("Clicked")
Print "Click: the blob grows or shrinks, and more balls fall."

Sub Clicked(w, x, y)
  If w.getScale(blob) < 1.5 Then
    w.scaleTo(blob, 2.5, 1.5)
  Else
    w.scaleTo(blob, 1, 1.5)
  End If
  Dim ball = w.addBall(x, 20, 7)
  w.setColor(ball, "#f08c00")
  Print "Bodies: " & Str(w.getCount())
End Sub
