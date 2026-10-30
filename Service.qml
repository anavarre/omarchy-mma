import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// The one process-wide owner of everything fetched from ESPN: the event list,
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

  onOrganizationsChanged: if (root.organizations !== null) refreshSoon()
  onLookaheadDaysChanged: refreshSoon()
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
    eventsProcess.command = ["/usr/bin/bash", root.api, "events", promo.slug,
      Model.dateRange(new Date(), Model.snapLookaheadDays(root.lookaheadDays))]
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
    if (root.events.length > 0) root.loadCard(root.events[0].id)
  }

  function merge() {
    // Events restored from the cache have no per-organization lists behind
    // them, so there is nothing to re-merge until a fetch succeeds.
    if (root.offline && Object.keys(root.byOrg).length === 0) return
    var selected = Model.selectedOrganizations(root.organizations)
    var lists = []
    for (var i = 0; i < selected.length; i++)
      if (root.byOrg[selected[i]]) lists.push(root.byOrg[selected[i]])
    root.events = Model.mergeEvents(lists, root.eventLimit)
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
    var next = {}
    for (var k in root.cards) next[k] = root.cards[k]
    next[id] = { sections: Model.buildCard(event, {}), loading: true, error: "", done: false }
    root.cards = next
    cardQueue.push({ id: id, event: event })
    root.nextCard()
  }

  function nextCard() {
    if (cardProcess.running || root.cardQueue.length === 0) return
    var job = root.cardQueue.shift()
    cardProcess.job = job
    var ids = job.event.fights.map(function(f) { return f.id })
    cardProcess.command = ["/usr/bin/bash", root.api, "card", job.event.slug, job.event.id].concat(ids)
    cardProcess.running = true
  }

  function setCard(id, sections, error, done) {
    var next = {}
    for (var k in root.cards) next[k] = root.cards[k]
    next[id] = { sections: sections, loading: false, error: error, done: done }
    root.cards = next
  }

  // Cards are re-fetched on the next open after a refresh: lineups change.
  function forgetCards() { root.cards = ({}) }

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
      if (exitCode === 0) {
        var parsed = Model.parseScoreboard(eventsOut.text, eventsProcess.org)
        var g = root.gathered
        g[eventsProcess.org] = parsed
        root.gathered = g
      } else {
        var f = root.failures
        f.push(eventsProcess.org)
        root.failures = f
        root.lastError = Model.errorMessage(eventsErr.text, exitCode)
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
        var segments = exitCode === 0 ? Model.parseSegments(cardOut.text) : ({})
        var ok = Object.keys(segments).length > 0
        root.setCard(job.id, Model.buildCard(job.event, segments),
          ok ? "" : "Card order is estimated from start times.", ok)
      }
      Qt.callLater(root.nextCard)
    }
  }

  Process {
    id: cacheMkdir
    running: false
    command: ["/usr/bin/mkdir", "-p", root.cacheDir]
    onExited: cacheFile.setText(Model.serializeCache(root.events, root.fetchedAt))
  }

  FileView {
    id: cacheFile
    path: root.cacheDir + "/events.json"
    printErrors: false
    onLoaded: {
      var cached = Model.parseCache(text())
      if (!cached || root.events.length > 0) return
      root.events = Model.forOrganizations(Model.upcomingOnly(cached.events, new Date()),
        Model.selectedOrganizations(root.organizations))
      root.fetchedAt = cached.fetchedAt
      // A fetch that already failed before the cache was read.
      root.offline = !root.loading && root.errorText !== ""
    }
  }

  Component.onCompleted: root.refresh()
}
