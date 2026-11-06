.pragma library

// Pure helpers shared by Service.qml, Panel.qml and BarWidget.qml, kept free of
// QML types so they can be unit-tested with node (tests/model.test.js).

// Promotions the settings pane offers. `enabled` ones have a data provider:
// "espn" (the default), "wikipedia" (see parseWikipedia), "ares" (parseAres) or "sherdog" (parseSherdog).
var promotions = [
  { id: "ufc", label: "UFC", slug: "ufc", enabled: true, logo: "assets/ufc.png", description: "Ultimate Fighting Championship" },
  { id: "pfl", label: "PFL", slug: "pfl", enabled: true, logo: "assets/pfl.png", description: "Professional Fighters League" },
  { id: "cw", experimental: true, label: "Cage Warriors", slug: "cage-warriors", enabled: true, logo: "assets/cw.png", tag: "CW", provider: "wikipedia", wikiPage: "Cage_Warriors", idBase: 8000000, description: "Cage Warriors Fighting Championship" },
  { id: "ksw", experimental: true, label: "KSW", slug: "ksw", enabled: true, logo: "assets/ksw.png", tag: "KSW", provider: "wikipedia", wikiPage: "Konfrontacja_Sztuk_Walki", idBase: 8300000, description: "Konfrontacja Sztuk Walki" },
  { id: "ares", experimental: true, label: "ARES", slug: "ares", enabled: true, logo: "assets/ares.png", tag: "ARES", provider: "ares", idBase: 8600000, description: "ARES Fighting Championship" },
  { id: "oktagon", experimental: true, label: "Oktagon", slug: "oktagon", enabled: true, logo: "assets/oktagon.png", tag: "OKT", provider: "wikipedia", wikiPage: "Oktagon_MMA", idBase: 8700000, description: "Oktagon MMA" },
  { id: "hxmma", experimental: true, label: "Hexagone MMA", slug: "hxmma", enabled: true, logo: "assets/hxmma.png", tag: "HX", provider: "sherdog", idBase: 8800000, description: "Hexagone MMA (France)" },
  { id: "aca", experimental: true, label: "ACA", slug: "aca", enabled: true, logo: "assets/aca.png", tag: "ACA", provider: "wikipedia", wikiPage: "Absolute_Championship_Akhmat", idBase: 8900000, description: "Absolute Championship Akhmat" },
  { id: "one", experimental: true, label: "ONE", slug: "one", enabled: true, logo: "assets/one.png", tag: "ONE", provider: "wikipedia", wikiPage: "ONE_Championship", mmaOnly: true, idBase: 9000000, description: "ONE Championship (MMA bouts only)" }
]

var defaultOrganizations = ["ufc"]
var eventLimitMin = 1
var eventLimitMax = 30
// Hard budgets for what a remote answer can make us hold or look up: events
// kept after merging, event sections read from one Wikipedia page, and names
// waiting for a record lookup at any one time.
var remoteEventMax = 60
var wikiSectionMax = 200
var recordQueueBudget = 40
// What the card cache keeps, in memory and on disk: the newest entries only.
var cacheSegmentMax = 60
var cacheRecordMax = 500
// A fighter Sherdog would not answer for is not asked again for this long
// (the card cache's 12 hours): a vendor that refuses is left alone, and the
// hard refresh does not reset this either.
var blockedRetryMs = 12 * 60 * 60 * 1000
// A refresh the user asks for (r, middle-click) is ignored when the last one
// was this recent: key repeat must not turn into a request storm.
var manualRefreshMinMs = 30 * 1000
// bin/mma-api already caps every answer; the service still refuses to parse
// anything beyond this, so a runaway response can never be fed to the parsers
// (which run on the shell's GUI thread).
var maxResponseChars = 16 * 1024 * 1024
// Hosts an event link may point to. ESPN's link field is remote-controlled,
// so the browser is only ever sent to one of the sources themselves.
var linkHosts = ["espn.com", "wikipedia.org", "aresfighting.com", "sherdog.com"]
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

// The short text shown in the list's logo slot for a promotion without a
// logo: it has to fit a small square, so "CW", not "Cage Warriors".
function tagFor(orgId) {
  var p = promotionById(orgId)
  return p ? (p.tag || p.label) : String(orgId).toUpperCase()
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
  "russia": "Europe/Moscow", "belarus": "Europe/Moscow", "south africa": "Africa/Johannesburg", "india": "Asia/Kolkata", "thailand": "Asia/Bangkok",
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
    champion: false,
    method: ""
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

// A URL that may be handed to the browser launcher: https only, on one of the
// sources' own hosts (or a subdomain), no whitespace or quoting characters.
// Anything else becomes "".
function safeUrl(href) {
  var s = String(href || "")
  var m = /^https:\/\/([a-z0-9.-]{1,253})(?:[/?#][^\s"'<>\\]*)?$/i.exec(s)
  if (!m) return ""
  var host = m[1].toLowerCase()
  var allowed = linkHosts.some(function(h) { return host === h || host.slice(-(h.length + 1)) === "." + h })
  return allowed ? s : ""
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
      orgTag: tagFor(orgId),
      logo: logoFor(orgId),
      slug: promo ? promo.slug : String(orgId),
      name: String(e.name || e.shortName || ""),
      shortName: String(e.shortName || e.name || ""),
      date: String(e.date || ""),
      finished: status === "STATUS_FINAL",
      dateOnly: false,
      inline: false,
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

// Lower-cased, accent-free text, so "jiri prochazka" finds "Jiří Procházka".
function searchText(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

// The events that match a search: every word typed has to appear in the
// event's name, its organization or the name of one of its fighters.
function filterEvents(events, query) {
  var words = searchText(query).split(/\s+/).filter(function(w) { return w !== "" })
  if (words.length === 0) return events
  return events.filter(function(e) {
    var parts = [e.name, e.shortName, e.orgLabel]
    list(e.fights).forEach(function(f) {
      list(f && f.fighters).forEach(function(x) { if (x) parts.push(x.name, x.shortName) })
    })
    var hay = searchText(parts.join(" "))
    return words.every(function(w) { return hay.indexOf(w) >= 0 })
  })
}

// Events of one organization; an empty `org` keeps them all.
function filterByOrg(events, org) {
  if (!org) return events
  return events.filter(function(e) { return e.org === org })
}

// The organizations present in `events`, in promotion order, as { id, label }.
function eventOrganizations(events) {
  var seen = ({})
  events.forEach(function(e) { seen[e.org] = true })
  return promotions.filter(function(p) { return seen[p.id] })
    .map(function(p) { return { id: p.id, label: p.label } })
}

// The soonest event still to come, if any.
function nextEvent(events) {
  for (var i = 0; i < events.length; i++) if (events[i].finished !== true) return events[i]
  return null
}

// Several organizations' events merged into one list, limited (Infinity keeps
// them all). Finished events older than `days` are left out first, so they
// never use up the limit.
function mergeEvents(lists, limit, now, days) {
  var all = []
  lists.forEach(function(l) { all = all.concat(l) })
  var events = visibleEvents(all, now === undefined ? Date.now() : now, days)
  return events.slice(0, limit === Infinity ? remoteEventMax : clampEventLimit(limit))
}

// Queues a record lookup for `names` of an event. A name already waiting (or
// being looked up, `active`) is shared with that job rather than asked again,
// and no more than `budget` names wait at once. Returns the names that did not
// fit; the caller leaves that card unsettled so opening it again retries.
function enqueueRecords(queue, active, event, names, budget) {
  var owner = ({})
  var total = 0
  queue.forEach(function(j) { j.names.forEach(function(n) { owner[n] = j; total++ }) })
  if (active) active.names.forEach(function(n) { owner[n] = active })
  var fresh = []
  var dropped = []
  names.forEach(function(n) {
    var j = owner[n]
    if (j) {
      if (!j.events.some(function(e) { return e.id === event.id })) j.events.push(event)
      return
    }
    if (total + fresh.length >= budget) { dropped.push(n); return }
    fresh.push(n)
  })
  if (fresh.length > 0) queue.push({ events: [event], names: fresh })
  return dropped
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
    // Fights from a provider that carries the whole card (Wikipedia) bring
    // their own segment, billing and method; ESPN's come from `segments`.
    copy.segment = s ? s.segment : str(f.segment)
    copy.matchNumber = s ? s.matchNumber : (Number(f.matchNumber) || 0)
    copy.champion = s ? s.champion : f.champion === true
    copy.segmentLabel = s ? s.label : ""
    copy.method = s ? s.method : str(f.method)
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

// ----------------------------------------------------------------- records
// Wikipedia's cards name fighters but carry no records, so `bin/mma-api records`
// looks them up on Sherdog. The answer is a JSON object {name: value}, where
// value is "W-L-D", "n/a" (Sherdog answered but has no usable record) or
// "blocked" (it did not answer properly). Anything else is dropped, whatever
// the server sent.
var recordShape = /^[0-9]{1,3}-[0-9]{1,3}-[0-9]{1,3}(?: \([0-9]{1,3} NC\))?$/

function parseRecords(text) {
  var out = ({})
  var data
  try { data = JSON.parse(text) } catch (e) { return out }
  if (!isObject(data)) return out
  Object.keys(data).forEach(function(name) {
    var v = data[name]
    if (typeof v === "string" && (recordShape.test(v) || v === "n/a" || v === "blocked")) out[name] = v
  })
  return out
}

// Names on an event's card that have no record yet, each once. Only a real
// record counts as known: "n/a" and "blocked" are looked up again.
function namesNeedingRecords(event, known) {
  var seen = ({})
  var names = []
  list(event && event.fights).forEach(function(f) {
    list(f.fighters).forEach(function(x) {
      if (!x || x.tba || x.record || !x.name || seen[x.name] || (known && recordShape.test(str(known[x.name])))) return
      seen[x.name] = true
      names.push(x.name)
    })
  })
  return names
}

// A copy of the event whose fighters carry the records found for them. A
// fighter still without one is flagged recordPending while the lookup runs and
// recordMissing once it is `settled`, so the panel can show a spinner and then
// say why there is none: "blocked" (the vendor refused) or "na" (it has none).
function withRecords(event, records, settled) {
  var copy = {}
  for (var k in event) copy[k] = event[k]
  copy.fights = list(event && event.fights).map(function(f) {
    var g = {}
    for (var k2 in f) g[k2] = f[k2]
    g.fighters = list(f.fighters).map(function(x) {
      var h = {}
      for (var k3 in x) h[k3] = x[k3]
      if (!h.record && Object.prototype.hasOwnProperty.call(records, h.name) && recordShape.test(str(records[h.name]))) h.record = records[h.name]
      var wanted = event.inline === true && !h.record && !h.tba
      h.recordMissing = wanted && settled === true ? (records[h.name] === "n/a" ? "na" : "blocked") : ""
      h.recordPending = wanted && settled !== true
      return h
    })
    return g
  })
  return copy
}

// ------------------------------------------------------------ wikipedia
//
// Cage Warriors has no usable ESPN coverage and its own site refuses
// programmatic clients, so its events come from Wikipedia's "<year> in Cage
// Warriors" pages (bin/mma-api wiki cw). KSW does the same: ESPN's KSW feed
// stops at December 2024. Each event is a section holding an
// infobox (date, venue, city) and a card of {{MMAevent bout}} templates, with
// results filled in after the fact. The pages have dates but no start times,
// so these events are `dateOnly`, and they carry their whole card (`inline`):
// there is no second request when one is opened.

function providerOf(orgId) {
  var p = promotionById(orgId)
  return p && p.provider ? p.provider : "espn"
}

// Years whose "<year> in ..." pages cover the window: from `back`
// days ago to `days` days ahead.
function wikiYears(now, days, back) {
  var from = new Date(now.getTime() - (back > 0 ? back : 1) * 86400000).getUTCFullYear()
  var to = new Date(now.getTime() + days * 86400000).getUTCFullYear()
  var years = []
  for (var y = from; y <= to && years.length < 4; y++) years.push(String(y))
  return years
}

// Wikitext reduced to the plain text a reader sees: links, templates, refs and
// emphasis removed.
//
// Every lazy or open-ended match in this file is bounded ({0,n}). The input
// is remote, and Wikipedia's is editable by anyone: an unbounded lazy run
// against a page that opens a construct and never closes it scans to the end
// of the page once per opener, which is quadratic and froze the shell for
// minutes in tests. With a bound, each opener costs at most n steps. Where
// only the first occurrence matters, the regex runs on a slice at it instead,
// so a page full of openers costs one scan, not one per opener.
function wikiPlain(text) {
  var s = str(text).slice(0, plainMax)
  s = s.replace(/<ref[^>]{0,500}\/>/gi, "").replace(/<ref[^>]{0,500}>[\s\S]{0,5000}?<\/ref>/gi, "")
  s = s.replace(/<!--[\s\S]{0,20000}?-->/g, "").replace(/<br\s*\/?>/gi, " ")
  s = s.replace(/<[^>]{0,1000}>/g, "")
  s = s.replace(/\{\{(?:flagicon|flag|nowrap)[^{}]{0,500}\}\}/gi, "")
  s = s.replace(/\[\[(?:[^\]|]{0,500}\|)?([^\]]{0,1000})\]\]/g, "$1")
  s = s.replace(/'{2,}/g, "")
  return s.replace(/\s+/g, " ").trim()
}

function capitalized(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() }

// "Decision (unanimous) (29–28, ...)" -> "Unanimous Decision"; the judges'
// scores and any other trailing note are dropped. "TKO (punches)" is kept.
function wikiMethod(text) {
  var s = wikiPlain(text)
  var m = /^(Decision|Draw)\s*\(\s*(unanimous|split|majority)\s*\)/i.exec(s)
  if (m) return capitalized(m[2]) + " " + capitalized(m[1])
  return s.replace(/\s*\((?=[^)]{0,200}\d\s*[–-]\s*\d)[^)]{0,200}\)\s*$/, "").slice(0, 80)
}

function wikiSegment(label) {
  var s = wikiPlain(str(label).slice(0, 300)).toLowerCase()
  if (/early|prelim.{0,100}2/.test(s)) return "prelims2"
  if (/prelim/.test(s)) return "prelims1"
  return "main"
}

// The {{MMAevent card}} and {{MMAevent bout}} templates of an event's section,
// in listed order (main event first): [{ segment, parts: [...] }].
function wikiBouts(section) {
  var out = []
  var segment = "main"
  // The section is cut at every template opener, then each body is read up
  // to its own close with indexOf: one pass, whatever the page repeats.
  var pieces = String(section).split(/\{\{MMAevent (card|bout)\b/)
  for (var i = 1; i + 1 < pieces.length && out.length < maxFightsPerEvent; i += 2) {
    var body = pieces[i + 1]
    if (pieces[i] === "card") {
      // "{{MMAevent card|Main card}}": one line, nothing nested.
      var close = body.indexOf("}}")
      var line = body.indexOf("\n")
      if (body.charAt(0) !== "|" || close < 0 || close > 500 || (line >= 0 && line < close)) continue
      segment = wikiSegment(body.slice(1, close).split("|")[0])
      continue
    }
    var end = body.indexOf("\n}}")
    if (end < 0) continue
    out.push({ segment: segment, parts: body.slice(0, Math.min(end, 8000)).split(/\n\|/).slice(1) })
  }
  return out
}

// ONE Championship's page has no bout templates, only a results table whose
// rows read: weight class (it ends in the sport: "Lightweight MMA", "Flyweight
// Muay Thai"), fighter, "def."/"vs.", fighter, method, round, time, notes.
// Returns the MMA rows only, in the shape wikiBouts gives.
function wikiTableBouts(section) {
  var out = []
  // The first table after the Results heading, read at its first opener only.
  var after = section.split(/^===\s*Results\s*===/mi)[1] || ""
  var table = /^\{\|[\s\S]{0,200000}?^\|\}/m.exec(atFirst(after, /^\{\|/m, 200000))
  if (!table) return out
  table[0].split(/^\|-[^\n]*$/m).forEach(function(row) {
    if (out.length >= maxFightsPerEvent) return
    var cells = row.split("\n").filter(function(l) { return /^\|(?![}+-])/.test(l) }).map(function(l) {
      // Cell attributes ("align=center|", 'style="..." |') are dropped. The
      // value class excludes "=", so each repetition eats exactly one
      // attribute and a line of "a=a=a=..." cannot be split in 2^n ways.
      return l.slice(1, 2001).replace(/^\s*(?:[a-z]+\s*=\s*"?[^|"\[{=]{0,200}"?\s*)+\|(?!\|)/i, "")
    })
    if (cells.length < 7 || !/\bMMA\s*$/.test(wikiPlain(cells[0]))) return
    cells[0] = wikiPlain(cells[0]).replace(/\s*\bMMA\s*$/, "")
    out.push({ segment: "main", parts: cells })
  })
  return out
}

function wikiFighter(raw, winner) {
  var name = wikiPlain(raw)
  var crowned = /\((?:c|ic)\)/i.test(name)
  name = name.replace(/\s*\((?:c|ic)\)\s*/gi, " ").trim()
  var tba = isTba(name)
  return { name: tba ? "TBA" : name, shortName: tba ? "TBA" : name, record: "", country: "", winner: winner, tba: tba, crowned: crowned }
}

function wikiFight(b, index) {
  var p = b.parts
  var versus = wikiPlain(p[2] || "")
  var method = wikiMethod(p[4] || "")
  var done = method !== ""
  var decisive = done && /^def/i.test(versus)
  var a = wikiFighter(p[1], decisive)
  var d = wikiFighter(p[3], false)
  var note = wikiPlain(p[7] || "")
  // A title fight reads "For the ... Championship"; an interim title has no
  // champion yet, so there is no crown (as for ESPN's).
  var title = /\bchampionship\b|\btitle\b/i.test(note) && !/\binterim\b/i.test(note)
  return {
    id: String(index + 1),
    weightClass: wikiPlain(p[0] || ""),
    rounds: 0,
    startDate: "",
    status: done ? "STATUS_FINAL" : "STATUS_SCHEDULED",
    done: done,
    round: roundNumber(wikiPlain(p[5] || "")),
    clock: wikiPlain(p[6] || ""),
    fighters: [a, d].map(function(f) {
      return { name: f.name, shortName: f.shortName, record: "", country: "", winner: f.winner, tba: f.tba }
    }),
    segment: b.segment,
    matchNumber: index + 1,
    champion: title || a.crowned || d.crowned,
    method: method
  }
}

// "{{start date|2026|11|7}}" or "{{Start date|2026|2|21|...}}" -> noon UTC of
// that day, so every time zone shows the right date; "" when unreadable.
var monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

// Also reads the plain "November 21, 2026" and "21 November 2026" some pages
// (KSW's) write instead of the template.
function wikiDate(text) {
  var t = wikiPlain(text)
  var y, mo, day
  var m = /\{\{\s*start date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(str(text))
  if (m) { y = Number(m[1]); mo = Number(m[2]) - 1; day = Number(m[3]) }
  else if ((m = /^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})/.exec(t))) { mo = monthNames.indexOf(m[1].toLowerCase()); y = Number(m[3]); day = Number(m[2]) }
  else if ((m = /^(\d{1,2}) ([A-Za-z]+),? (\d{4})/.exec(t))) { mo = monthNames.indexOf(m[2].toLowerCase()); y = Number(m[3]); day = Number(m[1]) }
  else return ""
  if (mo < 0 || mo > 11 || day < 1 || day > 31) return ""
  var d = new Date(Date.UTC(y, mo, day, 12))
  return isNaN(d.getTime()) || d.getUTCMonth() !== mo ? "" : d.toISOString()
}

function infoboxField(box, key) {
  var m = new RegExp("^\\|\\s*" + key + "\\s*=([^\\n]*)", "mi").exec(box)
  return m ? m[1] : ""
}

// Events from the MediaWiki API answers bin/mma-api wiki prints (an array of
// them, or one). Cancelled events are dropped; events from before `now` are
// flagged finished once their results are in or a day has passed; events
// further than `days` ahead are dropped.
function parseWikipedia(text, orgId, now, days) {
  var data = typeof text === "string" ? parseJson(text) : text
  var pages = Array.isArray(data) ? data : (data ? [data] : [])
  var promo = promotionById(orgId)
  var out = []
  var nowMs = now === undefined ? Date.now() : Number(now)
  pages.forEach(function(page) {
    var wikitext = isObject(page) && isObject(page.parse) ? str(page.parse.wikitext) : ""
    var title = isObject(page) && isObject(page.parse) ? str(page.parse.title).replace(/ /g, "_") : ""
    if (wikitext === "") return
    // Each event is a level-2 section with an infobox.
    var sections = wikitext.split(/^==\s*(?!=)/m).slice(1)
    sections.slice(0, wikiSectionMax).forEach(function(sec, i) {
      var nameMatch = /^([^=\n]+?)\s*==\s*\n/.exec(sec)
      // The infobox is read at its first opener only.
      var boxAt = sec.search(/\{\{Infobox MMA event/i)
      var box = boxAt < 0 ? null : /^\{\{Infobox MMA event[\s\S]{0,20000}?\n\}\}/i.exec(sec.slice(boxAt, boxAt + 20000))
      if (!nameMatch || !box) return
      var heading = wikiPlain(nameMatch[1])
      var date = wikiDate(infoboxField(box[0], "date"))
      if (date === "") return
      // A cancellation is announced in the first lines after the infobox.
      var intro = sec.slice(boxAt + box[0].length, boxAt + box[0].length + 4000).split(/^===/m)[0]
      if (/\b(cancell?ed|postponed)\b/i.test(wikiPlain(intro))) return
      var bouts = promo && promo.mmaOnly ? wikiTableBouts(sec) : wikiBouts(sec)
      // A promotion that mixes sports lists only its MMA events.
      if (promo && promo.mmaOnly && bouts.length === 0) return
      // The listed order has the main event first; the model wants it last.
      var fights = bouts.map(wikiFight).reverse()
      var number = /(\d+)/.exec(heading)
      var base = promo && promo.idBase ? promo.idBase : 8000000
      var id = number ? String(base + Number(number[1])) : String(base + 100000 + (new Date(date).getUTCFullYear() % 100) * 1000 + i)
      var name = wikiPlain(infoboxField(box[0], "name")) || heading
      var city = wikiPlain(infoboxField(box[0], "city"))
      var country = city.indexOf(",") >= 0 ? city.split(",").pop().trim() : city
      var startMs = new Date(date).getTime()
      var allDone = fights.length > 0 && fights.every(function(f) { return f.done })
      var finished = allDone || nowMs - startMs > eventLengthMs + 12 * 3600 * 1000
      if (!finished && days !== undefined && startMs - nowMs > days * 86400000) return
      var fightCount = fights.length
      var short = /^(?:XTB )?((?:Cage Warriors|KSW|Oktagon|ACA|ONE (?:Fight Night|Samurai|Friday Fights)) \d+)/.exec(name)
      out.push({
        id: id,
        org: orgId,
        orgLabel: promo ? promo.label : String(orgId).toUpperCase(),
        orgTag: tagFor(orgId),
        logo: logoFor(orgId),
        slug: promo ? promo.slug : String(orgId),
        name: name,
        shortName: short ? short[1] : name,
        date: date,
        dateOnly: true,
        inline: true,
        finished: finished,
        venue: [wikiPlain(infoboxField(box[0], "venue")), city].filter(Boolean).join(" · "),
        tz: zoneForAddress({ country: country }),
        broadcast: "",
        url: title !== "" ? safeUrl("https://en.wikipedia.org/wiki/" + encodeURI(title) + "#" + encodeURI(heading.replace(/ /g, "_"))) : "",
        fights: fights,
        fightCount: fightCount,
        headliner: fightCount > 0 ? fights[fightCount - 1] : null
      })
    })
  })
  return sortEvents(out)
}

// ------------------------------------------------------------------ ares
//
// ARES Fighting Championship (France) is on neither ESPN nor Wikipedia, so its
// events are read from the promotion's own site (bin/mma-api ares): the
// upcoming and past listings, the "Fight Card" page of each upcoming event and
// the result page of each past one. Like Wikipedia's, these events carry their
// whole card (`inline`), records included. The listings give a day; an upcoming
// event's card page also gives the start time, in Paris time.

// The `max` characters of `s` from its first `marker` on, or "" when there is
// none: a regex anchored with ^ then runs once, at that occurrence, instead of
// once per occurrence of the marker across a page built to repeat it.
function atFirst(s, marker, max) {
  var text = String(s)
  var at = marker instanceof RegExp ? text.search(marker) : text.indexOf(marker)
  return at < 0 ? "" : text.slice(at, at + max)
}

// The most markup one fight's block, or one event page's heading, is given:
// the inner matches are bounded, but a block is only as cheap as its length.
var blockMax = 20000
// The most markup wikiPlain and htmlText read: every caller hands them a
// bounded slice already (a heading, a cell, a template body), and no text a
// reader sees is longer than this.
var plainMax = 40000

// The site's markup reduced to the text a reader sees.
function htmlText(s) {
  return str(s).slice(0, plainMax).replace(/<!--[\s\S]{0,20000}?-->/g, "").replace(/<[^>]{0,2000}>/g, " ")
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function(m, e) {
      var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘" }
      var code = e.charAt(0) !== "#" ? -1 : (e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      if (code > 0 && code < 0x110000 && !(code >= 0xd800 && code < 0xe000)) return String.fromCodePoint ? String.fromCodePoint(code) : " "
      return named[e.toLowerCase()] !== undefined ? named[e.toLowerCase()] : m
    }).replace(/\s+/g, " ").trim()
}

function lastSundayUtc(year, month, hour) {
  var last = new Date(Date.UTC(year, month + 1, 0, hour))
  return last.getTime() - last.getUTCDay() * 86400000
}

// The instant of a Paris wall-clock time: summer time runs from the last
// Sunday of March to the last Sunday of October, both at 01:00 UTC.
function parisInstant(y, mo, d, h, mi) {
  var asUtc = Date.UTC(y, mo, d, h, mi)
  var summer = asUtc - 3600000 >= lastSundayUtc(y, 2, 1) && asUtc - 7200000 < lastSundayUtc(y, 9, 1)
  return asUtc - (summer ? 2 : 1) * 3600000
}

// "20/11/2026" or "20/11/2026 19:30:00" -> { day: noon UTC of that day, at:
// the instant when a time is given or "" }, or null when unreadable.
function aresDate(text) {
  var m = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::\d{2})?)?/.exec(str(text))
  if (!m) return null
  var y = Number(m[3]), mo = Number(m[2]) - 1, d = Number(m[1])
  var day = new Date(Date.UTC(y, mo, d, 12))
  if (isNaN(day.getTime()) || day.getUTCMonth() !== mo || y < 2000) return null
  var at = ""
  if (m[4] !== undefined && Number(m[4]) < 24 && Number(m[5]) < 60) at = new Date(parisInstant(y, mo, d, Number(m[4]), Number(m[5]))).toISOString()
  return { day: day.toISOString(), at: at }
}

// The site names some events in French ("ARES Paris Fevrier 2027"); the months
// are shown in English, whatever the accents or case.
var frenchMonths = {
  janvier: "January", fevrier: "February", mars: "March", avril: "April", mai: "May", juin: "June",
  juillet: "July", aout: "August", septembre: "September", octobre: "October", novembre: "November", decembre: "December"
}

function aresName(text) {
  return htmlText(text).replace(/[A-Za-z\u00c0-\u00ff]+/g, function(w) {
    var plain = w.toLowerCase().normalize ? w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : w.toLowerCase()
    return Object.prototype.hasOwnProperty.call(frenchMonths, plain) ? frenchMonths[plain] : w
  })
}

// The site writes methods in French and English, in any case.
function aresMethod(text) {
  var s = htmlText(text)
  var plain = s.toLowerCase().normalize ? s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : s.toLowerCase()
  if (/unanim/.test(plain)) return "Unanimous Decision"
  if (/partag|split/.test(plain)) return "Split Decision"
  if (/majorit/.test(plain)) return "Majority Decision"
  if (/decision/.test(plain)) return "Decision"
  if (/soumission|submission/.test(plain)) return "Submission"
  if (/^\s*(draw|nul)/.test(plain)) return "Draw"
  if (/no contest|disqual/.test(plain)) return /disqual/.test(plain) ? "DQ" : "No Contest"
  if (/^t?ko\b/.test(plain)) return plain.indexOf("tko") === 0 ? "TKO" : "KO"
  return s.slice(0, 80)
}

// The fights of a card page or result page as wikiFight makes them. The page
// lists the main event first; the model wants it last.
function aresFights(html) {
  var out = []
  var segment = "main"
  // The page is cut at every segment heading and every fight block, in one
  // pass; a heading's text is then read up to its close with indexOf.
  var pieces = String(html).split(/(<h2[^>]{0,500}>)|(class="(?:[^"]{0,200}\s)?fighter-line(?:\s[^"]{0,200})?")/)
  for (var i = 1; i + 2 < pieces.length && out.length < maxFightsPerEvent; i += 3) {
    var text = str(pieces[i + 2])
    if (pieces[i] !== undefined) {
      var close = text.indexOf("</h2>")
      if (close >= 0 && close <= 2000) segment = wikiSegment(htmlText(text.slice(0, close)))
      continue
    }
    var block = text.slice(0, blockMax)
    var names = []
    var nameRe = /<h4[^>]{0,500}>([\s\S]{0,1000}?)<\/h4>/g
    var n
    while ((n = nameRe.exec(block)) !== null && names.length < 2) names.push(htmlText(n[1]))
    if (names.length < 2) continue
    var values = {}
    var valRe = /combat-round-title">([\s\S]{0,500}?)<\/span>\s*<span class="combat-round-value">([\s\S]{0,500}?)<\/span>/g
    while ((n = valRe.exec(block)) !== null) values[htmlText(n[1]).toLowerCase()] = htmlText(n[2])
    var records = /^class="records"[\s\S]{0,3000}?stat-left">([^<]{0,100})<[\s\S]{0,3000}?stat-right">([^<]{0,100})</.exec(atFirst(block, 'class="records"', 7000))
    var weight = /<h3[^>]{0,500}>([\s\S]{0,1000}?)<\/h3>/.exec(block)
    // The site has no title flag. Its photo of a champion is named "...-CHAMP-...",
    // so a main event whose first fighter has one is taken as a title fight.
    var photo = /^class="fighter-one"[\s\S]{0,5000}?<img[^>]{0,2000}\ssrc="([^"]{0,2000})"/.exec(atFirst(block, 'class="fighter-one"', 10000))
    var champ = out.length === 0 && segment === "main" && photo !== null && /[-_]CHAMP[-_.]/i.test(photo[1])
    var method = aresMethod(values.method || "")
    var done = method !== ""
    var left = /class="winner winner-left"/.test(block)
    var right = /class="winner winner-right"/.test(block)
    out.push({ segment: segment, names: names, records: records ? [htmlText(records[1]), htmlText(records[2])] : ["", ""],
      weightClass: weight ? htmlText(weight[1]) : "", method: method, done: done,
      champion: champ, round: roundNumber(values.round), clock: str(values.time).slice(0, 12), winners: [done && left && !right, done && right && !left] })
  }
  return out.map(function(b, index) {
    var fighters = [0, 1].map(function(k) {
      var tba = isTba(b.names[k])
      return { name: tba ? "TBA" : b.names[k], shortName: tba ? "TBA" : b.names[k],
        record: !tba && recordShape.test(b.records[k]) ? b.records[k] : "", country: "", winner: b.winners[k], tba: tba }
    })
    return {
      id: String(index + 1),
      weightClass: b.weightClass,
      rounds: 0,
      startDate: "",
      status: b.done ? "STATUS_FINAL" : "STATUS_SCHEDULED",
      done: b.done,
      round: b.round,
      clock: b.clock,
      fighters: fighters,
      segment: b.segment,
      matchNumber: index + 1,
      champion: b.champion,
      method: b.method
    }
  }).reverse()
}

// Events from what `bin/mma-api ares` prints. Upcoming events further than
// `days` ahead are dropped; past ones are all finished.
function parseAres(text, now, days) {
  var data = typeof text === "string" ? parseJson(text) : text
  if (!isObject(data)) return []
  var promo = promotionById("ares")
  var cards = isObject(data.cards) ? data.cards : ({})
  var results = isObject(data.results) ? data.results : ({})
  var nowMs = now === undefined ? Date.now() : Number(now)
  var out = []
  var seen = ({})

  function add(name, when, fights, finished, url) {
    var number = /\bARES\s+(\d+)\b/i.exec(name)
    var ymd = (when.day.slice(2, 4) + when.day.slice(5, 7) + when.day.slice(8, 10))
    var id = String(promo.idBase + (number ? Number(number[1]) : 100000 + Number(ymd)))
    if (seen[id]) return
    seen[id] = true
    var date = when.at !== "" ? when.at : when.day
    var startMs = new Date(date).getTime()
    var allDone = fights.length > 0 && fights.every(function(f) { return f.done })
    var over = finished || allDone || nowMs - startMs > eventLengthMs + 12 * 3600 * 1000
    if (!over && days !== undefined && startMs - nowMs > days * 86400000) return
    var count = fights.length
    out.push({
      id: id,
      org: "ares",
      orgLabel: promo.label,
      orgTag: tagFor("ares"),
      logo: logoFor("ares"),
      slug: promo.slug,
      name: name,
      shortName: name,
      date: date,
      dateOnly: when.at === "",
      inline: true,
      finished: over,
      venue: "",
      tz: zoneForAddress({ country: "France" }),
      broadcast: "",
      url: url,
      fights: fights,
      fightCount: count,
      headliner: count > 0 ? fights[count - 1] : null
    })
  }

  // Upcoming events: one block each in the listing, its card page by id.
  str(data.upcoming).split(/class="competition-resume upcoming"/).slice(1, 20).forEach(function(block) {
    var name = aresName((/title="([^"]*)"/.exec(block) || [])[1])
    var comp = /\?competition=(\d{1,9})/.exec(block)
    var when = aresDate((/^class="date">[\s\S]{0,500}?<br\s*\/?>\s*(\d{2}\/\d{2}\/\d{4})/.exec(atFirst(block, 'class="date">', 600)) || [])[1])
    if (name === "" || !comp || !when) return
    var page = str(cards[comp[1]])
    // The card page repeats the date, with the start time.
    var timed = aresDate((/^class="date">[\s\S]{0,500}?<br\s*\/?>\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/.exec(atFirst(page, 'class="date">', 600)) || [])[1])
    if (timed && timed.day === when.day) when = timed
    add(name, when, aresFights(page), false, safeUrl("https://www.aresfighting.com/events/?competition=" + comp[1]))
  })

  // Past events: an entry each in the listing, linking to the result page.
  str(data.past).split(/competition-resume past/).slice(1, 60).forEach(function(block) {
    var path = /href="https:\/\/www\.aresfighting\.com(\/[A-Za-z0-9_-]+\/)"/.exec(block)
    var name = aresName((/title="([^"]*)"/.exec(block) || [])[1])
    var when = aresDate((/class="date">\s*(\d{2}\/\d{2}\/\d{4})/.exec(block) || [])[1])
    // Only the pages bin/mma-api fetched (the recent ones) become events.
    if (!path || name === "" || !when || results[path[1]] === undefined) return
    add(name, when, aresFights(str(results[path[1]])), true, safeUrl("https://www.aresfighting.com" + path[1]))
  })
  return sortEvents(out)
}

// ---------------------------------------------------------------- sherdog
//
// Hexagone MMA (France) is on neither ESPN nor Wikipedia, so its events are read
// from Sherdog (bin/mma-api sherdog): the event pages of its organization page.
// Like Wikipedia's, these events carry their whole card (`inline`), records
// included. Sherdog gives a day, not a start time.

// Sherdog writes a method as "Decision (Split)" or "TKO (Elbow and Punches)".
function sherdogMethod(text) {
  var s = htmlText(text)
  var d = /^decision\s*\(?\s*(unanimous|split|majority)?/i.exec(s)
  if (d) return d[1] ? d[1].charAt(0).toUpperCase() + d[1].slice(1).toLowerCase() + " Decision" : "Decision"
  return s.slice(0, 80)
}

// One fight from the markup of its two fighters: { names, records, results }.
function sherdogFight(block, segmentIndex, number) {
  block = str(block).slice(0, blockMax)
  var names = []
  var nameRe = /itemprop="name">([\s\S]{0,500}?)<\/span>/g
  var n
  while ((n = nameRe.exec(block)) !== null && names.length < 2) names.push(htmlText(n[1]))
  if (names.length < 2) return null
  var records = []
  var recRe = /class="record">\s*(?:<em>)?\s*([0-9]{1,3}-[0-9]{1,3}-[0-9]{1,3})/g
  while ((n = recRe.exec(block)) !== null && records.length < 2) records.push(n[1])
  var results = []
  var resRe = /class="final_result ([a-z_]+)"/g
  while ((n = resRe.exec(block)) !== null && results.length < 2) results.push(n[1])
  var weight = /class="weight_class">([\s\S]{0,500}?)<\/span>/.exec(block)
  var done = results.length === 2 && results.every(function(r) { return r !== "yet_to_come" })
  var winby = /class="winby"><b>([\s\S]{0,500}?)<\/b>/.exec(block) || /<em>Method<\/em>\s*<br\s*\/?>([\s\S]{0,500}?)<\/td>/.exec(block)
  var round = /class="winby"[\s\S]{0,2000}?<\/td>\s*<td>\s*([0-9]+)\s*<\/td>\s*<td>\s*([0-9:]+)\s*<\/td>/.exec(block)
    || /<em>Round<\/em>\s*<br\s*\/?>\s*([0-9]+)[\s\S]{0,2000}?<em>Time<\/em>\s*<br\s*\/?>\s*([0-9:]+)/.exec(block)
  var method = done ? (winby ? sherdogMethod(winby[1]) : "") : ""
  if (done && method === "" && results[0] === "draw") method = "Draw"
  return { names: names, records: records, results: results, done: done, method: method,
    weightClass: weight ? htmlText(weight[1]) : "", champion: /class="title_fight"/.test(block),
    round: round ? roundNumber(round[1]) : 0, clock: round ? round[2] : "" }
}

// The fights of an event page as wikiFight makes them: the main event comes
// first in the page's markup, the model wants it last.
function sherdogFights(page) {
  var raw = []
  var start = page.indexOf('class="fight_card"')
  if (start >= 0) {
    var tableAt = page.indexOf('class="new_table_holder"', start)
    var main = sherdogFight(page.slice(start, tableAt >= 0 ? tableAt : page.length), 0, 0)
    if (main) raw.push(main)
    if (tableAt >= 0) {
      page.slice(tableAt).split(/<tr itemprop="subEvent"/).slice(1, maxFightsPerEvent + 1).forEach(function(row) {
        var f = sherdogFight(row, 0, 0)
        if (f) raw.push(f)
      })
    }
  }
  return raw.slice(0, maxFightsPerEvent).map(function(b, index) {
    var fighters = [0, 1].map(function(k) {
      var tba = isTba(b.names[k])
      return { name: tba ? "TBA" : b.names[k], shortName: tba ? "TBA" : b.names[k],
        record: !tba && b.records[k] !== undefined && recordShape.test(b.records[k]) ? b.records[k] : "",
        country: "", winner: b.done && b.results[k] === "win", tba: tba }
    })
    return {
      id: String(index + 1),
      weightClass: b.weightClass,
      rounds: 0,
      startDate: "",
      status: b.done ? "STATUS_FINAL" : "STATUS_SCHEDULED",
      done: b.done,
      round: b.round,
      clock: b.clock,
      fighters: fighters,
      segment: "main",
      matchNumber: index + 1,
      champion: b.champion,
      method: b.method
    }
  }).reverse()
}

// Events from what `bin/mma-api sherdog` prints. Upcoming events further than
// `days` ahead are dropped.
function parseSherdog(text, orgId, now, days) {
  var data = typeof text === "string" ? parseJson(text) : text
  if (!isObject(data) || !isObject(data.events)) return []
  var promo = promotionById(orgId)
  if (!promo) return []
  var nowMs = now === undefined ? Date.now() : Number(now)
  var out = []
  var seen = ({})
  Object.keys(data.events).slice(0, 20).forEach(function(path) {
    if (!/^\/events\/[A-Za-z0-9_-]+$/.test(path)) return
    var page = str(data.events[path])
    var title = htmlText((/^<h1[^>]{0,500}>([\s\S]{0,2000}?)<\/h1>/.exec(atFirst(page, "<h1", 3000)) || [])[1])
    var day = /class="info">\s*<span><meta itemprop="startDate" content="(\d{4})-(\d{2})-(\d{2})/.exec(page)
    if (title === "" || !day) return
    var when = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12))
    if (isNaN(when.getTime())) return
    var number = /\bHXMMA\s+(\d+)\b/i.exec(title)
    var sherdogId = /-(\d+)$/.exec(path)
    var id = String(promo.idBase + (number ? Number(number[1]) : 100000 + (sherdogId ? Number(sherdogId[1]) % 100000 : 0)))
    if (seen[id]) return
    seen[id] = true
    var place = htmlText((/^<span itemprop="location">([\s\S]{0,1000}?)<\/span>/.exec(atFirst(page, '<span itemprop="location">', 1200)) || [])[1])
    var comma = place.indexOf(",")
    var venue = comma > 0 ? place.slice(0, comma).trim() + " · " + place.slice(comma + 1).trim() : place
    var country = place.slice(place.lastIndexOf(",") + 1).trim()
    var fights = sherdogFights(page)
    var startMs = when.getTime()
    var over = (fights.length > 0 && fights.every(function(f) { return f.done })) || nowMs - startMs > eventLengthMs + 12 * 3600 * 1000
    if (!over && days !== undefined && startMs - nowMs > days * 86400000) return
    var count = fights.length
    var short = /^(HXMMA \d+)/i.exec(title)
    out.push({
      id: id,
      org: orgId,
      orgLabel: promo.label,
      orgTag: tagFor(orgId),
      logo: logoFor(orgId),
      slug: promo.slug,
      name: title.indexOf(" - ") > 0 ? title.slice(title.indexOf(" - ") + 3) : title,
      shortName: short ? short[1].toUpperCase() : title,
      date: when.toISOString(),
      dateOnly: true,
      inline: true,
      finished: over,
      venue: venue,
      tz: zoneForAddress({ country: country }),
      broadcast: "",
      url: safeUrl("https://www.sherdog.com" + path),
      fights: fights,
      fightCount: count,
      headliner: count > 0 ? fights[count - 1] : null
    })
  })
  return sortEvents(out)
}

// "Sat, Nov 7 · 12:00 PM", or just the day when the source has no start time.
function whenText(e, format, zoneId) {
  var day = formatDay(e.date, zoneId)
  return e.dateOnly === true ? day : day + " · " + formatTime(e.date, format, zoneId)
}

// ------------------------------------------------------------------- cache

// ------------------------------------------------------------ card cache
//
// What a card needed a request for (the segments of an ESPN card, the fight
// record of a Cage Warriors fighter) is kept on disk for 12 hours, so reopening an
// event, or the app, costs nothing. Only answers worth keeping are stored: a
// vendor that refused ("blocked") is asked again next time.

var cardCacheMs = 12 * 60 * 60 * 1000

function cardCacheFresh(at, now) {
  var age = now - Number(at)
  return isFinite(age) && age >= 0 && age < cardCacheMs
}

// The newest `max` entries of an object, `atOf(key, value)` giving each one's
// time. Entries without a time count as oldest.
function newestEntries(map, max, atOf) {
  var keys = Object.keys(map)
  if (keys.length <= max) return map
  keys.sort(function(a, b) { return (Number(atOf(b, map[b])) || 0) - (Number(atOf(a, map[a])) || 0) })
  var out = ({})
  keys.slice(0, max).forEach(function(k) { out[k] = map[k] })
  return out
}

// A real record cannot change before the fighter's next fight, so it is kept
// until that fight starts, rather than for the 12 hours everything else gets.
// "n/a" and "blocked" answers do not qualify: they are asked again after 12
// hours.
var recordUntilMaxMs = 366 * 24 * 60 * 60 * 1000
// Asked for while a fight is on or over but not yet marked done, a record is
// likely the old one: it is looked up again after this, so the new one shows
// soon after the fight.
var recordRetryMs = 10 * 60 * 1000
var recordLiveWindowMs = 12 * 60 * 60 * 1000

// When the record of `name` stops being good: the start of the earliest
// upcoming event of `events` that has the fighter on its card. If the fighter's
// event has started and their fight is not over yet, a short retry delay. 0
// (the usual 12 hours) when neither applies.
function recordUntil(name, events, now) {
  var best = 0
  var live = false
  list(events).forEach(function(e) {
    var t = Date.parse(e && e.date)
    if (!isFinite(t)) return
    var fights = list(e.fights).filter(function(f) { return list(f && f.fighters).some(function(x) { return x && x.name === name }) })
    if (fights.length === 0) return
    if (t > now) { if (best === 0 || t < best) best = t; return }
    if (now - t < recordLiveWindowMs && fights.some(function(f) { return f.done !== true })) live = true
  })
  return best !== 0 ? best : live ? now + recordRetryMs : 0
}

// Whether a cached record entry { at, until } is still good at `now`.
function recordFresh(at, until, now) {
  var u = Number(until)
  if (isFinite(u) && u > now && u - now <= recordUntilMaxMs) return true
  return cardCacheFresh(at, now)
}

function serializeCardCache(segments, records) {
  return JSON.stringify({ version: 1, segments: segments, records: records })
}

// { segments: { id: { at, data } }, records: { name: { at, value, until? } } }, fresh
// entries only, each rebuilt field by field: the file is not to be trusted.
// A "blocked" record is kept too: it is what stops the vendor that refused
// from being asked again for 12 hours, across restarts.
function parseCardCache(text, now) {
  var out = { segments: ({}), records: ({}) }
  var data = parseJson(text)
  if (!isObject(data) || data.version !== 1) return out
  var segs = isObject(data.segments) ? data.segments : ({})
  Object.keys(segs).forEach(function(id) {
    var e = segs[id]
    if (!isId(id) || !isObject(e) || !isObject(e.data) || !cardCacheFresh(e.at, now)) return
    var clean = ({})
    Object.keys(e.data).forEach(function(cid) {
      var c = e.data[cid]
      if (!isId(cid) || !isObject(c)) return
      clean[cid] = {
        segment: str(c.segment),
        label: str(c.label),
        matchNumber: Number(c.matchNumber) || 0,
        champion: c.champion === true,
        method: str(c.method)
      }
    })
    if (Object.keys(clean).length > 0) out.segments[id] = { at: Number(e.at), data: clean }
  })
  out.segments = newestEntries(out.segments, cacheSegmentMax, function(k, v) { return v.at })
  var recs = isObject(data.records) ? data.records : ({})
  Object.keys(recs).forEach(function(name) {
    var e = recs[name]
    if (!isObject(e)) return
    var v = str(e.value)
    var real = recordShape.test(v)
    if (!(real || v === "n/a" || v === "blocked")) return
    if (!(real ? recordFresh(e.at, e.until, now) : cardCacheFresh(e.at, now))) return
    out.records[name] = { at: Number(e.at), value: v }
    if (real && Number(e.until) > now) out.records[name].until = Number(e.until)
  })
  out.records = newestEntries(out.records, cacheRecordMax, function(k, v) { return v.at })
  return out
}

function serializeCache(events, fetchedAt) {
  return JSON.stringify({ version: 1, fetchedAt: fetchedAt, events: events })
}

function parseCache(text) {
  var data = parseJson(text)
  if (!data || data.version !== 1 || !Array.isArray(data.events)) return null
  return { fetchedAt: Number(data.fetchedAt) || 0, events: sanitizeEvents(data.events.slice(0, remoteEventMax)) }
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
    segment: segmentOrder.indexOf(f.segment) >= 0 ? f.segment : "",
    matchNumber: Math.max(0, Math.min(99, Math.floor(Number(f.matchNumber)) || 0)),
    champion: f.champion === true,
    method: str(f.method).slice(0, 80)
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
    orgTag: tagFor(promo.id),
    logo: logoFor(promo.id),
    slug: promo.slug,
    name: str(e.name),
    shortName: str(e.shortName) || str(e.name),
    date: str(e.date),
    finished: e.finished === true,
    dateOnly: e.dateOnly === true,
    inline: e.inline === true,
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
