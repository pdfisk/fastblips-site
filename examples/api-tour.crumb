' A tour of twelve free web APIs with Fetch, JsonGet and JsonCount.
' None of them needs a key. Run it from a console or a launch window:
' each Fetch waits for its answer while other programs keep running.
'
' Fetch(url) returns the response as a String. JsonGet(json, path) picks a
' value out of it: names and indexes separated by dots, indexes from 0
' ("features.0.properties.place", or "features[0].properties.place").
' JsonCount(json, path) is the length of an array (or an object's size).
' docs/apis.md lists these APIs and more.

Dim data

' 1. Open-Meteo: the weather now, in Toronto
data = Fetch("https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current_weather=true")
Print "Toronto:", JsonGet(data, "current_weather.temperature") & " C, wind", JsonGet(data, "current_weather.windspeed") & " km/h"

' 2. USGS: earthquakes of magnitude 4.5+ in the last day
data = Fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson")
Print JsonCount(data, "features"), "big earthquakes today; the latest:"
If JsonCount(data, "features") > 0 Then
  Print "  M" & JsonGet(data, "features.0.properties.mag"), JsonGet(data, "features.0.properties.place")
End If

' 3. Where the ISS is
data = Fetch("https://api.wheretheiss.at/v1/satellites/25544")
Print "ISS at", Int(JsonGet(data, "latitude")) & ",", Int(JsonGet(data, "longitude")), "going", Int(JsonGet(data, "velocity")), "km/h"

' 4. PokeAPI
data = Fetch("https://pokeapi.co/api/v2/pokemon/pikachu")
Print JsonGet(data, "name"), "is", JsonGet(data, "types.0.type.name") & "; weight", JsonGet(data, "weight")

' 5. Open Library: books
data = Fetch("https://openlibrary.org/search.json?q=dune&limit=3&fields=title,author_name,first_publish_year")
For i = 0 To JsonCount(data, "docs") - 1
  Print "Book:", JsonGet(data, "docs." & i & ".title"), "by", JsonGet(data, "docs." & i & ".author_name.0"), "(" & JsonGet(data, "docs." & i & ".first_publish_year") & ")"
Next

' 6. A joke
data = Fetch("https://official-joke-api.appspot.com/random_joke")
Print JsonGet(data, "setup")
Print "  ..." & JsonGet(data, "punchline")

' 7. Hacker News: the top story (the list is ids; fetch the first one)
data = Fetch("https://hacker-news.firebaseio.com/v0/topstories.json")
data = Fetch("https://hacker-news.firebaseio.com/v0/item/" & JsonGet(data, "0") & ".json")
Print "HN:", JsonGet(data, "title"), "(" & JsonGet(data, "score") & " points)"

' 8. Nager.Date: public holidays in Canada
data = Fetch("https://date.nager.at/api/v3/PublicHolidays/2026/CA")
Print JsonCount(data, ""), "holidays in 2026, starting with", JsonGet(data, "0.name"), "on", JsonGet(data, "0.date")

' 9. Wikipedia: a page summary
data = Fetch("https://en.wikipedia.org/api/rest_v1/page/summary/Toronto")
Print JsonGet(data, "title") & ":", JsonGet(data, "description")

' 10. CoinGecko: prices
data = Fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd")
Print "Bitcoin $" & JsonGet(data, "bitcoin.usd"), "Ethereum $" & JsonGet(data, "ethereum.usd")

' 11. Open Trivia DB
data = Fetch("https://opentdb.com/api.php?amount=1&type=multiple")
Print "Trivia:", JsonGet(data, "results.0.question")
Print "  Answer:", JsonGet(data, "results.0.correct_answer")

' 12. Art Institute of Chicago
data = Fetch("https://api.artic.edu/api/v1/artworks?limit=3&fields=title,artist_display")
For i = 0 To JsonCount(data, "data") - 1
  Print "Art:", JsonGet(data, "data[" & i & "].title")
Next
