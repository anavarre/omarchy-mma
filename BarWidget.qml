import QtQuick
import Quickshell
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "anavarre.mma"

  // Loader.item is typed QObject, so qmllint cannot see Panel.qml's members
  // through it.
  // qmllint disable missing-property
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  // The plugin's Service.qml singleton, shared by every monitor's widget.
  readonly property var service: root.bar && root.bar.shell
    && typeof root.bar.shell.serviceFor === "function"
    ? root.bar.shell.serviceFor(root.moduleName) : null

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open(payloadJson) { if (panelLoader.item) panelLoader.item.open(payloadJson) }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function toggle() { if (panelLoader.item) panelLoader.item.toggle() }
  function closeForPopoutSwitch() { if (panelLoader.item) panelLoader.item.closeForPopoutSwitch() }
  // qmllint enable missing-property

  // Settings are injected into widgets, not services, so they are handed down
  // here, clamped, since shell.json is hand-editable.
  function injectService() {
    if (!root.service) return
    root.service.organizations = Model.selectedOrganizations(root.setting("organizations", undefined))
    root.service.eventLimit = Model.clampEventLimit(root.setting("eventLimit", 10))
    root.service.lookaheadDays = Model.snapLookaheadDays(root.setting("lookaheadDays", 120))
    root.service.refreshMinutes = Model.snapRefreshMinutes(root.setting("refreshMinutes", 180))
    root.service.keepFinishedDays = Model.knownKeepDays(root.setting("keepFinishedDays", 1))
  }

  function injectPanel() {
    root.injectService()
    if (!panelLoader.item) return
    panelLoader.item.bar = root.bar
    panelLoader.item.anchorItem = button
    panelLoader.item.hostWidget = root
    panelLoader.item.service = root.service
    panelLoader.item.keepFinishedDays = Model.knownKeepDays(root.setting("keepFinishedDays", 1))
    panelLoader.item.textSize = Model.knownTextSize(root.setting("textSize", "medium"))
    panelLoader.item.timeFormat = Model.knownTimeFormat(root.setting("timeFormat", "12h"))
    panelLoader.item.timeZone = Model.knownTimeZone(root.setting("timeZone", "venue"))
  }

  // Called by the panel's settings view. Applied locally first so the panel
  // redraws on the click; the shell.json write comes back as the same value.
  function saveSetting(name, value) {
    var entry = { id: root.moduleName }
    for (var key in root.settings) if (key !== "id") entry[key] = root.settings[key]
    entry[name] = value
    root.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function setOrganizations(list) { root.saveSetting("organizations", list) }
  function saveTimeZone(zone) { root.saveSetting("timeZone", Model.knownTimeZone(zone)) }
  function saveKeepFinishedDays(days) { root.saveSetting("keepFinishedDays", Model.knownKeepDays(days)) }
  function saveTextSize(size) { root.saveSetting("textSize", Model.knownTextSize(size)) }

  readonly property var nextEvent: root.service ? Model.nextEvent(root.service.events) : null

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight
  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onServiceChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // nf-md-boxing_glove (U+F0B65). It is outside the BMP, so no \u escape.
    text: String.fromCodePoint(0xF0B65)
    readonly property string zone: Model.knownTimeZone(root.setting("timeZone", "venue"))
    tooltipText: (root.nextEvent
      ? "Next: " + root.nextEvent.name + "\n"
        + Model.formatDay(root.nextEvent.date, Model.effectiveZone(zone, root.nextEvent)) + " · "
        + Model.formatTime(root.nextEvent.date, Model.knownTimeFormat(root.setting("timeFormat", "12h")), Model.effectiveZone(zone, root.nextEvent))
      : root.service && root.service.loading ? "MMA — loading events"
      : "MMA — no upcoming events")
      + "\nClick: open · Middle-click: refresh"
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
      else if (buttonCode === Qt.MiddleButton && root.service) root.service.refresh()
    }
  }
}
