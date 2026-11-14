/**
 * Singing: what the listener reports of a voice, and how a held note, the steadiness of a tone and the
 * range of a voice are worked out from it. The voice is the synthesized "ah" of the practice instrument:
 * it slides into each note, wavers with vibrato and breathes.
 */
import { describe, expect, it } from 'vitest';
import { Listener } from '../src/audio/listener';
import { addNoise, mixInto, voiceTone } from '../src/audio/synth';
import { centsOff, fitTo, heldRange, Hold, steadiness, voiceType, type Frame } from '../src/core/singing';
import { SR } from './helpers';
import { Run, sungPool, voiceKeys, voicePool, voiceScaleBoss, VOICE_PATTERNS } from '../src/game/run';
import { songsToSing, sungPhraseKey, voiceBook, voiceProfile } from '../src/music/voicebook';
import { learningPath } from '../src/music/path';
import { skillLabel } from '../src/music/labels';
import { L, setLang } from '../src/core/i18n';

/** The pitch readings the listener makes of a signal, as the singing screens get them. */
function frames(sig: Float32Array, a4 = 440): Frame[] {
  const l = new Listener(SR);
  l.a4 = a4;
  l.noteDetection = false;
  l.pitchTracking = true;
  const out: Frame[] = [];
  l.onPitch = (e) => out.push({ t: e.time, midi: e.midi + e.cents / 100 });
  for (let i = 0; i < sig.length; i += 128) l.push(sig.subarray(i, Math.min(sig.length, i + 128)));
  return out;
}

/** Sung notes one after the other, after half a second of room. */
function sung(notes: { midi: number; dur: number; cents?: number; vibrato?: number }[], gap = 0.15): Float32Array {
  const total = 0.5 + notes.reduce((s, n) => s + n.dur + gap, 0) + 0.5;
  const out = new Float32Array(Math.floor(total * SR));
  let t = 0.5;
  notes.forEach((n, i) => {
    mixInto(out, voiceTone({ sr: SR, seed: i + 1, ...n }), t * SR);
    t += n.dur + gap;
  });
  addNoise(out, 0.0015);
  return out;
}

describe('a sung note', () => {
  it('is measured in cents, and an octave lower is the same note', () => {
    expect(centsOff(60.2, 60)).toBeCloseTo(20);
    expect(centsOff(48.1, 60)).toBeCloseTo(10);
    expect(centsOff(48.1, 60, false)).toBeCloseTo(-1190);
    expect(centsOff(59.5, 60)).toBeCloseTo(-50);
  });

  it('is followed by the listener through its slide, its vibrato and the breath, from a bass to a soprano', () => {
    for (const midi of [43, 50, 57, 64, 72, 79]) {
      const f = frames(sung([{ midi, dur: 1.2 }]));
      // most readings of the held part lie on the note
      const held = f.filter((x) => x.t > 0.8 && x.t < 1.6);
      expect(held.length, `MIDI ${midi}`).toBeGreaterThan(20);
      const near = held.filter((x) => Math.abs(centsOff(x.midi, midi)) < 50).length;
      expect(near / held.length, `MIDI ${midi}`).toBeGreaterThan(0.9);
    }
  });

  it('counts once it has been held near the note for a moment, not while the voice slides into it', () => {
    const f = frames(sung([{ midi: 57, dur: 1.0 }]));
    const hold = new Hold(57, 50, 0.3);
    let at = -1;
    for (const x of f) if (hold.push(x) && at < 0) at = x.t;
    // sung from 0.5 s: not before it has been held for the 0.3 s asked for
    expect(at).toBeGreaterThan(0.8);
    expect(at).toBeLessThan(1.15);
    expect(Math.abs(hold.done!.cents)).toBeLessThan(15);
  });

  it('does not count when it is sung a semitone off, nor a quarter tone off with a strict ear', () => {
    const wrong = frames(sung([{ midi: 58, dur: 1.0 }]));
    const h1 = new Hold(57, 50, 0.3);
    for (const x of wrong) h1.push(x);
    expect(h1.done).toBeNull();
    const flat = frames(sung([{ midi: 57, dur: 1.0, cents: -45, vibrato: 10 }]));
    const lenient = new Hold(57, 60, 0.3);
    const strict = new Hold(57, 25, 0.3);
    for (const x of flat) {
      lenient.push(x);
      strict.push(x);
    }
    expect(lenient.done).not.toBeNull();
    expect(strict.done).toBeNull();
  });

  it('is called steady when it holds the note, and its middle tells how far off it was', () => {
    const plain = frames(sung([{ midi: 55, dur: 2.0, vibrato: 0, cents: 20 }])).filter((x) => x.t > 0.9);
    const wobbly = frames(sung([{ midi: 55, dur: 2.0, vibrato: 60 }])).filter((x) => x.t > 0.9);
    const a = steadiness(plain, 55);
    const b = steadiness(wobbly, 55);
    expect(a.spread).toBeLessThan(8);
    expect(a.cents).toBeGreaterThan(12);
    expect(a.cents).toBeLessThan(28);
    expect(b.spread).toBeGreaterThan(25);
  });
});

describe('the range of a voice', () => {
  it('is the lowest and the highest note that was held, not a short slip', () => {
    const f = frames(sung([
      { midi: 48, dur: 0.9 },
      { midi: 45, dur: 0.9 },
      { midi: 43, dur: 0.2 },
      { midi: 64, dur: 0.9 },
      { midi: 67, dur: 0.9 },
    ]));
    expect(heldRange(f)).toEqual({ low: 45, high: 67 });
  });

  it('points to a voice type, and a melody is moved into it, by octaves where it can', () => {
    expect(voiceType(41, 60)).toBe('bass');
    expect(voiceType(45, 64)).toBe('baritone');
    expect(voiceType(48, 67)).toBe('tenor');
    expect(voiceType(57, 77)).toBe('soprano');
    // Ode to Joy (C4 to G4) for a bass (F2 to C4): an octave down
    expect(fitTo([60, 62, 64, 65, 67], 41, 60)).toBe(-12);
    // for an alto (F3 to C5): as it is
    expect(fitTo([60, 62, 64, 65, 67], 53, 72)).toBe(0);
    // a melody of an octave and a half in a voice of an octave and a half: it fills it
    const k = fitTo([55, 74], 48, 67);
    expect(55 + k).toBe(48);
  });
});

describe('the songs to sing', () => {
  it('are the tunes a voice can sing, easiest first, each with its level and its reasons', () => {
    const book = voiceBook();
    expect(book.length).toBeGreaterThanOrEqual(40);
    const order = songsToSing();
    const levels = order.map((s) => voiceProfile(s).level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    for (const lv of [1, 2, 3, 4]) expect(levels.filter((l) => l === lv).length, `level ${lv}`).toBeGreaterThanOrEqual(5);
    for (const s of order) {
      const midis = s.phrases.flat().map((n) => n.midi);
      expect(Math.max(...midis) - Math.min(...midis), s.title).toBeLessThanOrEqual(17);
      expect(voiceProfile(s).reasons.length, s.title).toBeGreaterThanOrEqual(3);
    }
    // the same phrase twice is one skill
    const ode = book.find((s) => s.id === 'ode-to-joy~voice')!;
    expect(new Set(ode.phrases.map((_, k) => sungPhraseKey(ode, k))).size).toBeLessThan(ode.phrases.length);
  });
});

describe('the voice gym', () => {
  for (const [name, low, high] of [['a baritone', 45, 64], ['a soprano', 58, 77], ['a narrow voice', 52, 62]] as const) {
    it(`lies inside the range of ${name}, with its third on the middle`, () => {
      const pool = voicePool(low, high);
      const keys = voiceKeys(low, high);
      expect(pool).toHaveLength(VOICE_PATTERNS.length * keys.length);
      for (const p of pool) {
        expect(p.voice).toBe(true);
        expect(p.key).toMatch(/^sing:/);
        for (const n of p.keys) {
          expect(n.midi, p.label).toBeGreaterThanOrEqual(low + 1);
          expect(n.midi, p.label).toBeLessThanOrEqual(high - 1);
        }
      }
      const boss = voiceScaleBoss(low, high);
      expect(boss.steps).toHaveLength(8);
      expect(boss.steps[7].midi - boss.steps[0].midi).toBe(12);
      expect(boss.steps.map((s) => s.label)).toEqual(['do', 're', 'mi', 'fa', 'sol', 'la', 'ti', 'do']);
    });
  }

  it('counts a sung pattern in notes a minute', () => {
    const pool = voicePool(45, 64).filter((p) => p.key === 'sing:chord').slice(0, 1);
    const run = new Run('sing', pool, () => 1, { speed: 60, waves: 1, rng: () => 0.5 });
    run.update(0);
    let t = 1;
    // do, mi, sol, mi, do: four steps in four seconds
    for (const n of pool[0].keys) expect(run.note(n.midi, (t += 1))).toBe(true);
    const cleared = run.events.find((e) => e.type === 'clear');
    expect(cleared && cleared.type === 'clear' && Math.round(cleared.value!)).toBe(60);
  });

  it('turns a song into phrases moved into the voice, the same phrase once', () => {
    const ode = voiceBook().find((s) => s.id === 'ode-to-joy~voice')!;
    const pool = sungPool(ode, -12, (k) => sungPhraseKey(ode, k));
    expect(new Set(pool.map((p) => p.key)).size).toBe(new Set(ode.phrases.map((_, k) => sungPhraseKey(ode, k))).size);
    expect(pool[0].keys[0].midi).toBe(ode.phrases[0][0].midi - 12);
    expect(pool[0].noteDur).toBe(ode.noteDur);
  });
});

describe('the path of the voice', () => {
  it('goes from finding the voice over sung patterns to songs, level by level', () => {
    const stages = learningPath('voice');
    expect(stages.filter((s) => s.state !== 'side').map((s) => s.id)).toEqual(['vfirst', 'vpatterns', 'vsongs1', 'vsongs2', 'vsongs3', 'vsongs4']);
    expect(stages.filter((s) => s.state === 'side').map((s) => s.id)).toEqual(['ear', 'vfine', 'vscale']);
    expect(stages.find((s) => s.state === 'here')!.id).toBe('vfirst');
    for (const lv of [1, 2, 3, 4]) expect(stages.find((s) => s.id === `vsongs${lv}`)!.items, `level ${lv}`).toHaveLength(5);
    for (const s of stages) for (const i of s.items) expect(i.href, `${s.id} ${i.label}`).toMatch(/^#\/(range|match|hold|run|sing|ear)/);
  });
});

describe('both languages', () => {
  it('name the skills of the voice in English and in German', () => {
    const keys = ['pitch:match', 'tone:steady', 'sing:chord', 'scale:v.major', 'beat:v.four', 'bar:ode-to-joy~voice:p2'];
    setLang('en');
    const en = keys.map(skillLabel);
    expect(en).toEqual(['Tones sung back', 'A tone held steady', 'Sung: do-mi-sol', 'Sung major scale', 'In time, sung: every beat', 'Ode to Joy (sung), phrase 2']);
    setLang('de');
    const de = keys.map(skillLabel);
    expect(de).toEqual(['Nachgesungene Töne', 'Ein ruhig gehaltener Ton', 'Gesungen: do-mi-sol', 'Gesungene Dur-Tonleiter', 'Im Takt, gesungen: Jeder Schlag', 'Ode to Joy (gesungen), Phrase 2']);
    // the stages of the path are named in the language shown
    expect(learningPath('voice')[0].title).toBe('Deine Stimme, gefunden und treffsicher');
    expect(L('Voice', 'Stimme')).toBe('Stimme');
    setLang('en');
    expect(learningPath('voice')[0].title).toBe('Your voice, found and in tune');
  });
});
