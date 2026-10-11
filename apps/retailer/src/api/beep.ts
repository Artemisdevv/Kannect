// A short, quiet "got it" tone when a barcode is read. Generated with the Web Audio API, so there is
// no sound file to ship. Never throws: a phone that blocks audio just stays silent.
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

export function playScanBeep(): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.12, now); // quiet
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1); // fades out, no click
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    /* silent */
  }
}
