process.env.TZ = "UTC";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");

// Model.js is a QML .pragma library; evaluate it as a plain script.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../Model.js", "utf8").replace(/^\.pragma.*$/m, ""), ctx);
// Objects built inside the vm context have that context's prototypes, which
// deepStrictEqual rejects, so results come back as plain JSON.
const M = {};
for (const name of Object.keys(ctx)) {
  M[name] = typeof ctx[name] === "function"
    ? (...args) => {
        const r = ctx[name](...args);
        return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : r;
      }
    : ctx[name];
}

const fixture = (name) => fs.readFileSync(__dirname + "/fixtures/" + name, "utf8");
const ufc = M.parseScoreboard(fixture("ufc-scoreboard.json"), "ufc");
const byName = (events, part) => events.find((e) => e.name.includes(part));

test("selectedOrganizations defaults to UFC only", () => {
  assert.deepStrictEqual(M.selectedOrganizations(undefined), ["ufc"]);
  assert.deepStrictEqual(M.selectedOrganizations("ufc"), ["ufc"]);
});

test("selectedOrganizations keeps an explicit choice and drops unfetchable ones", () => {
  assert.deepStrictEqual(M.selectedOrganizations(["pfl", "ufc"]), ["pfl", "ufc"]);
  assert.deepStrictEqual(M.selectedOrganizations(["one", "ufc", "nope", "ufc"]), ["ufc"]);
  assert.deepStrictEqual(M.selectedOrganizations([]), []);
});

test("toggleOrganization adds and removes enabled promotions only", () => {
  assert.deepStrictEqual(M.toggleOrganization(["ufc"], "pfl", true), ["ufc", "pfl"]);
  assert.deepStrictEqual(M.toggleOrganization(["pfl", "ufc"], "ufc", false), ["pfl"]);
  assert.deepStrictEqual(M.toggleOrganization(["ufc"], "ufc", false), []);
  assert.deepStrictEqual(M.toggleOrganization(["ufc"], "one", true), ["ufc"]);
});

test("UFC and PFL have bundled logos, and PFL is off by default", () => {
  assert.strictEqual(M.logoFor("ufc"), "assets/ufc.png");
  assert.strictEqual(M.logoFor("pfl"), "assets/pfl.png");
  assert.strictEqual(M.logoFor("one"), "");
  assert.deepStrictEqual(M.selectedOrganizations(undefined), ["ufc"]);
  for (const f of ["ufc", "pfl"]) assert.ok(fs.existsSync(__dirname + "/../assets/" + f + ".png"));
});

test("forOrganizations keeps only selected promotions' events", () => {
  const events = [{ org: "ufc" }, { org: "pfl" }];
  assert.deepStrictEqual(M.forOrganizations(events, ["pfl"]), [{ org: "pfl" }]);
  assert.deepStrictEqual(M.forOrganizations(events, []), []);
});

test("organizationOptions lists UFC, PFL, Cage Warriors and KSW", () => {
  const ids = M.organizationOptions().map((o) => o.value);
  assert.deepStrictEqual(ids, ["ufc", "pfl", "cw", "ksw"]);
});

test("setting clamps", () => {
  assert.strictEqual(M.clampEventLimit(0), 1);
  assert.strictEqual(M.clampEventLimit(999), 30);
  assert.strictEqual(M.clampEventLimit("x"), 10);
  assert.strictEqual(M.snapRefreshMinutes(1), 60);
  assert.strictEqual(M.snapRefreshMinutes("x"), 180);
  assert.strictEqual(M.snapLookaheadDays(100), 90);
  assert.strictEqual(M.knownTextSize("huge"), "medium");
  assert.strictEqual(M.knownTimeFormat("24h"), "24h");
  assert.strictEqual(M.knownTimeFormat("x"), "12h");
});

test("selectedOrganizations accepts the array-like lists the shell hands over", () => {
  const listLike = { length: 2, 0: "ufc", 1: "pfl" };
  assert.deepStrictEqual(Array.from(M.selectedOrganizations(listLike)), ["ufc", "pfl"]);
  assert.deepStrictEqual(Array.from(M.selectedOrganizations(["pfl"])), ["pfl"]);
  assert.deepStrictEqual(Array.from(M.selectedOrganizations([])), []);
  assert.deepStrictEqual(Array.from(M.selectedOrganizations(undefined)), ["ufc"]);
  assert.deepStrictEqual(Array.from(M.selectedOrganizations("pfl")), ["ufc"]);
});

test("dateRange spans yesterday to N days ahead", () => {
  assert.strictEqual(M.dateRange(new Date("2026-10-29T12:00:00Z"), 120), "20261028-20270226");
});

test("dates format in local time", () => {
  assert.strictEqual(M.formatDay("2026-11-14T22:00Z"), "Sat, Nov 14");
  assert.strictEqual(M.formatTime("2026-11-14T22:00Z", "12h"), "10:00 PM");
  assert.strictEqual(M.formatTime("2026-11-14T00:05Z", "12h"), "12:05 AM");
  assert.strictEqual(M.formatTime("2026-11-14T22:00Z", "24h"), "22:00");
  assert.strictEqual(M.formatDay("garbage"), "");
});

test("time zones", () => {
  // Nov 14 2026: US standard time, UK GMT, Sydney daylight time.
  assert.strictEqual(M.formatTime("2026-11-15T03:00Z", "12h", "America/New_York"), "10:00 PM");
  assert.strictEqual(M.formatDay("2026-11-15T03:00Z", "America/New_York"), "Sat, Nov 14");
  assert.strictEqual(M.formatDay("2026-11-15T03:00Z", "Asia/Tokyo"), "Sun, Nov 15");
  assert.strictEqual(M.formatTime("2026-11-15T03:00Z", "24h", "Australia/Sydney"), "14:00");
  assert.strictEqual(M.formatTime("2026-11-15T03:00Z", "24h", "Europe/London"), "03:00");
  // DST edges: US ET (Mar 8 and Nov 1 2026), EU (Mar 29 and Oct 25 2026).
  assert.strictEqual(M.formatTime("2026-07-04T00:00Z", "24h", "America/New_York"), "20:00");
  assert.strictEqual(M.formatTime("2026-03-08T06:59Z", "24h", "America/New_York"), "01:59");
  assert.strictEqual(M.formatTime("2026-03-08T07:00Z", "24h", "America/New_York"), "03:00");
  assert.strictEqual(M.formatTime("2026-11-01T05:59Z", "24h", "America/New_York"), "01:59");
  assert.strictEqual(M.formatTime("2026-11-01T06:00Z", "24h", "America/New_York"), "01:00");
  assert.strictEqual(M.formatTime("2026-03-29T00:59Z", "24h", "Europe/Paris"), "01:59");
  assert.strictEqual(M.formatTime("2026-03-29T01:00Z", "24h", "Europe/Paris"), "03:00");
  assert.strictEqual(M.formatTime("2026-10-25T01:00Z", "24h", "Europe/Paris"), "02:00");
  // Southern hemisphere: Sydney is AEST in July, AEDT in January; Auckland too.
  assert.strictEqual(M.formatTime("2026-07-01T00:00Z", "24h", "Australia/Sydney"), "10:00");
  assert.strictEqual(M.formatTime("2026-01-01T00:00Z", "24h", "Australia/Sydney"), "11:00");
  assert.strictEqual(M.formatTime("2026-01-01T00:00Z", "24h", "Pacific/Auckland"), "13:00");
  assert.strictEqual(M.formatTime("2026-07-01T00:00Z", "24h", "Pacific/Auckland"), "12:00");
  assert.strictEqual(M.formatTime("2026-07-01T00:00Z", "24h", "Asia/Kolkata"), "05:30");
  assert.strictEqual(M.knownTimeZone("Mars/Base"), "venue");
  assert.strictEqual(M.knownTimeZone("Asia/Tokyo"), "venue");
  assert.strictEqual(M.knownTimeZone("local"), "local");
  assert.strictEqual(M.formatTime("garbage", "12h", "Asia/Tokyo"), "");
  const now = new Date("2026-10-30T02:00Z"); // still Oct 29 in New York
  assert.strictEqual(M.relativeDay("2026-10-30T03:00Z", now, "America/New_York"), "Today");
  assert.strictEqual(M.relativeDay("2026-10-30T03:00Z", now, "Asia/Tokyo"), "Today");
  assert.strictEqual(M.relativeDay("2026-10-30T16:00Z", now, "Asia/Tokyo"), "Tomorrow");
});

test("venue time zones", () => {
  assert.strictEqual(M.zoneForAddress({ city: "Las Vegas", state: "NV", country: "USA" }), "America/Los_Angeles");
  assert.strictEqual(M.zoneForAddress({ city: "New York", state: "NY", country: "USA" }), "America/New_York");
  assert.strictEqual(M.zoneForAddress({ city: "Toronto", state: "ON", country: "Canada" }), "America/New_York");
  assert.strictEqual(M.zoneForAddress({ city: "Dubai", country: "United Arab Emirates" }), "Asia/Dubai");
  assert.strictEqual(M.zoneForAddress({ city: "Nowhere", country: "Atlantis" }), "");
  assert.strictEqual(M.zoneForAddress(null), "");
  const ev = { tz: "America/New_York" };
  assert.strictEqual(M.effectiveZone("venue", ev), "America/New_York");
  assert.strictEqual(M.effectiveZone("venue", { tz: "" }), "local");
  assert.strictEqual(M.effectiveZone("local", ev), "local");
  // Parsed events carry the zone of their venue and survive the cache.
  ufc.forEach((e) => assert.ok(M.zoneIds().includes(e.tz), e.venue));
  assert.ok(ufc.some((e) => e.tz === "America/Los_Angeles" || e.tz === "Asia/Dubai"));
  assert.strictEqual(M.sanitizeEvents(JSON.parse(JSON.stringify(ufc)))[0].tz, ufc[0].tz);
  assert.strictEqual(M.sanitizeEvents([{ ...ufc[0], tz: "venue" }])[0].tz, "");
  // A venue-zone event shows its local evening, not the viewer's.
  assert.strictEqual(M.formatTime("2026-11-15T03:00Z", "12h", M.effectiveZone("venue", ev)), "10:00 PM");
});

test("relativeDay", () => {
  const now = new Date("2026-10-29T08:00:00Z");
  assert.strictEqual(M.relativeDay("2026-10-29T23:00Z", now), "Today");
  assert.strictEqual(M.relativeDay("2026-10-30T01:00Z", now), "Tomorrow");
  assert.strictEqual(M.relativeDay("2026-11-02T01:00Z", now), "in 4 days");
  assert.strictEqual(M.relativeDay("2026-11-26T01:00Z", now), "in 4 weeks");
  assert.strictEqual(M.relativeDay("2026-10-20T01:00Z", now), "");
});

test("parseScoreboard returns date-ordered events with metadata", () => {
  assert.deepStrictEqual(ufc.map((e) => e.date), ["2026-10-31T21:00Z", "2026-11-14T22:00Z", "2027-01-30T22:00Z"]);
  const e = byName(ufc, "UFC 334");
  assert.strictEqual(e.org, "ufc");
  assert.strictEqual(e.orgLabel, "UFC");
  assert.strictEqual(e.fightCount, 14);
  assert.ok(e.venue.length > 0);
  assert.strictEqual(M.headlinerText(e), "C. Gane vs J. Hokit");
});

test("parseScoreboard tolerates garbage and flags finished events", () => {
  assert.deepStrictEqual(M.parseScoreboard("not json", "ufc"), []);
  assert.deepStrictEqual(M.parseScoreboard("{}", "ufc"), []);
  const done = { events: [{ id: "1", name: "Old", date: "2020-01-01T00:00Z", status: { type: { name: "STATUS_FINAL" } }, competitions: [] }] };
  assert.strictEqual(M.parseScoreboard(done, "ufc")[0].finished, true);
  done.events[0].status.type.name = "STATUS_CANCELED";
  assert.deepStrictEqual(M.parseScoreboard(done, "ufc"), []);
});

test("knownKeepDays only accepts 1, 3 or 7", () => {
  assert.strictEqual(M.knownKeepDays(7), 7);
  assert.strictEqual(M.knownKeepDays("3"), 3);
  assert.strictEqual(M.knownKeepDays(5), 1);
});

test("visibleEvents keeps finished events for the chosen days, in date order", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const ev = (id, date, finished) => ({ id, date, finished });
  const list = [ev("a", "2026-11-09T22:00:00Z", true), ev("b", "2026-11-05T22:00:00Z", true), ev("c", "2026-11-20T22:00:00Z", false)];
  const ids = (days) => M.visibleEvents(list, now, days).map((e) => e.id);
  assert.deepStrictEqual(ids(1), ["a", "c"]);
  assert.deepStrictEqual(ids(3), ["a", "c"]);
  assert.deepStrictEqual(ids(7), ["b", "a", "c"]);
  assert.strictEqual(M.nextEvent(M.visibleEvents(list, now, 7)).id, "c");
  assert.strictEqual(M.nextEvent([ev("a", "x", true)]), null);
});

test("the challenger is always on the right, whatever order ESPN lists them in", () => {
  const e = byName(ufc, "Moicano");
  // The scoreboard lists Lisboa (order 2) before Szabova (order 1).
  const first = e.fights[0];
  assert.strictEqual(first.fighters[0].name, "Lucia Szabová");
  assert.strictEqual(first.fighters[1].name, "Tainara Lisboa");
  const main = e.fights[e.fights.length - 1];
  assert.strictEqual(main.fighters[0].name, "Renato Moicano");
  assert.strictEqual(main.fighters[1].name, "Tom Nolan");
  // Every fight on every fixture card follows the rule.
  for (const ev of ufc) for (const f of ev.fights) assert.ok(f.fighters.length === 2);
});

test("sortedFighters uses order, not position, and pads a missing side", () => {
  const out = M.sortedFighters([
    { order: 2, athlete: { displayName: "B" } },
    { order: 1, athlete: { displayName: "A" } },
  ]);
  assert.deepStrictEqual(out.map((f) => f.name), ["A", "B"]);
  const single = M.sortedFighters([{ order: 1, athlete: { displayName: "A" } }]);
  assert.strictEqual(single[1].name, "TBA");
  assert.strictEqual(M.sortedFighters(undefined)[0].name, "TBA");
});

test("sortedFighters falls back to list position when order is missing", () => {
  const out = M.sortedFighters([{ athlete: { displayName: "X" } }, { athlete: { displayName: "Y" } }]);
  assert.deepStrictEqual(out.map((f) => f.name), ["X", "Y"]);
});

test("fighter records and TBA", () => {
  const e = byName(ufc, "UFC 334");
  const main = e.fights[e.fights.length - 1];
  assert.strictEqual(main.fighters[0].record, "14-2-0");
  assert.strictEqual(main.fighters[1].record, "10-0-0");
  const tba = byName(ufc, "UFC 336").fights[0];
  assert.strictEqual(tba.fighters[0].name, "TBA");
  assert.strictEqual(tba.fighters[0].record, "");
});

test("parseSegments reads the core API's card segments", () => {
  const seg = M.parseSegments(fixture("ufc-334-cards.json"));
  assert.strictEqual(Object.keys(seg).length, 14);
  assert.strictEqual(seg["401913646"].segment, "main");
  assert.strictEqual(seg["401913646"].matchNumber, 1);
  assert.strictEqual(seg["401932013"].segment, "prelims2");
  assert.deepStrictEqual(M.parseSegments("nope"), {});
});

test("buildCard puts the main card first, prelims after, main event on top", () => {
  const e = byName(ufc, "UFC 334");
  const card = M.buildCard(e, M.parseSegments(fixture("ufc-334-cards.json")));
  assert.deepStrictEqual(card.map((s) => s.label), ["Main Card", "Prelims", "Early Prelims"]);
  assert.deepStrictEqual(card.map((s) => s.fights.length), [5, 4, 5]);
  const main = card[0].fights;
  assert.match(M.fightTitle(main[0]), /Gane vs .*Hokit/);
});

test("buildCard orders by matchNumber within a section", () => {
  const e = byName(ufc, "UFC 334");
  const card = M.buildCard(e, M.parseSegments(fixture("ufc-334-cards.json")));
  for (const s of card) {
    const nums = s.fights.map((f) => f.matchNumber);
    assert.deepStrictEqual(nums, nums.slice().sort((a, b) => a - b));
  }
  assert.strictEqual(card[0].fights[0].matchNumber, 1);
});

test("buildCard keeps the challenger on the right in every section", () => {
  const e = byName(ufc, "UFC 334");
  const card = M.buildCard(e, M.parseSegments(fixture("ufc-334-cards.json")));
  const main = card[0].fights[0];
  assert.strictEqual(main.fighters[0].shortName, "C. Gane");
  assert.strictEqual(main.fighters[1].shortName, "J. Hokit");
});

test("buildCard falls back to start times when segments are missing", () => {
  const e = byName(ufc, "Moicano");
  const card = M.buildCard(e, {});
  assert.deepStrictEqual(card.map((s) => s.label), ["Main Card", "Prelims"]);
  assert.strictEqual(card[0].fights.length, 5);
  assert.strictEqual(card[1].fights.length, 7);
  // The headliner leads the main card.
  assert.strictEqual(M.fightTitle(card[0].fights[0]), "Renato Moicano vs Tom Nolan");
});

test("buildCard with one start time is a single main card", () => {
  const e = { fights: [
    { id: "1", startDate: "2026-11-01T00:00Z", fighters: M.sortedFighters([]) },
    { id: "2", startDate: "2026-11-01T00:00Z", fighters: M.sortedFighters([]) },
  ] };
  const card = M.buildCard(e, {});
  assert.deepStrictEqual(card.map((s) => s.label), ["Main Card"]);
  assert.deepStrictEqual(card[0].fights.map((f) => f.id), ["2", "1"]);
});

test("events carry their ESPN page", () => {
  assert.match(byName(ufc, "UFC 334").url, /^https:\/\/www\.espn\.com\/mma\/fightcenter\//);
  assert.strictEqual(M.eventUrl({ links: [{ rel: ["x"], href: "https://a" }] }), "");
  assert.strictEqual(M.eventUrl({ links: [{ rel: ["event"], href: "javascript:alert(1)" }] }), "");
});

test("sectionStart and isMainEvent", () => {
  const card = M.buildCard(byName(ufc, "Moicano"), {});
  assert.strictEqual(M.sectionStart(card[0]), "2026-11-01T00:00Z");
  assert.strictEqual(M.sectionStart(card[1]), "2026-10-31T21:00Z");
  assert.strictEqual(M.sectionStart({ fights: [] }), "");
  assert.ok(M.isMainEvent(card[0], 0));
  assert.ok(!M.isMainEvent(card[0], 1));
  assert.ok(!M.isMainEvent(card[1], 0));
  const seg = M.buildCard(byName(ufc, "UFC 334"), M.parseSegments(fixture("ufc-334-cards.json")));
  assert.ok(M.isMainEvent(seg[0], 0));
  assert.ok(!M.isMainEvent(seg[1], 0));
});

test("PFL fixture parses and builds a card", () => {
  const pfl = M.parseScoreboard(fixture("pfl-scoreboard.json"), "pfl");
  assert.strictEqual(pfl.length, 1);
  assert.strictEqual(pfl[0].orgLabel, "PFL");
  assert.ok(M.buildCard(pfl[0], {}).length >= 1);
});

test("mergeEvents interleaves organizations by date and limits", () => {
  const pfl = M.parseScoreboard(fixture("pfl-scoreboard.json"), "pfl");
  const merged = M.mergeEvents([ufc, pfl], 30);
  const dates = merged.map((e) => new Date(e.date).getTime());
  assert.deepStrictEqual(dates, dates.slice().sort((a, b) => a - b));
  assert.strictEqual(merged.length, ufc.length + pfl.length);
  assert.strictEqual(M.mergeEvents([ufc, pfl], 2).length, 2);
});

test("cache round-trips and rejects other versions", () => {
  const text = M.serializeCache(ufc, 123);
  const back = M.parseCache(text);
  assert.strictEqual(back.fetchedAt, 123);
  assert.strictEqual(back.events.length, ufc.length);
  // Real ESPN data survives the sanitizer unchanged.
  assert.deepStrictEqual(back.events, ufc);
  assert.strictEqual(M.parseCache("{}"), null);
  assert.strictEqual(M.parseCache("junk"), null);
});

test("safeUrl accepts https only", () => {
  assert.strictEqual(M.safeUrl("https://www.espn.com/mma/x?a=1&b=2"), "https://www.espn.com/mma/x?a=1&b=2");
  for (const bad of ["http://espn.com", "javascript:alert(1)", "file:///etc/passwd", "https://a b", "https://a\"b", "", null, undefined, 42])
    assert.strictEqual(M.safeUrl(bad), "");
});

test("a tampered cache cannot smuggle URLs, logos, or shell arguments", () => {
  const good = JSON.parse(JSON.stringify(ufc[0]));
  const evil = JSON.parse(JSON.stringify(ufc[0]));
  evil.id = "1; rm -rf ~";
  const badUrl = JSON.parse(JSON.stringify(ufc[0]));
  badUrl.url = "file:///etc/passwd";
  badUrl.logo = "file:///etc/passwd";
  badUrl.slug = "../../x";
  badUrl.orgLabel = "<b>x</b>";
  badUrl.fights[0].id = "--data @/etc/passwd";
  badUrl.fights[1].fighters = "nope";
  badUrl.fights.push("junk", null, { id: "7" });
  const unknownOrg = JSON.parse(JSON.stringify(ufc[0]));
  unknownOrg.org = "zzz";
  const cached = M.parseCache(M.serializeCache([good, evil, badUrl, unknownOrg, "x", null, 7], 1)).events;
  assert.strictEqual(cached.length, 2);
  assert.deepStrictEqual(cached[0], ufc[0]);
  const fixed = cached[1];
  assert.strictEqual(fixed.url, "");
  assert.strictEqual(fixed.logo, "assets/ufc.png");
  assert.strictEqual(fixed.slug, "ufc");
  assert.strictEqual(fixed.orgLabel, "UFC");
  // The fight with a bad id and the junk entries are gone; the bare one is padded.
  assert.strictEqual(fixed.fights.length, ufc[0].fights.length);
  for (const f of fixed.fights) {
    assert.match(f.id, /^[0-9]+$/);
    assert.strictEqual(f.fighters.length, 2);
  }
  assert.strictEqual(fixed.fights[0].id, ufc[0].fights[1].id);
  assert.strictEqual(fixed.fights[0].fighters[0].name, "TBA");
  assert.strictEqual(fixed.fights[fixed.fights.length - 1].id, "7");
  assert.strictEqual(fixed.headliner.id, "7");
  assert.strictEqual(M.sanitizeEvents("not a list").length, 0);
});

test("upcomingOnly drops events that began long ago", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const kept = M.upcomingOnly(ufc, now).map((e) => e.date);
  assert.deepStrictEqual(kept, ["2027-01-30T22:00Z"]);
});

test("weightClassLabel and errorMessage", () => {
  assert.strictEqual(M.weightClassLabel({ weightClass: "Heavyweight", rounds: 5 }), "Heavyweight · 5 rds");
  assert.strictEqual(M.weightClassLabel({ weightClass: "", rounds: 0 }), "");
  assert.strictEqual(M.errorMessage("curl: (6) Could not resolve host\n", 6), "curl: (6) Could not resolve host");
  assert.strictEqual(M.errorMessage("", 22), "Request failed (22)");
});

test("a title fight gets a crown next to the fight details", () => {
  const segs = M.parseSegments(fs.readFileSync(__dirname + "/fixtures/ufc-334-cards.json", "utf8"));
  const champs = Object.keys(segs).filter((id) => segs[id].champion);
  assert.strictEqual(champs.length, 2);
  const f = { champion: true, fighters: [{ name: "Ciryl Gane" }, { name: "Josh Hokit" }] };
  assert.strictEqual(M.crownFor(f), "👑 ");
  assert.strictEqual(M.crownFor({ champion: false, fighters: f.fighters }), "");
  assert.doesNotMatch(M.weightClassLabel({ weightClass: "Heavyweight", rounds: 5, champion: true }), /\uD83D/);
});

test("interim and non-title fights have no champion", () => {
  const seg = (text) => M.parseSegments([{ id: 1, types: text ? [{ text }] : [] }])["1"].champion;
  assert.strictEqual(seg("UFC Heavyweight Title"), true);
  assert.strictEqual(seg("UFC Interim Welterweight Title"), false);
  assert.strictEqual(seg(""), false);
});

// ESPN's JSON is parsed for its shape as well as its syntax: a list that comes
// back as an object or a string must not throw, since an exception in the
// service's process handler would leave it loading forever.
test("parseScoreboard survives fields of the wrong type", () => {
  const shapes = [
    { events: [null, "x", 7, { id: 1, competitions: {} }] },
    { events: [{ id: 1, competitions: [null, "x", { id: 2, competitors: {} }] }] },
    { events: [{ id: 1, competitions: [{ id: 2, competitors: [null, { records: "abc" }, { athlete: { flag: 5 }, order: "z" }] }] }] },
    { events: [{ id: 1, competitions: [{ id: 2, broadcasts: [{ names: "abc" }, "x"] }] }] },
    { events: [{ id: 1, competitions: [{ id: 2, broadcasts: "abc", venue: "x", format: { regulation: "x" }, type: 5, status: { type: null } }] }] },
    { events: [{ id: 1, links: "x", venues: "x", status: { type: null } }] },
    { events: [{ id: 1, links: [null, { rel: 5, href: "https://a.b/c" }, { rel: "event", href: "https://a.b/c" }] }] },
  ];
  for (const s of shapes) {
    const events = M.parseScoreboard(s, "ufc");
    assert.ok(Array.isArray(events), JSON.stringify(s));
    for (const e of events) {
      assert.strictEqual(e.url, "");
      for (const f of e.fights) assert.strictEqual(f.fighters.length, 2);
    }
  }
  // A string rel is not a list, so it is not the event link.
  assert.strictEqual(M.parseScoreboard({ events: [{ id: 1, links: [{ rel: ["event"], href: "https://a.b/c" }] }] }, "ufc")[0].url, "https://a.b/c");
});

test("parseSegments and buildCard survive fields of the wrong type", () => {
  for (const s of [[{ id: 1, types: "abc" }], [{ id: 1, types: {} }], [{ id: 1, cardSegment: null }], [{ id: 1, cardSegment: "x" }], ["abc", null, 7]]) {
    const map = M.parseSegments(s);
    for (const k in map) assert.strictEqual(map[k].champion, false);
  }
  assert.deepStrictEqual(M.buildCard({ fights: {} }, {}), []);
  assert.deepStrictEqual(M.buildCard({ fights: "abc" }, null), []);
  assert.deepStrictEqual(M.buildCard(null, {}), []);
});

test("an event's fights are capped, from the API and from the cache", () => {
  const many = { events: [{ id: 1, competitions: Array.from({ length: 200 }, (_, i) => ({ id: i + 1 })) }] };
  const e = M.parseScoreboard(many, "ufc")[0];
  assert.strictEqual(e.fights.length, M.maxFightsPerEvent);
  assert.strictEqual(e.fightCount, M.maxFightsPerEvent);
  const cached = { id: "1", org: "ufc", fights: Array.from({ length: 200 }, (_, i) => ({ id: String(i + 1) })) };
  assert.strictEqual(M.parseCache(M.serializeCache([cached], 1)).events[0].fights.length, M.maxFightsPerEvent);
});

test("finished fights name a winner and show how long they lasted", () => {
  const comp = (completed, winners) => ({
    id: "9",
    status: { period: 3, displayClock: "3:26", type: { name: completed ? "STATUS_FINAL" : "STATUS_SCHEDULED", completed } },
    competitors: winners.map((winner, i) => ({ order: i + 1, winner, athlete: { displayName: "Fighter " + (i + 1) } })),
  });
  const parse = (c) => M.parseScoreboard({ events: [{ id: "1", name: "X", date: "2026-10-01T00:00Z", competitions: [c] }] }, "ufc")[0].fights[0];

  const left = parse(comp(true, [true, false]));
  assert.deepStrictEqual([M.outcome(left, 0), M.outcome(left, 1)], ["win", "loss"]);
  assert.strictEqual(M.resultLabel(left), "R3 3:26");

  const right = parse(comp(true, [false, true]));
  assert.deepStrictEqual([M.outcome(right, 0), M.outcome(right, 1)], ["loss", "win"]);

  // A draw or no-contest is final, but neither side won.
  const draw = parse(comp(true, [false, false]));
  assert.deepStrictEqual([M.outcome(draw, 0), M.outcome(draw, 1)], ["none", "none"]);

  const upcoming = parse(comp(false, [false, false]));
  assert.deepStrictEqual([M.outcome(upcoming, 0), M.outcome(upcoming, 1)], ["none", "none"]);
  assert.strictEqual(M.resultLabel(upcoming), "");

  // The result survives the cache.
  const event = { id: "1", org: "ufc", name: "X", date: "2026-10-01T00:00Z", fights: [left] };
  const back = M.parseCache(M.serializeCache([event], 1)).events[0].fights[0];
  assert.strictEqual(back.done, true);
  assert.strictEqual(M.resultLabel(back), "R3 3:26");
  assert.strictEqual(M.outcome(back, 0), "win");
});

test("the card says how a finished fight was won", () => {
  const status = (id, result) => ({ "$ref": `http://x/events/1/competitions/${id}/status?lang=en`, period: 3, result });
  const seg = M.parseSegments(JSON.stringify([
    status("1", { displayName: "KO/TKO", description: "Punch" }),
    { id: "1", cardSegment: { name: "main" }, matchNumber: 1 },
    { id: "2", cardSegment: { name: "main" }, matchNumber: 2 },
    { id: "3", cardSegment: { name: "main" }, matchNumber: 3 },
    status("2", { displayName: "Decision - Split", shortDisplayName: "S Dec" }),
    status("3", { displayName: "Submission", description: "Rear Naked Choke" }),
    status("99", { displayName: "KO/TKO" }),
  ]));
  assert.strictEqual(seg["1"].method, "KO/TKO (Punch)");
  assert.strictEqual(seg["2"].method, "Split Decision");
  assert.strictEqual(seg["3"].method, "Submission (Rear Naked Choke)");
  assert.strictEqual(seg["99"], undefined);

  const fight = { id: "1", done: true, round: 3, clock: "3:26", fighters: [{}, {}] };
  const card = M.buildCard({ fights: [fight] }, seg);
  assert.strictEqual(M.resultLabel(card[0].fights[0]), "R3 3:26 KO/TKO (Punch)");
  assert.strictEqual(M.resultLabel(M.buildCard({ fights: [fight] }, {})[0].fights[0]), "R3 3:26");
  assert.strictEqual(M.resultLabel({ done: true, round: 5, clock: "5:00", method: "Unanimous Decision" }), "Unanimous Decision");
  assert.strictEqual(M.resultLabel({ done: true, round: 3, clock: "5:00", method: "Split Decision" }), "Split Decision");
});

// ------------------------------------------------------- Cage Warriors (Wikipedia)

// The saved "2026 in Cage Warriors" page, as bin/mma-api wiki prints it (an
// array of API answers). 2027 does not exist yet, so its answer is an error.
const wikiPage = fixture("cw-2026-wiki.json");
const wikiAnswers = JSON.stringify([JSON.parse(wikiPage), { error: { code: "missingtitle" } }]);
const NOW = Date.parse("2026-11-02T12:00:00Z");
const cw = M.parseWikipedia(wikiAnswers, "cw", NOW, 365);
const cwEvent = (n) => cw.find((e) => e.name.startsWith("Cage Warriors " + n));

test("Cage Warriors: every event of the year is read, in date order, a missing year skipped", () => {
  assert.strictEqual(cw.length, 17);
  assert.strictEqual(cw[0].name, "Cage Warriors 200: Dublin");
  assert.strictEqual(cw[16].name, "Cage Warriors 216: Newcastle");
  assert.deepStrictEqual(cw.map((e) => e.date), cw.map((e) => e.date).slice().sort());
  assert.strictEqual(new Set(cw.map((e) => e.id)).size, 17);
  assert.ok(cw.every((e) => /^[0-9]+$/.test(e.id) && e.org === "cw" && e.inline && e.dateOnly));
});

test("Cage Warriors: bad input gives no events instead of throwing", () => {
  for (const bad of ["", "nope", "[]", "{}", "[null, 3, {\"parse\": 1}]", JSON.stringify([{ parse: { wikitext: "== x ==\n{{Infobox MMA event\n}}" } }])])
    assert.deepStrictEqual(M.parseWikipedia(bad, "cw", NOW, 365), []);
});

test("Cage Warriors: event details and time zone", () => {
  const e = cwEvent(211);
  assert.strictEqual(e.name, "Cage Warriors 211: Rome");
  assert.strictEqual(e.shortName, "Cage Warriors 211");
  assert.strictEqual(e.date, "2026-10-17T12:00:00.000Z");
  assert.strictEqual(e.venue, "PalaPellicone · Rome, Italy");
  assert.strictEqual(e.tz, "Europe/Paris");
  assert.strictEqual(e.url, "https://en.wikipedia.org/wiki/2026_in_Cage_Warriors#Cage_Warriors_211");
  assert.strictEqual(cwEvent(213).tz, "Europe/London");
  assert.strictEqual(e.logo, "assets/cw.png");
  assert.strictEqual(e.orgLabel, "Cage Warriors");
  // The logo slot is a small square: the tag must be short enough to fit it.
  assert.strictEqual(e.orgTag, "CW");
});

test("Cage Warriors: past events are finished, upcoming ones are not", () => {
  assert.strictEqual(cwEvent(211).finished, true);
  assert.strictEqual(cwEvent(212).finished, false);
  assert.strictEqual(M.nextEvent(cw).name, "Cage Warriors 212: Spanish Showcase");
});

test("Cage Warriors: events beyond the look-ahead are dropped", () => {
  const near = M.parseWikipedia(wikiAnswers, "cw", NOW, 30);
  assert.deepStrictEqual(near.filter((e) => !e.finished).map((e) => e.shortName),
    ["Cage Warriors 212", "Cage Warriors 213", "Cage Warriors 214", "Cage Warriors 215"]);
});

test("Cage Warriors: a finished card has segments, order, winners and how each fight ended", () => {
  const sections = M.buildCard(cwEvent(211), {});
  assert.deepStrictEqual(sections.map((s) => s.label), ["Main Card", "Prelims"]);
  assert.strictEqual(sections[0].fights.length, 5);
  assert.strictEqual(sections[1].fights.length, 6);
  const main = sections[0].fights[0];
  assert.strictEqual(M.isMainEvent(sections[0], 0), true);
  assert.deepStrictEqual([main.fighters[0].name, main.fighters[1].name], ["Dario Bellandi", "Aldo Pereira"]);
  assert.strictEqual(main.weightClass, "Middleweight");
  assert.strictEqual(M.outcome(main, 0), "win");
  assert.strictEqual(M.outcome(main, 1), "loss");
  assert.strictEqual(M.resultLabel(main), "R2 0:13 TKO (punches)");
  assert.strictEqual(M.headlinerText(cwEvent(211)), "Dario Bellandi vs Aldo Pereira");
  const labels = sections.flatMap((s) => s.fights).map((f) => M.resultLabel(f));
  assert.ok(labels.includes("Unanimous Decision"));
  assert.ok(labels.includes("R3 5:00 Split Draw"));
});

test("Cage Warriors: a draw has no winner or loser", () => {
  const draw = M.buildCard(cwEvent(211), {}).flatMap((s) => s.fights).find((f) => /Draw/.test(f.method));
  assert.strictEqual(M.outcome(draw, 0), "none");
  assert.strictEqual(M.outcome(draw, 1), "none");
});

test("Cage Warriors: an announced card has every bout, the title fight crowned, and no results", () => {
  const e = cwEvent(213);
  const sections = M.buildCard(e, {});
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].fights.length, 8);
  const [main, second] = sections[0].fights;
  assert.deepStrictEqual([main.fighters[0].name, main.fighters[1].name], ["Nik Bagley", "Bruno Souza"]);
  assert.strictEqual(main.champion, true);
  // An interim title is not a champion yet, so no crown.
  assert.strictEqual(second.champion, false);
  assert.ok(e.fights.every((f) => !f.done && M.resultLabel(f) === "" && M.outcome(f, 0) === "none"));
});

test("Cage Warriors: events show the day only, never an invented time", () => {
  const e = cwEvent(213);
  assert.strictEqual(M.whenText(e, "12h", "Europe/London"), "Sat, Nov 14");
  assert.strictEqual(M.whenText(e, "24h", "local"), "Sat, Nov 14");
  assert.strictEqual(M.whenText({ date: "2026-10-31T21:00Z" }, "24h", "local"), "Sat, Oct 31 · 21:00");
  assert.strictEqual(M.sectionStart(M.buildCard(e, {})[0]), "");
});

test("Cage Warriors: a cancelled event is dropped", () => {
  const page = JSON.parse(wikiPage);
  page.parse.wikitext = page.parse.wikitext.replace("is an upcoming [[mixed martial arts]] event promoted by [[Cage Warriors]] that is scheduled", "was a [[mixed martial arts]] event, now cancelled, that was scheduled");
  const events = M.parseWikipedia([page], "cw", NOW, 365);
  assert.ok(events.length < 17);
});

test("Cage Warriors: events survive the cache with their card and no extra trust", () => {
  const back = M.parseCache(M.serializeCache(cw, 1)).events;
  assert.deepStrictEqual(back, cw.map((e) => JSON.parse(JSON.stringify(e))));
  assert.deepStrictEqual(M.buildCard(back[10], {}), M.buildCard(cw[10], {}));
});

// ------------------------------------------------------------ KSW (Wikipedia)

const kswAnswers = JSON.stringify([JSON.parse(fixture("ksw-2026-wiki.json")), { error: { code: "missingtitle" } }]);
const ksw = M.parseWikipedia(kswAnswers, "ksw", NOW, 120);

test("KSW: the year's events are read from plain-text dates, in order", () => {
  assert.strictEqual(ksw.length, 11);
  assert.strictEqual(ksw[0].shortName, "KSW 114");
  assert.strictEqual(ksw[0].date, "2026-01-17T12:00:00.000Z");
  assert.strictEqual(ksw[10].name, "XTB KSW 124: Pawlak vs. Kuberski");
  assert.ok(ksw.every((e) => e.org === "ksw" && e.orgTag === "KSW" && e.inline && e.dateOnly && e.tz === "Europe/Paris"));
  assert.ok(ksw.slice(0, 9).every((e) => e.finished) && !ksw[9].finished && !ksw[10].finished);
});

test("KSW: an announced card has its title fights and no result", () => {
  const e = ksw[10];
  assert.strictEqual(e.venue, "Gliwice Arena · Gliwice, Poland");
  assert.strictEqual(e.headliner.champion, true);
  assert.deepStrictEqual(e.headliner.fighters.map((f) => f.name), ["Paweł Pawlak", "Piotr Kuberski"]);
  assert.ok(e.fights.every((f) => !f.done && f.method === ""));
});

test("KSW and Cage Warriors never share an event id", () => {
  const ids = new Set(cw.map((e) => e.id));
  assert.ok(ksw.every((e) => /^[0-9]+$/.test(e.id) && !ids.has(e.id)));
});

test("wikiDate reads the template and both plain-text forms, and rejects nonsense", () => {
  const iso = "2026-11-21T12:00:00.000Z";
  assert.strictEqual(M.wikiDate("{{start date|2026|11|21}}"), iso);
  assert.strictEqual(M.wikiDate("November 21, 2026"), iso);
  assert.strictEqual(M.wikiDate(" 21 November 2026 "), iso);
  for (const bad of ["", "TBA", "Smarch 3, 2026", "February 31, 2026"]) assert.strictEqual(M.wikiDate(bad), "");
});

test("wikiYears covers the window, a year boundary included", () => {
  assert.deepStrictEqual(M.wikiYears(new Date("2026-11-02T00:00:00Z"), 120, 2), ["2026", "2027"]);
  assert.deepStrictEqual(M.wikiYears(new Date("2026-06-02T00:00:00Z"), 30, 2), ["2026"]);
  assert.deepStrictEqual(M.wikiYears(new Date("2027-01-02T00:00:00Z"), 30, 4), ["2026", "2027"]);
});

test("tagFor gives a short tag, and falls back to the label or id", () => {
  assert.strictEqual(M.tagFor("cw"), "CW");
  assert.strictEqual(M.tagFor("ufc"), "UFC");
  assert.strictEqual(M.tagFor("zzz"), "ZZZ");
  for (const p of M.promotions) assert.ok(M.tagFor(p.id).length <= 4, p.id);
});

test("ESPN events carry their tag too", () => {
  assert.ok(ufc.every((e) => e.orgTag === "UFC"));
});

test("ESPN events are timed and fetch their card separately", () => {
  assert.ok(ufc.length > 0);
  assert.ok(ufc.every((e) => e.dateOnly === false && e.inline === false));
});

test("providerOf: Cage Warriors and KSW read Wikipedia, the others ESPN", () => {
  assert.strictEqual(M.providerOf("cw"), "wikipedia");
  assert.strictEqual(M.providerOf("ksw"), "wikipedia");
  assert.strictEqual(M.providerOf("ufc"), "espn");
  assert.strictEqual(M.providerOf("nope"), "espn");
});

test("wikiMethod keeps how it ended and drops judges' scores", () => {
  assert.strictEqual(M.wikiMethod("Decision (unanimous) (29–28, 29–28, 29–28)"), "Unanimous Decision");
  assert.strictEqual(M.wikiMethod("Decision (majority) (28–28, 29–27, 29–27)"), "Majority Decision");
  assert.strictEqual(M.wikiMethod("Draw (split) (27–29, 29–27, 28–28)"), "Split Draw");
  assert.strictEqual(M.wikiMethod("[[Technical knockout|TKO]] (punches)"), "TKO (punches)");
  assert.strictEqual(M.wikiMethod(""), "");
});

test("parseRecords keeps only values shaped like a record", () => {
  const text = JSON.stringify({
    "Nik Bagley": "10-1-0",
    "Anderson Silva": "34-11-0 (1 NC)",
    "Namesake": "n/a",
    "Refused": "blocked",
    "Bad One": "<script>",
    "Number": 5
  });
  assert.deepStrictEqual(M.parseRecords(text), {
    "Nik Bagley": "10-1-0", "Anderson Silva": "34-11-0 (1 NC)", "Namesake": "n/a", "Refused": "blocked"
  });
  assert.deepStrictEqual(M.parseRecords("not json"), {});
  assert.deepStrictEqual(M.parseRecords("[]"), {});
});

test("Cage Warriors fighters start without a record and take the ones found", () => {
  const event = cw.find((e) => e.fights.length > 0);
  const names = M.namesNeedingRecords(event, {});
  assert.ok(names.length >= 2);
  assert.strictEqual(new Set(names).size, names.length);
  assert.ok(!names.includes("TBA"));
  assert.ok(event.fights.every((f) => f.fighters.every((x) => x.record === "")));

  const filled = M.withRecords(event, { [names[0]]: "10-1-0" });
  const got = filled.fights.flatMap((f) => f.fighters).filter((x) => x.record !== "");
  assert.deepStrictEqual(got.map((x) => [x.name, x.record]), [[names[0], "10-1-0"]]);
  // The original event is left alone, and a fighter already known is skipped.
  assert.ok(event.fights.every((f) => f.fighters.every((x) => x.record === "")));
  assert.ok(!M.namesNeedingRecords(event, { [names[0]]: "10-1-0" }).includes(names[0]));
  // The card built from it carries the record through to the panel.
  const card = M.buildCard(filled, {});
  const shown = card.flatMap((s) => s.fights).flatMap((f) => f.fighters).filter((x) => x.record !== "");
  assert.strictEqual(shown.length, 1);
});

test("once the lookup is settled, fighters still without a record are flagged", () => {
  const event = cw.find((e) => e.fights.length > 0);
  const [first] = M.namesNeedingRecords(event, {});
  const flags = (e) => e.fights.flatMap((f) => f.fighters).filter((x) => x.recordMissing).map((x) => x.name);
  const pending = (e) => e.fights.flatMap((f) => f.fighters).filter((x) => x.recordPending).map((x) => x.name);
  assert.deepStrictEqual(flags(M.withRecords(event, {})), []);
  // While the lookup runs everyone without a record is pending, then nobody is.
  assert.strictEqual(pending(M.withRecords(event, {})).length, M.namesNeedingRecords(event, {}).length);
  assert.deepStrictEqual(pending(M.withRecords(event, {}, true)), []);
  assert.ok(!pending(M.withRecords(event, { [first]: "10-1-0" })).includes(first));
  const settled = M.withRecords(event, { [first]: "10-1-0" }, true);
  assert.ok(!flags(settled).includes(first));
  assert.strictEqual(flags(settled).length, M.namesNeedingRecords(event, {}).length - 1);
  // ESPN events are never flagged: their records come with the scoreboard.
  assert.deepStrictEqual(flags(M.withRecords(byName(ufc, "UFC"), {}, true)), []);
});

test("a missing record is told apart: blocked by the vendor, or simply N/A", () => {
  const event = cw.find((e) => e.fights.length > 0);
  const [a, b, c] = M.namesNeedingRecords(event, {});
  const settled = M.withRecords(event, { [a]: "n/a", [b]: "blocked", [c]: "10-1-0" }, true);
  const reason = (n) => settled.fights.flatMap((f) => f.fighters).find((x) => x.name === n).recordMissing;
  assert.strictEqual(reason(a), "na");
  assert.strictEqual(reason(b), "blocked");
  assert.strictEqual(reason(c), "");
  // An unanswered name is blocked; nothing is claimed while the lookup runs.
  const rest = M.namesNeedingRecords(event, {}).slice(3)[0];
  assert.strictEqual(settled.fights.flatMap((f) => f.fighters).find((x) => x.name === rest).recordMissing, "blocked");
  const running = M.withRecords(event, { [a]: "n/a", [b]: "blocked" });
  assert.ok(running.fights.flatMap((f) => f.fighters).every((x) => !x.recordMissing));
  // "n/a" and "blocked" are asked about again; a real record is not.
  const again = M.namesNeedingRecords(event, { [a]: "n/a", [b]: "blocked", [c]: "10-1-0" });
  assert.ok(again.includes(a) && again.includes(b) && !again.includes(c));
});

test("card cache keeps fresh, well-formed entries only", () => {
  const now = 10 * 24 * 3600 * 1000;
  const fresh = now - 3600 * 1000;
  const stale = now - 13 * 3600 * 1000;
  const seg = { "401": { segment: "main", label: "Main Card", matchNumber: 1, champion: true, method: "KO" } };
  const text = M.serializeCardCache(
    { "123": { at: fresh, data: seg }, "124": { at: stale, data: seg }, "abc": { at: fresh, data: seg } },
    { "Nik Bagley": { at: fresh, value: "10-2-0" }, "Old Guy": { at: stale, value: "1-0-0" },
      "Blocked": { at: fresh, value: "blocked" }, "Nobody": { at: fresh, value: "n/a" }, "Evil": { at: fresh, value: "<b>" } }
  );
  const back = M.parseCardCache(text, now);
  assert.deepStrictEqual(Object.keys(back.segments), ["123"]);
  assert.strictEqual(back.segments["123"].data["401"].champion, true);
  assert.deepStrictEqual(Object.keys(back.records).sort(), ["Nik Bagley", "Nobody"]);
  assert.deepStrictEqual(M.parseCardCache("junk", now), { segments: {}, records: {} });
  assert.strictEqual(M.cardCacheFresh(now + 1000, now), false);
});

test("card cache rebuilds each entry field by field", () => {
  const now = 10 * 24 * 3600 * 1000;
  const at = now - 1000;
  const text = JSON.stringify({
    version: 1,
    segments: { "5": { at, data: { "9": { segment: 7, label: { x: 1 }, matchNumber: "3", champion: "yes", method: "KO", extra: "<b>" }, "x": { segment: "main" }, "8": "junk" } },
                "6": { at, data: { "x": {} } }, "7": { at, data: "junk" } },
    records: { "A": "junk", "B": { at, value: "3-1-0 (1 NC)" }, "C": { at: "nope", value: "1-0-0" } }
  });
  const back = M.parseCardCache(text, now);
  assert.deepStrictEqual(Object.keys(back.segments), ["5"]);
  assert.deepStrictEqual(back.segments["5"].data, { "9": { segment: "7", label: "[object Object]", matchNumber: 3, champion: false, method: "KO" } });
  assert.deepStrictEqual(Object.keys(back.records), ["B"]);
  assert.deepStrictEqual(M.parseCardCache(JSON.stringify({ version: 2, segments: {}, records: {} }), now), { segments: {}, records: {} });
});

test("sanitizeFight bounds the billing fields it now keeps", () => {
  const base = { id: "1", fighters: [] };
  const clean = (extra) => M.sanitizeFight(Object.assign({}, base, extra));
  assert.strictEqual(clean({ segment: "prelims1" }).segment, "prelims1");
  assert.strictEqual(clean({ segment: "<script>" }).segment, "");
  assert.strictEqual(clean({ matchNumber: 500 }).matchNumber, 99);
  assert.strictEqual(clean({ matchNumber: -4 }).matchNumber, 0);
  assert.strictEqual(clean({ matchNumber: "x" }).matchNumber, 0);
  assert.strictEqual(clean({ matchNumber: 3.7 }).matchNumber, 3);
  assert.strictEqual(clean({ champion: "true" }).champion, false);
  assert.strictEqual(clean({ champion: true }).champion, true);
  assert.strictEqual(clean({ method: "x".repeat(200) }).method.length, 80);
  assert.strictEqual(clean({}).method, "");
  assert.strictEqual(M.sanitizeFight({ id: "abc" }), null);
});

test("wikiDate reads start date templates and gives noon UTC", () => {
  assert.strictEqual(M.wikiDate("{{start date|2026|11|7}}"), "2026-11-07T12:00:00.000Z");
  assert.strictEqual(M.wikiDate("{{Start date | 2026 | 2 | 21 |df=y}}"), "2026-02-21T12:00:00.000Z");
  assert.strictEqual(M.wikiDate("{{start date|2026|11|7}}<ref>x</ref>"), "2026-11-07T12:00:00.000Z");
  assert.strictEqual(M.wikiDate("November 7, 2026"), "2026-11-07T12:00:00.000Z");
  assert.strictEqual(M.wikiDate(""), "");
  assert.strictEqual(M.wikiDate(undefined), "");
});

test("wikiSegment maps card headings to segments", () => {
  assert.strictEqual(M.wikiSegment("Main card"), "main");
  assert.strictEqual(M.wikiSegment("Preliminary card"), "prelims1");
  assert.strictEqual(M.wikiSegment("Prelims"), "prelims1");
  assert.strictEqual(M.wikiSegment("Early prelims"), "prelims2");
  assert.strictEqual(M.wikiSegment("[[Prelims]] 2"), "prelims2");
  assert.strictEqual(M.wikiSegment(""), "main");
});

test("wikiBouts splits cards and bouts in listed order", () => {
  const text = [
    "{{MMAevent card|Main card}}",
    "{{MMAevent bout",
    "| Welterweight",
    "| A One",
    "| def.",
    "| B Two",
    "| KO",
    "}}",
    "{{MMAevent card|Prelims}}",
    "{{MMAevent bout",
    "| Lightweight",
    "| C Three",
    "| vs.",
    "| D Four",
    "}}"
  ].join("\n");
  const bouts = M.wikiBouts(text);
  assert.deepStrictEqual(bouts.map((b) => b.segment), ["main", "prelims1"]);
  assert.strictEqual(bouts[0].parts[1].trim(), "A One");
  assert.strictEqual(bouts[1].parts[3].trim(), "D Four");
  assert.deepStrictEqual(M.wikiBouts("no templates here"), []);
});

test("wikiFighter strips links and flags champions and TBA", () => {
  const f = M.wikiFighter(" [[Dario Bellandi]] (c) ", true);
  assert.strictEqual(f.name, "Dario Bellandi");
  assert.strictEqual(f.crowned, true);
  assert.strictEqual(f.winner, true);
  assert.strictEqual(M.wikiFighter("[[Aldo Pereira|Aldo P.]] (ic)", false).name, "Aldo P.");
  const tba = M.wikiFighter("TBA", false);
  assert.strictEqual(tba.tba, true);
  assert.strictEqual(tba.name, "TBA");
});

test("buildCard: a provider's own billing is used, but ESPN segments win", () => {
  const fight = (id, extra) => Object.assign({ id, fighters: [], rank: 0 }, extra);
  const event = { fights: [
    fight("1", { segment: "prelims1", matchNumber: 2, method: "KO", champion: false }),
    fight("2", { segment: "main", matchNumber: 1, method: "Submission", champion: true })
  ] };
  const own = M.buildCard(event, {});
  assert.deepStrictEqual(own.map((s) => s.key), ["main", "prelims1"]);
  assert.strictEqual(own[0].fights[0].champion, true);
  assert.strictEqual(own[0].fights[0].method, "Submission");
  const espn = M.buildCard(event, { "1": { segment: "main", label: "Main Card", matchNumber: 5, champion: false, method: "Decision" } });
  const moved = espn.flatMap((s) => s.fights.map((f) => [s.key, f.id, f.method]));
  assert.ok(moved.some((x) => x[0] === "main" && x[1] === "1" && x[2] === "Decision"));
});

test("whenText shows the day only for date-only events", () => {
  const e = { date: "2026-11-07T12:00:00.000Z", dateOnly: true };
  const day = M.formatDay(e.date, "UTC");
  assert.strictEqual(M.whenText(e, "24h", "UTC"), day);
  const timed = M.whenText({ date: e.date, dateOnly: false }, "24h", "UTC");
  assert.strictEqual(timed, day + " · " + M.formatTime(e.date, "24h", "UTC"));
});

test("filterEvents matches event, organization and fighter names, ignoring case and accents", () => {
  const ev = (id, name, names) => ({ id, name, shortName: name, orgLabel: "UFC",
    fights: [{ fighters: names.map((n) => ({ name: n, shortName: n })) }] });
  const list = [ev("a", "UFC 400", ["Jiří Procházka", "Khalil Rountree"]), ev("b", "UFC Fight Night", ["Nik Bagley"])];
  const ids = (q) => M.filterEvents(list, q).map((e) => e.id);
  assert.deepStrictEqual(ids("prochazka"), ["a"]);
  assert.deepStrictEqual(ids("  BAGLEY nik "), ["b"]);
  assert.deepStrictEqual(ids("night"), ["b"]);
  assert.deepStrictEqual(ids("nobody"), []);
  assert.deepStrictEqual(ids(""), ["a", "b"]);
});

// ------------------------------------------------------- remote budgets

function hostileWiki(count) {
  let text = "";
  for (let i = 0; i < count; i++) {
    const day = String(1 + (i % 28)).padStart(2, "0");
    text += `== Cage Warriors ${300 + i} ==\n{{Infobox MMA event\n|name = Cage Warriors ${300 + i}\n|date = {{start date|2027|1|${Number(day)}}}\n}}\nIntro.\n`;
  }
  return JSON.stringify([{ parse: { title: "2027 in Cage Warriors", wikitext: text } }]);
}

test("a page with far more valid events than the first page is bounded", () => {
  const evs = M.parseWikipedia(hostileWiki(500), "cw", NOW, 365);
  assert.ok(evs.length > M.eventLimitMax);
  assert.ok(evs.length <= M.wikiSectionMax);
  const merged = M.mergeEvents([evs], Infinity, NOW, 7);
  assert.ok(merged.length > M.eventLimitMax);
  assert.ok(merged.length <= M.remoteEventMax);
});

test("record lookups share names across events and stay within the budget", () => {
  const queue = [];
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
  assert.deepStrictEqual([...M.enqueueRecords(queue, null, a, ["X", "Y"], 3)], []);
  // "Y" is already waiting: shared, not queued twice; "Z" fits; "W" does not.
  assert.deepStrictEqual([...M.enqueueRecords(queue, null, b, ["Y", "Z", "W"], 3)], ["W"]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(queue.map((j) => j.names))), [["X", "Y"], ["Z"]]);
  assert.deepStrictEqual([...queue[0].events.map((e) => e.id)], ["a", "b"]);
  const active = { events: [a], names: ["Q"] };
  assert.deepStrictEqual([...M.enqueueRecords([], active, c, ["Q"], 3)], []);
  assert.deepStrictEqual([...active.events.map((e) => e.id)], ["a", "c"]);
});

test("a refresh alone does not queue record lookups for every event", () => {
  const src = fs.readFileSync(__dirname + "/../Service.qml", "utf8");
  const body = src.slice(src.indexOf("function finishFetch"), src.indexOf("function merge"));
  assert.ok(!/events\.forEach\([^)]*loadCard/.test(body));
  assert.strictEqual((body.match(/loadCard\(/g) || []).length, 1);
});

test("the card cache keeps only the newest entries, on load too", () => {
  const now = Date.now();
  const records = {}, segments = {};
  for (let i = 0; i < 700; i++) records["Fighter " + i] = { at: now - i * 1000, value: "1-0-0" };
  for (let i = 0; i < 100; i++) segments[String(1000 + i)] = { at: now - i * 1000, data: { "1": { segment: "main" } } };
  const out = M.parseCardCache(JSON.stringify({ version: 1, segments, records }), now);
  assert.strictEqual(Object.keys(out.records).length, M.cacheRecordMax);
  assert.strictEqual(Object.keys(out.segments).length, M.cacheSegmentMax);
  assert.ok(out.records["Fighter 0"] && !out.records["Fighter 699"]);
  assert.ok(out.segments["1000"] && !out.segments["1099"]);
});

test("the event cache is capped on load", () => {
  const text = M.serializeCache(M.mergeEvents([M.parseWikipedia(hostileWiki(150), "cw", NOW, 365)], Infinity, NOW, 7), NOW);
  assert.ok(M.parseCache(text).events.length <= M.remoteEventMax);
});
