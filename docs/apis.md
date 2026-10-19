# Free web APIs to fetch from

Twelve public APIs that answer in JSON, need no key or sign-up, and allow requests from
web pages (CORS), so `Fetch` (Crumb) and `fetch()` (MiniPy) work with them from the
playground, a launch window or a `?run=` page. All were checked from a browser on
2026-09-26. `examples/api-tour.bas` and `examples/api-tour.py` visit each one.

| # | API | Example URL | Try these paths (Crumb `JsonGet`) |
|---|---|---|---|
| 1 | [Open-Meteo](https://open-meteo.com/) — weather forecasts | `https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current_weather=true` | `current_weather.temperature`, `current_weather.windspeed`, `current_weather.weathercode` |
| 2 | [USGS Earthquakes](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) — quakes in the last hour/day/week | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` | `metadata.count`, `features.0.properties.mag`, `features.0.properties.place` |
| 3 | [Where the ISS at?](https://wheretheiss.at/w/developer) — the space station's position | `https://api.wheretheiss.at/v1/satellites/25544` | `latitude`, `longitude`, `altitude`, `velocity` |
| 4 | [PokéAPI](https://pokeapi.co/) — Pokémon data | `https://pokeapi.co/api/v2/pokemon/pikachu` | `name`, `weight`, `types.0.type.name`, `abilities.0.ability.name` |
| 5 | [Open Library](https://openlibrary.org/developers/api) — book search | `https://openlibrary.org/search.json?q=dune&limit=3&fields=title,author_name,first_publish_year` | `numFound`, `docs.0.title`, `docs.0.author_name.0`, `docs.0.first_publish_year` |
| 6 | [Official Joke API](https://github.com/15Dkatz/official_joke_api) — random jokes | `https://official-joke-api.appspot.com/random_joke` | `setup`, `punchline` |
| 7 | [Hacker News](https://github.com/HackerNews/API) — top stories | `https://hacker-news.firebaseio.com/v0/topstories.json`, then `https://hacker-news.firebaseio.com/v0/item/<id>.json` | `0` (an id); then `title`, `score`, `by`, `url` |
| 8 | [Nager.Date](https://date.nager.at/) — public holidays by country and year | `https://date.nager.at/api/v3/PublicHolidays/2026/CA` | `0.date`, `0.name`, `0.localName` (`JsonCount(data, "")` = how many) |
| 9 | [Wikipedia REST](https://en.wikipedia.org/api/rest_v1/) — page summaries | `https://en.wikipedia.org/api/rest_v1/page/summary/Toronto` | `title`, `description`, `extract` |
| 10 | [CoinGecko](https://www.coingecko.com/en/api) — cryptocurrency prices | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,cad` | `bitcoin.usd`, `ethereum.cad` |
| 11 | [Open Trivia DB](https://opentdb.com/api_config.php) — quiz questions | `https://opentdb.com/api.php?amount=5&type=multiple` | `results.0.question`, `results.0.correct_answer`, `results.0.incorrect_answers.0`, `results.0.category` |
| 12 | [Art Institute of Chicago](https://api.artic.edu/docs/) — the museum's collection | `https://api.artic.edu/api/v1/artworks?limit=5&fields=title,artist_display,date_display` | `data.0.title`, `data.0.artist_display`, `data.0.date_display` |

## More that work

- Sunrise and sunset: `https://api.sunrise-sunset.org/json?lat=43.65&lng=-79.38&formatted=0` (`results.sunrise`)
- Useless facts: `https://uselessfacts.jsph.pl/api/v2/facts/random` (`text`)
- Dog photos: `https://dog.ceo/api/breeds/image/random` (`message`, an image URL)
- Cat facts: `https://catfact.ninja/fact` (`fact`)
- Recipes: `https://www.themealdb.com/api/json/v1/1/random.php` (`meals.0.strMeal`)
- GitHub repositories: `https://api.github.com/repos/python/cpython` (`stargazers_count`)
- NASA picture of the day: `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY` (`title`, `explanation`; the demo key allows a few requests an hour)

## Things to know

- **Rate limits.** Most of these limit how often you can ask: Open Trivia DB allows one
  request every 5 seconds, CoinGecko a few per minute. A limited request usually answers
  429, which `Fetch` reports as an error.
- **HTML entities.** Open Trivia DB's questions contain entities such as `&quot;`; add
  `&encode=url3986` to the URL for plain text that is URL-encoded instead.
- **Not these.** restcountries.com, api.frankfurter.app and api.spacexdata.com refused
  requests from web pages when checked, so `Fetch` cannot reach them from the browser.
- **The command line.** `crumb run` fetches with Node's own `fetch` (Node 18+), which does
  not need CORS.
