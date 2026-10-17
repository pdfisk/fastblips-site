' Lights Out, made for a phone (360 x 640), on the Board. Tapping a square
' flips it and the squares next to it (up, down, left, right). Switch every
' light off to win. Rows and columns count from 0.

Dim size = 5
Dim moves = 0
Dim lit(24)

Dim board = New Board()
board.setSize(size, size)
board.setCheckered(False)
board.setSquareCells(True)
board.onClick("Tapped")
NewGame()

' Start from a solved board and make random taps, so it can always be won.
Sub NewGame()
  For i = 0 To 24
    lit(i) = False
  Next
  For i = 1 To 12
    Flip(Int(Rnd() * size), Int(Rnd() * size))
  Next
  moves = 0
  Draw()
  Print "Turn every light off. Tap a square."
End Sub

' Flip one square, if it is on the board.
Sub FlipOne(row, column)
  If row >= 0 And row < size And column >= 0 And column < size Then
    lit(row * size + column) = Not lit(row * size + column)
  End If
End Sub

Sub Flip(row, column)
  FlipOne(row, column)
  FlipOne(row - 1, column)
  FlipOne(row + 1, column)
  FlipOne(row, column - 1)
  FlipOne(row, column + 1)
End Sub

Function AllOff()
  For i = 0 To 24
    If lit(i) Then Return False
  Next
  Return True
End Function

Sub Draw()
  For r = 0 To size - 1
    For c = 0 To size - 1
      If lit(r * size + c) Then
        board.setBackground(r, c, "#f2c230")
      Else
        board.setBackground(r, c, "#33363d")
      End If
    Next
  Next
End Sub

Sub Tapped(b, row, column)
  If AllOff() Then
    NewGame()
  Else
    Flip(row, column)
    moves = moves + 1
    Draw()
    If AllOff() Then
      Print "All off in " & moves & " moves! Tap to play again."
    Else
      Print "Moves: " & moves
    End If
  End If
End Sub
