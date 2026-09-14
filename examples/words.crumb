' Split on single spaces and report the longest word.
Function Reverse(s)
  Dim out = ""
  For i = Len(s) To 1 Step -1
    out = out & Mid(s, i, 1)
  Next
  Return out
End Function

Sub Report(label, value)
  Print UCase(label) & ": " & value
End Sub

Dim words(31)
Dim count = 0
Dim text = "the quick brown fox jumps over the lazy dog"
Dim start = 1

While start <= Len(text)
  Dim gap = InStr(Mid(text, start, Len(text)), " ")
  If gap = 0 Then
    words(count) = Mid(text, start, Len(text))
    start = Len(text) + 1
  Else
    words(count) = Mid(text, start, gap - 1)
    start = start + gap
  End If
  count = count + 1
End While

Dim longest = ""
For i = 0 To count - 1
  If Len(words(i)) > Len(longest) Then longest = words(i)
Next

Report("words", count)
Report("longest", longest)
Report("backwards", Reverse(longest))
