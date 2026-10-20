' FizzBuzz, 1 to 20
For n = 1 To 20
  If n Mod 15 = 0 Then
    Print "FizzBuzz"
  ElseIf n Mod 3 = 0 Then
    Print "Fizz"
  ElseIf n Mod 5 = 0 Then
    Print "Buzz"
  Else
    Print n
  End If
Next
