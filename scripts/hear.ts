/**
 * What does the app make of a recording? Prints, moment by moment, what the listener hears in a WAV file:
 * the recordings saved from Settings ("When something is not heard right"), or any other 16-bit WAV.
 *
 *   npm run hear -- <file.wav> [expect=E2,A2] [chords=Em,Am,C] [string=A2] [a4=440] [ring=0.05] [buzz=0.5] [instrument=piano]
 *
 * expect   the notes a lesson would be waiting for (they get the benefit of the doubt, as in the app)
 * chords   the chords a song or run would be choosing between; without it, all the chords the app knows
 * string   run the chord check's test of one string on every pluck: clean, muted, buzzing or another note
 * a4       the tuning reference from the settings
 * instrument=piano   listen as the app does at the piano: chords are their keys from middle C, a key does not buzz,
 *          and string= tests one key the way the chord check does
 */
import { readFileSync } from 'node:fs';
import { Listener } from '../src/audio/listener';
import { decodeWav } from '../src/audio/wav';
import { KEY_CHORDS, KEY_CHORDS_ON } from '../src/music/content';
import { CHORDS, NOTE_NAMES, noteName, pianoChord } from '../src/music/theory';

const args = process.argv.slice(2).filter((a) => a !== '--');
const file = args.find((a) => !/^\w+=/.test(a));
const opt = (name: string): string | undefined => args.find((a) => a.startsWith(name + '='))?.slice(name.length + 1);
if (!file) {
  console.log('usage: npm run hear -- <file.wav> [expect=E2,A2] [chords=Em,Am,C] [string=A2] [a4=440] [ring=0.05] [buzz=0.5] [instrument=piano]');
  process.exit(1);
}

/** "A2", "F#3" or "F♯3", or a MIDI number */
function midiOf(name: string): number {
  if (/^\d+$/.test(name)) return Number(name);
  const m = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`not a note name: ${name}`);
  const pc = NOTE_NAMES.indexOf(m[1].toUpperCase()) + (m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0);
  return pc + 12 * (Number(m[3]) + 1);
}

const SR = 48000;
let wav: ReturnType<typeof decodeWav>;
try {
  wav = decodeWav(readFileSync(file));
} catch (err) {
  console.log(`${file}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
let samples = wav.samples;
if (wav.sampleRate !== SR) {
  // the app always listens at 48 kHz
  const n = Math.floor((samples.length * SR) / wav.sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * wav.sampleRate) / SR;
    const k = Math.floor(x);
    out[i] = samples[k] + (x - k) * ((samples[k + 1] ?? samples[k]) - samples[k]);
  }
  samples = out;
}

const l = new Listener(SR);
l.a4 = Number(opt('a4')) || 440;
const atPiano = opt('instrument') === 'piano';
if (atPiano) {
  // as the app sets its ears at the piano
  l.voicing = 'piano';
  l.buzzThreshold = Infinity;
  l.ringThreshold = 0.05;
}
if (opt('ring')) l.ringThreshold = Number(opt('ring'));
if (opt('buzz')) l.buzzThreshold = Number(opt('buzz'));
const expected = opt('expect')?.split(',').map(midiOf);
if (expected) l.expected = expected;
const chords = opt('chords')?.split(',') ?? (atPiano ? [...KEY_CHORDS, ...KEY_CHORDS_ON] : Object.keys(CHORDS));
// on the piano any chord the app can name will do; pianoChord says so when it cannot
for (const c of chords) if (atPiano ? !pianoChord(c) : !CHORDS[c]) throw new Error(`the app has no chord called ${c}`);
const string = opt('string') ? midiOf(opt('string')!) : null;
if (string !== null) {
  l.noteDetection = false;
  l.startStringCheck(string);
} else l.chordCandidates = chords;

// The listener needs a moment of quiet before the first note to know what quiet is, and a moment after the
// last one to finish judging it. A recording that starts or ends in the middle of the playing gets both.
const LEAD = 0.6;
const padded = new Float32Array(samples.length + Math.round((LEAD + 0.8) * SR));
padded.set(samples, Math.round(LEAD * SR));

const lines: { t: number; text: string }[] = [];
const say = (t: number, text: string): void => void lines.push({ t: Math.max(0, t - LEAD), text });
const two = (x: number): string => x.toFixed(2);
const levels: number[] = [];
let onsets = 0;
l.onLevel = (e) => {
  // of the recording itself, not of the quiet put around it
  if (e.time > LEAD && e.time < LEAD + samples.length / SR) levels.push(e.db);
};
l.onOnset = (e) => {
  onsets++;
  say(e.time, `struck                 strength ${two(e.strength)}`);
};
l.onNote = (e) => say(e.time, `note   ${noteName(e.midi).padEnd(4)}            sure ${two(e.conf)}, ahead of ${e.second === null ? 'nothing' : noteName(e.second)} by ×${two(e.margin)}, rings ${two(e.ring)}, held ${two(e.held)}`);
l.onDrop = (e) => say(e.time, `not counted as a note  ${e.reason === 'quiet' ? 'too quiet' : e.reason === 'choked' ? 'gone at once (dead or muted)' : 'not sure which'}${e.midi ? `, nearest ${noteName(e.midi)}, sure ${two(e.conf)}` : ''}`);
l.onChord = (e) => {
  const order = Object.entries(e.sims).sort((a, b) => b[1] - a[1]);
  const sure = e.best && e.score > 0.6 && e.margin > 0.08;
  say(e.time, `chord  ${(e.best ?? '?').padEnd(4)} ${sure ? 'counts    ' : 'not sure  '} ${order.slice(0, 3).map(([id, v]) => `${id} ${two(v)}`).join(', ')}`);
};
l.onThud = (e) => say(e.time, e.hit ? 'hit that left nothing: muted strings or a dead note' : 'sound stopped: a hand laid on the strings');
l.onString = (e) => {
  say(e.time, `string ${noteName(e.expected).padEnd(4)} ${e.result.padEnd(6)}     rings ${two(e.ring)} (needs ${two(l.ringThreshold)}), buzz ${two(e.buzz)} (limit ${two(l.buzzThreshold)})${e.heard !== null && e.heard !== e.expected ? `, heard ${noteName(e.heard)}` : ''}`);
  l.startStringCheck(string!);
};

let clipped = 0;
for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) >= 0.999) clipped++;
for (let i = 0; i < padded.length; i += 512) l.push(padded.subarray(i, i + 512));

levels.sort((a, b) => a - b);
const at = (q: number): number => levels[Math.min(levels.length - 1, Math.floor(q * levels.length))] ?? -120;
console.log(`${file}`);
console.log(`${two(samples.length / SR)} s${wav.sampleRate !== SR ? `, brought from ${wav.sampleRate} Hz to 48000 Hz` : ''}`);
console.log(`level: quiet moments ${at(0.1).toFixed(0)} dB, loudest ${at(1).toFixed(0)} dB${clipped > 20 ? `; ${clipped} samples at the limit: the microphone is set too loud and distorts` : ''}`);
if (at(1) < -40) console.log('That is very quiet: nothing in it is loud enough to be taken for playing.');
else if (at(1) - at(0.1) < 20) console.log('There is no quiet moment in it. If that is not all playing, the room is loud or the microphone is far from the instrument.');
console.log(string !== null ? `testing the string ${noteName(string)} on every pluck` : `${expected ? `waiting for ${expected.map(noteName).join(' ')}; ` : ''}chords to choose from: ${chords.join(' ')}`);
console.log('');
// a strum and its chord, a pluck and its note belong together: by time, the plain "struck" lines last
lines.sort((a, b) => a.t - b.t);
for (const x of lines) console.log(`${x.t.toFixed(2).padStart(7)}  ${x.text}`);
console.log(`\n${onsets} times something was struck.`);
