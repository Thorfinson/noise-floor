import { afterEach, describe, expect, it, vi } from 'vitest';

// the screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});

import { Listener } from '../src/audio/listener';
import { addNoise, mixInto, strum, tone } from '../src/audio/synth';
import { DAY_MS } from '../src/core/days';
import { setLang } from '../src/core/i18n';
import { savedAtOf, useFile, type ProgressHandle } from '../src/core/progressfile';
import { checkItems, checkRecording } from '../src/core/checkrun';
import { store } from '../src/core/store';
import { melodyWords, said, sheet, singAlongSongs } from '../src/music/accompany';
import { allPieces, findPiece, findSong, togetherVersion, TOGETHER_GAPS } from '../src/music/content';
import { LYRICS, SING_ALONG, sungWords, syllables } from '../src/music/lyrics';
import { parseRhythm, RHYTHM_LEVELS, rhythmKey } from '../src/music/rhythms';
import { whatStays } from '../src/music/review';
import { chordNotes, CHORDS, keysId, nearestString, midiToFreq, OPEN_STRINGS, OVERTONE_STEPS, pianoChord } from '../src/music/theory';
import { guitarA4, guitarSetup, guitarShift, TUNINGS, tuningOf } from '../src/music/tuning';
import { voiceBook } from '../src/music/voicebook';
import { begun, currentId, fullPlan, plan, setPlanned, songChoices } from '../src/screens/session';
import { SLURS, slurKey } from '../src/screens/slur';
import { FAR, tabLine, typeScale, LEARN } from '../src/ui/draw';

afterEach(() => {
  setLang('en');
  store.settings.capo = 0;
  store.settings.tuning = 'standard';
  store.settings.uiScale = 1;
  store.settings.instrument = 'guitar';
  store.planOff = {};
  store.reviews = {};
  store.skills.data = {};
  store.current = {};
});

describe('a capo, and a guitar tuned down', () => {
  it('moves the A the guitar is heard with by the capo and the tuning, so that written pitches stay written', () => {
    expect(guitarShift()).toBe(0);
    store.settings.capo = 2;
    expect(guitarShift()).toBe(2);
    expect(guitarA4()).toBeCloseTo(440 * 2 ** (2 / 12), 6);
    store.settings.tuning = 'half';
    expect(guitarShift()).toBe(1);
    expect(guitarSetup()).toBe('capo 2 · a half step down');
    // a tuning that moves single strings is for the tuner only: the lessons stay as written
    store.settings.capo = 0;
    store.settings.tuning = 'dropd';
    expect(guitarShift()).toBe(0);
  });

  it('hears a C shape played with a capo at the second fret as C', () => {
    const sr = 48000;
    const shape = chordNotes(CHORDS.C).map((m) => m + 2);
    const sig = new Float32Array(3 * sr);
    addNoise(sig, 0.0015);
    mixInto(sig, strum(shape, sr, 1.5), 1.2 * sr);
    const heard = (a4: number): string | null => {
      const l = new Listener(sr);
      l.a4 = a4;
      l.noteDetection = false;
      l.chordCandidates = ['C', 'D', 'G', 'Am', 'Em'];
      let best: string | null = null;
      l.onChord = (e) => {
        if (!best && e.best && e.score > 0.6) best = e.best;
      };
      for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
      return best;
    };
    store.settings.capo = 2;
    expect(heard(guitarA4())).toBe('C');
    // without the capo set, the same sound is a D
    expect(heard(440)).toBe('D');
  });

  it('tunes the strings of Drop D and the open tunings in the tuner', () => {
    expect(TUNINGS().length).toBe(7);
    const dropD = tuningOf('dropd');
    // the low string tuned down to D2 is still the low string
    expect(nearestString(midiToFreq(38, 440), 440, dropD.strings)).toBe(0);
    expect(tuningOf('dadgad').strings).toEqual([-2, 0, 0, 0, -2, -2]);
  });
});

describe('words: more songs, under the notes, and over the chords', () => {
  it('gives every phrase of a song with words as many syllables as notes', () => {
    for (const v of voiceBook().filter((x) => LYRICS[x.id])) v.phrases.forEach((ph, k) => expect(syllables(v.id, k).length, `${v.id} phrase ${k + 1}`).toBe(ph.length));
    expect(voiceBook().filter((x) => LYRICS[x.id]).length).toBeGreaterThanOrEqual(34);
    // every song has something to sing under each note: its words, or its notes in solfège
    for (const v of voiceBook()) v.phrases.forEach((ph, k) => expect(sungWords(v.id, k, v.phrases).words.length, `${v.id} ${k + 1}`).toBe(ph.length));
    const elise = voiceBook().find((v) => v.id === 'fur-elise~voice')!;
    expect(sungWords(elise.id, 0, elise.phrases)).toEqual({ words: ['mi', 'ri', 'mi', 'ri', 'mi', 'ti', 're', 'do', 'la'], solfa: true });
    expect(syllables('habanera~voice', 1).join(' ')).toBe('que nul ne peut _ _ ap- _ pri- voi- ser');
  });

  it('puts the words of a melody under a guitar tune and a piano piece, one syllable a note', () => {
    const song = findSong('oh-susanna');
    const notes = song.bars.reduce((n, b) => n + b.notes.length, 0);
    expect(melodyWords('oh-susanna', notes)?.slice(0, 6)).toEqual(['I', 'come', 'from', 'A-', 'la-', 'ba-']);
    const twinkle = findPiece('twinkle');
    expect(melodyWords('twinkle', twinkle.phrases.flat().length)?.[0]).toBe('Twin-');
    // a count that does not fit gives none
    expect(melodyWords('twinkle', 3)).toBeNull();
  });

  it('lays the words of a song over its chords bar by bar, and the melody into their key', () => {
    expect(singAlongSongs().map((s) => s.id).sort()).toEqual(Object.keys(SING_ALONG).sort());
    const s = sheet(findSong('oh-susanna-chords'))!;
    expect(said(s.words[0])).toBe('I come from A-la-ba-');
    expect(said(s.words[8])).toBe('Oh! Su-');
    expect(said(s.words[15])).toBe('knee');
    // the melody ends on the root of the last chord (C), around middle C
    const last = s.melody[s.melody.length - 1];
    expect(last.midi % 12).toBe(0);
    expect(Math.abs(last.midi - 64)).toBeLessThan(12);
    // a song the chords go through twice has its words twice
    const skip = sheet(findSong('skip-to-my-lou'))!;
    expect(said(skip.words[8])).toBe(said(skip.words[0]));
  });
});

describe('reading rhythm', () => {
  it('writes every rhythm in two bars of 4/4', () => {
    for (const l of RHYTHM_LEVELS()) for (const r of l.rhythms) expect(parseRhythm(r).bars, r).toBe(2);
    expect(() => parseRhythm('q q q')).toThrow();
    const dotted = parseRhythm('q. e q q | h h').notes;
    expect(dotted[0]).toMatchObject({ at: 0, len: 6, dotted: true });
    expect(dotted[1].at).toBe(6);
    expect(rhythmKey(3)).toBe('beat:read-3');
    expect(rhythmKey(3, true)).toBe('beat:p.read-3');
  });
});

describe('both hands together on the piano', () => {
  it('strikes a bass under the melody only where the two can be told apart', () => {
    const versions = allPieces().filter((p) => p.id.endsWith('~together'));
    expect(versions.length).toBeGreaterThan(20);
    for (const p of versions)
      for (const n of p.phrases.flat())
        if (n.bass) {
          const gap = n.midi - n.bass;
          expect(gap, `${p.id}: ${n.bass} under ${n.midi}`).toBeGreaterThanOrEqual(TOGETHER_GAPS[0]);
          expect(gap).toBeLessThanOrEqual(TOGETHER_GAPS[1]);
          expect(OVERTONE_STEPS).not.toContain(gap);
          expect(n.bass).toBeGreaterThanOrEqual(43);
          expect(n.bass).toBeLessThanOrEqual(54);
        }
    // Mary had a little lamb: C under its first E
    expect(findPiece('mary-lamb~together').phrases[0][0].bass).toBe(48);
    // a piece of chords has no such version
    expect(togetherVersion(findPiece('mary-lamb~together'))).toBeNull();
  });

  it('names keys struck together as a chord of its own', () => {
    const id = keysId([64, 48]);
    expect(id).toBe('keys:48+64');
    expect(pianoChord(id).midis).toEqual([48, 64]);
    expect(pianoChord(id).name).toBe('C3 + E4');
  });
});

describe('the player plans', () => {
  it('leaves out the steps the player left out, every day, and never all of them', () => {
    const all = fullPlan().map((s) => s.kind);
    expect(all).toContain('changes');
    setPlanned('changes', false);
    expect(plan().map((s) => s.kind)).not.toContain('changes');
    for (const k of all) setPlanned(k, false);
    expect(plan().length).toBe(fullPlan().length);
    for (const k of all) setPlanned(k, true);
    expect(plan().map((s) => s.kind)).toEqual(all);
  });

  it('offers the next song to choose among: the one the app would take, and others of another kind', () => {
    const c = songChoices('guitar');
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c[0].id).toBe(currentId('guitar'));
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
    expect(c.every((x) => x.why.length > 0)).toBe(true);
    expect(begun(c[0].id)).toBe(false);
    expect(songChoices('piano').length).toBeGreaterThanOrEqual(2);
    expect(songChoices('voice').length).toBeGreaterThanOrEqual(2);
  });
});

describe('does coming back keep the songs', () => {
  it('says it is too early until five songs a side are a month in the repertoire, then compares them', () => {
    const now = Date.now();
    expect(whatStays('guitar', now).enough).toBe(false);
    const songs = ['tom-dooley', 'skip-to-my-lou', 'amazing-grace-chords', 'oh-susanna-chords', 'la-cucaracha-chords', 'drunken-sailor-chords', 'auld-lang-syne-chords', 'jingle-bells-chords', 'go-tell-it', 'twinkle-chords'];
    const real = songs.filter((id) => findSong(id).id === id);
    real.forEach((id, i) => {
      const since = now - 60 * DAY_MS;
      store.reviews[`guitar:${id}`] = { since, step: i % 2 === 0 ? 3 : 0, due: now + DAY_MS, at: 0 };
      for (const b of new Set(findSong(id).bars.map((x) => x.chord ?? ''))) {
        const key = `bar:${id}:${b}`;
        store.skills.data[key] = { level: 5, best: 100, last: now - DAY_MS, tops: 3, days: 3, cold: [Math.floor(now / DAY_MS) - 1, i % 2 === 0 ? 95 : 70], h: [] } as never;
      }
    });
    const r = whatStays('guitar', now, Math.floor(real.length / 2) - 1);
    expect(r.often.n + r.seldom.n).toBeGreaterThan(0);
    if (r.often.n && r.seldom.n) expect(r.often.kept).toBeGreaterThan(r.seldom.kept);
  });
});

describe('a progress file of your own', () => {
  it('writes what is saved into the file chosen, and knows when a file is newer', async () => {
    let written = '';
    const fake: ProgressHandle = {
      name: 'noise-floor-progress.json',
      getFile: async () => ({ text: async () => '' }),
      createWritable: async () => ({ write: async (d: string) => void (written = d), close: async () => undefined }),
    };
    expect(await useFile(fake, false)).toBe('written');
    expect(savedAtOf(written)).toBe(store.savedAt);
    expect(savedAtOf('not json')).toBe(0);
    expect(savedAtOf(JSON.stringify({ app: 'something else', savedAt: 5 }))).toBe(0);
  });
});

describe('reading from a metre, and slurs', () => {
  it('draws fret numbers, chord names and words of a play screen by the size of the type', () => {
    expect(typeScale()).toBe(1);
    const t = { bars: [{ chord: 'G', notes: [{ s: 3, f: 2 }, { s: 3, f: 0 }] }], look: () => 'up' as const, words: ['Twin-', 'kle'], slurs: [undefined, 'h' as const] };
    const at1 = tabLine(t, LEARN, true).svg;
    expect(at1).toContain(`font-size:${FAR.fret.toFixed(1)}px`);
    expect(at1).toContain('Twin-');
    expect(at1).toMatch(/<path d="M[^"]*Q[^"]*"[^>]*\/><text[^>]*>h<\/text>/);
    store.settings.uiScale = 1.3;
    expect(tabLine(t, LEARN, true).svg).toContain(`font-size:${(FAR.fret * 1.3).toFixed(1)}px`);
  });

  it('has hammer-on and pull-off patterns on one string, each with its skill', () => {
    for (const p of SLURS()) {
      expect(p.how.length).toBe(p.frets.length - 1);
      p.how.forEach((h, i) => expect(h === 'h' ? p.frets[i + 1] > p.frets[i] : p.frets[i + 1] < p.frets[i]).toBe(true));
    }
    expect(slurKey(2)).toBe('finger:slur-2');
  });
});

describe('the hearing check', () => {
  it('judges what is asked for in order, catches up with a recording, and says what to change', () => {
    const sr = 48000;
    const sig = new Float32Array(Math.round(34 * sr));
    addNoise(sig, 0.001);
    let t = 2.6;
    for (const m of OPEN_STRINGS) {
      mixInto(sig, tone({ sr, midi: m, dur: 2 }), t * sr);
      t += 2.6;
    }
    for (const c of ['Em', 'Am', 'C', 'G']) {
      mixInto(sig, strum(chordNotes(CHORDS[c]), sr, 2), t * sr);
      t += 2.6;
    }
    mixInto(sig, strum(OPEN_STRINGS, sr, 0.3, { art: 'muted', amp: 0.2 }, 4), t * sr);
    const r = checkRecording(sig, sr, 'guitar', 440);
    expect(r.summary.right, r.run.outcomes.map((o) => `${o.item.want}:${o.heard}`).join(' ')).toBeGreaterThanOrEqual(10);
    expect(r.summary.roomDb).toBeLessThan(-45);
    // a check that hears the strings but not the first: the rest is still judged in order
    const late = new Float32Array(sig);
    late.fill(0, Math.round(2.5 * sr), Math.round(5.1 * sr));
    addNoise(late.subarray(Math.round(2.5 * sr), Math.round(5.1 * sr)), 0.001);
    const r2 = checkRecording(late, sr, 'guitar', 440);
    expect(r2.run.outcomes[0].right).toBe(false);
    expect(r2.run.outcomes.slice(1, 6).every((o) => o.right)).toBe(true);
    expect(checkItems('piano').length).toBe(9);
    expect(checkItems('voice', 60).filter((i) => i.kind === 'sung').map((i) => i.want)).toEqual([56, 58, 60, 62, 64]);
  });
});
