# Omarchy MMA Events

Upcoming MMA events in the Omarchy bar. Click the glove to see what's coming up
from the promotions you follow, then click an event for its full fight card:
main card first, prelims after, with the challenger always on the right.
Once a fight is over, the winner gets a green check, the loser is dimmed, and the round, time and method are shown. This is hidden by default to avoid spoilers; turn on `showResults` to see it.

![Omarchy MMA preview](preview.png)

## Requirements

- Omarchy with the Quickshell-based shell (`omarchy-shell`)
- `curl` and `bash`
- `wl-paste` (`wl-clipboard`, shipped with Omarchy) to paste into the search box
- A Nerd Font in the bar (the glyph is `nf-md-boxing_glove`, U+F0B65)
- For the tests only: `node`

## Install

```sh
omarchy plugin add https://github.com/anavarre/omarchy-mma.git --enable
```

## Settings

Open the widget's settings in the Omarchy shell (or edit its entry in
`~/.config/omarchy/shell.json`):

| Setting | Default | |
|---|---|---|
| `organizations` | `["ufc"]` | Promotions to follow: `ufc`, `pfl`, `cw` (Cage Warriors), `ksw`, `ares`, `oktagon`, `hxmma` (Hexagone MMA), `aca` (Absolute Championship Akhmat) or `one` (ONE Championship, MMA bouts only). UFC and PFL are fully supported; all others are experimental. |
| `eventLimit` | `10` | Events listed at first, 1 to 30. More load as you scroll or arrow down. |
| `lookaheadDays` | `120` | How far ahead to look. |
| `refreshMinutes` | `180` | Background refresh interval. |
| `timeFormat` | `12h` | `12h` or `24h`. |
| `timeZone` | `venue` | Time zone for event times: `venue` (each event's own location, worked out from its venue address) or `local` (this computer's). Also set from the panel's settings, above the text size. |
| `showResults` | `false` | Show winners, losers and how finished fights ended. Off by default, since it spoils results. Also set from the panel's settings. |
| `textSize` | `medium` | `small`, `medium`, `large` or `xlarge`. |

## Using it

- Click the glove: the event list, each event with its promotion's logo. Middle-click: refresh (at most once every 30 seconds).
- `s` opens the settings view: tick the organizations to follow (UFC on, the others off by default).
  `↑`/`↓` move through every setting (organizations, time zone, keep days, text size);
  Space or Enter toggles an organization, `←`/`→` change the other settings, `Esc` goes back. The choice is saved to `shell.json`.
- `↑`/`↓` move, `Enter` (or click) opens the card, `o` opens the event in your browser,
  `r` refreshes, `Esc` goes back, then closes.
- On a card, `↑`/`↓` scroll and `←` goes back.

Each event shows its promotion's logo, bundled in `assets/`. They remain the
property and trademarks of their owners; see [Credits and sources](#credits-and-sources)
for where each one comes from and under what terms.

## Where the data comes from

ESPN's public JSON API. It needs no key, but it is unofficial and could change.

- `site.api.espn.com/.../mma/<league>/scoreboard` lists upcoming events, their
  fights and fighters.
- `sports.core.api.espn.com/.../competitions/<id>` says which segment each
  fight is on (`main`, `prelims1`, `prelims2`) and its billing. It is fetched
  when an event is opened. If it fails, the card is split by fight start times.
- Fighter `order` 1 is the champion or higher-billed fighter and 2 is the
  challenger. ESPN lists them in no fixed order, so the plugin sorts by it.

### The official site wins: PFL and UFC

A base source (ESPN, Wikipedia) can lag the promotion's own site: a late addition may be
on the site days before the base lists it, and a pulled bout can linger there. For a
promotion that has an `official` entry in `Model.js`, its own site is the source of truth
for which bouts are on a card, and the base card is made to match. PFL is the first
([pflmma.com](https://pflmma.com/events): each event page carries schema.org JSON-LD, one
entry per bout, and its `robots.txt` allows these pages; `bin/mma-api official pfl`) and UFC
([ufc.com](https://www.ufc.com/events): no structured data, so the event pages' HTML is read,
`bin/mma-api official ufc`). ufc.com's `robots.txt` asks for 15 seconds between requests, which
is kept, so only its next two events are read and that fetch takes about half a minute; the
ESPN events are shown first and corrected when it finishes. ufc.com picks the page's language
from the visitor's region (French from some countries), so requests carry its own English
language preference; a page that still comes back in another language has its weight classes
dropped rather than shown.

- A bout the site lists and the base does not is added. It has no segment of its own, so
  it joins the section whose bouts start at the same time, after the ones the base ranks.
- A bout the base lists and the site does not is dropped. A replacement opponent therefore
  shows the site's version. Every change is logged (`mma official <org> <event> dropped:
  ... added: ...`), so nothing disappears silently.
- The base still supplies everything the site lacks (ids, segments, records, results) for
  the bouts both list. A bout that is already finished stays, since results are the base's.
- Bouts are matched by fighters' last names, accents ignored, in either order.
- Safeguards: the site only rules when at least one of its bouts matches a base bout
  (otherwise the events were probably paired by date alone), an empty site card changes
  nothing, and only events the base already lists are touched. If the site does not answer
  or cannot be read, the base cards stand, without an error.

Adding a promotion means a parser for its site (`officialParsers` in `Model.js`), a branch
in `bin/mma-api official`, and `official: "<id>"` on its entry. The rules above then apply as is.

### Cage Warriors, KSW, Oktagon, ACA and ONE: Wikipedia

ESPN has next to no Cage Warriors coverage, and cagewarriors.com refuses
programmatic clients (it sits behind a bot challenge, which this plugin does not
try to get around). ESPN does list KSW (Konfrontacja Sztuk Walki), but its feed
stops in December 2024. Oktagon (Oktagon MMA, Czech Republic and Slovakia) is not on ESPN at all. ACA (Absolute Championship Akhmat, Russia) is not on ESPN either. So all five come from Wikipedia's
"[2026 in Cage Warriors](https://en.wikipedia.org/wiki/2026_in_Cage_Warriors)" and
"[2026 in Konfrontacja Sztuk Walki](https://en.wikipedia.org/wiki/2026_in_Konfrontacja_Sztuk_Walki)" and
"[2026 in Oktagon MMA](https://en.wikipedia.org/wiki/2026_in_Oktagon_MMA)" and
"[2026 in Absolute Championship Akhmat](https://en.wikipedia.org/wiki/2026_in_Absolute_Championship_Akhmat)"
"[2026 in ONE Championship](https://en.wikipedia.org/wiki/2026_in_ONE_Championship)"
pages, read through the MediaWiki API (`bin/mma-api wiki cw|ksw|oktagon|aca|one`). They are maintained by
volunteers and are usually updated within hours of an announcement or a result.
No key or account is needed.

- Upcoming events show the card as announced so far, and finished ones the
  full results. Unlike ESPN, the whole card arrives with the event list, so
  opening one makes no second request for the card itself.
- Wikipedia has no fight records, so opening a card also looks each fighter up
  on [Sherdog](https://www.sherdog.com) (one search and one page per fighter,
  four fighters at a time, a new one starting as soon as another finishes). A record found is kept until the fighter's next
  fight starts, since it cannot change before, then looked up again; an N/A is
  kept for 12 hours. The record appears under the name a moment after the card opens. A fighter is shown a record only when
  Sherdog has exactly one fighter by that name, so namesakes and fighters it
  does not list show none rather than a wrong one. When Sherdog refuses to
  answer (it runs a bot challenge), that fighter is not asked about again for
  12 hours, and `r` does not reset that: a site that is blocking us is left alone.
- Wikipedia has dates but no start times, so these events show the day only.
- Cards are as complete as the page: a late change may take a while to appear.
- The event link opens its section on Wikipedia. Wikipedia text is CC BY-SA.

### ARES: the promotion's own site

ARES Fighting Championship (France) is on neither ESPN nor Wikipedia, so its
events are read from [aresfighting.com](https://www.aresfighting.com/events/)
(`bin/mma-api ares`). Its `robots.txt` allows these pages, and they are fetched
sparingly: two listings, then one page per event.

- Upcoming events come from the "Upcoming events" listing, and each one's
  "Fight Card" page gives the start time (Paris time, shown in the time zone
  you chose), the bouts and the fighters' records. Events whose card is not
  announced yet show no fights.
- Past events come from the "Past events" listing, and each one's result page
  gives the winners and how each fight ended. Only recent ones are fetched: as
  far back as "Keep finished events" reaches, and no more than six.
- The site writes methods in French and English; they are shown in English.
- The site gives no venue or title-fight marker, so ARES events show neither.
- The event link opens the event's page on aresfighting.com. This reads the
  site's HTML, so a redesign could break it until the parser is updated.

### Hexagone MMA: Sherdog

Hexagone MMA (France) is on neither ESPN nor Wikipedia. Its schedule and cards come from
its [Sherdog organization page](https://www.sherdog.com/organizations/Hexagone-MMA-16693)
and the event pages it links (`bin/mma-api sherdog hxmma <days>`): the upcoming and
recent events, with fighter records and, for finished fights, winners and methods.
This reads Sherdog's HTML, so a redesign could break it until the parser is updated, and
Sherdog gives a day, not a start time. The event link opens the event on sherdog.com.

Only UFC, PFL, Cage Warriors, KSW, ARES, Oktagon, Hexagone MMA, ACA and ONE are available at the moment. Another promotion
needs a provider of its own; suggestions are welcome, please open an issue.

Card details (segments, and the fighter records of Wikipedia-sourced promotions,
which are looked up when a card is opened or is the next event) are cached for
12 hours, except a fighter's record, which stays until their next fight starts, in `~/.cache/omarchy-mma/cards.json`. `r` is a hard refresh that
bypasses and clears that cache (except the list of fighters Sherdog refused);
the background refresh and middle-click use it. `r` and middle-click run at
most once every 30 seconds, so a held key is not a burst of requests.

Events are cached in `~/.cache/omarchy-mma/events.json` and shown when the source
can't be reached.

### Request limits

The plugin is a guest on every one of these servers, so what it asks for and
what it accepts back are both bounded:

- The event list is fetched on the refresh interval (an hour at the least),
  when the panel opens with a list more than ten minutes old, when the set of
  organizations changes, and on `r` or middle-click, at most every 30 seconds.
  Changing any other setting fetches nothing.
- Requests to ESPN run up to 16 at a time; to the HTML sites (ARES, Sherdog)
  four at a time. Each is tried once more on a transient error, with curl's
  backoff and `Retry-After` honoured. A failed refresh waits for the next
  interval rather than retrying.
- Every answer is cut at a size cap (1 to 4 MB, more than ten times the
  largest seen), one command prints at most 8 MB in all, redirects are
  followed only to https, and the service refuses to parse anything larger
  still. Every open-ended match in the parsers is bounded, so a page built to
  stall them (Wikipedia's are editable by anyone) costs milliseconds, not minutes.
- Each `bin/mma-api` command has five minutes in all, whatever its requests
  do (`BoundedProcess.qml`). It runs under `timeout` in a process group of its
  own: past the deadline every process in it gets SIGTERM, then SIGKILL, and
  anything still left in the group after a failed run is killed too. A command
  that cannot even start, or never ends, still settles: the list stops
  loading, the card falls back to start times, and the next one in the queue
  goes ahead. What a timed-out command printed is never parsed.
- The two cache files are read in a separate process, at most 4 MB and 10
  seconds each; a file over that is ignored whole, as if it were missing. They
  are only ever written from the shell, never read there.
- An event link opens in the browser only when it is an https URL on one of
  the sources' own hosts.
- Pasting into the search box (Ctrl+V, Shift+Insert, the Paste key, middle
  click) never goes through Qt's own clipboard read, which pulls the whole
  selection into the shell process before any limit applies. `bin/mma-paste`
  reads it in a separate process instead, capped at 512 bytes and one second;
  anything larger or slower is dropped. The right-click menu is off, and a
  search is at most 100 characters.

## Tests

```sh
tests/run
```

Runs `Model.js` against saved ESPN and Wikipedia responses in `tests/fixtures/` and
checks `bin/mma-api`'s argument handling, `bin/mma-paste`'s byte and time caps
against a fake `wl-paste`, and, with `qmltestrunner` (`qt6-declarative`)
installed, that real paste keys and clicks in the search box never reach Qt's
native paste. No network or display needed.

## Uninstall

```sh
omarchy plugin disable anavarre.mma
omarchy plugin remove anavarre.mma
omarchy-shell shell rescanPlugins
rm -rf ~/.cache/omarchy-mma
```

If you installed by hand, delete `~/.config/omarchy/plugins/anavarre.mma` instead of
running `omarchy plugin remove`. Also remove any leftover `anavarre.mma` entry from
`~/.config/omarchy/shell.json`.

## Credits and sources

The MIT license below covers this project's own code and text. It does not cover
the logos in `assets/` or the saved responses in `tests/fixtures/`, which are
third-party material under the terms listed here. Every logo is a trademark of
its promotion, whatever the copyright status of the image; it is used only to
identify that promotion's events, and no endorsement is implied.

### Logos (`assets/`)

Every bundled copy is resized to 128×128 and re-encoded as an 8-bit palette PNG.
Other changes are listed per file. Licenses are as stated on each source page
when checked (November 2026).

| File | Source | License as stated at the source | Changes |
|---|---|---|---|
| `ufc.png` | ESPN league logo, [a.espncdn.com/i/teamlogos/leagues/500/ufc.png](https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png) | None stated. Logo © UFC (Zuffa, LLC) | Resized |
| `pfl.png` | ESPN league logo, [a.espncdn.com/i/teamlogos/leagues/500/pfl.png](https://a.espncdn.com/i/teamlogos/leagues/500/pfl.png) | None stated. Logo © Professional Fighters League | Resized |
| `cw.png` | [File:Cage_Warriors_logo.png](https://commons.wikimedia.org/wiki/File:Cage_Warriors_logo.png), Wikimedia Commons. Author: Cage Warriors; uploaded by AddedUpdatePoster | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Cropped to the circular emblem, placed on a dark tile. This derivative is likewise CC BY-SA 4.0 |
| `ksw.png` | [File:Konfrontacja_Sztuk_Walki_logo.png](https://commons.wikimedia.org/wiki/File:Konfrontacja_Sztuk_Walki_logo.png), Wikimedia Commons | Public domain (PD-textlogo) | Resized |
| `ares.png` | ARES Fighting Championship's site logo, [aresfighting.com](https://www.aresfighting.com/) | All rights reserved ([legal notice](https://www.aresfighting.com/legal-notice)) | Resized |
| `oktagon.png` | [File:Oktagon_logo.png](https://commons.wikimedia.org/wiki/File:Oktagon_logo.png), Wikimedia Commons. Author: Jakub.schroder | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Placed on a dark tile. This derivative is likewise CC BY-SA 4.0 |
| `hxmma.png` | [File:Hexagone_MMA_Winamax_logo.svg](https://commons.wikimedia.org/wiki/File:Hexagone_MMA_Winamax_logo.svg), Wikimedia Commons | Public domain (PD-logo), trademarked | Cropped to the hexagon emblem, rasterized |
| `aca.png` | [File:Absolute_Championship_Akhmat_logo.png](https://en.wikipedia.org/wiki/File:Absolute_Championship_Akhmat_logo.png), English Wikipedia | Public domain (PD-textlogo) | Resized |
| `one.png` | [File:ONE_Championship_company_logo.png](https://en.wikipedia.org/wiki/File:ONE_Championship_company_logo.png), English Wikipedia | Public domain in the US (PD-textlogo, PD-ineligible-USonly), trademarked | Resized |

### Test fixtures (`tests/fixtures/`)

Saved responses, kept so the parsers can be tested offline. They are read by the
tests only; the plugin itself never reads them.

| File | Source | Terms |
|---|---|---|
| `cw-2026-wiki.json` | Wikipedia, [2026 in Cage Warriors](https://en.wikipedia.org/wiki/2026_in_Cage_Warriors) ([history](https://en.wikipedia.org/w/index.php?title=2026_in_Cage_Warriors&action=history)), wikitext via the MediaWiki API, November 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), Wikipedia contributors |
| `ksw-2026-wiki.json` | Wikipedia, [2026 in Konfrontacja Sztuk Walki](https://en.wikipedia.org/wiki/2026_in_Konfrontacja_Sztuk_Walki) ([history](https://en.wikipedia.org/w/index.php?title=2026_in_Konfrontacja_Sztuk_Walki&action=history)), as above | CC BY-SA 4.0, Wikipedia contributors |
| `oktagon-2026-wiki.json` | Wikipedia, [2026 in Oktagon MMA](https://en.wikipedia.org/wiki/2026_in_Oktagon_MMA) ([history](https://en.wikipedia.org/w/index.php?title=2026_in_Oktagon_MMA&action=history)), as above | CC BY-SA 4.0, Wikipedia contributors |
| `aca-2026-wiki.json` | Wikipedia, [2026 in Absolute Championship Akhmat](https://en.wikipedia.org/wiki/2026_in_Absolute_Championship_Akhmat) ([history](https://en.wikipedia.org/w/index.php?title=2026_in_Absolute_Championship_Akhmat&action=history)), as above | CC BY-SA 4.0, Wikipedia contributors |
| `one-2026-wiki.json` | Wikipedia, [2026 in ONE Championship](https://en.wikipedia.org/wiki/2026_in_ONE_Championship) ([history](https://en.wikipedia.org/w/index.php?title=2026_in_ONE_Championship&action=history)), an excerpt of its wikitext in the API's response shape | CC BY-SA 4.0, Wikipedia contributors |
| `ufc-scoreboard.json`, `ufc-334-cards.json`, `pfl-scoreboard.json`, `pfl-lyon-scoreboard.json` | ESPN's public API (`site.api.espn.com`, `sports.core.api.espn.com`) | None stated; © ESPN |
| `ufc-334-site.html` | An event page of [ufc.com](https://www.ufc.com/events) | None stated; © UFC |
| `pfl-site-lyon.html` | An event page of [pflmma.com](https://pflmma.com/events) | None stated; © Professional Fighters League |
| `ares-2026.json` | Listing, fight-card and result pages of [aresfighting.com](https://www.aresfighting.com/events/) | All rights reserved ([legal notice](https://www.aresfighting.com/legal-notice)) |
| `hxmma-2026.json` | Hexagone MMA's [Sherdog organization page](https://www.sherdog.com/organizations/Hexagone-MMA-16693) and its event pages | None stated; © Sherdog |

## License

MIT, for this project's own code and text. See [LICENSE.md](LICENSE.md), and
[Credits and sources](#credits-and-sources) for the bundled third-party material.
