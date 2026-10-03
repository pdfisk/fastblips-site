' Tic-tac-toe for two players, on the Board.
'
' Run it in a console (the Board tab of the output shows it), from a launch
' window, or as a page. New Board() is the program's board: a grid of cells
' that hold text. Rows and columns count from 0, from the top left.

Dim board = New Board()
board.setSize(3, 3)
board.setCheckered(False)
board.setSquareCells(True)

Dim turn = "X"
Dim moves = 0
Dim over = False

' Each click on a cell calls this Sub with the board, the row and the column.
board.onClick("CellClicked")
Print "X to move: click a square."

Sub CellClicked(b, row, column)
  If over Then
    NewGame()
  ElseIf b.getText(row, column) = "" Then
    b.setText(row, column, turn)
    If turn = "O" Then b.setColor(row, column, "#c03030")
    moves = moves + 1
    If Wins(turn) Then
      Print turn & " wins! Click the board to play again."
      over = True
    ElseIf moves = 9 Then
      Print "A draw. Click the board to play again."
      over = True
    Else
      If turn = "X" Then
        turn = "O"
      Else
        turn = "X"
      End If
      Print turn & " to move."
    End If
  End If
End Sub

Sub NewGame()
  board.clear()
  turn = "X"
  moves = 0
  over = False
  Print "X to move: click a square."
End Sub

' True if the three cells from (row, column), stepping by (dr, dc), all hold
' mark. A winning line is given a green background.
Function Line(mark, row, column, dr, dc)
  For i = 0 To 2
    If board.getText(row + i * dr, column + i * dc) <> mark Then Return False
  Next
  For i = 0 To 2
    board.setBackground(row + i * dr, column + i * dc, "#9acd32")
  Next
  Return True
End Function

Function Wins(mark)
  For i = 0 To 2
    If Line(mark, i, 0, 0, 1) Then Return True
    If Line(mark, 0, i, 1, 0) Then Return True
  Next
  If Line(mark, 0, 0, 1, 1) Then Return True
  Return Line(mark, 0, 2, 1, -1)
End Function
