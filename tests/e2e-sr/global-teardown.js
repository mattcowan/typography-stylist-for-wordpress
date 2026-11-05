/**
 * Release any key that a screen-reader run left held down.
 *
 * Guidepup sends a chord to NVDA as separate key-down and key-up messages, and
 * nvda.stop() releases nothing. After one run, Windows reported Left Alt and
 * Escape as held, and the keyboard misbehaved until they were released. A
 * Guidepup-only repro did not reproduce it, so the cause is not known.
 *
 * This reads the key state and sends a key-up for what is held: it presses
 * nothing. It writes tests/e2e-sr/logs/stuck-keys.json when it finds a stuck
 * key, because that is the evidence an upstream report would need.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = `
Add-Type -Namespace TypostSr -Name Keys -MemberDefinition '
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
'
# The keys a chord can hold: Shift, Control, Alt (generic, left, right), Windows,
# Escape, Tab, Enter, Space, the arrows, Home, End, Insert, and the letters and digits.
$keys = @(0x10,0xA0,0xA1,0x11,0xA2,0xA3,0x12,0xA4,0xA5,0x5B,0x5C,0x1B,0x09,0x0D,0x20,0x25,0x26,0x27,0x28,0x24,0x23,0x2D) + (0x30..0x39) + (0x41..0x5A)
$held = @()
foreach ($k in $keys) {
    if (([TypostSr.Keys]::GetAsyncKeyState($k) -band 0x8000) -ne 0) {
        $held += ('0x{0:X2}' -f $k)
        [TypostSr.Keys]::keybd_event([byte]$k, 0, 2, [UIntPtr]::Zero)
    }
}
$held -join ','
`;

module.exports = async () => {
  if (process.platform !== 'win32') {
    return;
  }
  let held = '';
  try {
    held = execFileSync('powershell', ['-NoProfile', '-Command', SCRIPT], { encoding: 'utf8', timeout: 20000 }).trim();
  } catch (error) {
    // The run is over: a failed check must not fail it, but it must not be silent
    process.stderr.write(`Could not check for stuck keys: ${error.message}\n`);
    return;
  }
  if (!held) {
    return;
  }
  const logDir = path.join(__dirname, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'stuck-keys.json'), JSON.stringify({ recordedAt: new Date().toISOString(), virtualKeys: held.split(',') }, null, 2));
  process.stderr.write(`A key was stuck after the run and has been released: ${held}. See tests/e2e-sr/logs/stuck-keys.json.\n`);
};
