import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// The one process-wide owner of everything fetched (ESPN, Wikipedia for Cage Warriors, KSW, Oktagon, ACA and ONE, ARES's own site and Sherdog for Hexagone MMA): the event list,
// per-event cards and the refresh timer. The bar widget exists once per
// monitor; they all read this instead of polling on their own.
Item {
  id: root

  // Injected by the host after load.
  property string omarchyPath: ""
  property var shell: null
  property var manifest: null

  readonly property string api: Model.localPath(Qt.resolvedUrl("bin/mma-api"))
  readonly property string cacheHome: Quickshell.env("XDG_CACHE_HOME") || (Quickshell.env("HOME") + "/.cache")
  readonly property string cacheDir: root.cacheHome + "/omarchy-mma"

  // Pushed in by the bar widget, the only side the shell injects settings into.
  // null until the widget has injected the setting, so nothing is fetched or
  // shown for a default the user may have changed.
  property var organizations: null
  property int eventLimit: 10
  property int lookaheadDays: 120
  property int refreshMinutes: 180
  property int keepFinishedDays: 1

  property bool loading: false
  property string errorText: ""
  // True while the list shown comes from the cache because the last fetch failed.
  property bool offline: false
  property double fetchedAt: 0
  property var events: []

  // Every fetched event per organization, before the merge and the limit.
  property var byOrg: ({})
  // Cards by event id: { sections, loading, error }. Fetched when opened, and for the soonest event after a refresh.
  property var cards: ({})

  // Bumped whenever the selection changes so results fetched for an old one
  // never land after it.
  property int generation: 0
  property var pending: []
  property var gathered: ({})
  property var failures: []
  property string lastError: ""
  property var cardQueue: []
  // Fight records by fighter name, for promotions whose cards carry none
  // (Wikipedia's): looked up once per name and kept until the app restarts.
  property var records: ({})
  property var recordQueue: []
  // When each kept answer was fetched, for the 12-hour card cache on disk:
  // segments by event id ({ at, data }), and the time of each record.
  property var segmentCache: ({})
  property var blockedAt: ({})
  property var recordTimes: ({})
  // When a real record stops being good: after the fighter's next fight.
  property var recordUntil: ({})
  // The selection the current event list was fetched for. The widget hands
  // the organizations over as a fresh array on every settings change, and a
  // var property signals every assignment, so without this a change of text
  // size or time zone would fetch everything again.
  property string selectionKey: ""
  // When the user last asked for a refresh (r or middle-click).
  property double manualRefreshAt: 0

  onOrganizationsChanged: {
    if (root.organizations === null) return
    var key = JSON.stringify(Model.selectedOrganizations(root.organizations))
    if (key === root.selectionKey) return
    root.selectionKey = key
    refreshSoon()
  }
  onLookaheadDaysChanged: refreshSoon()
  onKeepFinishedDaysChanged: refreshSoon()
  onEventLimitChanged: root.merge()
  onRefreshMinutesChanged: timer.restart()

  function refreshSoon() { Qt.callLater(refresh) }

  function refresh() {
    if (root.organizations === null) return
    var wanted = Model.selectedOrganizations(root.organizations)
    root.generation++
    root.gathered = ({})
    root.failures = []
    if (wanted.length === 0) {
      root.pending = []
      root.byOrg = ({})
      root.loading = false
      root.errorText = ""
      root.merge()
      return
    }
    root.loading = true
    root.errorText = ""
    root.pending = wanted
    root.fetchNext()
  }

  // Organizations are fetched one after another through one Process, which
  // keeps the number of concurrent curls small.
  function fetchNext() {
    if (eventsProcess.running) return
    if (root.pending.length === 0) { root.finishFetch(); return }
    var org = root.pending[0]
    var promo = Model.promotionById(org)
    eventsProcess.org = org
    eventsProcess.generation = root.generation
    var now = new Date()
    var days = Model.snapLookaheadDays(root.lookaheadDays)
    var back = root.keepFinishedDays + 1
    var provider = Model.providerOf(org)
    eventsProcess.command = provider === "wikipedia"
      ? ["/usr/bin/bash", root.api, "wiki", org].concat(Model.wikiYears(now, days, back))
      : provider === "ares"
        ? ["/usr/bin/bash", root.api, "ares", String(back)]
        : provider === "sherdog"
          ? ["/usr/bin/bash", root.api, "sherdog", org, String(back)]
          : ["/usr/bin/bash", root.api, "events", promo.slug, Model.dateRange(now, days, back)]
    eventsProcess.running = true
  }

  function finishFetch() {
    root.loading = false
    var failures = root.failures
    var gathered = root.gathered
    if (Object.keys(gathered).length === 0 && failures.length > 0) {
      // Nothing came through: keep whatever the cache gave us.
      root.offline = root.events.length > 0
      root.errorText = root.lastError
      return
    }
    root.offline = false
    root.errorText = failures.length > 0 ? root.lastError : ""
    root.byOrg = gathered
    root.fetchedAt = Date.now()
    root.merge()
    root.saveCache()
    // The crown and the segments only come from the card fetch, so start the
    // soonest event's now rather than when the panel opens.
    var next = Model.nextEvent(root.events)
    if (next) root.loadCard(next.id)
    // Wikipedia's cards carry no records; those are looked up when a card is
    // opened (or is the next event), never for every event a refresh brings.
  }

  function merge() {
    // Events restored from the cache have no per-organization lists behind
    // them, so there is nothing to re-merge until a fetch succeeds.
    if (root.offline && Object.keys(root.byOrg).length === 0) return
    var selected = Model.selectedOrganizations(root.organizations)
    var lists = []
    for (var i = 0; i < selected.length; i++)
      if (root.byOrg[selected[i]]) lists.push(root.byOrg[selected[i]])
    root.events = Model.mergeEvents(lists, Infinity, Date.now(), root.keepFinishedDays)
  }

  function eventById(id) {
    for (var i = 0; i < root.events.length; i++) if (root.events[i].id === id) return root.events[i]
    return null
  }

  // The card for an event: grouped by segment once the core API has answered,
  // split by start times until then (and for good if it never does).
  function cardFor(id) {
    var c = root.cards[id]
    return c ? c : { sections: [], loading: false, error: "" }
  }

  function loadCard(id) {
    var event = root.eventById(id)
    if (!event) return
    var existing = root.cards[id]
    if (existing && (existing.loading || existing.done)) return
    // An event that carries its whole card needs no second request.
    if (event.inline === true) {
      // Fighters without a record spin until the lookup answers; with nothing
      // to look up the card is final already.
      var names = Model.namesNeedingRecords(event, root.liveRecords()).filter(function(n) { return !root.knownNa(n) })
      // The card must exist before the lookup is queued: nextRecords skips
      // jobs whose cards are gone, and would take this one for stale.
      root.setCard(id, Model.buildCard(Model.withRecords(event, root.liveRecords(), names.length === 0), {}), "", false)
      var dropped = root.queueRecords(event, names)
      // A card whose lookups did not fit the budget stays unsettled, so
      // opening it again asks again.
      root.setCard(id, Model.buildCard(Model.withRecords(event, root.liveRecords(), names.length === 0), {}), "", dropped.length === 0)
      return
    }
    var kept = root.segmentCache[id]
    if (kept && Model.cardCacheFresh(kept.at, Date.now())) {
      root.setCard(id, Model.buildCard(event, kept.data), "", true)
      return
    }
    var next = {}
    for (var k in root.cards) next[k] = root.cards[k]
    next[id] = { sections: Model.buildCard(event, {}), loading: true, error: "", done: false }
    root.cards = next
    cardQueue.push({ id: id, event: event })
    root.nextCard()
  }

  // The records kept, minus those whose fighter has fought since.
  function liveRecords() {
    var out = {}, now = Date.now()
    for (var n in root.records) {
      var u = root.recordUntil[n]
      if (u !== undefined && u <= now && root.records[n] !== "blocked" && root.records[n] !== "n/a") continue
      out[n] = root.records[n]
    }
    return out
  }

  // A fighter Sherdog has no record for, asked about within the cache window.
  function knownNa(name) {
    if (root.records[name] === "blocked") return Date.now() - (root.blockedAt[name] || 0) < Model.blockedRetryMs
    return root.records[name] === "n/a" && Model.cardCacheFresh(root.recordTimes[name], Date.now())
  }

  function nextCard() {
    if (cardProcess.running || root.cardQueue.length === 0) return
    var job = root.cardQueue.shift()
    cardProcess.job = job
    // A "+" asks mma-api for how a finished fight was won.
    var ids = job.event.fights.map(function(f) { return f.done ? f.id + "+" : f.id })
    cardProcess.command = ["/usr/bin/bash", root.api, "card", job.event.slug, job.event.id].concat(ids)
    cardProcess.running = true
  }

  // Looks up the records of the fighters on an inline card that still have
  // none. The card is already on screen; it is rebuilt when they arrive.
  function queueRecords(event, names) {
    if (names.length === 0) return []
    var dropped = Model.enqueueRecords(root.recordQueue, recordsProcess.running ? recordsProcess.job : null, event, names, Model.recordQueueBudget)
    root.nextRecords()
    return dropped
  }

  function nextRecords() {
    if (recordsProcess.running) return
    // Jobs whose cards were forgotten meanwhile are stale: skip them.
    var job = null
    while (root.recordQueue.length > 0 && !job) {
      var next = root.recordQueue.shift()
      if (next.events.some(function(e) { return root.cards[e.id] !== undefined })) job = next
    }
    if (!job) return
    recordsProcess.job = job
    recordsProcess.command = ["/usr/bin/bash", root.api, "records"].concat(job.names)
    recordsProcess.running = true
  }

  function setCard(id, sections, error, done) {
    var next = {}
    for (var k in root.cards) next[k] = root.cards[k]
    next[id] = { sections: sections, loading: false, error: error, done: done }
    root.cards = next
  }

  // Cards are rebuilt after a refresh, from the one-day cache where it holds
  // them: lineups change, but not by the hour.
  function forgetCards() { root.recordQueue = []; root.cards = ({}) }

  // A refresh the user asked for. At most one per manualRefreshMinMs: a held
  // key repeats dozens of times a second, and each refresh is a round of
  // requests to every source. Returns whether it ran.
  function userRefresh() {
    var now = Date.now()
    if (now - root.manualRefreshAt < Model.manualRefreshMinMs) return false
    root.manualRefreshAt = now
    return true
  }

  // Middle-click: fetch the event list again, keeping every card cached.
  function softRefresh() {
    if (root.userRefresh()) root.refresh()
  }

  // The r key: forget the cards and records kept, on disk too, and fetch it
  // all again. What stays is the list of fighters Sherdog refused to answer
  // for: a vendor that is blocking us is not asked again for 12 hours,
  // however often the key is pressed.
  function hardRefresh() {
    if (!root.userRefresh()) return
    root.segmentCache = ({})
    root.recordTimes = ({})
    root.recordUntil = ({})
    var blocked = {}
    for (var n in root.records) if (root.records[n] === "blocked" && root.blockedAt[n] !== undefined) blocked[n] = "blocked"
    root.records = blocked
    root.recordQueue = []
    root.forgetCards()
    root.refresh()
    root.saveCache()
  }

  function saveCache() {
    cacheMkdir.running = true
  }

  // Only https URLs ever reach the browser launcher, whatever produced them.
  function openUrl(url) {
    var safe = Model.safeUrl(url)
    if (safe !== "") Quickshell.execDetached(["omarchy-launch-browser", safe])
  }

  Timer {
    id: timer
    interval: Math.max(1, Model.snapRefreshMinutes(root.refreshMinutes)) * 60 * 1000
    running: true
    repeat: true
    onTriggered: { root.forgetCards(); root.refresh() }
  }

  Process {
    id: eventsProcess
    property string org: ""
    property int generation: 0
    running: false
    command: []
    clearEnvironment: true
    environment: Model.environment
    stdout: StdioCollector { id: eventsOut; waitForEnd: true }
    stderr: StdioCollector { id: eventsErr; waitForEnd: true }
    onExited: function(exitCode) {
      if (eventsProcess.generation !== root.generation) { Qt.callLater(root.fetchNext); return }
      root.pending.shift()
      // A parser exception here would skip fetchNext and leave the service
      // loading for good, so a response that cannot be read counts as a failure.
      var error = ""
      if (exitCode === 0) {
        try {
          // The parsers run on the GUI thread: a response beyond the budget
          // is refused outright rather than read.
          if (eventsOut.text.length > Model.maxResponseChars) throw new Error("response too large")
          var org = eventsProcess.org
          var provider = Model.providerOf(org)
          var days = Model.snapLookaheadDays(root.lookaheadDays)
          var parsed = provider === "wikipedia"
            ? Model.parseWikipedia(eventsOut.text, org, Date.now(), days)
            : provider === "ares"
              ? Model.parseAres(eventsOut.text, Date.now(), days)
              : provider === "sherdog"
                ? Model.parseSherdog(eventsOut.text, org, Date.now(), days)
                : Model.parseScoreboard(eventsOut.text, org)
          var g = root.gathered
          g[eventsProcess.org] = parsed
          root.gathered = g
        } catch (e) {
          error = "Unreadable response for " + Model.promotionById(eventsProcess.org).label + "."
        }
      } else {
        error = Model.errorMessage(eventsErr.text, exitCode)
      }
      if (error !== "") {
        var f = root.failures
        f.push(eventsProcess.org)
        root.failures = f
        root.lastError = error
      }
      Qt.callLater(root.fetchNext)
    }
  }

  Process {
    id: cardProcess
    property var job: null
    running: false
    command: []
    clearEnvironment: true
    environment: Model.environment
    stdout: StdioCollector { id: cardOut; waitForEnd: true }
    stderr: StdioCollector { id: cardErr; waitForEnd: true }
    onExited: function(exitCode) {
      var job = cardProcess.job
      if (job) {
        var sections = [], ok = false, segments = ({})
        try {
          segments = exitCode === 0 && cardOut.text.length <= Model.maxResponseChars ? Model.parseSegments(cardOut.text) : ({})
          ok = Object.keys(segments).length > 0
          sections = Model.buildCard(job.event, segments)
        } catch (e) {
          sections = []
          ok = false
        }
        root.setCard(job.id, sections, ok ? "" : "Card order is estimated from start times.", ok)
        if (ok) {
          var kept = root.segmentCache
          kept[job.id] = { at: Date.now(), data: segments }
          root.segmentCache = Model.newestEntries(kept, Model.cacheSegmentMax, function(k, v) { return v.at })
          root.saveCache()
        }
      }
      Qt.callLater(root.nextCard)
    }
  }

  Process {
    id: recordsProcess
    property var job: null
    running: false
    command: []
    clearEnvironment: true
    environment: Model.environment
    stdout: StdioCollector { id: recordsOut; waitForEnd: true }
    onExited: function(exitCode) {
      var job = recordsProcess.job
      if (job) {
        try {
          // A failed run (exit 1: everything blocked) still settles the card:
          // whoever has no record by now is shown as blocked or N/A.
          var found = recordsOut.text.length <= Model.maxResponseChars ? Model.parseRecords(recordsOut.text) : ({})
          // A name the script never answered for counts as blocked.
          job.names.forEach(function(n) { if (!found[n]) found[n] = "blocked" })
          var all = {}
          for (var k in root.records) all[k] = root.records[k]
          var times = {}
          for (var t in root.recordTimes) times[t] = root.recordTimes[t]
          var blocked = {}
          for (var b in root.blockedAt) blocked[b] = root.blockedAt[b]
          var until = {}
          for (var u in root.recordUntil) until[u] = root.recordUntil[u]
          for (var n in found) {
            all[n] = found[n]
            delete until[n]
            if (found[n] === "blocked") blocked[n] = Date.now()
            else times[n] = Date.now()
            if (Model.recordShape.test(found[n])) {
              var to = Model.recordUntil(n, job.events, Date.now())
              if (to > 0) until[n] = to
            }
          }
          // Bounded memory: the newest answers stay, blocked ones go first.
          var keep = Model.newestEntries(all, Model.cacheRecordMax, function(k) { return times[k] })
          for (var o in all) if (keep[o] === undefined) { delete times[o]; delete blocked[o]; delete until[o] }
          root.recordUntil = until
          root.blockedAt = blocked
          all = keep
          root.records = all
          root.recordTimes = times
          root.saveCache()
          // Only cards still there: a refresh may have dropped them.
          job.events.forEach(function(e) {
            var card = root.cards[e.id]
            if (card && card.done) root.setCard(e.id, Model.buildCard(Model.withRecords(e, all, true), {}), "", true)
          })
        } catch (e) {}
      }
      Qt.callLater(root.nextRecords)
    }
  }

  Process {
    id: cacheMkdir
    running: false
    command: ["/usr/bin/mkdir", "-p", root.cacheDir]
    onExited: {
      cacheFile.setText(Model.serializeCache(root.events, root.fetchedAt))
      // Real records and N/As with the time they were fetched; blocked names
      // with the time of the refusal, so the backoff survives a restart.
      var recs = {}
      for (var n in root.recordTimes)
        if (root.records[n] !== undefined && root.records[n] !== "blocked") recs[n] = { at: root.recordTimes[n], value: root.records[n], until: root.recordUntil[n] }
      for (var b in root.blockedAt)
        if (root.records[b] === "blocked") recs[b] = { at: root.blockedAt[b], value: "blocked" }
      cardsFile.setText(Model.serializeCardCache(
        Model.newestEntries(root.segmentCache, Model.cacheSegmentMax, function(k, v) { return v.at }),
        Model.newestEntries(recs, Model.cacheRecordMax, function(k, v) { return v.at })))
    }
  }

  FileView {
    id: cardsFile
    path: root.cacheDir + "/cards.json"
    printErrors: false
    onLoaded: {
      var kept = Model.parseCardCache(text(), Date.now())
      var segs = {}, all = {}, times = {}, blocked = {}, until = {}
      var k
      for (k in kept.segments) segs[k] = kept.segments[k]
      for (k in root.segmentCache) segs[k] = root.segmentCache[k]
      for (k in root.records) all[k] = root.records[k]
      for (k in root.recordTimes) times[k] = root.recordTimes[k]
      for (k in root.blockedAt) blocked[k] = root.blockedAt[k]
      for (k in root.recordUntil) until[k] = root.recordUntil[k]
      for (k in kept.records) {
        if (all[k] !== undefined) continue
        all[k] = kept.records[k].value
        if (all[k] === "blocked") blocked[k] = kept.records[k].at
        else times[k] = kept.records[k].at
        if (kept.records[k].until !== undefined) until[k] = kept.records[k].until
      }
      root.segmentCache = segs
      root.records = all
      root.recordTimes = times
      root.blockedAt = blocked
      root.recordUntil = until
    }
  }

  FileView {
    id: cacheFile
    path: root.cacheDir + "/events.json"
    printErrors: false
    onLoaded: {
      var cached = Model.parseCache(text())
      if (!cached || root.events.length > 0) return
      root.events = Model.forOrganizations(Model.upcomingOnly(cached.events, new Date(), root.keepFinishedDays),
        Model.selectedOrganizations(root.organizations))
      root.fetchedAt = cached.fetchedAt
      // A fetch that already failed before the cache was read.
      root.offline = !root.loading && root.errorText !== ""
    }
  }

  Component.onCompleted: root.refresh()
}
