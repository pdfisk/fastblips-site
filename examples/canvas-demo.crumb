' Canvas demo: a bar chart, then a turning 3D scene.
'
' Run it in a console (the Canvas tab of the output shows it), from a launch
' window, or as a page. New Canvas() is the program's canvas. Its drawing is
' 400 units wide and 300 high, with (0, 0) at the top left; in 3D, x is to
' the right, y is up and z is toward you.

Dim canvas = New Canvas()

' ---- 2D: a bar chart of some numbers
Dim sales(5)
sales(0) = 12
sales(1) = 19
sales(2) = 7
sales(3) = 23
sales(4) = 15
sales(5) = 28

canvas.setFontSize(16)
canvas.text(20, 12, "Sales by month - click to see it in 3D")
canvas.line(30, 260, 380, 260)
canvas.line(30, 50, 30, 260)
canvas.setFontSize(12)
For i = 0 To 5
  Dim tall = sales(i) * 7
  canvas.setColor("#3a6db0")
  canvas.fillRect(45 + i * 56, 260 - tall, 40, tall)
  canvas.setColor("black")
  canvas.text(57 + i * 56, 242 - tall, sales(i))
  canvas.text(60 + i * 56, 266, i + 1)
Next

canvas.onClick("Clicked")
Print "Click the chart to see it in 3D."

' The same numbers as blocks standing on a floor. The shapes are given once;
' moving the camera round them (orbit) and calling update() redraws them.
' This Sub never ends, so the program handles no more events: Reset (or Run
' again) stops it.
Sub Clicked(c, x, y)
  Print "Turning. Reset (or Run again) stops it."
  c.setAutoUpdate(False)
  c.setBackground("#1b1e23")
  c.clear()
  c.setColor("#555a66")
  For i = -4 To 4
    c.line3d(i, 0, -2, i, 0, 2)
  Next
  For i = -2 To 2
    c.line3d(-4, 0, i, 4, 0, i)
  Next
  For i = 0 To 5
    Dim h = sales(i) / 7
    c.setColor("#4f8fe0")
    c.fillBox3d(i * 1.2 - 3, h / 2, 0, 0.8, h, 0.8)
  Next
  c.lookAt(0, 1.5, 0)
  Dim angle = 0
  While True
    c.orbit(angle, 4, 9)
    c.update()
    angle = angle + 2
    Sleep(30.5)          ' milliseconds (a whole number would be seconds)
  End While
End Sub
