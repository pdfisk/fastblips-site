' JSON Explorer: download data from a web API, list its keys in
' alphabetical order, and show the value of the key you pick.
'
' Run it from a Basic console's Launch menu (Desktop or Mobile), or save it
' to the Basic database as json-explorer and open index.html?run=json-explorer
' on a computer or a phone.
'
' One program, two layouts. The Viewport knows how wide the screen is:
'   desktop (600 pixels or more) - the list on the left, the detail on the right
'   mobile  (narrower)           - the list fills the screen; picking a key
'                                  shows its detail, and Back returns to the list
'
' Fetch(url) returns the API's answer as JSON text. JsonCount(data, path) is
' how many fields (or items) are at a path, JsonKey(data, path, n) is the name
' of field n, and JsonGet(data, path) is the value. The detail shows the
' JsonGet call that reads each value, so you can use it in your own programs.
' docs/apis.md lists more APIs to try.

' ---- The APIs on the Source menu (all answer with a JSON object)
Dim names(4)
Dim urls(4)
names(0) = "Pikachu"
urls(0) = "https://pokeapi.co/api/v2/pokemon/pikachu"
names(1) = "Toronto weather"
urls(1) = "https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current_weather=true"
names(2) = "Space station"
urls(2) = "https://api.wheretheiss.at/v1/satellites/25544"
names(3) = "Toronto on Wikipedia"
urls(3) = "https://en.wikipedia.org/api/rest_v1/page/summary/Toronto"
names(4) = "Python on GitHub"
urls(4) = "https://api.github.com/repos/python/cpython"

' ---- What the program knows
Dim data = ""                  ' the downloaded JSON text
Dim keys(0)                    ' its keys, sorted (replaced by each download)
Dim nl = Chr(10)               ' a line break, for the detail text
Dim vp = New Viewport()
Dim mobile = vp.getWidth() < 600

' ---- The screen: a header row, the body, and a status line
Dim page = New VPanel()
page.fill()
page.setPadding(4)
page.setSpacing(4)

Dim header = New HPanel()
header.setSpacing(4)
page.add(header)
Dim back = New Button("< Back")
back.setWidth(80)
back.setVisible(False)
header.add(back)
Dim sources = New Menu("Source")
header.add(sources)
For i = 0 To UBound(names)
  sources.addItem(names(i), "SourceChosen")
Next
Dim title = New Label("")
title.setFlex(1)
header.add(title)

Dim list = New ListPanel()
list.setFlex(1)
Dim detail = New TextPanel("")
detail.setReadOnly(True)
detail.setFlex(1)

If mobile Then
  ' One column; ShowDetail and ShowList swap the list and the detail.
  Dim body = New VPanel()
  body.setFlex(1)
  body.add(list)
  page.add(body)
Else
  Dim split = New HSplitPanel()
  split.setFlex(1)
  split.setPosition(0.3)
  split.setFirst(list)
  split.setSecond(detail)
  page.add(split)
End If

Dim status = New Label("")
page.add(status)

back.onClick("ShowList")
list.onSelect("KeyPicked")

Load(0)

' ---- Downloading

' A menu item's handler gets the menu and the item's label.
Sub SourceChosen(menu, label)
  For i = 0 To UBound(names)
    If names(i) = label Then Load(i)
  Next
End Sub

Sub Load(n)
  ShowList()
  title.setText(names(n))
  list.clear()
  list.setEmptyText("Downloading...")
  detail.setText("")
  status.setText("Downloading " & urls(n))
  data = Fetch(urls(n))
  If JsonCount(data, "") = 0 Then
    list.setEmptyText("(no keys)")
  Else
    keys = SortedKeys("")
    For i = 0 To UBound(keys)
      list.addItem(keys(i))
    Next
  End If
  status.setText(JsonCount(data, "") & " keys from " & names(n))
End Sub

' The names of the fields at path, in alphabetical order (ignoring case).
' For a list (a JSON array), its item numbers in order. There must be at
' least one.
Function SortedKeys(path)
  Dim count = JsonCount(data, path)
  Dim result(count - 1)
  Dim listed = IsList(path)
  For i = 0 To count - 1
    If listed Then
      result(i) = Str(i)
    Else
      result(i) = JsonKey(data, path, i)
    End If
  Next
  If Not listed Then SortStrings(result)
  Return result
End Function

' Insertion sort: each name moves left past the names that come after it.
Sub SortStrings(a)
  Dim item
  Dim j
  For i = 1 To UBound(a)
    item = a(i)
    j = i - 1
    While j >= 0 And LCase(a(j)) > LCase(item)
      a(j + 1) = a(j)
      j = j - 1
    End While
    a(j + 1) = item
  Next
End Sub

' ---- Showing a key

' An onSelect handler gets the list and the number of the row picked.
Sub KeyPicked(w, index)
  If index >= 0 Then ShowDetail(keys(index))
End Sub

Sub ShowDetail(key)
  detail.setText(Describe(key))
  If mobile Then
    list.remove()
    body.add(detail)
    back.setVisible(True)
  End If
End Sub

Sub ShowList()
  If mobile And detail.getParent() <> Nothing Then
    detail.remove()
    body.add(list)
    back.setVisible(False)
  End If
End Sub

' The detail text for the value at path.
Function Describe(path)
  Dim count = JsonCount(data, path)
  Dim text = path & nl & nl
  Dim hint = "In Crumb:  JsonGet(data, """ & path & """)"
  Dim shown
  If count = 0 Then
    Return text & Short(path, 100000) & nl & nl & hint
  End If
  If IsList(path) Then
    text = text & "A list of " & Plural(count, "item") & ":" & nl & nl
  Else
    text = text & "An object with " & Plural(count, "field") & ":" & nl & nl
  End If
  Dim fields = SortedKeys(path)
  shown = UBound(fields)
  If shown > 99 Then shown = 99
  For i = 0 To shown
    text = text & "  " & fields(i) & ":  " & Short(path & "." & fields(i), 60) & nl
  Next
  If UBound(fields) > shown Then text = text & "  ... and " & (UBound(fields) - shown) & " more" & nl
  hint = hint & nl & "Inside it:  JsonGet(data, """ & path & "." & fields(0) & """)"
  Return text & nl & hint
End Function

' "1 item", "2 items"
Function Plural(n, word)
  If n = 1 Then Return n & " " & word
  Return n & " " & word & "s"
End Function

' A value in one line: text cut to at most max characters, or a summary of
' an object or list.
Function Short(path, max)
  Dim count = JsonCount(data, path)
  Dim value = JsonGet(data, path)
  If count > 0 Then
    If IsList(path) Then Return "[" & Plural(count, "item") & "]"
    Return "{" & Plural(count, "field") & "}"
  End If
  If value = Nothing Then Return "(null)"
  Dim text = value & ""
  If Len(text) > max Then text = Mid(text, 1, max) & "..."
  Return text
End Function

' True if the value at path is a list (a JSON array) with items in it.
Function IsList(path)
  If JsonCount(data, path) = 0 Then Return False
  Return Mid(JsonGet(data, path), 1, 1) = "["
End Function
