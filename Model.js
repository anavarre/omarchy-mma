.pragma library

// Pure helpers shared by Service.qml, Panel.qml and BarWidget.qml, kept free of
// QML types so they can be unit-tested with node (tests/model.test.js).

// Promotions the settings pane offers. `enabled` ones have a data provider
// (ESPN).
var promotions = [
  { id: "ufc", label: "UFC", slug: "ufc", enabled: true, logo: "assets/ufc.png", description: "Ultimate Fighting Championship" },
  { id: "pfl", label: "PFL", slug: "pfl", enabled: true, logo: "assets/pfl.png", description: "Professional Fighters League" }
]

var defaultOrganizations = ["ufc"]
var eventLimitMin = 1
var eventLimitMax = 30
var refreshChoices = [60, 120, 180, 360, 720, 1440]
var lookaheadChoices = [30, 60, 90, 120, 180, 365]
// How many days a finished event stays listed, with a check mark.
var keepDaysChoices = [1, 3, 7]
var textSizeValues = ["small", "medium", "large", "xlarge"]
var timeFormats = ["12h", "24h"]

// Card sections in display order, with the labels ESPN uses.
var segmentOrder = ["main", "prelims1", "prelims2"]
var segmentLabels = { main: "Main Card", prelims1: "Prelims", prelims2: "Early Prelims" }

// The environment bin/mma-api is run with. A null value means "inherit this
// one from the shell"; everything else is dropped (clearEnvironment). The
// script's MMA_SITE_BASE / MMA_CORE_BASE overrides are deliberately not
// passed through: they are for running it by hand, and the service should
// never be pointed at another host by the shell's environment.
var environment = {
  PATH: "/usr/bin:/bin",
  HOME: null,
  XDG_CONFIG_HOME: null,
  XDG_CACHE_HOME: null
}

function localPath(url) {
  return decodeURIComponent(String(url).replace(/^file:\/\//, ""))
}

// ----------------------------------------------------------------- settings

function organizationOptions() {
  return promotions.map(function(p) {
    return { value: p.id, label: p.label, description: p.description }
  })
}

function promotionById(id) {
  for (var i = 0; i < promotions.length; i++) if (promotions[i].id === id) return promotions[i]
  return null
}

// What shell.json holds, reduced to promotions that can actually be fetched.
// A missing setting means the default; an explicit empty list means none.
function selectedOrganizations(value) {
  // The shell hands settings over as a QML list, which is array-like but
  // fails Array.isArray, so accept anything with a length and copy it out.
  if (value === null || value === undefined || typeof value === "string" || typeof value.length !== "number")
    return defaultOrganizations.slice()
  var list = []
  for (var i = 0; i < value.length; i++) list.push(value[i])
  var seen = ({})
  return list.filter(function(id) {
    var p = promotionById(id)
    if (!p || !p.enabled || seen[id]) return false
    seen[id] = true
    return true
  })
}

// The organizations after switching one on or off, in the order the
// promotions are listed. Unknown or unavailable ids are ignored.
function toggleOrganization(current, id, on) {
  var p = promotionById(id)
  if (!p || !p.enabled) return selectedOrganizations(current)
  var chosen = selectedOrganizations(current).filter(function(x) { return x !== id })
  if (on) chosen.push(id)
  return promotions.filter(function(q) { return chosen.indexOf(q.id) >= 0 }).map(function(q) { return q.id })
}

// The bundled logo path (relative to the plugin) for an event's promotion.
function logoFor(orgId) {
  var p = promotionById(orgId)
  return p && p.logo ? p.logo : ""
}

function clampEventLimit(value) {
  var n = Math.floor(Number(value))
  if (!isFinite(n)) return 10
  return Math.max(eventLimitMin, Math.min(eventLimitMax, n))
}

function snapTo(choices, value, fallback) {
  var n = Number(value)
  if (!isFinite(n)) return fallback
  var best = choices[0]
  for (var i = 1; i < choices.length; i++)
    if (Math.abs(choices[i] - n) < Math.abs(best - n)) best = choices[i]
  return best
}

function snapRefreshMinutes(value) { return snapTo(refreshChoices, value, 180) }
function snapLookaheadDays(value) { return snapTo(lookaheadChoices, value, 120) }

function knownKeepDays(value) {
  var n = Number(value)
  return keepDaysChoices.indexOf(n) >= 0 ? n : 1
}

function knownTextSize(value) {
  return textSizeValues.indexOf(value) >= 0 ? value : "medium"
}

function knownTimeFormat(value) {
  return timeFormats.indexOf(value) >= 0 ? value : "12h"
}

// ------------------------------------------------------------------- dates

function pad2(n) { return (n < 10 ? "0" : "") + n }

function ymd(date) {
  return "" + date.getUTCFullYear() + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate())
}

// The scoreboard's `dates` parameter: `back` days ago (default yesterday)
// through `days` days ahead.
function dateRange(now, days, back) {
  var from = new Date(now.getTime() - (back > 0 ? back : 1) * 24 * 3600 * 1000)
  var to = new Date(now.getTime() + days * 24 * 3600 * 1000)
  return ymd(from) + "-" + ymd(to)
}

var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// Dates are shown in the event's own time zone or the system's. QML's
// JavaScript has no Intl, so the venue zones below carry a standard offset and
// the daylight-saving rule of their region instead of the full tz database.
var localZone = "local"
var venueZoneId = "venue"

var zones = [
  { id: "UTC", label: "UTC", offset: 0 },
  { id: "America/Mexico_City", label: "Mexico City", offset: -360 },
  { id: "Pacific/Honolulu", label: "Honolulu", offset: -600 },
  { id: "America/Anchorage", label: "Anchorage", offset: -540, dst: "us" },
  { id: "America/Los_Angeles", label: "Los Angeles (PT)", offset: -480, dst: "us" },
  { id: "America/Denver", label: "Denver (MT)", offset: -420, dst: "us" },
  { id: "America/Phoenix", label: "Phoenix", offset: -420 },
  { id: "America/Chicago", label: "Chicago (CT)", offset: -360, dst: "us" },
  { id: "America/New_York", label: "New York (ET)", offset: -300, dst: "us" },
  { id: "America/Halifax", label: "Halifax", offset: -240, dst: "us" },
  { id: "America/Sao_Paulo", label: "São Paulo", offset: -180 },
  { id: "Europe/London", label: "London", offset: 0, dst: "eu" },
  { id: "Europe/Paris", label: "Paris / Berlin (CET)", offset: 60, dst: "eu" },
  { id: "Europe/Athens", label: "Athens / Helsinki", offset: 120, dst: "eu" },
  { id: "Africa/Johannesburg", label: "Johannesburg", offset: 120 },
  { id: "Europe/Moscow", label: "Moscow", offset: 180 },
  { id: "Asia/Riyadh", label: "Riyadh / Doha", offset: 180 },
  { id: "Asia/Dubai", label: "Abu Dhabi / Dubai", offset: 240 },
  { id: "Asia/Kolkata", label: "Mumbai", offset: 330 },
  { id: "Asia/Bangkok", label: "Bangkok", offset: 420 },
  { id: "Asia/Shanghai", label: "Singapore / Shanghai", offset: 480 },
  { id: "Australia/Perth", label: "Perth", offset: 480 },
  { id: "Asia/Tokyo", label: "Tokyo", offset: 540 },
  { id: "Australia/Sydney", label: "Sydney", offset: 600, dst: "au" },
  { id: "Pacific/Auckland", label: "Auckland", offset: 720, dst: "nz" }
]

function zoneIds() { return zones.map(function(z) { return z.id }) }

function knownTimeZone(value) {
  return value === localZone ? localZone : venueZoneId
}

var usStateZones = {
  HI: "Pacific/Honolulu", AK: "America/Anchorage",
  WA: "America/Los_Angeles", OR: "America/Los_Angeles", CA: "America/Los_Angeles", NV: "America/Los_Angeles",
  AZ: "America/Phoenix",
  MT: "America/Denver", ID: "America/Denver", WY: "America/Denver", UT: "America/Denver", CO: "America/Denver", NM: "America/Denver",
  ND: "America/Chicago", SD: "America/Chicago", NE: "America/Chicago", KS: "America/Chicago", OK: "America/Chicago",
  TX: "America/Chicago", MN: "America/Chicago", IA: "America/Chicago", MO: "America/Chicago", AR: "America/Chicago",
  LA: "America/Chicago", WI: "America/Chicago", IL: "America/Chicago", MS: "America/Chicago", AL: "America/Chicago",
  TN: "America/Chicago",
  MI: "America/New_York", IN: "America/New_York", OH: "America/New_York", KY: "America/New_York", GA: "America/New_York",
  FL: "America/New_York", SC: "America/New_York", NC: "America/New_York", VA: "America/New_York", WV: "America/New_York",
  MD: "America/New_York", DE: "America/New_York", DC: "America/New_York", PA: "America/New_York", NJ: "America/New_York",
  NY: "America/New_York", CT: "America/New_York", RI: "America/New_York", MA: "America/New_York", VT: "America/New_York",
  NH: "America/New_York", ME: "America/New_York"
}

var caProvinceZones = {
  BC: "America/Los_Angeles", AB: "America/Denver", SK: "America/Chicago", MB: "America/Chicago",
  ON: "America/New_York", QC: "America/New_York", NS: "America/Halifax", NB: "America/Halifax"
}

var auStateZones = { WA: "Australia/Perth", NSW: "Australia/Sydney", VIC: "Australia/Sydney", ACT: "Australia/Sydney", TAS: "Australia/Sydney" }

var countryZones = {
  "united arab emirates": "Asia/Dubai", "uae": "Asia/Dubai", "saudi arabia": "Asia/Riyadh", "qatar": "Asia/Riyadh",
  "united kingdom": "Europe/London", "uk": "Europe/London", "england": "Europe/London", "scotland": "Europe/London",
  "wales": "Europe/London", "ireland": "Europe/London", "portugal": "Europe/London",
  "france": "Europe/Paris", "germany": "Europe/Paris", "spain": "Europe/Paris", "italy": "Europe/Paris",
  "poland": "Europe/Paris", "netherlands": "Europe/Paris", "belgium": "Europe/Paris", "switzerland": "Europe/Paris",
  "austria": "Europe/Paris", "czech republic": "Europe/Paris", "czechia": "Europe/Paris", "denmark": "Europe/Paris",
  "sweden": "Europe/Paris", "norway": "Europe/Paris", "croatia": "Europe/Paris", "serbia": "Europe/Paris",
  "greece": "Europe/Athens", "finland": "Europe/Athens", "romania": "Europe/Athens", "bulgaria": "Europe/Athens",
  "russia": "Europe/Moscow", "south africa": "Africa/Johannesburg", "india": "Asia/Kolkata", "thailand": "Asia/Bangkok",
  "china": "Asia/Shanghai", "singapore": "Asia/Shanghai", "japan": "Asia/Tokyo", "brazil": "America/Sao_Paulo",
  "mexico": "America/Mexico_City", "new zealand": "Pacific/Auckland"
}

// The time zone of a venue, from its address, or "" when it is unknown. The
// scoreboard gives UTC start times and a city, state and country, no zone.
function zoneForAddress(address) {
  var a = address || {}
  var country = String(a.country || "").toLowerCase()
  var state = String(a.state || "").toUpperCase()
  if (country === "usa" || country === "united states" || country === "us")
    return usStateZones[state] || ""
  if (country === "canada") return caProvinceZones[state] || ""
  if (country === "australia") return auStateZones[state] || "Australia/Sydney"
  return countryZones[country] || ""
}

// The zone a time is shown in: the event's own venue (the system's when that
// is unknown) or the system's.
function effectiveZone(setting, event) {
  if (setting !== venueZoneId) return localZone
  return (event && event.tz) || localZone
}

function zoneById(id) {
  for (var i = 0; i < zones.length; i++) if (zones[i].id === id) return zones[i]
  return {}
}

// The UTC instant of the nth (1-based) or last (n = 0) Sunday of a month, at
// the given UTC hour.
function sundayUtc(year, month, n, hour) {
  if (n === 0) {
    var last = new Date(Date.UTC(year, month + 1, 0, hour))
    return last.getTime() - last.getUTCDay() * 86400000
  }
  var first = new Date(Date.UTC(year, month, 1, hour))
  return first.getTime() + (((7 - first.getUTCDay()) % 7) + (n - 1) * 7) * 86400000
}

// Whether a region's daylight-saving time is in force at a UTC instant.
function inDst(zone, ms) {
  var year = new Date(ms + zone.offset * 60000).getUTCFullYear()
  var std = zone.offset * 60000
  switch (zone.dst) {
  case "us": // 2nd Sunday of March to 1st Sunday of November, 02:00 local
    return ms >= sundayUtc(year, 2, 2, 2) - std && ms < sundayUtc(year, 10, 1, 2) - std - 3600000
  case "eu": // last Sunday of March to last Sunday of October, 01:00 UTC
    return ms >= sundayUtc(year, 2, 0, 1) && ms < sundayUtc(year, 9, 0, 1)
  case "au": // 1st Sunday of October to 1st Sunday of April, 02:00 standard time
    return ms < sundayUtc(year, 3, 1, 2) - std || ms >= sundayUtc(year, 9, 1, 2) - std
  case "nz": // last Sunday of September to 1st Sunday of April, 02:00 standard time
    return ms < sundayUtc(year, 3, 1, 2) - std || ms >= sundayUtc(year, 8, 0, 2) - std
  }
  return false
}

// The calendar fields of an ISO instant in a zone, or null if it is invalid.
function fieldsIn(iso, zoneId) {
  var d = new Date(iso)
  if (isNaN(d.getTime())) return null
  var zone = zoneById(zoneId)
  if (zone.offset === undefined)
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay(), hour: d.getHours(), minute: d.getMinutes() }
  var ms = d.getTime()
  var shifted = new Date(ms + (zone.offset + (inDst(zone, ms) ? 60 : 0)) * 60000)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(),
           weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() }
}

function formatDay(iso, zoneId) {
  var f = fieldsIn(iso, zoneId)
  if (!f) return ""
  return weekdays[f.weekday] + ", " + months[f.month] + " " + f.day
}

function formatTime(iso, format, zoneId) {
  var f = fieldsIn(iso, zoneId)
  if (!f) return ""
  var m = pad2(f.minute)
  if (format === "24h") return pad2(f.hour) + ":" + m
  return (f.hour % 12 === 0 ? 12 : f.hour % 12) + ":" + m + " " + (f.hour < 12 ? "AM" : "PM")
}

function dayNumber(f) { return Math.round(Date.UTC(f.year, f.month, f.day) / 86400000) }

function relativeDay(iso, now, zoneId) {
  var f = fieldsIn(iso, zoneId)
  if (!f) return ""
  var days = dayNumber(f) - dayNumber(fieldsIn(now.toISOString(), zoneId))
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days > 1 && days < 14) return "in " + days + " days"
  if (days >= 14) return "in " + Math.round(days / 7) + " weeks"
  return ""
}

// ----------------------------------------------------------------- parsing

function parseJson(text) {
  try { return JSON.parse(text) } catch (e) { return null }
}

// ESPN's responses are trusted for nothing, not even their shape: a field
// that should be a list may be an object, a string or missing, and a crash in
// here would leave the service stuck loading. Every list is read through
// these, and events and fights that are not objects are dropped.
function list(v) { return Array.isArray(v) ? v : [] }
function isObject(v) { return v !== null && typeof v === "object" }

// A fight card is at most about 15 bouts; the limit caps the card fetch,
// which runs one request per fight, whatever the scoreboard claims.
var maxFightsPerEvent = 40

function isTba(name) { return name === "" || /\btba\b/i.test(name) }

function fighter(c) {
  var a = (c && c.athlete) || {}
  var name = String(a.displayName || a.fullName || "")
  var tba = isTba(name)
  var recs = list(c && c.records)
  var rec = recs.length > 0 && isObject(recs[0]) ? recs[0].summary : ""
  return {
    name: tba ? "TBA" : name,
    shortName: tba ? "TBA" : String(a.shortName || name),
    record: tba || !rec ? "" : String(rec),
    country: tba ? "" : String(a.flag && a.flag.alt ? a.flag.alt : (a.flag || "")),
    winner: !!(c && c.winner),
    tba: tba
  }
}

// The two sides of a fight, champion or higher-billed fighter first. ESPN's
// `order` is 1 for that fighter and 2 for the challenger, but the scoreboard
// lists the competitors in no fixed order, so sort by it. Callers put
// `fighters[0]` on the left and `fighters[1]` on the right.
function sortedFighters(competitors) {
  var sides = list(competitors).map(function(c, i) {
    var o = Number(isObject(c) ? c.order : NaN)
    return { order: isFinite(o) && o > 0 ? o : i + 1, c: isObject(c) ? c : null }
  })
  sides.sort(function(a, b) { return a.order - b.order })
  var out = sides.map(function(x) { return fighter(x.c) })
  while (out.length < 2) out.push(fighter(null))
  return out.slice(0, 2)
}

function roundNumber(v) {
  var n = Number(v)
  return isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function fight(comp) {
  var periods = comp.format && comp.format.regulation ? Number(comp.format.regulation.periods) : 0
  return {
    id: String(comp.id),
    weightClass: String((comp.type && (comp.type.abbreviation || comp.type.text)) || ""),
    rounds: isFinite(periods) ? periods : 0,
    startDate: String(comp.startDate || comp.date || ""),
    status: String((comp.status && comp.status.type && comp.status.type.name) || ""),
    done: !!(comp.status && comp.status.type && comp.status.type.completed === true),
    round: roundNumber(comp.status && comp.status.period),
    clock: String((comp.status && comp.status.displayClock) || ""),
    fighters: sortedFighters(comp.competitors),
    // Filled in from the core API once the card is opened.
    segment: "",
    matchNumber: 0,
    champion: false
  }
}

function venueText(venue) {
  if (!venue) return ""
  var a = venue.address || {}
  var place = [a.city, a.state || a.country].filter(function(s) { return !!s }).join(", ")
  return [venue.fullName, place].filter(function(s) { return !!s }).join(" · ")
}

function broadcastText(comp) {
  if (!comp) return ""
  if (comp.broadcast) return String(comp.broadcast)
  var b = list(comp.broadcasts)[0]
  return isObject(b) ? list(b.names).map(String).join(", ") : ""
}

// A URL that may be handed to the browser launcher: https only, no
// whitespace or quoting characters. Anything else becomes "".
function safeUrl(href) {
  var s = String(href || "")
  return /^https:\/\/[^\s"'<>\\]+$/.test(s) ? s : ""
}

// The event's ESPN page, from the link marked as the event's own.
function eventUrl(e) {
  var links = list(e.links)
  for (var i = 0; i < links.length; i++) {
    var l = links[i]
    if (isObject(l) && list(l.rel).indexOf("event") >= 0 && safeUrl(l.href) !== "") return safeUrl(l.href)
  }
  return ""
}

// Events from a scoreboard response. Cancelled ones are dropped; finished ones
// are kept, flagged `finished`, for the panel to show a while (visibleEvents).
// The rest are sorted by date.
function parseScoreboard(text, orgId) {
  var data = typeof text === "string" ? parseJson(text) : text
  if (!data || !Array.isArray(data.events)) return []
  var promo = promotionById(orgId)
  var out = []
  data.events.forEach(function(e) {
    if (!isObject(e)) return
    var comps = list(e.competitions).filter(isObject).slice(0, maxFightsPerEvent)
    var status = (e.status && e.status.type && e.status.type.name) || ""
    if (status === "STATUS_CANCELED") return
    var fights = comps.map(fight)
    var first = comps[0] || null
    // The main event is the last fight the scoreboard lists.
    var headliner = fights.length > 0 ? fights[fights.length - 1] : null
    var venues = list(e.venues).filter(isObject)
    var venue = venues[0] || (first && isObject(first.venue) ? first.venue : null)
    out.push({
      id: String(e.id),
      org: orgId,
      orgLabel: promo ? promo.label : String(orgId).toUpperCase(),
      logo: logoFor(orgId),
      slug: promo ? promo.slug : String(orgId),
      name: String(e.name || e.shortName || ""),
      shortName: String(e.shortName || e.name || ""),
      date: String(e.date || ""),
      finished: status === "STATUS_FINAL",
      venue: venueText(venue),
      tz: zoneForAddress(venue && venue.address),
      broadcast: broadcastText(first),
      url: eventUrl(e),
      fights: fights,
      fightCount: fights.length,
      headliner: headliner
    })
  })
  return sortEvents(out)
}

function sortEvents(events) {
  return events.slice().sort(function(a, b) {
    var d = new Date(a.date).getTime() - new Date(b.date).getTime()
    return d !== 0 ? d : (a.id < b.id ? -1 : 1)
  })
}

// ESPN gives no end time, so a card is taken to be over this long after it
// started (a main card runs about five hours).
var eventLengthMs = 6 * 3600 * 1000

// Whether an event is over, and was over less than `days` days ago.
function recentlyFinished(e, now, days) {
  if (!e || e.finished !== true) return false
  var over = new Date(e.date).getTime() + eventLengthMs
  return isFinite(over) && Number(now) - over < knownKeepDays(days) * 86400000
}

// What the list shows, in date order: every unfinished event, and finished
// ones for `days` days after they ended.
function visibleEvents(events, now, days) {
  return sortEvents(events.filter(function(e) {
    return e.finished !== true || recentlyFinished(e, now, days)
  }))
}

// The soonest event still to come, if any.
function nextEvent(events) {
  for (var i = 0; i < events.length; i++) if (events[i].finished !== true) return events[i]
  return null
}

// Several organizations' events merged into one list, limited. Finished events
// older than `days` are left out first, so they never use up the limit.
function mergeEvents(lists, limit, now, days) {
  var all = []
  lists.forEach(function(l) { all = all.concat(l) })
  return visibleEvents(all, now === undefined ? Date.now() : now, days).slice(0, clampEventLimit(limit))
}

// Title fights carry a "types" entry such as "UFC Heavyweight Title". There is
// no belt glyph in Unicode, so the champion gets a crown. ESPN has no champion
// flag, so a champion is inferred: fighter order 1 of a title fight. An interim
// title ("UFC Interim Welterweight Title") has no champion yet, so no crown.
var titleGlyph = "\uD83D\uDC51"

function isChampionFight(c) {
  return list(c.types).some(function(t) {
    var text = String(t && t.text || "")
    return /\btitle\b/i.test(text) && !/\binterim\b/i.test(text)
  })
}

// { competitionId: { segment, label, matchNumber, champion } } from the JSON array
// bin/mma-api card prints.
function parseSegments(text) {
  var data = typeof text === "string" ? parseJson(text) : text
  var map = ({})
  if (!Array.isArray(data)) return map
  var methods = ({})
  data.forEach(function(c) {
    // A fight's status object: how it was won. It carries no id, only a $ref.
    var m = isObject(c) && isObject(c.result) ? /\/competitions\/(\d+)\/status/.exec(String(c["$ref"] || "")) : null
    if (m) methods[m[1]] = methodLabel(c.result)
    if (!isObject(c) || c.id === undefined) return
    var seg = isObject(c.cardSegment) ? c.cardSegment : {}
    map[String(c.id)] = {
      segment: String(seg.name || ""),
      label: String(seg.description || ""),
      matchNumber: Number(c.matchNumber) || 0,
      champion: isChampionFight(c),
      method: ""
    }
  })
  for (var id in methods) if (map[id]) map[id].method = methods[id]
  return map
}

// "KO/TKO (Punch)", "Unanimous Decision", "Submission (Rear Naked Choke)".
function methodLabel(result) {
  var name = str(result.displayName)
  var decision = /^Decision\s*-\s*(.+)$/i.exec(name)
  if (decision) return decision[1] + " Decision"
  var how = str(result.description)
  return how && how !== name ? name + " (" + how + ")" : name
}

// ------------------------------------------------------------------- cards

function segmentRank(key) {
  var i = segmentOrder.indexOf(key)
  return i >= 0 ? i : segmentOrder.length
}

// Sections of an event's card, main card first, then prelims. `segments` is
// the parseSegments map; when it covers nothing (a promotion that doesn't
// publish segments, or the request failed) the card is split by the fights'
// own start times instead: the latest start is the main card, earlier ones
// the prelims. Inside each section the main event comes first.
function buildCard(event, segments) {
  segments = segments || ({})
  var fights = list(event && event.fights).map(function(f, i) {
    var s = segments[f.id]
    var copy = {}
    for (var k in f) copy[k] = f[k]
    // The scoreboard lists fights in ascending billing, main event last, so a
    // higher index is a higher billing.
    copy.rank = i
    copy.segment = s ? s.segment : ""
    copy.matchNumber = s ? s.matchNumber : 0
    copy.champion = s ? s.champion : false
    copy.segmentLabel = s ? s.label : ""
    copy.method = s ? s.method : ""
    return copy
  })
  var known = fights.some(function(f) { return f.segment !== "" })
  var sections = known ? sectionsFromSegments(fights) : sectionsFromStartTimes(fights)
  return sections.filter(function(s) { return s.fights.length > 0 })
}

function byBilling(a, b) {
  if (a.matchNumber > 0 && b.matchNumber > 0) return a.matchNumber - b.matchNumber
  return b.rank - a.rank
}

function sectionsFromSegments(fights) {
  var groups = ({})
  var keys = []
  fights.forEach(function(f) {
    var key = f.segment !== "" ? f.segment : "main"
    if (!groups[key]) { groups[key] = { key: key, label: f.segmentLabel || segmentLabels[key] || key, fights: [] }; keys.push(key) }
    groups[key].fights.push(f)
  })
  keys.sort(function(a, b) { return segmentRank(a) - segmentRank(b) })
  return keys.map(function(k) {
    groups[k].fights.sort(byBilling)
    groups[k].label = segmentLabels[k] || groups[k].label
    return groups[k]
  })
}

function sectionsFromStartTimes(fights) {
  var times = []
  fights.forEach(function(f) { if (times.indexOf(f.startDate) < 0) times.push(f.startDate) })
  // Latest start first: that is the main card.
  times.sort(function(a, b) { return new Date(b).getTime() - new Date(a).getTime() })
  var keys = ["main", "prelims1", "prelims2"]
  return times.map(function(t, i) {
    var key = keys[Math.min(i, keys.length - 1)]
    var inGroup = fights.filter(function(f) { return f.startDate === t })
    inGroup.sort(byBilling)
    return { key: key, label: segmentLabels[key], fights: inGroup }
  }).reduce(function(acc, s) {
    // More start times than sections: fold the extras into the last one.
    var last = acc[acc.length - 1]
    if (last && last.key === s.key) last.fights = last.fights.concat(s.fights)
    else acc.push(s)
    return acc
  }, [])
}

// When a section starts: its earliest fight's start time, or "" if unknown.
function sectionStart(section) {
  var best = ""
  section.fights.forEach(function(f) {
    if (f.startDate && (best === "" || new Date(f.startDate).getTime() < new Date(best).getTime())) best = f.startDate
  })
  return best
}

function isMainEvent(section, index) {
  var f = section.fights[index]
  return f.matchNumber === 1 || (f.matchNumber === 0 && section.key === "main" && index === 0)
}

function fightTitle(f) {
  return f.fighters[0].name + " vs " + f.fighters[1].name
}

// "Gane vs Hokit" style line for the bar tooltip.
function headlinerText(event) {
  var h = event && event.headliner
  if (!h) return ""
  return h.fighters[0].shortName + " vs " + h.fighters[1].shortName
}

// The crown marks a title fight and sits next to the fight details (main event,
// weight class), not next to a fighter's name.
function crownFor(f) {
  return f.champion ? titleGlyph + " " : ""
}

function weightClassLabel(f) {
  var parts = []
  if (f.weightClass) parts.push(f.weightClass)
  if (f.rounds) parts.push(f.rounds + " rds")
  return parts.join(" · ")
}

// "win" or "loss" for fighter `i` of a finished fight. ESPN reports `winner:
// false` for both sides of a draw, a no-contest and a bout still to come, so
// only a final fight with a winner on one side says anything.
function outcome(f, i) {
  if (!f.done || !(f.fighters[0].winner || f.fighters[1].winner)) return "none"
  return f.fighters[i].winner ? "win" : "loss"
}

// "R3 3:26 KO/TKO (Punch)" for a finished fight; the method is empty until the
// card has loaded (or if ESPN has none, as for some old fights).
function resultLabel(f) {
  if (!f.done) return ""
  // A decision always goes the distance, so the round and time say nothing.
  if (/decision/i.test(f.method || "")) return f.method
  var end = f.round ? "R" + f.round + (f.clock ? " " + f.clock : "") : ""
  return [end, f.method || ""].filter(Boolean).join(" ")
}

// ------------------------------------------------------------------- cache

function serializeCache(events, fetchedAt) {
  return JSON.stringify({ version: 1, fetchedAt: fetchedAt, events: events })
}

function parseCache(text) {
  var data = parseJson(text)
  if (!data || data.version !== 1 || !Array.isArray(data.events)) return null
  return { fetchedAt: Number(data.fetchedAt) || 0, events: sanitizeEvents(data.events) }
}

// The cache file is writable by anything running as the user, so what comes
// out of it is rebuilt field by field rather than trusted: ids must be
// numeric (they become bin/mma-api arguments), the promotion must be a known
// one (its logo, slug and label are re-derived, never read back), and the
// event URL must pass safeUrl. Events and fights that fail are dropped.
var isId = function(v) { return /^[0-9]{1,20}$/.test(String(v)) }
var str = function(v) { return v === undefined || v === null ? "" : String(v) }

function sanitizeFighter(x) {
  var f = x && typeof x === "object" ? x : {}
  return {
    name: str(f.name) || "TBA",
    shortName: str(f.shortName) || str(f.name) || "TBA",
    record: str(f.record),
    country: str(f.country),
    winner: f.winner === true,
    tba: f.tba === true || !str(f.name)
  }
}

function sanitizeFight(f) {
  if (!f || typeof f !== "object" || !isId(f.id)) return null
  var fighters = Array.isArray(f.fighters) ? f.fighters.slice(0, 2).map(sanitizeFighter) : []
  while (fighters.length < 2) fighters.push(sanitizeFighter(null))
  var rounds = Number(f.rounds)
  return {
    id: String(f.id),
    weightClass: str(f.weightClass),
    rounds: isFinite(rounds) && rounds > 0 ? Math.floor(rounds) : 0,
    startDate: str(f.startDate),
    status: str(f.status),
    done: f.done === true,
    round: roundNumber(f.round),
    clock: str(f.clock),
    fighters: fighters,
    segment: "",
    matchNumber: 0,
    champion: false
  }
}

function sanitizeEvent(e) {
  if (!e || typeof e !== "object" || !isId(e.id)) return null
  var promo = promotionById(e.org)
  if (!promo || !promo.enabled) return null
  var fights = list(e.fights).slice(0, maxFightsPerEvent).map(sanitizeFight).filter(function(f) { return f !== null })
  return {
    id: String(e.id),
    org: promo.id,
    orgLabel: promo.label,
    logo: logoFor(promo.id),
    slug: promo.slug,
    name: str(e.name),
    shortName: str(e.shortName) || str(e.name),
    date: str(e.date),
    finished: e.finished === true,
    venue: str(e.venue),
    tz: knownEventZone(e.tz),
    broadcast: str(e.broadcast),
    url: safeUrl(e.url),
    fights: fights,
    fightCount: fights.length,
    headliner: fights.length > 0 ? fights[fights.length - 1] : null
  }
}

// A cached zone id is kept only when it is one this version knows.
function knownEventZone(id) {
  return zoneIds().indexOf(id) >= 0 ? id : ""
}

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return []
  return events.map(sanitizeEvent).filter(function(e) { return e !== null })
}

// Events cached before they started are still worth showing offline; ones
// that began more than half a day ago are not, unless they are finished ones
// still inside their `days` window.
function upcomingOnly(events, now, days) {
  var cutoff = now.getTime() - 12 * 3600 * 1000
  return events.filter(function(e) {
    if (e.finished === true) return recentlyFinished(e, now.getTime(), days)
    return new Date(e.date).getTime() >= cutoff
  })
}

// Events whose promotion is one of the selected ones.
function forOrganizations(events, selected) {
  return events.filter(function(e) { return selected.indexOf(e.org) >= 0 })
}

function errorMessage(stderr, exitCode) {
  var s = String(stderr || "").replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 160)
  return s !== "" ? s : "Request failed (" + exitCode + ")"
}
