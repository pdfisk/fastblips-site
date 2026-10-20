' Dice roller, made for a phone (the launch window's Mobile screen, or the
' Mobile page: 360 x 640). Pick one to three dice, tap Roll. The last ten
' rolls are listed under the dice.

Dim count = 2
Dim rolls = 0

Dim page = New VPanel()
page.fill()
page.setPadding(12)
page.setSpacing(10)

Dim title = New Label("Dice roller")
page.add(title)

' The dice, shown as die faces in one big label.
Dim faces = New Label("Tap Roll")
faces.setHeight(96)
faces.setBackground("#f4f0e0")
page.add(faces)

Dim total = New Label("")
page.add(total)

' How many dice: one button each.
Dim choose = New HPanel()
choose.setSpacing(8)
page.add(choose)
Dim one = New Button("1 die")
one.setFlex(1)
choose.add(one)
Dim two = New Button("2 dice")
two.setFlex(1)
choose.add(two)
Dim three = New Button("3 dice")
three.setFlex(1)
choose.add(three)

Dim roll = New Button("Roll")
roll.setHeight(64)
page.add(roll)

Dim history = New ListPanel()
history.setEmptyText("No rolls yet")
history.setFlex(1)
page.add(history)

one.onClick("PickOne")
two.onClick("PickTwo")
three.onClick("PickThree")
roll.onClick("RollDice")
ShowCount()

Sub PickOne()
  count = 1
  ShowCount()
End Sub

Sub PickTwo()
  count = 2
  ShowCount()
End Sub

Sub PickThree()
  count = 3
  ShowCount()
End Sub

Sub ShowCount()
  one.setEnabled(count <> 1)
  two.setEnabled(count <> 2)
  three.setEnabled(count <> 3)
  title.setText("Dice roller: " & count & " to roll")
End Sub

Sub RollDice()
  Dim shown = ""
  Dim sum = 0
  Dim digits = ""
  For i = 1 To count
    Dim n = Int(Rnd() * 6) + 1
    sum = sum + n
    shown = shown & Chr(9855 + n) & " "
    If i > 1 Then digits = digits & " + "
    digits = digits & n
  Next
  rolls = rolls + 1
  faces.setText(shown)
  total.setText("Total: " & sum)
  history.addItem("#" & rolls & "   " & digits & " = " & sum)
  ' Keep the last ten rolls, newest at the bottom.
  If history.getCount() > 10 Then history.removeItem(0)
  history.select(history.getCount() - 1)
End Sub
