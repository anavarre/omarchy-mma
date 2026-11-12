import QtQuick
import Quickshell
import Quickshell.Io

// A Process whose every run settles exactly once, through settled(), however
// it ends:
// - it exits: settled(exitCode, timedOut);
// - it never starts: Quickshell then reports only running going false, with
//   neither started nor exited, so a caller waiting on exited would wait for
//   good. That run settles with exit code -1;
// - it outlives its deadline. The command runs under timeout(1), which puts it
//   in a process group of its own: at `deadline` seconds the whole group (bash,
//   its subshells, every curl) gets SIGTERM, and timeout exits 124 once the
//   command is gone. If it is still there `killAfter` seconds later, the whole
//   group gets SIGKILL, timeout included: Quickshell then sees a crash, which
//   past the deadline counts as timed out too. Should even that not end the
//   run, the watchdog here settles it as timed out.
// timeout(1) stops at its own command: a descendant that survives the TERM is
// left behind once the command is gone. So whenever a run fails or times out,
// its whole group is sent SIGKILL as well. A process group id is never reused
// while any member is alive, so this can only reach what the run left behind;
// orphans are reaped by init (or the session's subreaper).
// A run that has settled is over for its caller: whatever it reports later
// (a late exit, its output) is ignored, and a timed-out run's output is never
// to be parsed: it may be cut anywhere. Start runs with launch(), never by
// setting command or running directly.
Process {
  id: proc

  // Seconds a run may take in all, whatever its parts do.
  property int deadline: 300
  property int killAfter: 5
  // The current run, and the last one settled.
  property int run: 0
  property int settledRun: 0
  // A run the watchdog gave up on: settled while it may still be running.
  property int abandonedRun: 0
  // The process group of the current run: timeout(1)'s pid, which leads it.
  property int group: 0
  // When the current run was launched, in ms since the epoch.
  property real launchedAt: 0

  signal settled(int exitCode, bool timedOut)
  // An abandoned run is finally gone. A queue that would not start the next run
  // while `running` was still true restarts from here.
  signal released()

  running: false
  command: []

  function launch(argv) {
    proc.run++
    proc.group = 0
    proc.launchedAt = Date.now()
    proc.command = ["/usr/bin/timeout", "--kill-after=" + proc.killAfter, String(proc.deadline)].concat(argv)
    proc.watchdog.restart()
    proc.running = true
  }

  function killGroup() {
    if (proc.group > 1) Quickshell.execDetached(["/usr/bin/kill", "-KILL", "--", "-" + proc.group])
  }

  function settle(r, exitCode, timedOut) {
    if (r !== proc.run || proc.settledRun === r) return
    proc.settledRun = r
    proc.watchdog.stop()
    proc.settled(exitCode, timedOut)
  }

  onStarted: proc.group = Number(proc.processId) || 0

  onExited: function(exitCode, exitStatus) {
    // A crashed process has no exit code worth reading (0 is QProcess.NormalExit).
    var code = exitStatus === 0 ? exitCode : -1
    if (code !== 0) proc.killGroup()
    // timeout(1) killed by its own SIGKILL to the group: a crash, not exit 137.
    var late = code === -1 && Date.now() - proc.launchedAt >= proc.deadline * 1000
    proc.settle(proc.run, late ? 137 : code, code === 124 || code === 137 || late)
  }

  onRunningChanged: {
    if (proc.running) return
    var r = proc.run
    // After a real exit, exited came first and settled this run already.
    Qt.callLater(function() {
      proc.settle(r, -1, false)
      if (proc.abandonedRun === r && !proc.running) proc.released()
    })
  }

  // Process takes no children, so the timer is held in a property.
  property Timer watchdog: Timer {
    interval: (proc.deadline + proc.killAfter + 5) * 1000
    onTriggered: {
      if (proc.running) proc.killGroup()
      proc.abandonedRun = proc.run
      proc.settle(proc.run, 137, true)
    }
  }
}
