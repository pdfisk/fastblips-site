Function Factorial(n)
  If n <= 1 Then Return 1
  Return n * Factorial(n - 1)
End Function

For i = 0 To 9
  Print "Factorial(" & i & ") = " & Factorial(i)
Next
