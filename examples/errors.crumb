' A runtime error raised three frames deep.
Function Depth(n)
  If n = 0 Then Return Boom(1)
  Return Depth(n - 1)
End Function

Function Boom(k)
  Dim label = "total"
  Return label + k          ' operator + expects Number, Number
End Function

Print "before"
Print Depth(2)
Print "unreachable"
