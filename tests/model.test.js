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

test("organizationOptions lists UFC and PFL", () => {
  const ids = M.organizationOptions().map((o) => o.value);
  assert.deepStrictEqual(ids, ["ufc", "pfl"]);
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

test("parseScoreboard tolerates garbage and drops finished events", () => {
  assert.deepStrictEqual(M.parseScoreboard("not json", "ufc"), []);
  assert.deepStrictEqual(M.parseScoreboard("{}", "ufc"), []);
  const done = { events: [{ id: "1", name: "Old", date: "2020-01-01T00:00Z", status: { type: { name: "STATUS_FINAL" } }, competitions: [] }] };
  assert.deepStrictEqual(M.parseScoreboard(done, "ufc"), []);
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
  unknownOrg.org = "ksw";
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
