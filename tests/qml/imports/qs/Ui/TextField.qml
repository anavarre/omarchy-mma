import QtQuick
import QtQuick.Controls

// Stand-in for Omarchy's qs.Ui TextField, which is a styled Qt Quick Controls
// TextField: the same underlying type, so Qt's native paste is the real one.
TextField {
  property color foreground: "black"
}
