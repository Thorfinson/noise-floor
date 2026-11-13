/** What the app measures, named as a person would say it, in the language shown. */
import { L } from '../core/i18n';
import { PATTERNS } from '../game/stride';
import { allPieces, allSongs, FINGER_PATTERNS, PIANO_PATTERNS, PIANO_SCALES } from './content';
import { chordName, CHORDS } from './theory';
import { voiceBook } from './voicebook';

/** "pair:Em>F#m" as a person would write it. */
export function skillLabel(key: string): string {
  const [kind, a0, b] = key.split(':');
  // the voice: tones sung back, a held tone, sung patterns, the sung scale, the beat sung, a song's phrases
  if (kind === 'pitch') return L('Tones sung back', 'Nachgesungene Töne');
  if (kind === 'tone') return L('A tone held steady', 'Ein ruhig gehaltener Ton');
  if (kind === 'sing') {
    const name = { step: L('a step', 'ein Schritt'), third: L('a third', 'eine Terz'), chord: 'do-mi-sol', up: L('five up', 'fünf aufwärts'), down: L('five down', 'fünf abwärts'), thirds: L('thirds', 'Terzen') }[a0] ?? a0;
    return L(`Sung: ${name}`, `Gesungen: ${name}`);
  }
  if (kind === 'scale' && a0 === 'v.major') return L('Sung major scale', 'Gesungene Dur-Tonleiter');
  if (kind === 'beat' && a0.startsWith('v.')) {
    const beat = PATTERNS.find((p) => p.id === a0.slice(2))?.name;
    return L(`In time, sung: ${beat?.toLowerCase() ?? a0}`, `Im Takt, gesungen: ${beat ?? a0}`);
  }
  if (kind === 'bar' && a0.endsWith('~voice')) {
    const title = voiceBook().find((s) => s.id === a0)?.title ?? a0;
    return L(`${title} (sung), phrase ${(b ?? '').slice(1)}`, `${title} (gesungen), Phrase ${(b ?? '').slice(1)}`);
  }
  // what is measured on the piano carries "p." before its name
  const keys = a0.startsWith('p.') && kind !== 'bar';
  const a = keys ? a0.slice(2) : a0;
  if (kind === 'chord') return keys ? L(`${chordName(a, true)} on the piano`, `${chordName(a, true)} am Klavier`) : (CHORDS[a]?.name ?? a);
  if (kind === 'pair') return a.split('>').map((c) => (keys ? chordName(c, true) : (CHORDS[c]?.name ?? c))).join(' → ') + (keys ? L(' on the piano', ' am Klavier') : '');
  if (kind === 'scale') return PIANO_SCALES.find((s) => s.id === a)?.name ?? L(`${a} scale`, `Tonleiter ${a}`);
  if (kind === 'beat') {
    const beat = PATTERNS.find((p) => p.id === a)?.name;
    return L(`In time${keys ? ' on the piano' : ''}: ${beat?.toLowerCase() ?? a}`, `Im Takt${keys ? ' am Klavier' : ''}: ${beat ?? a}`);
  }
  if (kind === 'finger') {
    const left = a.endsWith('-left');
    const id = left ? a.slice(0, -5) : a;
    const onPiano = PIANO_PATTERNS.find((p) => p.id === id);
    if (onPiano) return L(`Five fingers ${onPiano.name.toLowerCase()}${left ? ', left hand' : ''}`, `Fünf Finger: ${onPiano.name}${left ? ', linke Hand' : ''}`);
    const pattern = FINGER_PATTERNS.find((p) => p.id === id)?.name ?? a;
    return L(`${pattern} pattern`, `Muster ${pattern}`);
  }
  const title = allSongs().find((s) => s.id === a)?.title ?? allPieces().find((p) => p.id === a)?.title ?? a;
  const onKeys = a.endsWith('~keys') || a.endsWith('~keys-basic');
  return L(
    `${title}${onKeys ? ' (piano)' : ''}, ${CHORDS[b] ? CHORDS[b].name + ' bar' : b?.startsWith('p') ? 'phrase ' + b.slice(1) : 'bar ' + (b ?? '').slice(1)}`,
    `${title}${onKeys ? ' (Klavier)' : ''}, ${CHORDS[b] ? 'Takt mit ' + CHORDS[b].name : b?.startsWith('p') ? 'Phrase ' + b.slice(1) : 'Takt ' + (b ?? '').slice(1)}`,
  );
}
