' Button and Label demo. Run it from a launch window (the console's Launch
' menu) or as a page: index.html?run=button-demo after saving it to the
' Basic database under that name.
'
' Widgets are objects: New makes one, and its methods change it. Positions
' and sizes are in pixels from the top left of the screen.

Dim clicks = 0

Dim title = New Label("Click the button!")
title.setBounds(20, 20, 240, 24)

Dim counter = New Label("Clicks: 0")
counter.setBounds(20, 50, 240, 24)

Dim clickMe = New Button("Click me")
clickMe.setBounds(20, 84, 120, 32)

Dim startOver = New Button("Start over")
startOver.setLeft(150)
startOver.setTop(84)
startOver.setWidth(110)

' Each click calls the Sub named here. The program's top-level code ends
' below, but the program keeps running, waiting for clicks, until Reset.
clickMe.onClick("ClickMeClicked")
startOver.onClick("StartOverClicked")

Sub ClickMeClicked()
  clicks = clicks + 1
  counter.setText("Clicks: " & clicks)
  If clicks = 10 Then
    ' Move the button down and make it bigger.
    title.setText("Ten clicks. Impressive!")
    clickMe.setText("Keep going")
    clickMe.setTop(126)
    clickMe.setWidth(240)
    clickMe.setHeight(40)
  End If
End Sub

' A handler may take one argument: the widget that was clicked.
Sub StartOverClicked(button)
  Transcript button.getText() & " after " & clicks & " clicks"
  clicks = 0
  title.setText("Click the button!")
  counter.setText("Clicks: 0")
  clickMe.setText("Click me")
  clickMe.setBounds(20, 84, 120, 32)
End Sub
