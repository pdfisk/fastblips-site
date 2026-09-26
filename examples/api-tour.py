# A tour of twelve free web APIs with fetch(). None of them needs a key.
#
# fetch(url) returns the response's JSON as MiniPy values: dicts, lists,
# str, int, float, bool and None. The program waits for each answer while
# other programs keep running; a failed request raises OSError.
# docs/apis.md lists these APIs and more.

def get(url):
    try:
        return fetch(url)
    except OSError as e:
        print("  (failed:", str(e) + ")")
        return None

# 1. Open-Meteo: the weather now, in Toronto
w = get("https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current_weather=true")
if w:
    now = w["current_weather"]
    print("Toronto:", str(now["temperature"]) + " C, wind", str(now["windspeed"]) + " km/h")

# 2. USGS: earthquakes of magnitude 4.5+ in the last day, strongest first
quakes = get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson")
if quakes:
    mags = sorted([(q["properties"]["mag"], q["properties"]["place"]) for q in quakes["features"]])
    print(len(mags), "big earthquakes today")
    for mag, place in mags[-3:]:
        print("  M" + str(mag), place)

# 3. Where the ISS is
iss = get("https://api.wheretheiss.at/v1/satellites/25544")
if iss:
    print("ISS at", int(iss["latitude"]), int(iss["longitude"]), "going", int(iss["velocity"]), "km/h")

# 4. PokeAPI
p = get("https://pokeapi.co/api/v2/pokemon/pikachu")
if p:
    print(p["name"], "types:", [t["type"]["name"] for t in p["types"]], "abilities:", [a["ability"]["name"] for a in p["abilities"]])

# 5. Open Library: books
books = get("https://openlibrary.org/search.json?q=dune&limit=3&fields=title,author_name,first_publish_year")
if books:
    for b in books["docs"]:
        print("Book:", b["title"], "by", b.get("author_name", ["?"])[0], "(" + str(b.get("first_publish_year")) + ")")

# 6. A joke
j = get("https://official-joke-api.appspot.com/random_joke")
if j:
    print(j["setup"])
    print("  ..." + j["punchline"])

# 7. Hacker News: the top three stories
ids = get("https://hacker-news.firebaseio.com/v0/topstories.json")
if ids:
    for story_id in ids[:3]:
        s = get("https://hacker-news.firebaseio.com/v0/item/" + str(story_id) + ".json")
        if s:
            print("HN:", s["title"], "(" + str(s.get("score", 0)) + " points)")

# 8. Nager.Date: public holidays in Canada
hol = get("https://date.nager.at/api/v3/PublicHolidays/2026/CA")
if hol:
    print(len(hol), "holidays in 2026:", ", ".join([h["name"] for h in hol[:4]]))

# 9. Wikipedia: a page summary
wiki = get("https://en.wikipedia.org/api/rest_v1/page/summary/Toronto")
if wiki:
    print(wiki["title"] + ":", wiki["description"])

# 10. CoinGecko: prices
prices = get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,cad")
if prices:
    for coin in prices:
        print(coin, "USD", prices[coin]["usd"], "CAD", prices[coin]["cad"])

# 11. Open Trivia DB
t = get("https://opentdb.com/api.php?amount=1&type=multiple")
if t and t["results"]:
    q = t["results"][0]
    print("Trivia:", q["question"])
    print("  Answer:", q["correct_answer"])

# 12. Art Institute of Chicago
art = get("https://api.artic.edu/api/v1/artworks?limit=3&fields=title,artist_display")
if art:
    for a in art["data"]:
        print("Art:", a["title"], "-", a["artist_display"])
