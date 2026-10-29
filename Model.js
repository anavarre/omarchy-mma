.pragma library

// Pure helpers shared by Service.qml, Panel.qml and BarWidget.qml, kept free of
// QML types so they can be unit-tested with node (tests/model.test.js).

// Promotions the settings pane offers. `enabled` ones have a data provider
// (ESPN); the rest are listed as "coming soon" and can't be selected.
var promotions = [
  { id: "ufc", label: "UFC", slug: "ufc", enabled: true, logo: "assets/ufc.png", description: "Ultimate Fighting Championship" },
  { id: "pfl", label: "PFL", slug: "pfl", enabled: true, logo: "assets/pfl.png", description: "Professional Fighters League" },
  { id: "ksw", label: "KSW", slug: "ksw", enabled: false, description: "Konfrontacja Sztuk Walki, coming soon" },
  { id: "one", label: "ONE Championship", slug: "one", enabled: false, description: "Coming soon" },
  { id: "bellator", label: "Bellator", slug: "bellator", enabled: false, description: "Coming soon" },
  { id: "rizin", label: "RIZIN", slug: "rizin", enabled: false, description: "Coming soon" },
  { id: "cage-warriors", label: "Cage Warriors", slug: "cage-warriors", enabled: false, description: "Coming soon" },
  { id: "oktagon", label: "OKTAGON", slug: "oktagon", enabled: false, description: "Coming soon" },
  { id: "bkfc", label: "BKFC", slug: "bkfc", enabled: false, description: "Bare Knuckle FC, coming soon" }
]

var defaultOrganizations = ["ufc"]
var eventLimitMin = 1
var eventLimitMax = 30
var refreshChoices = [60, 120, 180, 360, 720, 1440]
var lookaheadChoices = [30, 60, 90, 120, 180, 365]
var textSizeValues = ["small", "medium", "large", "xlarge"]
var timeFormats = ["12h", "24h"]

// Card sections in display order, with the labels ESPN uses.
var segmentOrder = ["main", "prelims1", "prelims2"]
var segmentLabels = { main: "Main Card", prelims1: "Prelims", prelims2: "Early Prelims" }

// The environment bin/mma-api is run with. A null value means "inherit this
// one from the shell"; everything else is dropped (clearEnvironment).
var environment = {
  PATH: "/usr/bin:/bin",
  HOME: null,
  XDG_CONFIG_HOME: null,
  XDG_CACHE_HOME: null,
  MMA_SITE_BASE: null,
  MMA_CORE_BASE: null
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
  if (!Array.isArray(value)) return defaultOrganizations.slice()
  var seen = ({})
  return value.filter(function(id) {
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

// The scoreboard's `dates` parameter: today through `days` days ahead.
function dateRange(now, days) {
  var from = new Date(now.getTime() - 24 * 3600 * 1000)
  var to = new Date(now.getTime() + days * 24 * 3600 * 1000)
  return ymd(from) + "-" + ymd(to)
}

var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// Dates are shown in the viewer's local time zone.
function formatDay(iso) {
  var d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return weekdays[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate()
}

function formatTime(iso, format) {
  var d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  var h = d.getHours()
  var m = pad2(d.getMinutes())
  if (format === "24h") return pad2(h) + ":" + m
  return (h % 12 === 0 ? 12 : h % 12) + ":" + m + " " + (h < 12 ? "AM" : "PM")
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

function relativeDay(iso, now) {
  var d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  var days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000)
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

function isTba(name) { return name === "" || /\btba\b/i.test(name) }

function fighter(c) {
  var a = (c && c.athlete) || {}
  var name = String(a.displayName || a.fullName || "")
  var tba = isTba(name)
  var rec = c && c.records && c.records.length > 0 ? c.records[0].summary : ""
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
  var list = (competitors || []).map(function(c, i) {
    var o = Number(c.order)
    return { order: isFinite(o) && o > 0 ? o : i + 1, c: c }
  })
  list.sort(function(a, b) { return a.order - b.order })
  var out = list.map(function(x) { return fighter(x.c) })
  while (out.length < 2) out.push(fighter(null))
  return out.slice(0, 2)
}

function fight(comp) {
  var periods = comp.format && comp.format.regulation ? Number(comp.format.regulation.periods) : 0
  return {
    id: String(comp.id),
    weightClass: String((comp.type && (comp.type.abbreviation || comp.type.text)) || ""),
    rounds: isFinite(periods) ? periods : 0,
    startDate: String(comp.startDate || comp.date || ""),
    status: String((comp.status && comp.status.type && comp.status.type.name) || ""),
    fighters: sortedFighters(comp.competitors),
    // Filled in from the core API once the card is opened.
    segment: "",
    matchNumber: 0,
    title: false
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
  var b = comp.broadcasts && comp.broadcasts[0]
  return b && b.names ? b.names.join(", ") : ""
}

// The event's ESPN page, from the link marked as the event's own.
function eventUrl(e) {
  var links = e.links || []
  for (var i = 0; i < links.length; i++)
    if (links[i].rel && links[i].rel.indexOf("event") >= 0 && /^https:\/\//.test(links[i].href)) return String(links[i].href)
  return ""
}

// Events from a scoreboard response. Past events and cancelled ones are
// dropped; the rest are sorted by date.
function parseScoreboard(text, orgId) {
  var data = typeof text === "string" ? parseJson(text) : text
  if (!data || !Array.isArray(data.events)) return []
  var promo = promotionById(orgId)
  var out = []
  data.events.forEach(function(e) {
    var comps = e.competitions || []
    var status = (e.status && e.status.type && e.status.type.name) || ""
    if (status === "STATUS_FINAL" || status === "STATUS_CANCELED") return
    var fights = comps.map(fight)
    var first = comps[0] || null
    // The main event is the last fight the scoreboard lists.
    var headliner = fights.length > 0 ? fights[fights.length - 1] : null
    var venue = (e.venues && e.venues[0]) || (first && first.venue) || null
    out.push({
      id: String(e.id),
      org: orgId,
      orgLabel: promo ? promo.label : String(orgId).toUpperCase(),
      logo: logoFor(orgId),
      slug: promo ? promo.slug : String(orgId),
      name: String(e.name || e.shortName || ""),
      shortName: String(e.shortName || e.name || ""),
      date: String(e.date || ""),
      venue: venueText(venue),
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

// Several organizations' events merged into one date-ordered, limited list.
function mergeEvents(lists, limit) {
  var all = []
  lists.forEach(function(l) { all = all.concat(l) })
  return sortEvents(all).slice(0, clampEventLimit(limit))
}

// Title fights carry a "types" entry such as "UFC Heavyweight Title". There is
// no belt glyph in Unicode, so they get a crown.
var titleGlyph = "\uD83D\uDC51"

function isTitleFight(c) {
  return (c.types || []).some(function(t) { return t && /\btitle\b/i.test(String(t.text || "")) })
}

// { competitionId: { segment, label, matchNumber, title } } from the JSON array
// bin/mma-api card prints.
function parseSegments(text) {
  var data = typeof text === "string" ? parseJson(text) : text
  var map = ({})
  if (!Array.isArray(data)) return map
  data.forEach(function(c) {
    if (!c || c.id === undefined) return
    var seg = c.cardSegment || {}
    map[String(c.id)] = {
      segment: String(seg.name || ""),
      label: String(seg.description || ""),
      matchNumber: Number(c.matchNumber) || 0,
      title: isTitleFight(c)
    }
  })
  return map
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
  var fights = (event.fights || []).map(function(f, i) {
    var s = segments[f.id]
    var copy = {}
    for (var k in f) copy[k] = f[k]
    // The scoreboard lists fights in ascending billing, main event last, so a
    // higher index is a higher billing.
    copy.rank = i
    copy.segment = s ? s.segment : ""
    copy.matchNumber = s ? s.matchNumber : 0
    copy.title = s ? s.title : false
    copy.segmentLabel = s ? s.label : ""
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

function weightClassLabel(f) {
  var parts = []
  if (f.title) parts.push(titleGlyph)
  if (f.weightClass) parts.push(f.weightClass)
  if (f.rounds) parts.push(f.rounds + " rds")
  return parts.join(" · ")
}

// ------------------------------------------------------------------- cache

function serializeCache(events, fetchedAt) {
  return JSON.stringify({ version: 1, fetchedAt: fetchedAt, events: events })
}

function parseCache(text) {
  var data = parseJson(text)
  if (!data || data.version !== 1 || !Array.isArray(data.events)) return null
  return { fetchedAt: Number(data.fetchedAt) || 0, events: data.events }
}

// Events cached before they started are still worth showing offline; ones
// that began more than half a day ago are not.
function upcomingOnly(events, now) {
  var cutoff = now.getTime() - 12 * 3600 * 1000
  return events.filter(function(e) { return new Date(e.date).getTime() >= cutoff })
}

function errorMessage(stderr, exitCode) {
  var s = String(stderr || "").replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 160)
  return s !== "" ? s : "Request failed (" + exitCode + ")"
}
