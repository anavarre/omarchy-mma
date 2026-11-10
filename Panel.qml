pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "anavarre.mma"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null

  // The plugin's Service.qml singleton, handed down by the bar widget. Until it
  // appears the panel reads an inert stand-in so every binding has something
  // to read.
  property var service: null
  readonly property var mma: root.service || inertService

  // The record line under a fighter's name: a spinner while the record is
  // being looked up, the record once it is known, and a note when it is not.
  component RecordLine: Item {
    id: line
    required property var fighter
    required property bool rightAligned
    required property color dim
    required property string fontFamily
    required property real pixelSize
    required property bool active
    readonly property bool pending: line.fighter.recordPending === true
    readonly property string label: line.fighter.record !== ""
      ? line.fighter.record
      : (line.fighter.recordMissing === "blocked" ? "Blocked by vendor!" : (line.fighter.recordMissing === "na" ? "N/A" : ""))
    visible: line.pending || line.label !== ""
    height: line.visible ? labelText.implicitHeight : 0

    Text {
      id: labelText
      anchors.left: parent.left
      anchors.right: parent.right
      horizontalAlignment: line.rightAligned ? Text.AlignRight : Text.AlignLeft
      elide: Text.ElideRight
      textFormat: Text.PlainText
      text: line.label
      font.italic: line.fighter.record === "" && !!line.fighter.recordMissing
      color: line.dim
      font.family: line.fontFamily
      font.pixelSize: line.pixelSize
    }

    // A thin ring with a gap, turning steadily: drawn once, then rotated.
    Canvas {
      id: spinner
      visible: line.pending
      readonly property real size: Math.round(line.pixelSize * 1.05)
      width: spinner.size
      height: spinner.size
      anchors.left: line.rightAligned ? undefined : parent.left
      anchors.right: line.rightAligned ? parent.right : undefined
      anchors.verticalCenter: parent.verticalCenter
      transformOrigin: Item.Center
      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var w = Math.max(1.5, spinner.size / 9)
        ctx.lineWidth = w
        ctx.lineCap = "round"
        ctx.strokeStyle = line.dim
        ctx.beginPath()
        ctx.arc(spinner.size / 2, spinner.size / 2, spinner.size / 2 - w, 0, Math.PI * 1.55)
        ctx.stroke()
      }
      Connections {
        target: line
        function onDimChanged() { spinner.requestPaint() }
      }
      RotationAnimator on rotation {
        from: 0
        to: 360
        duration: 800
        loops: Animation.Infinite
        running: line.pending && line.active
      }
    }
  }

  // Events that are over stay listed, with a check mark, for the number of days
  // set in Settings. The clock is refreshed while the panel is open so a row
  // leaves the list on time without waiting for a refresh.
  property int keepFinishedDays: 1
  property real now: Date.now()
  Timer {
    interval: 60000
    repeat: true
    running: root.opened
    onTriggered: root.now = Date.now()
  }
  // Every event loaded, and how many of them the list shows so far: the
  // "Events to show" setting at first, then another page each time the
  // selection or the scroll reaches the end.
  property string query: ""
  property string orgFilter: ""
  readonly property var visibleAll: Model.visibleEvents(root.mma.events, root.now, root.keepFinishedDays)
  readonly property var orgChoices: Model.eventOrganizations(root.visibleAll)
  // A filter whose organization has no events left falls back to "All".
  readonly property string activeOrg: root.orgChoices.some(function(o) { return o.id === root.orgFilter }) ? root.orgFilter : ""
  readonly property var allEvents: Model.filterEvents(Model.filterByOrg(root.visibleAll, root.activeOrg), root.query)
  function cycleOrg() {
    var ids = [""].concat(root.orgChoices.map(function(o) { return o.id }))
    root.orgFilter = ids[(ids.indexOf(root.activeOrg) + 1) % ids.length]
  }
  readonly property int pageSize: Model.clampEventLimit(root.mma.eventLimit)
  property int shownCount: root.pageSize
  readonly property var events: root.allEvents.slice(0, root.shownCount)
  readonly property bool hasMore: root.allEvents.length > root.shownCount
  function showMore() {
    if (root.hasMore) root.shownCount += root.pageSize
    Qt.callLater(function() { root.revealSelected() })
  }
  readonly property bool loading: root.mma.loading === true
  readonly property bool offline: root.mma.offline === true
  readonly property string errorText: root.mma.errorText
  readonly property int organizationCount: (root.mma.organizations || []).length

  property int selected: 0
  // The settings view replaces the list and the card while it is showing.
  property bool showSettings: false
  property int settingsSelected: 0
  readonly property var promotions: Model.promotions
  // The event whose card is showing; empty while the list is.
  property string eventId: ""
  readonly property bool showCard: root.eventId !== "" && !root.showSettings
  readonly property var currentEvent: {
    var list = root.events
    for (var i = 0; i < list.length; i++) if (list[i].id === root.eventId) return list[i]
    return null
  }
  readonly property var card: root.showCard ? root.mma.cardFor(root.eventId) : null

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color accent: Color.accent
  readonly property color urgent: bar ? bar.urgent : Color.urgent

  // Themes pick muted/accent/green for looks, not for legibility on every
  // surface. Text colors are therefore nudged toward a pole (foreground, or
  // black/white) until they reach a readable contrast against the worst
  // surface they sit on: the panel background, or a selected row's tint.
  function luminance(c) {
    function lin(v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  }
  function contrast(a, b) {
    var la = root.luminance(a), lb = root.luminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  }
  function readable(c, pole, ratio) {
    for (var t = 0; t <= 1.0001; t += 0.05) {
      var m = Qt.tint(c, Qt.alpha(pole, t))
      if (root.contrast(m, root.surface) >= ratio && root.contrast(m, root.surfaceSelected) >= ratio) return m
    }
    return pole
  }
  readonly property color surface: Color.background
  readonly property color surfaceSelected: Qt.tint(Color.background, Qt.alpha(Color.accent, 0.18))
  readonly property color pole: root.contrast("#000000", root.surface) > root.contrast("#ffffff", root.surface) ? "#000000" : "#ffffff"
  readonly property color dim: root.readable(Color.muted, root.foreground, 4.5)
  readonly property color good: root.readable("#2ea043", root.pole, 4.5)
  readonly property color accentText: root.readable(Color.accent, root.foreground, 4.5)

  // Text size is offered as named sizes; every font size in the panel is
  // scaled by the matching factor.
  property string textSize: "medium"
  property string timeFormat: "12h"
  property string timeZone: "venue"
  // Winners are spoilers, so they stay hidden until asked for.
  property bool showResults: false
  readonly property var textScales: ({ small: 0.85, medium: 1.0, large: 1.2, xlarge: 1.45 })
  readonly property real requestedScale: root.textScales[root.textSize] || 1.0
  // The chosen size is a preference; the screen has the final say. Scale down
  // until the card keeps room for several rows plus the footer hints, so the
  // list, settings and shortcuts stay reachable on any screen size or ratio.
  readonly property real fitScale: {
    var h = panel.availableCardHeight, w = panel.availableCardWidth
    var byHeight = h > 0 ? h / Style.space(620) : root.requestedScale
    var byWidth = w > 0 ? w / Style.space(540) : root.requestedScale
    return Math.max(0.6, Math.min(byHeight, byWidth))
  }
  readonly property real textScale: Math.min(root.requestedScale, root.fitScale)

  // Every font size in this panel goes through here, so one setting moves all
  // of them together.
  function fs(size) { return Math.round(size * root.textScale) }

  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property real cardWidth: panel.fittedContentWidth(Style.space(Math.round(520 * root.textScale)))
  // What the card has left for the scrolling body once the header, footer and
  // spacing are placed.
  // Measured from what is actually showing (status line, search row, hint
  // chevron, wrapped footer...) rather than guessed, so nothing overflows.
  readonly property real chromeHeight: {
    var kids = content.children, used = 0, shown = 0
    for (var k = 0; k < kids.length; k++) {
      var c = kids[k]
      if (!c.visible) continue
      shown++
      if (c.objectName !== "body") used += c.height
    }
    return used + Math.max(0, shown - 1) * content.spacing
  }
  readonly property real bodyMaxHeight: Math.max(Style.space(80),
    panel.availableCardHeight - panel.verticalContentInset - root.chromeHeight)

  QtObject {
    id: inertService
    readonly property var events: []
    readonly property var organizations: []
    readonly property bool loading: false
    readonly property bool offline: false
    readonly property string errorText: ""
    readonly property double fetchedAt: 0
    function cardFor(id) { return { sections: [], loading: false, error: "" } }
    function loadCard(id) {}
    function refresh() {}
    function hardRefresh() {}
    function refreshCard(id) {}
    property string openCardId: ""
    function openUrl(url) {}
  }

  onOpenedChanged: {
    if (root.opened) {
      root.eventId = ""
      root.showSettings = false
      root.query = ""
      root.orgFilter = ""
      root.selected = 0
      root.shownCount = root.pageSize
      listView.contentY = 0
      // Opening the panel is cheap; refetching on every open is not.
      if (root.service && Date.now() - root.mma.fetchedAt > 10 * 60 * 1000) root.mma.refresh()
    }
  }

  onQueryChanged: {
    root.shownCount = root.pageSize
    root.selected = 0
    listView.contentY = 0
  }
  onActiveOrgChanged: {
    root.shownCount = root.pageSize
    root.selected = 0
    listView.contentY = 0
  }

  // The search box only takes the keyboard when asked ("f"); every other view
  // change hands it back to the key catcher.
  onShowCardChanged: { keys.forceActiveFocus(); root.mma.openCardId = root.showCard ? root.eventId : "" }
  onEventIdChanged: root.mma.openCardId = root.showCard ? root.eventId : ""
  onShowSettingsChanged: keys.forceActiveFocus()

  // The "load more" row sits after the last event and is selectable like one.
  readonly property int lastSelectable: root.events.length - 1 + (root.hasMore ? 1 : 0)
  onLastSelectableChanged: root.selected = Math.max(0, Math.min(root.lastSelectable, root.selected))

  // Keyboard-only: hover also moves the selection, and scrolling under a
  // stationary pointer would then fight it.
  function ensureSettingsVisible() {
    var sel = root.settingsSelected, n = root.promotions.length
    var item = sel < n ? settingsRepeater.itemAt(sel)
      : [zoneItem, keepItem, resultsItem, sizeItem][sel - n]
    if (!item) return
    var f = settingsFlick, top = item.y, bottom = item.y + item.height
    if (top < f.contentY) f.contentY = top
    else if (bottom > f.contentY + f.height) f.contentY = bottom - f.height
    f.contentY = Math.max(0, Math.min(Math.max(0, f.contentHeight - f.height), f.contentY))
  }

  // The "Past events" / "Upcoming events" groups can be folded away.
  property bool collapsedPast: false
  property bool collapsedUpcoming: false
  function isCollapsed(e) { return e.finished === true ? root.collapsedPast : root.collapsedUpcoming }
  // Selectable: an event in an expanded group, or the "load more" row.
  function selectable(i) {
    return i === root.events.length ? root.hasMore : !root.isCollapsed(root.events[i])
  }
  function toggleGroup(finished) {
    if (finished) root.collapsedPast = !root.collapsedPast
    else root.collapsedUpcoming = !root.collapsedUpcoming
    // Keep the selection on something visible.
    var n = root.lastSelectable, i
    if (n < 0 || root.selectable(root.selected)) return
    for (i = root.selected; i <= n; i++) if (root.selectable(i)) { root.selected = i; return }
    for (i = root.selected; i >= 0; i--) if (root.selectable(i)) { root.selected = i; return }
  }

  function moveSelection(dy) {
    if (root.events.length === 0) return
    var step = dy < 0 ? -1 : 1, i = root.selected + step
    while (i >= 0 && i <= root.lastSelectable && !root.selectable(i)) i += step
    if (i >= 0 && i <= root.lastSelectable) root.selected = i
  }

  function openEvent(index) {
    // On the "load more" row, Enter loads the next page; the selection then
    // lands on the first new event.
    if (index === root.events.length && root.hasMore) { root.showMore(); return }
    var e = root.events[index]
    if (!e) return
    root.eventId = e.id
    cardView.contentY = 0
    root.mma.loadCard(e.id)
  }

  function organizationOn(id) { return (root.mma.organizations || []).indexOf(id) >= 0 }

  function toggleOrganization(index) {
    var p = root.promotions[index]
    if (!p || !p.enabled || !root.hostWidget) return
    root.hostWidget.setOrganizations(Model.toggleOrganization(root.mma.organizations || [], p.id, !root.organizationOn(p.id)))
  }

  readonly property var textSizeChoices: [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
    { value: "xlarge", label: "Extra large" }
  ]
  readonly property int textSizeIndex: {
    for (var i = 0; i < root.textSizeChoices.length; i++)
      if (root.textSizeChoices[i].value === root.textSize) return i
    return 1
  }
  readonly property string textSizeLabel: root.textSizeChoices[root.textSizeIndex].label

  // Applied locally first so the panel redraws at the new size on the click;
  // the shell.json write comes back as the same value.
  function stepTextSize(delta) {
    var i = Math.max(0, Math.min(root.textSizeChoices.length - 1, root.textSizeIndex + delta))
    var next = root.textSizeChoices[i].value
    if (next === root.textSize) return
    root.textSize = next
    if (root.hostWidget && typeof root.hostWidget.saveTextSize === "function")
      root.hostWidget.saveTextSize(next)
  }

  // Applied locally first so the times redraw on the pick; the shell.json
  // write comes back as the same value.
  function pickTimeZone(value) {
    if (value === root.timeZone) return
    root.timeZone = value
    if (root.hostWidget && typeof root.hostWidget.saveTimeZone === "function")
      root.hostWidget.saveTimeZone(value)
  }

  function outcomeOf(fight, i) { return root.showResults ? Model.outcome(fight, i) : "none" }

  function pickShowResults(value) {
    if (value === root.showResults) return
    root.showResults = value
    if (root.hostWidget && typeof root.hostWidget.saveShowResults === "function")
      root.hostWidget.saveShowResults(value)
  }

  readonly property int keepDaysIndex: Math.max(0, Model.keepDaysChoices.indexOf(root.keepFinishedDays))

  function stepTimeZone(delta) {
    root.pickTimeZone(delta < 0 ? "venue" : "local")
  }

  function stepKeepDays(delta) {
    var i = Math.max(0, Math.min(Model.keepDaysChoices.length - 1, root.keepDaysIndex + delta))
    root.pickKeepFinishedDays(Model.keepDaysChoices[i])
  }

  function pickKeepFinishedDays(value) {
    if (value === root.keepFinishedDays) return
    root.keepFinishedDays = value
    if (root.hostWidget && typeof root.hostWidget.saveKeepFinishedDays === "function")
      root.hostWidget.saveKeepFinishedDays(value)
  }

  // Settings rows: one per organization, then the time zone, keep-days,
  // results and text size steppers.
  readonly property int settingsRowCount: root.promotions.length + 4
  readonly property int zoneRow: root.promotions.length
  readonly property int keepRow: root.promotions.length + 1
  readonly property int resultsRow: root.promotions.length + 2
  readonly property int sizeRow: root.promotions.length + 3

  function stepSettingsRow(dx) {
    if (root.settingsSelected === root.zoneRow) root.stepTimeZone(dx)
    else if (root.settingsSelected === root.keepRow) root.stepKeepDays(dx)
    else if (root.settingsSelected === root.resultsRow) root.pickShowResults(dx > 0)
    else if (root.settingsSelected === root.sizeRow) root.stepTextSize(dx)
  }

  function openSettings() {
    root.showSettings = true
    root.settingsSelected = 0
  }

  function back() {
    root.eventId = ""
    Qt.callLater(function() { root.revealSelected() })
  }

  function scrollCard(dy) {
    var max = Math.max(0, cardView.contentHeight - cardView.height)
    cardView.contentY = Math.max(0, Math.min(max, cardView.contentY + dy * Style.space(70)))
  }

  function revealSelected() {
    var item = root.selected === root.events.length ? loadMoreRow : eventRepeater.itemAt(root.selected)
    if (!item || !item.visible) return
    if (item.y < listView.contentY) listView.contentY = item.y
    else if (item.y + item.height > listView.contentY + listView.height)
      listView.contentY = item.y + item.height - listView.height
  }

  onSelectedChanged: root.revealSelected()

  // The zone an event's times are shown in: the chosen one, or its venue's.
  function zoneFor(e) { return Model.effectiveZone(root.timeZone, e) }

  function whenText(e) {
    var zone = root.zoneFor(e)
    return Model.whenText(e, root.timeFormat, zone)
  }

  // A section's start time. When it falls on another day than the event's
  // (a late main card seen from a time zone ahead of the venue's), the weekday
  // comes first so "3:00 AM" isn't read as the same night.
  function sectionTime(iso) {
    if (!root.currentEvent) return Model.formatTime(iso, root.timeFormat, root.timeZone)
    var zone = root.zoneFor(root.currentEvent)
    var time = Model.formatTime(iso, root.timeFormat, zone)
    if (time === "") return time
    var day = Model.formatDay(iso, zone)
    return day !== Model.formatDay(root.currentEvent.date, zone) ? day.split(",")[0] + " " + time : time
  }

  // A short line for the list row: date, time and how far off it is.
  function eventWhen(e) {
    var rel = Model.relativeDay(e.date, new Date(), root.zoneFor(e))
    return root.whenText(e) + (rel !== "" ? " · " + rel : "")
  }

  function eventWhere(e) {
    return [e.venue, e.broadcast].filter(function(s) { return s !== "" }).join(" · ")
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keys
    contentWidth: root.cardWidth
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keys
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (root.showSettings) {
          if (dy !== 0) {
            root.settingsSelected = Math.max(0, Math.min(root.settingsRowCount - 1, root.settingsSelected + dy))
            root.ensureSettingsVisible()
          }
          else if (root.settingsSelected >= root.promotions.length) root.stepSettingsRow(dx)
          else if (dx < 0) root.showSettings = false
        }
        else if (root.showCard) {
          if (dx < 0) root.back()
          else if (dy !== 0) root.scrollCard(dy)
        }
        else if (dy !== 0) root.moveSelection(dy)
        else if (dx > 0) root.openEvent(root.selected)
      }
      onActivateRequested: {
        if (root.showSettings) root.toggleOrganization(root.settingsSelected)
        else if (!root.showCard) root.openEvent(root.selected)
      }
      onCloseRequested: {
        if (root.showSettings) root.showSettings = false
        else if (root.showCard) root.back()
        else root.close()
      }
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        if (root.showSettings) {
          if (text === " ") root.toggleOrganization(root.settingsSelected)
          else if (text === "t") root.pickTimeZone(root.timeZone === "venue" ? "local" : "venue")
        }
        else if (text === "f" && !root.showCard) searchField.forceActiveFocus()
        else if (text === "g" && !root.showCard) root.cycleOrg()
        else if (text === "s") root.openSettings()
        else if (text === "p" && !root.showCard) root.toggleGroup(true)
        else if (text === "u" && !root.showCard) root.toggleGroup(false)
        else if (text === "r") {
          if (root.showCard) root.mma.refreshCard(root.eventId)
          else root.mma.hardRefresh()
        }
        else if (text === "o") {
          var e = root.showCard ? root.currentEvent : root.events[root.selected]
          if (e) root.mma.openUrl(e.url)
        }
      }

      Column {
        id: content
        width: parent.width
        spacing: Style.space(10)

        // ------------------------------------------------------------ header
        Column {
          id: header
          // The event list needs no title; settings and a card do.
          visible: root.showSettings || root.showCard
          width: parent.width
          spacing: Style.space(2)

          Text {
            width: parent.width
            elide: Text.ElideRight
            textFormat: Text.PlainText
            text: root.showSettings ? "Settings" : root.showCard && root.currentEvent ? root.currentEvent.name : ""
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.subtitle)
            font.bold: true
          }
          Text {
            width: parent.width
            elide: Text.ElideRight
            textFormat: Text.PlainText
            visible: text !== ""
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
            text: root.showSettings ? "Organizations to show events for"
              : root.showCard && root.currentEvent
              ? [root.whenText(root.currentEvent), root.eventWhere(root.currentEvent)]
                .filter(function(s) { return s !== "" }).join(" · ")
              : ""
          }
        }

        // ------------------------------------------------------------ status
        Text {
          width: parent.width
          visible: text !== ""
          textFormat: Text.PlainText
          wrapMode: Text.WordWrap
          color: root.errorText !== "" && !root.offline ? root.urgent : root.dim
          font.family: root.fontFamily
          font.pixelSize: root.fs(Style.font.bodySmall)
          text: root.offline ? "Can't fetch events. Showing the last events seen."
            : root.errorText !== "" ? root.errorText
            : root.showCard && root.card && root.card.error !== "" ? root.card.error
            : ""
        }

        // ------------------------------------------------- search + org filter
        Row {
          id: searchRow
          width: parent.width
          spacing: Style.space(8)
          visible: !root.showSettings && !root.showCard

          // Sized to the longest organization name (or "All") so the control
          // never changes width as the filter or the loaded events change.
          TextMetrics {
            id: orgMetrics
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
          }
          readonly property real orgWidth: {
            var labels = ["All"]
            Model.promotions.forEach(function(p) { labels.push(p.label) })
            root.orgChoices.forEach(function(o) { labels.push(o.label) })
            var w = 0
            for (var i = 0; i < labels.length; i++) {
              orgMetrics.text = labels[i]
              w = Math.max(w, orgMetrics.advanceWidth)
            }
            return Math.ceil(w) + Style.spacing.controlPaddingX * 2 + Style.spacing.md
              + Style.font.body + Style.spacing.controlGap + Style.space(6)
          }

          Dropdown {
            id: orgDropdown
            visible: root.orgChoices.length > 1
            width: searchRow.orgWidth
            showLabel: false
            // Same height as the search box beside it.
            rowHeight: searchField.height
            fontFamily: root.fontFamily
            foreground: root.foreground
            accent: root.accent
            options: [{ value: "", label: "All" }].concat(root.orgChoices.map(function(o) { return { value: o.id, label: o.label } }))
            onChanged: function(v) { root.orgFilter = v }
            // Closing the popup (Esc or a pick) hands the keys back to the list.
            onPopupOpenChanged: if (!popupOpen) keys.forceActiveFocus()
            // Tab moves on to the search box.
            Keys.onTabPressed: function(event) {
              if (event.modifiers & Qt.ShiftModifier) { event.accepted = false; return }
              close()
              searchField.forceActiveFocus()
              event.accepted = true
            }
          }
          // Dropdown assigns its own value on pick; keep it following the filter ("g" cycles it too).
          Binding { target: orgDropdown; property: "value"; value: root.activeOrg }

          TextField {
            id: searchField
            width: parent.width - (orgDropdown.visible ? orgDropdown.width + searchRow.spacing : 0)
            foreground: root.foreground
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.body)
            placeholderText: "Search events or fighters"
            text: root.query
            onTextChanged: if (root.query !== text) root.query = text
            Keys.onPressed: function(event) {
              if (event.key === Qt.Key_Down) { root.moveSelection(1); event.accepted = true }
              else if (event.key === Qt.Key_Up) { root.moveSelection(-1); event.accepted = true }
              else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { root.openEvent(root.selected); event.accepted = true }
            }
            // Leaves the box, keeping the filter; Esc again closes the panel.
            Keys.onEscapePressed: keys.forceActiveFocus()
            // Tab goes on to the event list; Shift+Tab still switches panel.
            Keys.onTabPressed: function(event) {
              if (event.modifiers & Qt.ShiftModifier) {
                if (!root.switchPanel(-1)) event.accepted = false
              } else {
                keys.forceActiveFocus()
                event.accepted = true
              }
            }
          }

        }

        Text {
          width: parent.width
          visible: !root.showSettings && !root.showCard && root.events.length === 0 && !root.loading
          wrapMode: Text.WordWrap
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: root.fs(Style.font.body)
          text: root.query.trim() !== "" ? "No event or fighter matches \u201c" + root.query.trim() + "\u201d."
            : root.organizationCount === 0
            ? "No organization selected. Press s to pick some."
            : "No upcoming events found."
        }

        // -------------------------------------------------------- event list
        Flickable {
          id: listView
          objectName: "body"
          visible: !root.showSettings && !root.showCard && root.events.length > 0
          width: parent.width
          height: visible ? Math.min(listColumn.implicitHeight, root.bodyMaxHeight) : 0
          contentWidth: width
          contentHeight: listColumn.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds

          Column {
            id: listColumn
            width: listView.width
            spacing: Style.space(2)

            Repeater {
              id: eventRepeater
              model: root.events

              Item {
                id: entry
                required property int index
                required property var modelData
                width: listColumn.width
                readonly property bool folded: root.isCollapsed(entry.modelData)
                height: row.y + (entry.folded ? 0 : row.height)

                // "Past events" / "Upcoming events" above the first event of each;
                // click to fold or unfold the group.
                Text {
                  id: sectionHeader
                  visible: entry.index === 0
                    || (root.events[entry.index - 1].finished === true) !== (entry.modelData.finished === true)
                  height: visible ? implicitHeight + Style.space(8) : 0
                  verticalAlignment: Text.AlignVCenter
                  leftPadding: Style.space(8)
                  textFormat: Text.PlainText
                  text: ((entry.folded ? "\u25b8 " : "\u25be ")
                    + (entry.modelData.finished === true ? "Past events" : "Upcoming events")).toUpperCase()
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: root.fs(Style.font.bodySmall)
                  font.bold: true

                  MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.toggleGroup(entry.modelData.finished === true)
                  }
                }

                Rectangle {
                  id: row
                  visible: !entry.folded
                  readonly property int index: entry.index
                  readonly property var modelData: entry.modelData
                  y: sectionHeader.visible ? sectionHeader.height : 0
                  width: listColumn.width
                  height: Math.max(rowText.implicitHeight, tag.height) + Style.space(14)
                  radius: Style.space(6)
                  color: row.index === root.selected ? Qt.alpha(root.accent, 0.18) : "transparent"

                  Rectangle {
                    visible: row.index === root.selected
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(3)
                    height: parent.height - Style.space(12)
                    radius: width / 2
                    color: root.accent
                  }

                  // The promotion's logo, or a text tag when it has none.
                  Item {
                    id: tag
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(8)
                    width: Style.space(Math.round(52 * root.textScale))
                    height: logoImage.visible ? width : tagBox.height

                    Image {
                      id: logoImage
                      anchors.fill: parent
                      visible: row.modelData.logo !== "" && status !== Image.Error
                      source: row.modelData.logo !== "" ? Qt.resolvedUrl(row.modelData.logo) : ""
                      fillMode: Image.PreserveAspectFit
                      sourceSize.width: 128
                      sourceSize.height: 128
                      smooth: true
                      mipmap: true
                    }
                    Rectangle {
                      id: tagBox
                      visible: !logoImage.visible
                      width: parent.width
                      height: tagText.implicitHeight + Style.space(6)
                      radius: Style.space(4)
                      color: Qt.alpha(root.accent, 0.25)
                      Text {
                        id: tagText
                        anchors.centerIn: parent
                        // Short ("CW"), and elided rather than overflowing the box.
                        width: Math.min(implicitWidth, parent.width - Style.space(6))
                        elide: Text.ElideRight
                        horizontalAlignment: Text.AlignHCenter
                        text: row.modelData.orgTag
                        textFormat: Text.PlainText
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: root.fs(Style.font.bodySmall)
                        font.bold: true
                      }
                    }
                  }

                  Column {
                    id: rowText
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: tag.right
                    anchors.right: parent.right
                    anchors.leftMargin: Style.space(10)
                    anchors.rightMargin: Style.space(8)
                    spacing: Style.space(2)

                    Item {
                      width: parent.width
                      height: rowName.implicitHeight

                      Text {
                        id: rowName
                        width: Math.min(implicitWidth, parent.width - (rowDone.visible ? rowDone.implicitWidth + Style.space(6) : 0))
                        elide: Text.ElideRight
                        textFormat: Text.PlainText
                        text: row.modelData.name
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: root.fs(Style.font.body)
                      }
                      // The event is over.
                      Text {
                        id: rowDone
                        anchors.left: rowName.right
                        anchors.leftMargin: Style.space(6)
                        anchors.verticalCenter: rowName.verticalCenter
                        visible: row.modelData.finished === true
                        text: "\u2713"
                        color: root.good
                        font.family: root.fontFamily
                        font.pixelSize: root.fs(Style.font.body)
                        font.bold: true
                      }
                    }
                    Text {
                      width: parent.width
                      elide: Text.ElideRight
                      textFormat: Text.PlainText
                      text: root.eventWhen(row.modelData)
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: root.fs(Style.font.bodySmall)
                    }
                    Text {
                      width: parent.width
                      elide: Text.ElideRight
                      textFormat: Text.PlainText
                      visible: text !== ""
                      text: root.eventWhere(row.modelData)
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: root.fs(Style.font.bodySmall)
                    }
                  }

                  MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onEntered: root.selected = row.index
                    onClicked: root.openEvent(row.index)
                  }
                }
              }
            }

            Rectangle {
              id: loadMoreRow
              visible: root.hasMore
              width: listColumn.width
              height: visible ? loadMoreIcon.implicitHeight + Style.space(14) : 0
              radius: Style.space(6)
              color: root.selected === root.events.length ? Qt.alpha(root.accent, 0.18) : "transparent"
              Text {
                id: loadMoreIcon
                anchors.centerIn: parent
                color: root.selected === root.events.length ? root.accent : root.dim
                font.family: root.fontFamily
                font.pixelSize: root.fs(Style.font.body)
                // nf-fa-angle_double_down (U+F103)
                text: "\uf103"
              }
              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onEntered: root.selected = root.events.length
                onClicked: root.showMore()
              }
            }
          }
        }

        // A gently bobbing chevron while more events wait below the fold.
        Text {
          id: moreHint
          // The "load more" row carries its own chevron once any of it is in
          // view, so this hint only covers content still below the fold.
          readonly property bool moreBelow: root.hasMore
            ? loadMoreRow.y >= listView.contentY + listView.height
            : listView.contentY + listView.height < listView.contentHeight - 2
          visible: listView.visible && moreBelow
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: root.fs(Style.font.body)
          // nf-fa-angle_down (U+F107)
          text: "\uf107"
          SequentialAnimation on opacity {
            running: moreHint.visible && root.opened
            loops: Animation.Infinite
            NumberAnimation { from: 0.25; to: 0.9; duration: 900; easing.type: Easing.InOutSine }
            NumberAnimation { from: 0.9; to: 0.25; duration: 900; easing.type: Easing.InOutSine }
          }
        }

        // ---------------------------------------------------------- settings
        Flickable {
          id: settingsFlick
          objectName: "body"
          visible: root.showSettings
          width: parent.width
          height: visible ? Math.min(settingsView.implicitHeight, root.bodyMaxHeight) : 0
          contentWidth: width
          contentHeight: settingsView.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          Column {
            width: settingsFlick.width
            id: settingsView
            spacing: Style.space(2)

            Repeater {
              id: settingsRepeater
              model: root.showSettings ? root.promotions : []

              Column {
                id: orgWrap
                required property int index
                required property var modelData
                width: settingsView.width
                spacing: Style.space(2)

                Text {
                  width: parent.width
                  visible: orgWrap.modelData.experimental === true
                    && (orgWrap.index === 0 || root.promotions[orgWrap.index - 1].experimental !== true)
                  height: visible ? implicitHeight + Style.space(10) : 0
                  verticalAlignment: Text.AlignBottom
                  elide: Text.ElideRight
                  textFormat: Text.PlainText
                  text: "Experimental organizations to show events for"
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: root.fs(Style.font.bodySmall)
                }

              Rectangle {
                id: orgRow
                readonly property int index: orgWrap.index
                readonly property var modelData: orgWrap.modelData
                readonly property bool on: root.organizationOn(orgRow.modelData.id)
                width: settingsView.width
                height: Math.max(orgText.implicitHeight, Style.space(Math.round(32 * root.textScale))) + Style.space(14)
                radius: Style.space(6)
                opacity: orgRow.modelData.enabled ? 1 : 0.5
                color: orgRow.index === root.settingsSelected ? Qt.alpha(root.accent, 0.18) : "transparent"

                Rectangle {
                  id: box
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.left: parent.left
                  anchors.leftMargin: Style.space(8)
                  width: Style.space(Math.round(16 * root.textScale))
                  height: width
                  radius: Style.space(3)
                  color: orgRow.on ? root.accent : "transparent"
                  border.width: 1
                  border.color: orgRow.on ? root.accent : root.dim
                  Text {
                    anchors.centerIn: parent
                    visible: orgRow.on
                    text: "✓"
                    color: Color.background
                    font.family: root.fontFamily
                    font.pixelSize: root.fs(Style.font.bodySmall)
                    font.bold: true
                  }
                }

                Item {
                  id: orgLogo
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.left: box.right
                  anchors.leftMargin: Style.space(10)
                  width: Style.space(Math.round(32 * root.textScale))
                  height: width
                  Image {
                    anchors.fill: parent
                    visible: orgRow.modelData.logo !== "" && status !== Image.Error
                    source: orgRow.modelData.logo ? Qt.resolvedUrl(orgRow.modelData.logo) : ""
                    fillMode: Image.PreserveAspectFit
                    sourceSize.width: 128
                    sourceSize.height: 128
                    smooth: true
                    mipmap: true
                  }
                }

                Column {
                  id: orgText
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.left: orgLogo.right
                  anchors.right: parent.right
                  anchors.leftMargin: Style.space(10)
                  anchors.rightMargin: Style.space(8)
                  Text {
                    width: parent.width
                    elide: Text.ElideRight
                    textFormat: Text.PlainText
                    text: orgRow.modelData.label + (orgRow.modelData.enabled ? "" : " (coming soon)")
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: root.fs(Style.font.body)
                  }
                  Text {
                    width: parent.width
                    elide: Text.ElideRight
                    textFormat: Text.PlainText
                    text: orgRow.modelData.description
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: root.fs(Style.font.bodySmall)
                  }
                }

                MouseArea {
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: orgRow.modelData.enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                  onEntered: root.settingsSelected = orgRow.index
                  onClicked: root.toggleOrganization(orgRow.index)
                }
              }
              }
            }

            // Event times follow this zone: "Event location" uses each venue's,
            // "System" the computer's own.
            Item {
              id: zoneItem
              width: parent.width
              height: Math.max(timeZoneCaption.implicitHeight, timeZoneControls.implicitHeight) + Style.space(14)

              Rectangle {
                anchors.fill: parent
                radius: Style.space(6)
                color: root.settingsSelected === root.zoneRow ? Qt.alpha(root.accent, 0.18) : "transparent"
              }
              HoverHandler { onHoveredChanged: if (hovered) root.settingsSelected = root.zoneRow }

              Text {
                id: timeZoneCaption
                anchors.left: parent.left
                anchors.leftMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - timeZoneControls.width - Style.space(16)
                text: "Time zone"
                elide: Text.ElideRight
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: root.fs(Style.font.body)
              }

              Row {
                id: timeZoneControls
                anchors.right: parent.right
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-angle_left (U+F104)
                  iconText: "\uf104"
                  tooltipText: "Event location"
                  enabled: root.timeZone !== "venue"
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.stepTimeZone(-1)
                }

                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(Math.round(130 * root.textScale))
                  horizontalAlignment: Text.AlignHCenter
                  text: root.timeZone === "venue" ? "Event location" : "System"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: root.fs(Style.font.body)
                }

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-angle_right (U+F105)
                  iconText: "\uf105"
                  tooltipText: "System"
                  enabled: root.timeZone !== "local"
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.stepTimeZone(1)
                }
              }
            }

            Item {
              id: keepItem
              width: parent.width
              height: Math.max(keepCaption.implicitHeight, keepControls.implicitHeight) + Style.space(14)

              Rectangle {
                anchors.fill: parent
                radius: Style.space(6)
                color: root.settingsSelected === root.keepRow ? Qt.alpha(root.accent, 0.18) : "transparent"
              }
              HoverHandler { onHoveredChanged: if (hovered) root.settingsSelected = root.keepRow }

              Text {
                id: keepCaption
                anchors.left: parent.left
                anchors.leftMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - keepControls.width - Style.space(16)
                text: "Keep finished events"
                elide: Text.ElideRight
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: root.fs(Style.font.body)
              }

              Row {
                id: keepControls
                anchors.right: parent.right
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-angle_left (U+F104)
                  iconText: "\uf104"
                  tooltipText: "Fewer days"
                  enabled: root.keepDaysIndex > 0
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.stepKeepDays(-1)
                }

                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(Math.round(70 * root.textScale))
                  horizontalAlignment: Text.AlignHCenter
                  text: root.keepFinishedDays + (root.keepFinishedDays === 1 ? " day" : " days")
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: root.fs(Style.font.body)
                }

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-angle_right (U+F105)
                  iconText: "\uf105"
                  tooltipText: "More days"
                  enabled: root.keepDaysIndex < Model.keepDaysChoices.length - 1
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.stepKeepDays(1)
                }
              }
            }

            // Winners, losers and how a fight ended are spoilers: hidden by default.
            Item {
              id: resultsItem
              width: parent.width
              height: Math.max(resultsCaption.implicitHeight, resultsControls.implicitHeight) + Style.space(14)

              Rectangle {
                anchors.fill: parent
                radius: Style.space(6)
                color: root.settingsSelected === root.resultsRow ? Qt.alpha(root.accent, 0.18) : "transparent"
              }
              HoverHandler { onHoveredChanged: if (hovered) root.settingsSelected = root.resultsRow }

              Text {
                id: resultsCaption
                anchors.left: parent.left
                anchors.leftMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - resultsControls.width - Style.space(16)
                text: "Fight results"
                elide: Text.ElideRight
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: root.fs(Style.font.body)
              }

              Row {
                id: resultsControls
                anchors.right: parent.right
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-angle_left (U+F104)
                  iconText: "\uf104"
                  tooltipText: "Hide"
                  enabled: root.showResults
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.pickShowResults(false)
                }

                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(Math.round(70 * root.textScale))
                  horizontalAlignment: Text.AlignHCenter
                  text: root.showResults ? "Show" : "Hide"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: root.fs(Style.font.body)
                }

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-angle_right (U+F105)
                  iconText: "\uf105"
                  tooltipText: "Show"
                  enabled: !root.showResults
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.pickShowResults(true)
                }
              }
            }

            // Same minus/plus control as miniflux; the panel redraws at the
            // chosen size as soon as it is picked.
            Item {
              id: sizeItem
              width: parent.width
              height: Math.max(textSizeCaption.implicitHeight, textSizeControls.implicitHeight) + Style.space(14)

              Rectangle {
                anchors.fill: parent
                radius: Style.space(6)
                color: root.settingsSelected === root.sizeRow ? Qt.alpha(root.accent, 0.18) : "transparent"
              }
              HoverHandler { onHoveredChanged: if (hovered) root.settingsSelected = root.sizeRow }

              Text {
                id: textSizeCaption
                anchors.left: parent.left
                anchors.leftMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - textSizeControls.width - Style.space(16)
                text: "Text size"
                elide: Text.ElideRight
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: root.fs(Style.font.body)
              }

              Row {
                id: textSizeControls
                anchors.right: parent.right
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-minus (U+F068)
                  iconText: "\uf068"
                  tooltipText: "Smaller"
                  enabled: root.textSizeIndex > 0
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.stepTextSize(-1)
                }

                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(Math.round(80 * root.textScale))
                  horizontalAlignment: Text.AlignHCenter
                  text: root.textSizeLabel
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: root.fs(Style.font.body)
                }

                PanelActionButton {
                  anchors.verticalCenter: parent.verticalCenter
                  // nf-fa-plus (U+F067)
                  iconText: "\uf067"
                  tooltipText: "Larger"
                  enabled: root.textSizeIndex < root.textSizeChoices.length - 1
                  foreground: root.foreground
                  hoverColor: root.foreground
                  fontSize: root.fs(Style.font.bodySmall)
                  onClicked: root.stepTextSize(1)
                }
              }
            }
          }
        }

        // ---------------------------------------------------------- fight card
        Flickable {
          id: cardView
          objectName: "body"
          visible: root.showCard
          width: parent.width
          height: visible ? Math.min(cardColumn.implicitHeight, root.bodyMaxHeight) : 0
          contentWidth: width
          contentHeight: cardColumn.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds

          Column {
            id: cardColumn
            width: cardView.width
            spacing: Style.space(8)

            Text {
              width: parent.width
              visible: root.showCard && root.card && root.card.sections.length === 0
              text: root.card && root.card.loading ? "Loading card…" : "No fights announced yet."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: root.fs(Style.font.body)
            }

            Repeater {
              model: root.showCard && root.card ? root.card.sections : []

              Column {
                id: section
                required property var modelData
                width: cardColumn.width
                spacing: Style.space(2)

                // Main Card, Prelims, Early Prelims: each with its start time.
                Item {
                  width: parent.width
                  height: sectionTitle.implicitHeight + Style.space(8)

                  Text {
                    id: sectionTitle
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    textFormat: Text.PlainText
                    text: section.modelData.label.toUpperCase()
                    color: root.accentText
                    font.family: root.fontFamily
                    font.pixelSize: root.fs(Style.font.bodySmall)
                    font.bold: true
                    font.letterSpacing: 1
                  }
                  Text {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    textFormat: Text.PlainText
                    text: root.sectionTime(Model.sectionStart(section.modelData))
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: root.fs(Style.font.bodySmall)
                  }
                  Rectangle {
                    anchors.left: sectionTitle.right
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(Math.round(100 * root.textScale))
                    anchors.leftMargin: Style.space(8)
                    anchors.verticalCenter: parent.verticalCenter
                    height: 1
                    color: Qt.alpha(root.foreground, 0.15)
                  }
                }

                Repeater {
                  model: section.modelData.fights

                  Item {
                    id: bout
                    required property int index
                    required property var modelData
                    width: section.width
                    height: boutColumn.implicitHeight + Style.space(10)

                    readonly property real sideWidth: (width - vsText.implicitWidth - Style.space(16)) / 2

                    Column {
                      id: boutColumn
                      anchors.left: parent.left
                      anchors.right: parent.right
                      anchors.verticalCenter: parent.verticalCenter
                      spacing: Style.space(2)

                      Item {
                        width: parent.width
                        height: Math.max(leftSide.implicitHeight, rightSide.implicitHeight)

                        // The champion or higher-billed fighter is always on the
                        // left and the challenger always on the right, whichever
                        // order the source listed them in (Model.sortedFighters).
                        Column {
                          id: leftSide
                          anchors.left: parent.left
                          width: bout.sideWidth
                          Text {
                            width: parent.width
                            elide: Text.ElideRight
                            textFormat: Text.PlainText
                            text: (root.outcomeOf(bout.modelData, 0) === "win" ? "✓ " : "") + bout.modelData.fighters[0].name
                            color: root.outcomeOf(bout.modelData, 0) === "win" ? root.good : (bout.modelData.fighters[0].tba ? root.dim : root.foreground)
                            font.family: root.fontFamily
                            font.pixelSize: root.fs(Style.font.body)
                            font.bold: !bout.modelData.fighters[0].tba
                            // Losers fade, but only the name: the record stays legible.
                            opacity: root.outcomeOf(bout.modelData, 0) === "loss" ? 0.65 : 1
                          }
                          RecordLine {
                            width: parent.width
                            fighter: bout.modelData.fighters[0]
                            rightAligned: false
                            dim: root.dim
                            fontFamily: root.fontFamily
                            pixelSize: root.fs(Style.font.bodySmall)
                            active: root.opened
                          }
                        }

                        Text {
                          id: vsText
                          anchors.horizontalCenter: parent.horizontalCenter
                          anchors.top: parent.top
                          text: "vs"
                          color: root.dim
                          font.family: root.fontFamily
                          font.pixelSize: root.fs(Style.font.bodySmall)
                        }

                        Column {
                          id: rightSide
                          anchors.right: parent.right
                          width: bout.sideWidth
                          Text {
                            width: parent.width
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideRight
                            textFormat: Text.PlainText
                            text: bout.modelData.fighters[1].name + (root.outcomeOf(bout.modelData, 1) === "win" ? " ✓" : "")
                            color: root.outcomeOf(bout.modelData, 1) === "win" ? root.good : (bout.modelData.fighters[1].tba ? root.dim : root.foreground)
                            font.family: root.fontFamily
                            font.pixelSize: root.fs(Style.font.body)
                            font.bold: !bout.modelData.fighters[1].tba
                            // Losers fade, but only the name: the record stays legible.
                            opacity: root.outcomeOf(bout.modelData, 1) === "loss" ? 0.65 : 1
                          }
                          RecordLine {
                            width: parent.width
                            fighter: bout.modelData.fighters[1]
                            rightAligned: true
                            dim: root.dim
                            fontFamily: root.fontFamily
                            pixelSize: root.fs(Style.font.bodySmall)
                            active: root.opened
                          }
                        }
                      }

                      Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        elide: Text.ElideRight
                        textFormat: Text.PlainText
                        visible: text !== ""
                        text: Model.crownFor(bout.modelData) + [Model.isMainEvent(section.modelData, bout.index) ? "Main event" : "",
                          Model.weightClassLabel(bout.modelData), (root.showResults ? Model.resultLabel(bout.modelData) : "")].filter(function(s) { return s !== "" }).join(" · ")
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: root.fs(Style.font.bodySmall)
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // ------------------------------------------------------------ footer
        Flow {
          id: footer
          width: parent.width
          spacing: Style.space(14)
          Text {
            visible: root.showSettings
            text: "↵ Toggle"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
          Text {
            visible: !root.showSettings
            text: root.loading || (root.showCard && root.card && root.card.loading) ? "Refreshing…" : "r Refresh"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
          Text {
            visible: !root.showSettings && !root.showCard && root.events.length > 0
            text: "↵ Card"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
          Text {
            visible: !root.showSettings && (root.showCard || root.events.length > 0)
            text: "o Open"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
          Text {
            visible: !root.showSettings && !root.showCard
            text: "f Search"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
          Text {
            visible: !root.showSettings && !root.showCard && root.orgChoices.length > 1
            text: "g Org"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
          Text {
            visible: !root.showSettings && !root.showCard
            text: "s Settings"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
          Text {
            text: root.showSettings || root.showCard ? "Esc Back" : "Esc Close"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: root.fs(Style.font.bodySmall)
          }
        }
      }
    }
  }
}
