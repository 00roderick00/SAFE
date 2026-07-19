type SoundCue = 'ready' | 'tick' | 'crack' | 'fail' | 'breach' | 'settled';

let enabled = false;
let context: AudioContext | null = null;

const cueNotes: Record<SoundCue, [number, number, OscillatorType]> = {
  ready: [440, 0.06, 'sine'],
  tick: [220, 0.035, 'square'],
  crack: [740, 0.11, 'triangle'],
  fail: [105, 0.22, 'sawtooth'],
  breach: [920, 0.28, 'triangle'],
  settled: [560, 0.12, 'sine'],
};

function getContext() {
  if (context) return context;
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  context = new window.AudioContext();
  return context;
}

export const gameAudio = {
  isEnabled: () => enabled,
  setEnabled: (value: boolean) => {
    enabled = value;
    if (value) gameAudio.play('ready');
  },
  play: (cue: SoundCue) => {
    if (!enabled) return;
    const audio = getContext();
    if (!audio) return;
    const [frequency, duration, type] = cueNotes[cue];
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, audio.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration + 0.02);
  },
};

