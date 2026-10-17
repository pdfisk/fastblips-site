' Tip splitter, made for a phone (360 x 640). There is no number box, so the
' bill, the tip and the people are stepped with + and - buttons.

Dim bill = 40
Dim tipPercent = 15
Dim people = 2

Dim page = New VPanel()
page.fill()
page.setPadding(12)
page.setSpacing(10)

page.add(New Label("Tip splitter"))

Dim billLabel = New Label("")
page.add(billLabel)
page.add(Stepper("BillDown", "BillUp", "$5"))

Dim tipLabel = New Label("")
page.add(tipLabel)
page.add(Stepper("TipDown", "TipUp", "1%"))

Dim peopleLabel = New Label("")
page.add(peopleLabel)
page.add(Stepper("PeopleDown", "PeopleUp", "1"))

Dim result = New Label("")
result.setBackground("#e8f2e0")
result.setHeight(120)
page.add(result)
page.add(New Spacer())

Refresh()

' A row with a - button and a + button, each calling the named Sub.
Function Stepper(downSub, upSub, amount)
  Dim row = New HPanel()
  row.setSpacing(8)
  Dim down = New Button("- " & amount)
  down.setFlex(1)
  down.setHeight(48)
  down.onClick(downSub)
  row.add(down)
  Dim up = New Button("+ " & amount)
  up.setFlex(1)
  up.setHeight(48)
  up.onClick(upSub)
  row.add(up)
  Return row
End Function

Sub BillUp()
  bill = bill + 5
  Refresh()
End Sub

Sub BillDown()
  If bill > 5 Then bill = bill - 5
  Refresh()
End Sub

Sub TipUp()
  If tipPercent < 50 Then tipPercent = tipPercent + 1
  Refresh()
End Sub

Sub TipDown()
  If tipPercent > 0 Then tipPercent = tipPercent - 1
  Refresh()
End Sub

Sub PeopleUp()
  If people < 20 Then people = people + 1
  Refresh()
End Sub

Sub PeopleDown()
  If people > 1 Then people = people - 1
  Refresh()
End Sub

' Money as dollars and cents, rounded to the nearest cent.
Function Money(amount)
  Dim cents = Int(amount * 100 + 0.5)
  Dim c = cents Mod 100
  Dim pad = ""
  If c < 10 Then pad = "0"
  Return "$" & (cents \ 100) & "." & pad & c
End Function

Sub Refresh()
  Dim tip = bill * tipPercent / 100
  billLabel.setText("Bill: " & Money(bill))
  tipLabel.setText("Tip: " & tipPercent & "%")
  peopleLabel.setText("People: " & people)
  result.setText("Tip " & Money(tip) & "   Total " & Money(bill + tip) & "   Each " & Money((bill + tip) / people))
End Sub
