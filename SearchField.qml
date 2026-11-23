import QtQuick
import QtQuick.Controls
import qs.Ui
import "Model.js" as Model

// The panel's search box. Qt's own paste reads the whole clipboard into the
// shell process, synchronously, before maximumLength or onTextChanged can
// limit it, so it never gets the chance: pastes are reported through
// pasteRequested() instead, the panel reads the clipboard with bin/mma-paste
// (byte cap, deadline, separate process) and hands the text to insertPasted().
//
// The field is read-only to Qt, always. A writable TextInput also listens to
// every clipboard change and, on Qt builds without qtdeclarative bcbfae67
// ("don't call QMimeData::text() for canPaste", QTBUG-149610), reads the new
// clipboard text right there to update canPaste: no paste needed, just any
// client setting the clipboard while the panel exists. That handler reads
// nothing while readOnly is set, and readOnly also shuts every native paste
// route (keys, middle click, context menu) at the source. Editing is done
// here instead, on the text property: typed characters, Backspace and Delete
// (with Ctrl, by word) and Cut. Moving, selecting and copying stay Qt's,
// which allows them on a read-only field. What a read-only field does lose
// is input methods (compose sequences, IMEs) and undo; search matching
// ignores accents, so plain letters find every name.
//
// Paste keys (StandardKey.Paste, Ctrl+V, Shift+Insert, the Paste key,
// Ctrl+Shift+V) and middle click (PRIMARY selection) become pasteRequested().
// The context menu, by mouse or the Menu key, is turned off.
TextField {
  id: field

  // primary: true for the PRIMARY selection (middle click), false for the clipboard.
  signal pasteRequested(bool primary)

  readOnly: true
  // A read-only field hides its cursor; this one is edited, so it shows it.
  cursorVisible: activeFocus
  maximumLength: Model.maxQueryLength
  ContextMenu.menu: null

  // Puts `t` over the selection, else at the cursor, clipped to the room left.
  function replaceSelection(t) {
    var start = Math.min(field.selectionStart, field.selectionEnd)
    var end = Math.max(field.selectionStart, field.selectionEnd)
    var room = Model.maxQueryLength - (field.length - (end - start))
    t = Model.pastedQuery(t, room)
    if (t === "" && end === start) return false
    var s = field.text
    field.text = s.slice(0, start) + t + s.slice(end)
    field.cursorPosition = start + t.length
    return true
  }

  // Puts bounded clipboard text where Qt's paste would have.
  function insertPasted(text) {
    if (Model.pastedQuery(text) !== "") field.replaceSelection(text)
  }

  // Deletes the selection, else from the cursor back (dir -1) or forward
  // (dir 1) by one character, or with byWord to the next word boundary.
  function erase(dir, byWord) {
    if (field.selectionStart !== field.selectionEnd) return field.replaceSelection("")
    var s = field.text, pos = field.cursorPosition, other = pos
    if (dir < 0) {
      if (pos === 0) return false
      if (byWord) { other = pos; while (other > 0 && s[other - 1] === " ") other--; while (other > 0 && s[other - 1] !== " ") other-- }
      else other = pos - (pos > 1 && /[\udc00-\udfff]/.test(s[pos - 1]) && /[\ud800-\udbff]/.test(s[pos - 2]) ? 2 : 1)
    } else {
      if (pos === s.length) return false
      if (byWord) { other = pos; while (other < s.length && s[other] === " ") other++; while (other < s.length && s[other] !== " ") other++ }
      else other = pos + (/[\ud800-\udbff]/.test(s[pos]) && /[\udc00-\udfff]/.test(s[pos + 1] || "") ? 2 : 1)
    }
    field.select(Math.min(pos, other), Math.max(pos, other))
    return field.replaceSelection("")
  }

  function isPaste(event) {
    return event.matches(StandardKey.Paste)
      || event.key === Qt.Key_Paste
      || (event.key === Qt.Key_Insert && (event.modifiers & Qt.ShiftModifier))
      || (event.key === Qt.Key_V && (event.modifiers & Qt.ControlModifier))
  }

  function isCut(event) {
    return event.matches(StandardKey.Cut)
      || (event.key === Qt.Key_Delete && (event.modifiers & Qt.ShiftModifier))
  }

  // Printable text from a key press with no command modifier held.
  function typedText(event) {
    if (event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier)) return ""
    var t = event.text || ""
    // Model.pastedQuery turns control characters (Return, Tab, Esc...) into spaces.
    return t !== "" && Model.pastedQuery(t) === t ? t : ""
  }

  // Runs before the TextInput's own key handling.
  Keys.priority: Keys.BeforeItem
  Keys.onShortcutOverride: function(event) {
    // Claimed so a global shortcut cannot take the key either; the key press
    // that follows is the one handled below.
    if (field.isPaste(event) || field.isCut(event) || field.typedText(event) !== ""
        || event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete) event.accepted = true
  }
  Keys.onPressed: function(event) {
    var word = (event.modifiers & Qt.ControlModifier) !== 0
    if (field.isPaste(event)) {
      event.accepted = true
      if (!event.isAutoRepeat) field.pasteRequested(false)
    } else if (field.isCut(event)) {
      event.accepted = true
      if (field.selectionStart !== field.selectionEnd) { field.copy(); field.replaceSelection("") }
    } else if (event.key === Qt.Key_Backspace) {
      event.accepted = true
      field.erase(-1, word)
    } else if (event.key === Qt.Key_Delete) {
      event.accepted = true
      field.erase(1, word)
    } else if (event.key === Qt.Key_Menu) {
      event.accepted = true
    } else {
      var t = field.typedText(event)
      if (t !== "") { event.accepted = true; field.replaceSelection(t) }
    }
  }

  // Middle click asks for PRIMARY; right click would open a menu.
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
