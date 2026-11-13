"use strict";

// Test data for the sources that publish no reuse terms: ESPN's API, ufc.com,
// pflmma.com, aresfighting.com and Sherdog. Nothing here was saved from those
// services. Each builder below writes, from the small tables in this file, a
// response in the shape bin/mma-api hands to Model.js: only the fields and
// markup the parsers read. Every fighter, record, result, venue and id is
// invented; a name that matches a real person does so by chance. Event titles
// only follow each promotion's naming scheme ("UFC 334", "ARES 45", "HXMMA 47"),
// which is what the parsers derive ids from.

// ------------------------------------------------------------------ people

const GIVEN = ["Anton", "Bruno", "Caio", "Dmitri", "Elias", "Farid", "Goran", "Hamid", "Ivo", "Jarek", "Kenji", "Luan",
  "Matteo", "Nils", "Osman", "Pavel", "Quentin", "Rafael", "Soren", "Tariq", "Ulises", "Viktor", "Wendell", "Xavi",
  "Yusuf", "Zoran", "Amara", "Bianca", "Carla", "Dalia", "Esme", "Freya", "Greta", "Hana", "Ines", "Jana"];
const FAMILY = ["Abara", "Belmonte", "Cresswell", "Dragunov", "Eklund", "Farkas", "Galvez", "Haddou", "Iwata", "Jankovic",
  "Kowalczuk", "Lindqvist", "Marchetti", "Nakano", "Obradovic", "Pellerin", "Quintero", "Rosales", "Stojan", "Tavita",
  "Ulloa", "Vasquez", "Wojcik", "Ximenes", "Yamada", "Zielinski", "Ashdown", "Brannigan", "Castellan", "Dunmore",
  "Everard", "Fontaine", "Grimaldi", "Hollis", "Ingram", "Jessop", "Kirkby", "Lomas", "Merrick", "Northam", "Oakes"];
const COUNTRIES = ["USA", "Brazil", "France", "Poland", "Japan", "England", "Mexico", "Georgia"];

// The nth invented fighter: a name no other n gives, a plausible record and a country.
function person(n) {
  return {
    name: GIVEN[n % GIVEN.length] + " " + FAMILY[(n * 7 + Math.floor(n / GIVEN.length)) % FAMILY.length],
    record: (6 + (n * 5) % 13) + "-" + (n % 5) + "-" + (n % 11 === 0 ? 1 : 0),
    country: COUNTRIES[n % COUNTRIES.length],
  };
}
// A fighter the tests name: "Marek Dolan", optionally with a record.
const named = (name, record = "9-2-0", country = "USA") => ({ name, record, country });
const TBA = { name: "TBA", record: "", country: "" };
// "Marek Dolan" -> "M. Dolan", as ESPN shortens names.
const shortName = (name) => name.replace(/^(\S)\S*\s+/, "$1. ");

// ------------------------------------------------------------- ESPN's API

function competitor(p, order) {
  const c = { order, winner: false, athlete: { displayName: p.name, shortName: shortName(p.name) } };
  if (p.country) c.athlete.flag = { alt: p.country };
  if (p.record) c.records = [{ summary: p.record }];
  return c;
}

// One bout of a scoreboard event. `left` is the champion or higher-billed side
// (order 1). ESPN lists the two in no fixed order: `challengerFirst` puts
// order 2 first, as it sometimes does.
function bout({ id, start, weight, rounds = 3, left, right, challengerFirst = false }) {
  const sides = [competitor(left, 1), competitor(right, 2)];
  return {
    id: String(id), date: start, startDate: start,
    type: { abbreviation: weight },
    format: { regulation: { periods: rounds } },
    status: { period: 0, displayClock: "-", type: { name: "STATUS_SCHEDULED", completed: false } },
    broadcasts: [{ names: ["Ringside One"] }],
    competitors: challengerFirst ? sides.reverse() : sides,
  };
}

function scoreboardEvent({ id, league, name, shortName: short, date, venue, bouts }) {
  return {
    id: String(id), name, shortName: short, date,
    status: { type: { name: "STATUS_SCHEDULED" } },
    venues: [venue],
    links: [{ rel: ["summary", "desktop", "event"], href: "https://www.espn.com/mma/fightcenter/_/id/" + id + "/league/" + league }],
    competitions: bouts.map(bout),
  };
}

const scoreboard = (events) => JSON.stringify({ events: events.map(scoreboardEvent) });

const WEIGHTS = ["Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight", "Light Heavyweight"];

// `count` ordinary bouts starting at `start`, their fighters taken from person(from) on.
function filler(count, { firstId, start, from }) {
  return Array.from({ length: count }, (_, i) => ({
    id: firstId + i, start, weight: WEIGHTS[(from + i) % WEIGHTS.length],
    left: person(from + 2 * i), right: person(from + 2 * i + 1),
  }));
}

// A scoreboard lists a card in ascending billing: early prelims first, main event last.

// UFC Fight Night: 7 prelims and a 5-bout main card, told apart by start time only.
const fightNight = {
  id: 600090031, league: "ufc", name: "UFC Fight Night: Varga vs. Okoro", shortName: "UFC Fight Night",
  date: "2026-10-31T21:00Z",
  venue: { fullName: "Desert Dome", address: { city: "Las Vegas", state: "NV", country: "USA" } },
  bouts: [
    { id: 920001, start: "2026-10-31T21:00Z", weight: "Women's Flyweight", challengerFirst: true,
      left: named("Ilse Kovářová", "7-1-0", "Slovakia"), right: named("Marta Quispe", "8-3-0", "Peru") },
    ...filler(6, { firstId: 920002, start: "2026-10-31T21:00Z", from: 0 }),
    ...filler(4, { firstId: 920008, start: "2026-11-01T00:00Z", from: 12 }),
    { id: 920012, start: "2026-11-01T00:00Z", weight: "Lightweight", rounds: 5,
      left: named("Tibor Varga", "20-5-1", "Hungary"), right: named("Emeka Okoro", "11-1-0", "Nigeria") },
  ],
};

// UFC 334: three segments. The bout ids are 910000 + the bout's matchNumber
// in ufcCards below, 1 being the main event.
const ufc334Bouts = [
  // Early prelims, matchNumber 14 to 10.
  { id: 910014, weight: "Flyweight", left: person(40), right: person(41) },
  { id: 910013, weight: "Lightweight", left: named("Rustam Aliyev", "10-1-0", "Azerbaijan"), right: named("Jefferson Prado", "9-2-0", "Brazil") },
  { id: 910012, weight: "Featherweight", left: person(42), right: person(43) },
  { id: 910011, weight: "Women's Strawweight", left: person(66), right: person(67) },
  { id: 910010, weight: "Bantamweight", left: named("Diego Nuñez", "17-5-0", "Mexico"), right: person(44) },
  // Prelims, 9 to 6.
  { id: 910009, weight: "Welterweight", left: person(45), right: person(46) },
  { id: 910008, weight: "Light Heavyweight", left: person(47), right: person(48) },
  { id: 910007, weight: "Welterweight", left: named("Miloš Petrić", "12-3-0", "Serbia"), right: named("Kevin Harlan", "28-14-0") },
  { id: 910006, weight: "Featherweight", left: person(49), right: person(50) },
  // Main card, 5 to 1.
  { id: 910005, weight: "Lightweight", left: person(51), right: person(52) },
  { id: 910004, weight: "Welterweight", left: person(53), right: person(54) },
  { id: 910003, weight: "Middleweight", left: person(55), right: person(56) },
  { id: 910002, weight: "Women's Bantamweight", rounds: 5, title: "UFC Women's Bantamweight Title",
    left: named("Renata Sousa", "13-2-0", "Brazil"), right: named("Hollie Marsh", "9-1-0", "England") },
  { id: 910001, weight: "Heavyweight", rounds: 5, title: "UFC Heavyweight Title", challengerFirst: true,
    left: named("Marek Dolan", "14-2-0", "Czechia"), right: named("Jonas Hale", "10-0-0") },
];
const ufc334Segment = (b) => { const n = b.id - 910000; return n <= 5 ? "main" : (n <= 9 ? "prelims1" : "prelims2"); };
const UFC334_STARTS = { main: "2026-11-15T02:00Z", prelims1: "2026-11-15T00:00Z", prelims2: "2026-11-14T22:00Z" };

const ufc334 = {
  id: 600090114, league: "ufc", name: "UFC 334: Dolan vs. Hale", shortName: "UFC 334", date: "2026-11-14T22:00Z",
  venue: { fullName: "Hudson Garden", address: { city: "New York", state: "NY", country: "USA" } },
  bouts: ufc334Bouts.map((b) => Object.assign({}, b, { start: UFC334_STARTS[ufc334Segment(b)] })),
};

// UFC 336: a card still being put together, one side of its first bout unannounced.
const ufc336 = {
  id: 600090130, league: "ufc", name: "UFC 336: Sato vs. Ferro", shortName: "UFC 336", date: "2027-01-30T22:00Z",
  venue: { fullName: "Pacific Forum", address: { city: "Los Angeles", state: "CA", country: "USA" } },
  bouts: [
    { id: 930001, start: "2027-01-30T22:00Z", weight: "Bantamweight", left: TBA, right: person(60) },
    { id: 930002, start: "2027-01-31T00:00Z", weight: "Welterweight", left: person(61), right: person(62) },
    { id: 930003, start: "2027-01-31T02:00Z", weight: "Featherweight", left: person(63), right: person(64) },
    { id: 930004, start: "2027-01-31T02:00Z", weight: "Flyweight", rounds: 5,
      left: named("Ryo Sato", "18-2-0", "Japan"), right: named("Mateus Ferro", "21-7-0", "Brazil") },
  ],
};

const ufcScoreboard = scoreboard([ufc334, ufc336, fightNight]);

// What `bin/mma-api card` prints for UFC 334: one object per bout from ESPN's
// core API, with its segment, its billing and, for a title fight, the belt.
const ufcCards = JSON.stringify(ufc334Bouts.map((b) => {
  const key = ufc334Segment(b);
  return {
    id: String(b.id),
    cardSegment: { name: key, description: { main: "Main Card", prelims1: "Prelims", prelims2: "Early Prelims" }[key] },
    matchNumber: b.id - 910000,
    types: b.title ? [{ text: b.title }] : [],
  };
}));

const pflScoreboard = scoreboard([{
  id: 600091114, league: "pfl", name: "PFL Dubai: Orlov vs. Bondar", shortName: "PFL Dubai", date: "2026-11-14T14:00Z",
  venue: { fullName: "Creek Arena", address: { city: "Dubai", country: "United Arab Emirates" } },
  bouts: [
    ...filler(3, { firstId: 940001, start: "2026-11-14T14:00Z", from: 70 }),
    ...filler(2, { firstId: 940004, start: "2026-11-14T18:00Z", from: 76 }),
    { id: 940006, start: "2026-11-14T18:00Z", weight: "Light Heavyweight", rounds: 5,
      left: named("Vadim Orlov", "19-2-0", "Russia"), right: named("Taras Bondar", "12-1-0", "Ukraine") },
  ],
}]);

// ------------------------------------------------- PFL Lyon, on ESPN and on pflmma.com
// ESPN's card lacks Diallo vs Moré and Harker vs Calder, which the PFL site
// lists; the site lacks Pruitt vs Yildar, which ESPN lists. Three fighters are
// spelled differently by the two: a middle name, another given name, an accent.

const LYON_PRELIMS = "2026-12-19T16:00Z";
const LYON_MAIN = "2026-12-19T20:00Z";

const pflLyonScoreboard = scoreboard([{
  id: 600091219, league: "pfl", name: "PFL Lyon: Benard vs. Mackie", shortName: "PFL Lyon", date: LYON_PRELIMS,
  venue: { fullName: "Halle des Deux Rives", address: { city: "Lyon", country: "France" } },
  bouts: [
    { id: 950001, start: LYON_PRELIMS, weight: "Lightweight", left: named("Liam Pruitt", "6-1-0", "England"), right: named("Emre Yildar", "7-2-0", "Turkey") },
    { id: 950002, start: LYON_PRELIMS, weight: "Women's Flyweight", left: named("Shelda Mwamba", "5-0-0", "DR Congo"), right: person(80) },
    { id: 950003, start: LYON_PRELIMS, weight: "Featherweight", left: named("Adam Kessri", "8-1-0", "France"), right: named("Hugo Brassart", "7-0-0", "France") },
    { id: 950004, start: LYON_MAIN, weight: "Heavyweight", left: named("Boris Mbarga Etoundi", "9-1-0", "Cameroon"), right: person(81) },
    { id: 950005, start: LYON_MAIN, weight: "Middleweight", left: person(82), right: person(83) },
    { id: 950006, start: LYON_MAIN, weight: "Welterweight", left: person(84), right: person(85) },
    { id: 950007, start: LYON_MAIN, weight: "Lightweight", left: person(86), right: person(87) },
    { id: 950008, start: LYON_MAIN, weight: "Bantamweight", rounds: 5, left: named("Yanis Benard", "22-4-0", "France"), right: named("Aaron Mackie", "15-3-0") },
  ],
}]);

// The site's event page carries its card as schema.org JSON-LD: a graph whose
// "#event" node has one subEvent per bout, described as "A vs B - Weight class".
// Its times are local (Lyon is UTC+1 in December).
function pflSitePage({ path, name, start, bouts }) {
  const url = "https://pflmma.com" + path;
  const graph = [
    { "@type": "WebSite", "@id": "https://pflmma.com/#website", name: "PFL" },
    {
      "@type": "SportsEvent", "@id": url + "#event", name, url, startDate: start,
      eventStatus: "https://schema.org/EventScheduled",
      subEvent: bouts.map((b) => ({
        "@type": "SportsEvent", "@id": url + "#fight-" + b.id,
        name: b.left + " vs " + b.right,
        description: b.left + " vs " + b.right + " - " + b.weight,
        startDate: b.start || start,
        eventStatus: "https://schema.org/" + (b.cancelled ? "EventCancelled" : "EventScheduled"),
        competitor: [{ "@type": "Person", name: b.left }, { "@type": "Person", name: b.right }],
      })),
    },
  ];
  return [
    "<!DOCTYPE html>", '<html lang="en">', "<head>", "<title>" + name + "</title>",
    '<script type="application/ld+json">' + JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) + "</script>",
    "</head>", "<body><h1>" + name + "</h1></body>", "</html>", "",
  ].join("\n");
}

const pflSiteLyon = pflSitePage({
  path: "/event/pfl-lyon-2026", name: "PFL Lyon", start: "2026-12-19T21:00:00+01:00",
  bouts: [
    { id: 1671, left: "Yanis Bénard", right: "Aaron Mackie", weight: "Bantamweight World Title" },
    { id: 1672, left: person(86).name, right: person(87).name, weight: "Lightweight" },
    { id: 1673, left: person(84).name, right: person(85).name, weight: "Welterweight" },
    { id: 1674, left: person(82).name, right: person(83).name, weight: "Middleweight" },
    { id: 1675, left: "Boris Etoundi", right: person(81).name, weight: "Heavyweight" },
    { id: 1680, left: "Oumar Diallo", right: "Alex Moré", weight: "Welterweight" },
    { id: 1681, left: "Dean Harker", right: "Bryce Calder", weight: "Featherweight", start: "2026-12-19T17:00:00+01:00" },
    { id: 1676, left: "Adam Kessri", right: "Hugo Brassart", weight: "Featherweight", start: "2026-12-19T17:00:00+01:00" },
    { id: 1677, left: "Miracle Mwamba", right: person(80).name, weight: "Women's Flyweight", start: "2026-12-19T17:00:00+01:00" },
    { id: 1678, left: person(90).name, right: person(91).name, weight: "Lightweight", start: "2026-12-19T17:00:00+01:00", cancelled: true },
  ],
});

// ------------------------------------------------------------- ufc.com's card
// The event page has one block per segment, holding the Unix time it starts,
// then a "c-listing-fight" block per bout: the weight class and the two
// corners' names, each a link holding two spans or, for some fighters, plain
// text. The main event comes first. ufc.com no longer lists Aliyev vs Prado,
// and writes "Nunez" where ESPN has "Nuñez".

const UFC_SITE_NAMES = { "Diego Nuñez": "Diego Nunez" };
const UFC_SITE_PLAIN = ["Miloš Petrić"];
const UFC_SITE_DROPPED = [910013];

function ufcSiteCorner(colour, name) {
  const cut = name.indexOf(" ");
  const text = UFC_SITE_PLAIN.includes(name)
    ? name
    : '<span class="c-listing-fight__corner-given-name">' + name.slice(0, cut) + "</span>\n" +
      '            <span class="c-listing-fight__corner-family-name">' + name.slice(cut + 1) + "</span>";
  return [
    '        <div class="c-listing-fight__corner-name c-listing-fight__corner-name--' + colour + '">',
    '          <a href="/athlete/' + name.toLowerCase().replace(/[^a-z]+/g, "-") + '">',
    "            " + text,
    "          </a>",
    "        </div>",
  ].join("\n");
}

function ufcSitePage() {
  const sections = [["main-card", "main"], ["prelims-card", "prelims1"], ["early-prelims", "prelims2"]].map(([id, key]) => {
    const bouts = ufc334Bouts.filter((b) => ufc334Segment(b) === key && !UFC_SITE_DROPPED.includes(b.id)).reverse();
    return [
      '  <div id="' + id + '" class="fight-card-segment">',
      '    <div class="c-event-fight-card-broadcaster__time" data-timestamp="' + Date.parse(UFC334_STARTS[key].replace("Z", ":00Z")) / 1000 + '"></div>',
      ...bouts.map((b) => [
        '    <div class="c-listing-fight" data-fmid="' + (b.id - 900000) + '" data-status="">',
        '      <div class="c-listing-fight__class-text">' + b.weight.replace("'", "&#039;") + (b.title ? " Title Bout" : " Bout") + "</div>",
        '      <div class="c-listing-fight__names-row">',
        ufcSiteCorner("red", UFC_SITE_NAMES[b.left.name] || b.left.name),
        ufcSiteCorner("blue", UFC_SITE_NAMES[b.right.name] || b.right.name),
        "      </div>",
        "    </div>",
      ].join("\n")),
      "  </div>",
    ].join("\n");
  });
  return ["<!DOCTYPE html>", '<html lang="en" dir="ltr">', "<head><title>UFC 334</title></head>", "<body>", ...sections, "</body>", "</html>", ""].join("\n");
}

const ufcSite334 = ufcSitePage();

// ---------------------------------------------------------- aresfighting.com
// `bin/mma-api ares` prints { upcoming, past, cards, results }: the two event
// listings, then the card page of each upcoming event by competition id and
// the result page of each recent past event by path. Dates are Paris time,
// day first. A page lists its main event first.

function aresListingUpcoming(events) {
  return events.map((e) => [
    '<div class="competition-resume upcoming">',
    '  <a href="https://www.aresfighting.com/events/?competition=' + e.competition + '" title="' + e.title + '">',
    '    <div class="date">' + e.weekday + "<br />" + e.day + "</div>",
    '    <div class="name">' + e.title + "</div>",
    "  </a>",
    "</div>",
  ].join("\n")).join("\n");
}

function aresListingPast(events) {
  return events.map((e) => [
    '<div class="competition-resume past">',
    '  <a href="https://www.aresfighting.com' + e.path + '" title="' + e.title + '">',
    '    <div class="date">' + e.day + "</div>",
    '    <div class="name">' + e.title + "</div>",
    "  </a>",
    "</div>",
  ].join("\n")).join("\n");
}

// One bout of a card or result page. `result` is { method, round, time, winner: "left" | "right" | "" }.
function aresBout(b) {
  const photo = (p, i) => "/media/fighters/" + p.name.toLowerCase().replace(/[^a-z]+/g, "-") + (b.title && i === 0 ? "-CHAMP-" : "-") + "2026.png";
  const lines = [
    '<div class="fighter-line">',
    '  <div class="fighter-one"><img alt="" src="' + photo(b.left, 0) + '"><h4>' + b.left.name + "</h4></div>",
    '  <div class="fight-info">',
    "    <h3>" + b.weight + "</h3>",
  ];
  if (b.result) {
    if (b.result.winner) lines.push('    <div class="winner winner-' + b.result.winner + '">Winner</div>');
    for (const [label, value] of [["Method", b.result.method], ["Round", b.result.round], ["Time", b.result.time]])
      lines.push('    <span class="combat-round-title">' + label + '</span> <span class="combat-round-value">' + value + "</span>");
  }
  lines.push(
    "  </div>",
    '  <div class="fighter-two"><img alt="" src="' + photo(b.right, 1) + '"><h4>' + b.right.name + "</h4></div>",
    '  <div class="records"><span class="stat-left">' + b.left.record + '</span> <span class="stat-title">Record</span> <span class="stat-right">' + b.right.record + "</span></div>",
    "</div>");
  return lines.join("\n");
}

function aresCardPage(e, bouts) {
  return ["<h1>" + e.title + "</h1>", '<div class="date">' + e.weekday + "<br />" + e.day + " " + e.time + "</div>", ...bouts.map(aresBout)].join("\n");
}

function aresResultPage(title, segments) {
  return ["<h1>" + title + "</h1>", ...segments.map(([heading, bouts]) => ["<h2>" + heading + "</h2>", ...bouts.map(aresBout)].join("\n"))].join("\n");
}

const aresUpcoming = [
  { competition: 9045, title: "ARES 45", weekday: "Vendredi", day: "20/11/2026", time: "19:30:00" },
  { competition: 9046, title: "ARES 46", weekday: "Vendredi", day: "11/12/2026", time: "20:00:00" },
  { competition: 9101, title: "ARES Marseille Janvier 2027", weekday: "Vendredi", day: "15/01/2027", time: "20:00:00" },
  { competition: 9102, title: "ARES Paris Février 2027", weekday: "Vendredi", day: "12/02/2027", time: "20:00:00" },
  { competition: 9047, title: "ARES 47", weekday: "Vendredi", day: "16/04/2027", time: "20:00:00" },
  { competition: 9103, title: "ARES Lyon Juin 2027", weekday: "Vendredi", day: "04/06/2027", time: "20:00:00" },
];

const aresBouts = (count, from) => Array.from({ length: count }, (_, i) =>
  ({ weight: WEIGHTS[(from + i) % WEIGHTS.length], left: person(from + 2 * i), right: person(from + 2 * i + 1) }));
const decided = (b, method, round, time, winner) => Object.assign({}, b, { result: { method, round, time, winner } });

const ares = JSON.stringify({
  upcoming: aresListingUpcoming(aresUpcoming),
  past: aresListingPast([
    { path: "/ares-44-fighting/", title: "ARES 44", day: "31/10/2026" },
    // Older than the pages bin/mma-api fetches: listed, but with no result page.
    { path: "/ares-43-fighting/", title: "ARES 43", day: "25/09/2026" },
  ]),
  cards: {
    9045: aresCardPage(aresUpcoming[0], [
      { weight: "Welterweight", title: true, left: named("Jordan Mercier", "11-1-0"), right: named("Bassir Tchamaev", "11-1-0") },
      ...aresBouts(5, 100),
    ]),
    9046: aresCardPage(aresUpcoming[1], aresBouts(3, 110)),
    9101: aresCardPage(aresUpcoming[2], aresBouts(2, 116)),
    // Announced, with a start time, but no bout yet.
    9102: aresCardPage(aresUpcoming[3], []),
    9047: aresCardPage(aresUpcoming[4], aresBouts(1, 120)),
  },
  results: {
    "/ares-44-fighting/": aresResultPage("ARES 44", [
      ["Main card", [
        decided({ weight: "Bantamweight", left: named("Abdoul Kasimov", "9-0-0"), right: named("Tyson Bae", "22-13-1") }, "TKO", 3, "3:21", "left"),
        decided(aresBouts(1, 122)[0], "Soumission", 1, "3:43", "left"),
        decided(aresBouts(1, 124)[0], "Décision partagée", 3, "5:00", "right"),
        decided(aresBouts(1, 126)[0], "Decision Unanime", 3, "5:00", "left"),
      ]],
      ["Prelims", [
        decided(aresBouts(1, 128)[0], "Decision majoritaire", 3, "5:00", "right"),
        decided(aresBouts(1, 130)[0], "KO", 1, "0:47", "left"),
        decided(aresBouts(1, 132)[0], "decision Unanime", 3, "5:00", "left"),
        decided(aresBouts(1, 134)[0], "TKO", 2, "4:10", "right"),
      ]],
    ]),
  },
});

// ------------------------------------------------------------------ Sherdog
// `bin/mma-api sherdog hxmma` prints { events: { path: page } }, the event
// pages linked from the organization's page. A page has the main event in a
// block of its own, then a table with one row per remaining bout. Methods read
// "Decision (Split)" or "TKO (Punches)".

function sherdogSide(p, result, title) {
  return [
    '<div class="fighter">',
    '  <h3><a href="/fighter/' + p.name.replace(/[^A-Za-z]+/g, "-") + '"><span itemprop="name">' + p.name + "</span></a></h3>",
    title ? '  <span class="title_fight">Title Fight</span>' : "",
    '  <span class="final_result ' + result + '">' + result + "</span>",
    '  <span class="record">' + p.record + "</span>",
    "</div>",
  ].filter(Boolean).join("\n");
}

const sherdogResults = (b) => (b.result ? (b.result.draw ? ["draw", "draw"] : ["win", "loss"]) : ["yet_to_come", "yet_to_come"]);

function sherdogMain(b) {
  const [a, c] = sherdogResults(b);
  const lines = ['<div class="fight_card">', sherdogSide(b.left, a, b.title), sherdogSide(b.right, c, false),
    '<span class="weight_class">' + b.weight + "</span>"];
  if (b.result) lines.push("<table><tr>",
    "<td><em>Method</em><br>" + b.result.method + "</td>",
    "<td><em>Round</em><br>" + b.result.round + "</td>",
    "<td><em>Time</em><br>" + b.result.time + "</td>",
    "</tr></table>");
  lines.push("</div>");
  return lines.join("\n");
}

function sherdogRow(b) {
  const [a, c] = sherdogResults(b);
  const lines = ['<tr itemprop="subEvent" itemscope itemtype="http://schema.org/Event">',
    "<td>" + sherdogSide(b.left, a, false) + "</td>",
    '<td><span class="weight_class">' + b.weight + "</span></td>",
    "<td>" + sherdogSide(b.right, c, false) + "</td>"];
  if (b.result) lines.push('<td class="winby"><b>' + b.result.method + "</b></td>", "<td>" + b.result.round + "</td>", "<td>" + b.result.time + "</td>");
  lines.push("</tr>");
  return lines.join("\n");
}

// `bouts` lists the main event first, as the page does.
function sherdogPage({ title, day, place, bouts }) {
  return [
    '<h1><span itemprop="name">' + title + "</span></h1>",
    '<div class="info"><span><meta itemprop="startDate" content="' + day + 'T00:00:00+00:00">' + day + "</span>",
    '<span itemprop="location">' + place + "</span></div>",
    bouts.length > 0 ? sherdogMain(bouts[0]) : "",
    '<div class="new_table_holder"><table>',
    ...bouts.slice(1).map(sherdogRow),
    "</table></div>",
  ].join("\n");
}

const hxBouts = (count, from) => Array.from({ length: count }, (_, i) =>
  ({ weight: WEIGHTS[(from + i) % WEIGHTS.length], left: person(from + 2 * i), right: person(from + 2 * i + 1) }));
const won = (b, method, round, time) => Object.assign({}, b, { result: { method, round, time } });
const HX_METHODS = [["Decision (Unanimous)", 3, "5:00"], ["Submission (Rear-Naked Choke)", 2, "2:41"], ["KO (Punch)", 1, "1:09"],
  ["Decision (Split)", 3, "5:00"], ["TKO (Punches)", 3, "0:58"]];
const hxFinished = (count, from) => hxBouts(count, from).map((b, i) => won(b, ...HX_METHODS[i % HX_METHODS.length]));

// Newest first, as bin/mma-api prints them.
const hxmma = JSON.stringify({ events: {
  "/events/HXMMA-49-Hexagone-MMA-49-900049": sherdogPage({
    title: "HXMMA 49 - Hexagone MMA 49", day: "2026-12-12", place: "Arena Loire, Nantes, France",
    bouts: [
      { weight: "Lightweight", title: true, left: named("Theo Lambrecht", "8-0-0"), right: named("Karim Ouali", "10-2-0") },
      ...hxBouts(5, 140),
    ],
  }),
  "/events/HXMMA-48-Hexagone-MMA-48-900048": sherdogPage({
    title: "HXMMA 48 - Hexagone MMA 48", day: "2026-11-07", place: "Palais des Sports, Lille, France",
    bouts: hxBouts(7, 152),
  }),
  "/events/HXMMA-47-Hexagone-MMA-47-900047": sherdogPage({
    title: "HXMMA 47 - Hexagone MMA 47", day: "2026-10-24", place: "Halle Garonne, Toulouse, France",
    bouts: [
      won({ weight: "Middleweight", left: named("Nicolae Ardelean", "12-3-0"), right: named("David Soria", "9-4-0") }, "TKO (Elbow and Punches)", 1, "4:02"),
      ...hxFinished(10, 166),
    ],
  }),
  "/events/HXMMA-46-Hexagone-MMA-46-Series-5-Rouen-900046": sherdogPage({
    title: "HXMMA 46 - Hexagone MMA 46: Series 5 Rouen", day: "2026-10-10", place: "Salle des Docks, Rouen, France",
    bouts: hxFinished(6, 186),
  }),
} });

module.exports = { ufcScoreboard, ufcCards, ufcSite334, pflScoreboard, pflLyonScoreboard, pflSiteLyon, ares, hxmma };
