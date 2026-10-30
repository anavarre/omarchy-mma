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
  readonly property var events: Model.visibleEvents(root.mma.events, root.now, root.keepFinishedDays)
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
  readonly property color dim: Color.muted
  readonly property color accent: Color.accent
  readonly property color urgent: bar ? bar.urgent : Color.urgent

  // Text size is offered as named sizes; every font size in the panel is
  // scaled by the matching factor.
  property string textSize: "medium"
  property string timeFormat: "12h"
  property string timeZone: "venue"
  // Winners are spoilers, so they stay hidden until asked for.
  property bool showResults: false
  readonly property var textScales: ({ small: 0.85, medium: 1.0, large: 1.2, xlarge: 1.45 })
  readonly property real textScale: root.textScales[root.textSize] || 1.0

  // Every font size in this panel goes through here, so one setting moves all
  // of them together.
  function fs(size) { return Math.round(size * root.textScale) }

  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property real cardWidth: panel.fittedContentWidth(Style.space(Math.round(520 * root.textScale)))
  // What the card has left for the scrolling body once the header, footer and
  // spacing are placed.
  readonly property real bodyMaxHeight: Math.max(Style.space(160),
    panel.availableCardHeight - panel.verticalContentInset - header.implicitHeight - footer.implicitHeight - Style.space(20))

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
    function openUrl(url) {}
  }

  onOpenedChanged: {
    if (root.opened) {
      root.eventId = ""
      root.showSettings = false
      root.selected = 0
      listView.contentY = 0
      // Opening the panel is cheap; refetching on every open is not.
      if (root.service && Date.now() - root.mma.fetchedAt > 10 * 60 * 1000) root.mma.refresh()
    }
  }

  onEventsChanged: root.selected = Math.max(0, Math.min(root.events.length - 1, root.selected))

  function moveSelection(dy) {
    if (root.events.length === 0) return
    root.selected = Math.max(0, Math.min(root.events.length - 1, root.selected + dy))
  }

  function openEvent(index) {
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
    var item = eventRepeater.itemAt(root.selected)
    if (!item) return
    if (item.y < listView.contentY) listView.contentY = item.y
    else if (item.y + item.height > listView.contentY + listView.height)
      listView.contentY = item.y + item.height - listView.height
  }

  onSelectedChanged: root.revealSelected()

  // The zone an event's times are shown in: the chosen one, or its venue's.
  function zoneFor(e) { return Model.effectiveZone(root.timeZone, e) }

  function whenText(e) {
    var zone = root.zoneFor(e)
    return Model.formatDay(e.date, zone) + " · " + Model.formatTime(e.date, root.timeFormat, zone)
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
          if (dy !== 0) root.settingsSelected = Math.max(0, Math.min(root.settingsRowCount - 1, root.settingsSelected + dy))
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
        else if (text === "s") root.openSettings()
        else if (text === "r") root.mma.refresh()
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
          width: parent.width
          spacing: Style.space(2)

          Text {
            width: parent.width
            elide: Text.ElideRight
            textFormat: Text.PlainText
            text: root.showSettings ? "Settings" : root.showCard && root.currentEvent ? root.currentEvent.name : "Upcoming MMA events"
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

        Text {
          width: parent.width
          visible: !root.showSettings && !root.showCard && root.events.length === 0 && !root.loading
          wrapMode: Text.WordWrap
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: root.fs(Style.font.body)
          text: root.organizationCount === 0
            ? "No organization selected. Press s to pick some."
            : "No upcoming events found."
        }

        // -------------------------------------------------------- event list
        Flickable {
          id: listView
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

              Rectangle {
                id: row
                required property int index
                required property var modelData
                width: listColumn.width
                height: Math.max(rowText.implicitHeight, tag.height) + Style.space(14)
                radius: Style.space(6)
                color: row.index === root.selected ? Qt.alpha(root.accent, 0.18) : "transparent"

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
                      text: row.modelData.orgLabel
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
                      color: "#2ea043"
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
        }

        // ---------------------------------------------------------- settings
        Column {
          id: settingsView
          visible: root.showSettings
          width: parent.width
          spacing: Style.space(2)

          Repeater {
            model: root.showSettings ? root.promotions : []

            Rectangle {
              id: orgRow
              required property int index
              required property var modelData
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

          // Event times follow this zone: "Event location" uses each venue's,
          // "System" the computer's own.
          Item {
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

        // ---------------------------------------------------------- fight card
        Flickable {
          id: cardView
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
                    color: root.accent
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
                          opacity: root.outcomeOf(bout.modelData, 0) === "loss" ? 0.5 : 1
                          Text {
                            width: parent.width
                            elide: Text.ElideRight
                            textFormat: Text.PlainText
                            text: (root.outcomeOf(bout.modelData, 0) === "win" ? "✓ " : "") + bout.modelData.fighters[0].name
                            color: root.outcomeOf(bout.modelData, 0) === "win" ? "#2ea043" : (bout.modelData.fighters[0].tba ? root.dim : root.foreground)
                            font.family: root.fontFamily
                            font.pixelSize: root.fs(Style.font.body)
                            font.bold: !bout.modelData.fighters[0].tba
                          }
                          Text {
                            width: parent.width
                            visible: text !== ""
                            elide: Text.ElideRight
                            textFormat: Text.PlainText
                            text: bout.modelData.fighters[0].record
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: root.fs(Style.font.bodySmall)
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
                          opacity: root.outcomeOf(bout.modelData, 1) === "loss" ? 0.5 : 1
                          Text {
                            width: parent.width
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideRight
                            textFormat: Text.PlainText
                            text: bout.modelData.fighters[1].name + (root.outcomeOf(bout.modelData, 1) === "win" ? " ✓" : "")
                            color: root.outcomeOf(bout.modelData, 1) === "win" ? "#2ea043" : (bout.modelData.fighters[1].tba ? root.dim : root.foreground)
                            font.family: root.fontFamily
                            font.pixelSize: root.fs(Style.font.body)
                            font.bold: !bout.modelData.fighters[1].tba
                          }
                          Text {
                            width: parent.width
                            visible: text !== ""
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideRight
                            textFormat: Text.PlainText
                            text: bout.modelData.fighters[1].record
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: root.fs(Style.font.bodySmall)
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
        Row {
          id: footer
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
            text: root.loading ? "Refreshing…" : "r Refresh"
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
