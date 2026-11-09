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
  assert.deepStrictEqual(M.selectedOrganizations(["bellator", "ufc", "nope", "ufc"]), ["ufc"]);
  assert.deepStrictEqual(M.selectedOrganizations([]), []);
});

test("toggleOrganization adds and removes enabled promotions only", () => {
  assert.deepStrictEqual(M.toggleOrganization(["ufc"], "pfl", true), ["ufc", "pfl"]);
  assert.deepStrictEqual(M.toggleOrganization(["pfl", "ufc"], "ufc", false), ["pfl"]);
  assert.deepStrictEqual(M.toggleOrganization(["ufc"], "ufc", false), []);
  assert.deepStrictEqual(M.toggleOrganization(["ufc"], "bellator", true), ["ufc"]);
});

test("UFC and PFL have bundled logos, and PFL is off by default", () => {
  assert.strictEqual(M.logoFor("ufc"), "assets/ufc.png");
  assert.strictEqual(M.logoFor("pfl"), "assets/pfl.png");
  assert.strictEqual(M.logoFor("bellator"), "");
  assert.deepStrictEqual(M.selectedOrganizations(undefined), ["ufc"]);
  for (const f of ["ufc", "pfl"]) assert.ok(fs.existsSync(__dirname + "/../assets/" + f + ".png"));
});

test("forOrganizations keeps only selected promotions' events", () => {
  const events = [{ org: "ufc" }, { org: "pfl" }];
  assert.deepStrictEqual(M.forOrganizations(events, ["pfl"]), [{ org: "pfl" }]);
  assert.deepStrictEqual(M.forOrganizations(events, []), []);
});

test("organizationOptions lists UFC, PFL, Cage Warriors, KSW, ARES, Oktagon, Hexagone MMA, ACA and ONE", () => {
  const ids = M.organizationOptions().map((o) => o.value);
  assert.deepStrictEqual(ids, ["ufc", "pfl", "cw", "ksw", "ares", "oktagon", "hxmma", "aca", "one"]);
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

test("visibleEvents puts an unfinished event with an old date after the finished ones", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const ev = (id, date, finished) => ({ id, date, finished });
  const list = [ev("stale", "2026-11-01T22:00:00Z", false), ev("done", "2026-11-09T22:00:00Z", true), ev("next", "2026-11-20T22:00:00Z", false)];
  const shown = M.visibleEvents(list, now, 3);
  assert.deepStrictEqual(shown.map((e) => e.id), ["done", "stale", "next"]);
  let changes = 0;
  shown.forEach((e, i) => { if (i > 0 && (shown[i - 1].finished === true) !== (e.finished === true)) changes++; });
  assert.strictEqual(changes, 1);
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

test("safeUrl accepts https only, on the sources' own hosts", () => {
  assert.strictEqual(M.safeUrl("https://www.espn.com/mma/x?a=1&b=2"), "https://www.espn.com/mma/x?a=1&b=2");
  for (const ok of ["https://espn.com", "https://en.wikipedia.org/wiki/X#Y", "https://www.aresfighting.com/events/?competition=1", "https://www.sherdog.com/events/E-1", "https://WWW.ESPN.com/x"])
    assert.strictEqual(M.safeUrl(ok), ok);
  for (const bad of ["http://espn.com", "javascript:alert(1)", "file:///etc/passwd", "https://a b", "https://a\"b", "", null, undefined, 42,
    // Any other host, including look-alikes: the link field is remote-controlled.
    "https://evil.example/espn.com", "https://espn.com.evil.example/", "https://notespn.com/", "https://www.espn.com@evil.example/", "https://www.espn.com:443/x"])
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
    { events: [{ id: 1, links: [null, { rel: 5, href: "https://www.espn.com/c" }, { rel: "event", href: "https://www.espn.com/c" }] }] },
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
  assert.strictEqual(M.parseScoreboard({ events: [{ id: 1, links: [{ rel: ["event"], href: "https://www.espn.com/c" }] }] }, "ufc")[0].url, "https://www.espn.com/c");
  assert.strictEqual(M.parseScoreboard({ events: [{ id: 1, links: [{ rel: ["event"], href: "https://a.b/c" }] }] }, "ufc")[0].url, "");
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

// ------------------------------------------------------- Oktagon (Wikipedia)

const oktagon = M.parseWikipedia(JSON.stringify([JSON.parse(fixture("oktagon-2026-wiki.json")), { error: { code: "missingtitle" } }]), "oktagon", NOW, 120);

test("Oktagon: the year's events are read in order, with venue and country", () => {
  assert.strictEqual(oktagon.length, 19);
  assert.strictEqual(oktagon[0].shortName, "Oktagon 82");
  assert.strictEqual(oktagon[0].venue, "PSD Bank Dome · Düsseldorf, Germany");
  assert.strictEqual(oktagon[0].tz, "Europe/Paris");
  assert.strictEqual(oktagon[18].shortName, "Oktagon 100");
  assert.ok(oktagon.every((e) => e.org === "oktagon" && e.orgTag === "OKT" && e.inline && e.dateOnly && e.id.startsWith("87")));
  assert.deepStrictEqual(oktagon.map((e) => e.date), oktagon.map((e) => e.date).slice().sort());
});

test("Oktagon: results show winners and methods, announced cards neither", () => {
  const done = oktagon.find((e) => e.shortName === "Oktagon 96");
  assert.ok(done.finished);
  assert.strictEqual(done.headliner.fighters[0].winner, true);
  assert.strictEqual(done.headliner.method, "Unanimous Decision");
  const next = oktagon.find((e) => e.shortName === "Oktagon 97");
  assert.ok(!next.finished && next.fights.every((f) => !f.done && f.method === ""));
  assert.strictEqual(next.url, "https://en.wikipedia.org/wiki/2026_in_Oktagon_MMA#Oktagon_97:_Severino_vs._Holzer");
});

test("Oktagon never shares an event id with the other promotions", () => {
  const others = new Set([...cw, ...ksw, ...ares].map((e) => e.id));
  assert.ok(oktagon.every((e) => !others.has(e.id)));
});

// ------------------------------------------------------ Hexagone MMA (Sherdog)
//
// The event pages of Hexagone MMA's Sherdog organization page, as
// bin/mma-api sherdog hxmma prints them (scripts and styles stripped).

const hx = M.parseSherdog(fixture("hxmma-2026.json"), "hxmma", Date.parse("2026-11-05T12:00:00Z"), 120);

test("Hexagone MMA: events are read in order, with venue and country", () => {
  assert.deepStrictEqual(hx.map((e) => e.shortName), ["HXMMA 46", "HXMMA 47", "HXMMA 48", "HXMMA 49"]);
  assert.strictEqual(hx[1].name, "Hexagone MMA 47");
  assert.strictEqual(hx[1].venue, "Zenith Toulouse · Toulouse, France");
  assert.strictEqual(hx[1].tz, "Europe/Paris");
  assert.ok(hx.every((e) => e.org === "hxmma" && e.orgTag === "HX" && e.inline && e.dateOnly && e.id.startsWith("88")));
  assert.strictEqual(hx[0].url, "https://www.sherdog.com/events/HXMMA-46-Hexagone-MMA-46-Series-5-Rouen-113782");
});

test("Hexagone MMA: results show winners and methods, announced cards neither", () => {
  const done = hx[1];
  assert.ok(done.finished && done.fightCount === 11);
  assert.deepStrictEqual(done.headliner.fighters.map((f) => [f.name, f.winner]), [["Nicolae Bivol", true], ["David Sipra", false]]);
  assert.strictEqual(done.headliner.method, "TKO (Elbow and Punches)");
  assert.strictEqual(done.headliner.round, 1);
  assert.ok(done.fights.some((f) => f.method === "Split Decision"));
  const next = hx[3];
  assert.ok(!next.finished && next.fights.every((f) => !f.done && f.method === ""));
  assert.strictEqual(next.headliner.fighters[0].name, "Theo Ulrich");
  assert.strictEqual(next.headliner.fighters[0].record, "8-0-0");
  assert.ok(next.headliner.champion);
});

test("Hexagone MMA: events beyond the lookahead are dropped, junk is ignored", () => {
  assert.strictEqual(M.parseSherdog(fixture("hxmma-2026.json"), "hxmma", Date.parse("2026-11-05T12:00:00Z"), 7).length, 3);
  assert.deepStrictEqual(M.parseSherdog("nope", "hxmma", NOW, 120), []);
  assert.deepStrictEqual(M.parseSherdog(JSON.stringify({ events: { "/x/../y": "<h1>a</h1>" } }), "hxmma", NOW, 120), []);
});

test("Hexagone MMA never shares an event id with the other promotions", () => {
  const others = new Set([...cw, ...ksw, ...ares, ...oktagon].map((e) => e.id));
  assert.ok(hx.every((e) => !others.has(e.id)));
});

// ------------------------------------------------------------ ACA (Wikipedia)

const aca = M.parseWikipedia(JSON.stringify([JSON.parse(fixture("aca-2026-wiki.json")), { error: { code: "missingtitle" } }]), "aca", NOW, 120);

test("ACA: the year's events are read in order, with venue and country", () => {
  assert.strictEqual(aca.length, 13);
  assert.strictEqual(aca[0].shortName, "ACA 198");
  assert.strictEqual(aca[0].venue, "Sport Hall Colosseum · Grozny, Russia");
  assert.strictEqual(aca[0].tz, "Europe/Moscow");
  assert.strictEqual(aca[3].tz, "Europe/Moscow");
  assert.ok(aca.every((e) => e.org === "aca" && e.orgTag === "ACA" && e.inline && e.dateOnly && e.id.startsWith("89")));
  assert.deepStrictEqual(aca.map((e) => e.date), aca.map((e) => e.date).slice().sort());
});

test("ACA: results show winners and methods, announced cards neither", () => {
  const done = aca.find((e) => e.shortName === "ACA 200");
  assert.ok(done.finished);
  assert.strictEqual(done.headliner.fighters[0].winner, true);
  assert.strictEqual(done.headliner.method, "Unanimous Decision");
  const next = aca.find((e) => e.shortName === "ACA 210");
  assert.ok(!next.finished && next.fights.every((f) => !f.done && f.method === ""));
});

test("ACA never shares an event id with the other promotions", () => {
  const others = new Set([...cw, ...ksw, ...oktagon].map((e) => e.id));
  assert.ok(aca.every((e) => !others.has(e.id)));
});

// ------------------------------------------------- ONE Championship (Wikipedia)
//
// ONE mixes MMA with Muay Thai, kickboxing and grappling; only the MMA bouts
// are kept, and an event without any is left out.

const one = M.parseWikipedia(fixture("one-2026-wiki.json"), "one", NOW, 120);

test("ONE: only MMA bouts are listed, with the sport dropped from the weight class", () => {
  const samurai = one.find((e) => e.shortName === "ONE Samurai 4");
  assert.deepStrictEqual(samurai.fights.map((f) => f.weightClass).sort(), ["Flyweight", "Lightweight", "Women's Atomweight"]);
  assert.ok(one.every((e) => e.fights.every((f) => !/muay|kickbox|grappl|mma/i.test(f.weightClass))));
  assert.strictEqual(samurai.venue, "Ariake Arena · Tokyo, Japan");
  assert.strictEqual(samurai.tz, "Asia/Tokyo");
  assert.ok(one.every((e) => e.org === "one" && e.orgTag === "ONE" && e.inline && e.dateOnly && e.id.startsWith("90")));
});

test("ONE: events with no MMA bout or no announced card are dropped", () => {
  assert.deepStrictEqual(one.map((e) => e.shortName), ["ONE Fight Night 48", "ONE Friday Fights 175", "ONE Samurai 4", "ONE Fight Night 49", "ONE Fight Night 50"]);
});

test("ONE: results show winners and methods, announced cards neither", () => {
  const done = one.find((e) => e.shortName === "ONE Samurai 4");
  assert.ok(done.finished);
  const abe = done.fights.find((f) => f.weightClass === "Lightweight");
  assert.strictEqual(abe.fighters[0].name, "Kota Abe");
  assert.strictEqual(abe.fighters[0].winner, true);
  assert.strictEqual(abe.method, "TKO (punches)");
  assert.strictEqual(done.fights.find((f) => f.weightClass === "Women's Atomweight").method, "Unanimous Decision");
  const next = one.find((e) => e.shortName === "ONE Fight Night 49");
  assert.ok(!next.finished && next.fights.every((f) => !f.done && f.method === ""));
  assert.strictEqual(next.headliner.fighters[0].name, "Lucas Gabriel");
});

test("ONE never shares an event id with the other promotions", () => {
  const others = new Set([...cw, ...ksw, ...oktagon, ...aca].map((e) => e.id));
  assert.ok(one.every((e) => !others.has(e.id)));
});

// ------------------------------------------------------------- ARES (own site)
//
// The saved pages of aresfighting.com, as bin/mma-api ares prints them: the
// upcoming and past listings, the card page of five upcoming events and the
// result page of ARES 44 (the one past event fetched).

const aresPages = fixture("ares-2026.json");
const ares = M.parseAres(aresPages, NOW, 120);
const aresEvent = (name) => ares.find((e) => e.name === name);

test("ARES: the past event and the upcoming ones within the look-ahead, in date order", () => {
  assert.deepStrictEqual(ares.map((e) => e.name), ["ARES 44", "ARES 45", "ARES 46", "ARES Marseille January 2027", "ARES Paris February 2027"]);
  assert.deepStrictEqual(ares.map((e) => e.date), ares.map((e) => e.date).slice().sort());
  assert.ok(ares.every((e) => e.org === "ares" && e.inline && /^[0-9]+$/.test(e.id)));
  assert.strictEqual(new Set(ares.map((e) => e.id)).size, ares.length);
  assert.strictEqual(M.parseAres(aresPages, NOW, 365).length, 7);
});

test("ARES: bad input gives no events instead of throwing", () => {
  for (const bad of ["", "nope", "[]", "null", "{}", '{"upcoming":5,"past":[],"cards":[],"results":"x"}']) {
    assert.deepStrictEqual(M.parseAres(bad, NOW, 365), []);
  }
});

test("ARES: event details, with the start time from the card page in Paris time", () => {
  const e = aresEvent("ARES 45");
  assert.strictEqual(e.id, "8600045");
  assert.strictEqual(e.date, "2026-11-20T18:30:00.000Z");
  assert.strictEqual(e.dateOnly, false);
  assert.strictEqual(e.finished, false);
  assert.strictEqual(e.tz, "Europe/Paris");
  assert.strictEqual(e.url, "https://www.aresfighting.com/events/?competition=3368");
  assert.strictEqual(e.logo, "assets/ares.png");
  assert.strictEqual(e.orgLabel, "ARES");
  assert.strictEqual(e.orgTag, "ARES");
  assert.strictEqual(M.whenText(e, "24h", "Europe/Paris"), "Fri, Nov 20 · 19:30");
  // An event without a number still gets a stable id of its own.
  const m = aresEvent("ARES Marseille January 2027");
  assert.strictEqual(m.id, "8970115");
  assert.strictEqual(m.date, "2027-01-15T19:00:00.000Z");
});

test("ARES: an announced card has its bouts, records and no results; main event last", () => {
  const e = aresEvent("ARES 45");
  assert.strictEqual(e.fights.length, 6);
  assert.ok(e.fights.every((f) => !f.done && f.method === "" && f.fighters.every((x) => !x.winner)));
  const sections = M.buildCard(e, {});
  assert.strictEqual(sections.length, 1);
  const main = sections[0].fights[0];
  assert.deepStrictEqual(main.fighters.map((x) => x.name), ["Jordan Zebo", "Baissangour Chamsoudinov"]);
  assert.deepStrictEqual(main.fighters.map((x) => x.record), ["11-1-0", "11-1-0"]);
  assert.strictEqual(main.weightClass, "Welterweight");
  assert.strictEqual(M.isMainEvent(sections[0], 0), true);
  // Zebo's photo is named ...-CHAMP-..., so the main event counts as a title fight; no other bout does.
  assert.strictEqual(main.champion, true);
  assert.strictEqual(e.fights.filter((f) => f.champion).length, 1);
  assert.strictEqual(M.headlinerText(e), "Jordan Zebo vs Baissangour Chamsoudinov");
  // Records come with the card, so nothing is left to look up on Sherdog.
  assert.deepStrictEqual(M.namesNeedingRecords(e, {}), []);
  assert.strictEqual(aresEvent("ARES Paris February 2027").fights.length, 0);
});

test("ARES: a finished card has two segments, winners and how each fight ended", () => {
  const e = aresEvent("ARES 44");
  assert.strictEqual(e.finished, true);
  assert.strictEqual(e.dateOnly, true);
  assert.strictEqual(e.date, "2026-10-31T12:00:00.000Z");
  assert.strictEqual(e.url, "https://www.aresfighting.com/ares-44-fighting/");
  const sections = M.buildCard(e, {});
  assert.deepStrictEqual(sections.map((s) => s.label), ["Main Card", "Prelims"]);
  assert.strictEqual(sections[0].fights.length, 4);
  assert.strictEqual(sections[1].fights.length, 4);
  const main = sections[0].fights[0];
  assert.deepStrictEqual(main.fighters.map((x) => x.name), ["Aboubakar Younousov", "Tyson Nam"]);
  assert.strictEqual(M.outcome(main, 0), "win");
  assert.strictEqual(M.outcome(main, 1), "loss");
  assert.strictEqual(M.resultLabel(main), "R3 3:21 TKO");
  // A win on the right-hand side, and French methods in English.
  const labels = sections.flatMap((s) => s.fights).map((f) => M.resultLabel(f));
  assert.ok(labels.includes("R1 3:43 Submission"));
  assert.ok(labels.includes("Split Decision"));
  assert.ok(labels.includes("Majority Decision"));
  assert.ok(labels.includes("R1 0:47 KO"));
  const split = sections.flatMap((s) => s.fights).find((f) => f.method === "Split Decision");
  assert.deepStrictEqual([M.outcome(split, 0), M.outcome(split, 1)], ["loss", "win"]);
});

test("ARES: a result page that was not fetched gives no event, a card page that was not gives an empty card", () => {
  const data = JSON.parse(aresPages);
  data.results = {};
  assert.ok(!M.parseAres(data, NOW, 120).some((e) => e.name === "ARES 44"));
  data.cards = {};
  const e = M.parseAres(data, NOW, 120).find((x) => x.name === "ARES 45");
  assert.deepStrictEqual([e.fights.length, e.dateOnly, e.date], [0, true, "2026-11-20T12:00:00.000Z"]);
});

test("ARES: events survive the cache with their card", () => {
  const back = M.parseCache(M.serializeCache(ares, 1)).events;
  assert.deepStrictEqual(back, ares.map((e) => JSON.parse(JSON.stringify(e))));
});

test("aresDate reads the listing's day and the card page's time, in summer time too", () => {
  assert.deepStrictEqual(M.aresDate("20/11/2026"), { day: "2026-11-20T12:00:00.000Z", at: "" });
  assert.strictEqual(M.aresDate("20/11/2026 19:30:00").at, "2026-11-20T18:30:00.000Z");
  assert.strictEqual(M.aresDate("03/07/2026 19:30:00").at, "2026-07-03T17:30:00.000Z");
  // Clocks change on the last Sunday of March and October.
  assert.strictEqual(M.aresDate("28/03/2026 20:00").at, "2026-03-28T19:00:00.000Z");
  assert.strictEqual(M.aresDate("29/03/2026 20:00").at, "2026-03-29T18:00:00.000Z");
  assert.strictEqual(M.aresDate("24/10/2026 20:00").at, "2026-10-24T18:00:00.000Z");
  assert.strictEqual(M.aresDate("25/10/2026 20:00").at, "2026-10-25T19:00:00.000Z");
  for (const bad of ["", "soon", "31/02/2026", "20/11/1999", "2026-11-20"]) assert.strictEqual(M.aresDate(bad), null);
  assert.strictEqual(M.aresDate("20/11/2026 25:00").at, "");
});

test("aresName puts French months in English and leaves the rest alone", () => {
  assert.strictEqual(M.aresName("ARES Marseille Janvier 2027"), "ARES Marseille January 2027");
  assert.strictEqual(M.aresName("ARES Paris F\u00e9vrier 2027"), "ARES Paris February 2027");
  assert.strictEqual(M.aresName("ARES Paris, JUIN 2027"), "ARES Paris, June 2027");
  assert.strictEqual(M.aresName("ARES 45"), "ARES 45");
  assert.strictEqual(M.aresName("ARES Mars Attacks"), "ARES March Attacks");
});

test("aresMethod turns the site's French and English into one wording", () => {
  const cases = { "Decision Unanime": "Unanimous Decision", "decision Unanime": "Unanimous Decision", "Décision partagée": "Split Decision",
    "Decision majoritaire": "Majority Decision", "Soumission": "Submission", "TKO": "TKO", "KO": "KO", "Nul": "Draw", "": "" };
  for (const [raw, want] of Object.entries(cases)) assert.strictEqual(M.aresMethod(raw), want, raw);
});

test("htmlText strips markup and decodes entities, without being tricked into markup", () => {
  assert.strictEqual(M.htmlText("<b>Sofia&nbsp;&amp; Ma&#235;lle</b> &#x41; &rsquo;"), "Sofia & Maëlle A \u2019");
  assert.strictEqual(M.htmlText("&lt;script&gt; &#0; &#xD800; &bogus;"), "<script> &#0; &#xD800; &bogus;");
});

test("ARES never shares an event id with KSW or Cage Warriors", () => {
  const ids = new Set(cw.concat(ksw).map((e) => e.id));
  assert.ok(M.parseAres(aresPages, NOW, 365).every((e) => !ids.has(e.id)));
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

test("providerOf: Cage Warriors, KSW and Oktagon read Wikipedia, ARES its own site, the others ESPN", () => {
  assert.strictEqual(M.providerOf("cw"), "wikipedia");
  assert.strictEqual(M.providerOf("ksw"), "wikipedia");
  assert.strictEqual(M.providerOf("oktagon"), "wikipedia");
  assert.strictEqual(M.providerOf("aca"), "wikipedia");
  assert.strictEqual(M.providerOf("one"), "wikipedia");
  assert.strictEqual(M.providerOf("ares"), "ares");
  assert.strictEqual(M.providerOf("hxmma"), "sherdog");
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
  // A blocked name is kept: it is what holds the 12-hour backoff across restarts.
  assert.deepStrictEqual(Object.keys(back.records).sort(), ["Blocked", "Nik Bagley", "Nobody"]);
  assert.strictEqual(back.records["Blocked"].value, "blocked");
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
  // The soonest event, and the card the panel has open (if any); never all of them.
  assert.strictEqual((body.match(/loadCard\(/g) || []).length, 2);
  assert.ok(/openCardId\s*!==\s*""\)\s*root\.loadCard\(root\.openCardId\)/.test(body));
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

test("filterByOrg and eventOrganizations narrow events to one organization", () => {
  const list = [{ id: 1, org: "pfl" }, { id: 2, org: "ufc" }, { id: 3, org: "ufc" }]
  assert.deepEqual(M.filterByOrg(list, "ufc").map((e) => e.id), [2, 3])
  assert.equal(M.filterByOrg(list, "").length, 3)
  assert.deepEqual(M.eventOrganizations(list).map((o) => o.id), ["ufc", "pfl"])
})

// ------------------------------------------------------------ hostile input
//
// The parsers run on the shell's GUI thread, on text anyone can edit (Wikipedia)
// or any server can send. Each case below opens a construct over and over and
// never closes it; with unbounded lazy matches each opener scanned to the end of
// the input, which took from 6 seconds to well over a minute at these sizes.
// Bounded, each must finish in well under a second; the budget is generous for
// slow machines.

// The size is the per-page cap bin/mma-api applies to HTML and (near enough)
// to a year's wikitext; the parsers are linear, so this is their worst case.
const hostileKb = 2048;
const hostileBudgetMs = 1500;
function timed(label, fn) {
  const t = Date.now();
  const r = fn();
  const ms = Date.now() - t;
  assert.ok(ms < hostileBudgetMs, label + " took " + ms + " ms");
  return r;
}

test("a Wikipedia page with an infobox that never closes parses in bounded time", () => {
  const sec = "== Cage Warriors 999 ==\n" + "{{Infobox MMA event |x".repeat(Math.floor(hostileKb * 1024 / 22));
  const page = JSON.stringify([{ parse: { title: "2026 in Cage Warriors", wikitext: sec } }]);
  assert.strictEqual(timed("infobox", () => M.parseWikipedia(page, "cw", NOW, 365)).length, 0);
});

test("wikitext with refs, comments, tags and links that never close is stripped in bounded time", () => {
  const n = Math.floor(hostileKb * 1024 / 8);
  for (const s of ["<ref>a".repeat(n), "<!-- a".repeat(n), "<a".repeat(n), "[[a".repeat(n), "{{flag a".repeat(n)])
    assert.strictEqual(typeof timed("wikiPlain", () => M.wikiPlain(s)), "string");
  // A bout template that never closes, and a card label that runs on.
  const bouts = "== X ==\n{{Infobox MMA event\n| date = {{start date|2026|11|7}}\n}}\n" + "{{MMAevent bout\n|a".repeat(n);
  assert.ok(timed("wikiBouts", () => M.wikiBouts(bouts)).length <= M.maxFightsPerEvent);
  assert.strictEqual(timed("wikiSegment", () => M.wikiSegment("prelim".repeat(n))), "prelims1");
});

test("a ONE results table cell attribute cannot be split in exponentially many ways", () => {
  // "a=a=a=..." with no closing pipe used to backtrack 2^n ways.
  const cell = "|" + "a=".repeat(40) + "Lightweight MMA";
  const section = "== ONE 1 ==\n=== Results ===\n{|\n|-\n" + [cell, "|A", "|def.", "|B", "|KO", "|1", "|1:00", "|x"].join("\n") + "\n|}";
  assert.strictEqual(timed("table cell", () => M.wikiTableBouts(section)).length, 1);
});

test("an ARES fight block whose records never reach stat-right parses in bounded time", () => {
  const block = 'class="fighter-line"<h4>A</h4><h4>B</h4>' + 'class="records"stat-left">1<'.repeat(Math.floor(hostileKb * 1024 / 28));
  const data = JSON.stringify({ upcoming: 'class="competition-resume upcoming" title="ARES 99" ?competition=5 class="date"><br/>20/12/2026', past: "", cards: { "5": block }, results: {} });
  assert.strictEqual(timed("ares", () => M.parseAres(data, NOW, 365)).length, 1);
  const tags = "<h2".repeat(Math.floor(hostileKb * 1024 / 3));
  assert.strictEqual(timed("ares h2", () => M.aresFights(tags)).length, 0);
});

test("a Sherdog page of unclosed headings parses in bounded time", () => {
  const page = "<h1>".repeat(Math.floor(hostileKb * 1024 / 4));
  const data = JSON.stringify({ org: "", events: { "/events/HXMMA-1-1": page } });
  assert.strictEqual(timed("sherdog", () => M.parseSherdog(data, "hxmma", NOW, 365)).length, 0);
  const html = "<a".repeat(Math.floor(hostileKb * 1024 / 2));
  assert.strictEqual(typeof timed("htmlText", () => M.htmlText(html)), "string");
});

test("the regexes stay bounded: no unbounded lazy scan is left in Model.js", () => {
  const src = fs.readFileSync(__dirname + "/../Model.js", "utf8");
  assert.deepStrictEqual(src.match(/\[\\s\\S\]\*\?/g), null, "an unbounded [\\s\\S]*? is back");
  assert.deepStrictEqual(src.match(/<\[\^>\]\*>/g), null, "an unbounded <[^>]*> is back");
});

// ------------------------------------------------------- polling discipline

test("the service fetches again only when the selection really changed", () => {
  const src = fs.readFileSync(__dirname + "/../Service.qml", "utf8");
  const handler = src.slice(src.indexOf("onOrganizationsChanged"), src.indexOf("onLookaheadDaysChanged"));
  assert.ok(/selectionKey/.test(handler), "organizations are compared before a refresh");
  assert.ok(/JSON\.stringify\(Model\.selectedOrganizations/.test(handler));
});

test("a manual refresh is throttled and keeps the vendor's refusals", () => {
  const src = fs.readFileSync(__dirname + "/../Service.qml", "utf8");
  assert.strictEqual((src.match(/function hardRefresh\(/g) || []).length, 1, "one hardRefresh, not a stray copy");
  const hard = src.slice(src.indexOf("function hardRefresh"), src.indexOf("function saveCache"));
  assert.ok(/userRefresh\(\)/.test(hard));
  assert.ok(!/blockedAt = \(\{\}\)/.test(hard), "hard refresh must not forget who blocked us");
  assert.ok(/manualRefreshMinMs/.test(src));
  assert.ok(M.manualRefreshMinMs >= 10 * 1000);
  const widget = fs.readFileSync(__dirname + "/../BarWidget.qml", "utf8");
  assert.ok(/MiddleButton[^\n]*softRefresh\(\)/.test(widget), "middle-click goes through the throttle");
  // A refusal is not retried for as long as the card cache lives.
  assert.ok(M.blockedRetryMs >= M.cardCacheMs);
});

test("every process output is size-checked before it is parsed", () => {
  const src = fs.readFileSync(__dirname + "/../Service.qml", "utf8");
  assert.strictEqual((src.match(/Model\.maxResponseChars/g) || []).length, 3, "events, card and records");
  assert.ok(M.maxResponseChars <= 32 * 1024 * 1024);
});

test("bin/mma-api caps, paces and pins its requests", () => {
  const api = fs.readFileSync(__dirname + "/../bin/mma-api", "utf8");
  assert.ok(/--proto-redir '=https'/.test(api) && /--max-redirs \d/.test(api), "redirects stay on https");
  assert.ok(/^SITE_PARALLEL=[1-4]$/m.test(api), "the HTML sites get a gentle pace");
  assert.ok(/^TOTAL_MAX=\d+$/m.test(api) && /fits\(\)/.test(api), "a per-command output budget");
  // Every fetch in a background job of an HTML site is paced by SITE_PARALLEL,
  // and the card's status request is no longer a second concurrent job.
  assert.strictEqual((api.match(/n % PARALLEL/g) || []).length, 1, "ESPN cards only");
  assert.strictEqual((api.match(/n % SITE_PARALLEL/g) || []).length, 4, "ARES cards, ARES results, Sherdog events, records");
  assert.ok(!/status\?lang=en" > "\$tmp\/\$n\.s\.json" 2> \/dev\/null \\\n\s*\|\| rm -f "\$tmp\/\$n\.s\.json"; \} &/.test(api));
});

test("a real record is kept until the fighter's next fight starts; N/A and blocked keep 12 hours", () => {
  const day = 24 * 3600 * 1000;
  const now = 100 * day;
  const card = (date, done) => ({ date: new Date(date).toISOString(), fights: [{ done, fighters: [{ name: "A" }, { name: "B" }] }] });
  const event = card(now + 10 * day, false);
  const past = card(now - 5 * day, true);
  assert.strictEqual(M.recordUntil("A", [past, event], now), now + 10 * day);
  assert.strictEqual(M.recordUntil("Nobody", [event], now), 0);
  assert.strictEqual(M.recordUntil("A", [past], now), 0);
  // The fight is on but not over: look again soon, so the new record shows.
  assert.strictEqual(M.recordUntil("A", [card(now - 3600 * 1000, false)], now), now + M.recordRetryMs);
  const until = now + 10 * day;
  // 8 days old, yet still good: the fight has not started.
  const at = now - 8 * day;
  const text = M.serializeCardCache({}, {
    A: { at, until, value: "10-2-0" }, Old: { at, value: "1-0-0" },
    Na: { at, until, value: "n/a" }, Far: { at, until: now + 5 * 366 * day, value: "2-0-0" }
  });
  const back = M.parseCardCache(text, now);
  assert.deepStrictEqual(Object.keys(back.records), ["A"]);
  assert.strictEqual(back.records.A.until, until);
  assert.deepStrictEqual(Object.keys(M.parseCardCache(text, until + 1).records), []);
});

test("parseScoreboard reads a bounded number of events from a padded response", () => {
  const events = Array.from({ length: 150000 }, (_, i) => ({ id: String(i), date: "2026-11-01T00:00Z" }))
  assert.ok(M.parseScoreboard({ events }, "ufc").length <= 200)
})
