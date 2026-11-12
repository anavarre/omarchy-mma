import QtQuick
import QtQuick.Controls
import qs.Ui
import "Model.js" as Model

// The panel's search box. Qt's own paste reads the whole clipboard into the
// shell process, synchronously, before maximumLength or onTextChanged can
// limit it, so every route to it is closed here and reported through
// pasteRequested() instead: the panel reads the clipboard with bin/mma-paste
// (byte cap, deadline, separate process) and hands the text to insertPasted().
//
// Routes closed: StandardKey.Paste (Ctrl+V, Shift+Insert, the Paste key on
// the platforms that bind it), the Paste key and Ctrl+Shift+V explicitly,
// middle click (PRIMARY selection), and the context menu, by mouse or the
// Menu key, which offers Paste. Drag and drop does not reach a TextInput.
TextField {
  id: field

  // primary: true for the PRIMARY selection (middle click), false for the clipboard.
  signal pasteRequested(bool primary)

  maximumLength: Model.maxQueryLength
  ContextMenu.menu: null

  // Puts bounded clipboard text where Qt's paste would have: over the
  // selection, else at the cursor, clipped to the room left in the box.
  function insertPasted(text) {
    var start = Math.min(field.selectionStart, field.selectionEnd)
    var end = Math.max(field.selectionStart, field.selectionEnd)
    var room = Model.maxQueryLength - (field.length - (end - start))
    var t = Model.pastedQuery(text, room)
    if (t === "") return
    if (end > start) field.remove(start, end)
    field.insert(start, t)
    field.cursorPosition = start + t.length
  }

  function isPaste(event) {
    return event.matches(StandardKey.Paste)
      || event.key === Qt.Key_Paste
      || (event.key === Qt.Key_Insert && (event.modifiers & Qt.ShiftModifier))
      || (event.key === Qt.Key_V && (event.modifiers & Qt.ControlModifier))
  }

  // Runs before the TextInput's own key handling, so a paste key never reaches it.
  Keys.priority: Keys.BeforeItem
  Keys.onShortcutOverride: function(event) {
    // Claimed so a global shortcut cannot take the key either; the key press
    // that follows is the one turned into pasteRequested().
    if (field.isPaste(event)) event.accepted = true
  }
  Keys.onPressed: function(event) {
    if (field.isPaste(event)) {
      event.accepted = true
      if (!event.isAutoRepeat) field.pasteRequested(false)
    } else if (event.key === Qt.Key_Menu) {
      event.accepted = true
    }
  }

  // Middle and right presses never reach the TextInput: middle would paste
  // PRIMARY natively, right would open the menu with Paste in it.
  MouseArea {
    anchors.fill: parent
    acceptedButtons: Qt.MiddleButton | Qt.RightButton
    onPressed: function(mouse) {
      mouse.accepted = true
      if (mouse.button === Qt.MiddleButton) {
        field.forceActiveFocus()
        field.pasteRequested(true)
      }
    }
  }
}
