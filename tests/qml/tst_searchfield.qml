import QtQuick
import QtQuick.Controls
import QtTest
import "../.."

// SearchField must keep every native paste route away from Qt's unbounded
// clipboard read: real key and mouse events, against a real TextInput.
Item {
  id: top
  width: 400; height: 200

  SearchField { id: field; y: 0; width: 300; height: 40 }
  // The control: an untouched TextField does paste natively, so a pass
  // below means the routes were closed, not that pasting does nothing here.
  TextField { id: plain; y: 50; width: 300; height: 40 }
  TextInput { id: seed; y: 100; width: 300; height: 40 }

  SignalSpy { id: spy; target: field; signalName: "pasteRequested" }

  TestCase {
    name: "SearchField"
    when: windowShown

    function init() {
      seed.text = "NATIVE"; seed.selectAll(); seed.copy()
      field.text = ""; plain.text = ""; spy.clear()
      field.forceActiveFocus()
    }

    function test_control_pastes_natively() {
      plain.forceActiveFocus()
      keyClick(Qt.Key_V, Qt.ControlModifier)
      compare(plain.text, "NATIVE")
    }

    function test_paste_keys_are_rerouted_data() {
      return [
        { tag: "Ctrl+V", key: Qt.Key_V, mod: Qt.ControlModifier },
        { tag: "Shift+Insert", key: Qt.Key_Insert, mod: Qt.ShiftModifier },
        { tag: "Paste key", key: Qt.Key_Paste, mod: Qt.NoModifier },
        { tag: "Ctrl+Shift+V", key: Qt.Key_V, mod: Qt.ControlModifier | Qt.ShiftModifier }
      ]
    }
    function test_paste_keys_are_rerouted(d) {
      keyClick(d.key, d.mod)
      compare(field.text, "")
      compare(spy.count, 1)
      compare(spy.signalArguments[0][0], false)
    }

    function test_middle_click_asks_for_primary() {
      mouseClick(field, 20, 20, Qt.MiddleButton)
      compare(field.text, "")
      compare(spy.count, 1)
      compare(spy.signalArguments[0][0], true)
    }

    function test_right_click_and_menu_key_do_nothing() {
      mouseClick(field, 20, 20, Qt.RightButton)
      keyClick(Qt.Key_Menu)
      compare(spy.count, 0)
      compare(field.text, "")
      // A menu would have taken focus away from the box.
      verify(field.activeFocus)
    }

    function test_typing_still_works() {
      keyClick(Qt.Key_A); keyClick(Qt.Key_B)
      compare(field.text, "ab")
      compare(spy.count, 0)
    }

    function test_insert_pasted_cleans_and_clips() {
      field.insertPasted("Jon\nJones\t\u0007x")
      compare(field.text, "Jon Jones x")
      field.text = ""
      field.insertPasted(new Array(10001).join("a"))
      compare(field.text.length, 100)
      field.insertPasted("more")
      compare(field.text.length, 100)
    }

    function test_insert_pasted_replaces_selection() {
      field.text = "jon smith"
      field.select(4, 9)
      field.insertPasted("jones")
      compare(field.text, "jon jones")
      compare(field.cursorPosition, 9)
    }

    function test_typing_is_capped() {
      field.text = new Array(100).join("a")
      keyClick(Qt.Key_B); keyClick(Qt.Key_C)
      compare(field.text.length, 100)
    }
  }
}
