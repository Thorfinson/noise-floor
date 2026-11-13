import { describe, expect, it } from 'vitest';
import { yin } from '../src/audio/yin';
import { decodeWav, encodeWav } from '../src/audio/wav';
import { chime, addNoise, click, mixInto, strum, tone } from '../src/audio/synth';
import { CHORDS, chordMidis, chordNotes, midiToFreq, OPEN_STRINGS } from '../src/music/theory';
import { Listener } from '../src/audio/listener';
import { listen, onStrings, sequence, SR } from './helpers';

describe('yin', () => {
  it('finds the pitch of single notes across the guitar range within 5 cents', () => {
    for (const midi of [40, 45, 52, 57, 64, 69, 76, 81]) {
      const sig = tone({ sr: SR, midi, dur: 0.4 });
      const p = yin(sig.subarray(4000, 4000 + 4096), SR);
      expect(p, `midi ${midi}`).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(p!.freq / midiToFreq(midi))), `midi ${midi}`).toBeLessThan(5);
    }
  });

  it('reports nothing for noise', () => {
    const sig = new Float32Array(8192);
    addNoise(sig, 0.1);
    expect(yin(sig.subarray(0, 4096), SR)).toBeNull();
  });
});

describe('note detection', () => {
  it('hears one onset per pluck and none while notes ring out', () => {
    const sig = sequence([45, 55, 60, 64, 60, 55].map((midi) => ({ midi })));
    const h = listen(sig);
    expect(h.onsets.length).toBe(6);
  });

  it('identifies every note of the guitar range while another string is still ringing', () => {
    const wrong: string[] = [];
    for (let midi = 40; midi <= 79; midi++) {
      const other = midi < 60 ? midi + 7 : midi - 8;
      const h = listen(sequence([{ midi: other }, { midi }], 0.5));
      const got = h.notes.map((n) => n.midi);
      if (got.length !== 2 || got[1] !== midi) wrong.push(`${midi} heard as ${got.join(',')}`);
    }
    expect(wrong).toEqual([]);
  });

  it('follows an arpeggio over a held chord, one bar after the other', () => {
    const am = [45, 57, 60, 64, 60, 57];
    const c = [48, 55, 60, 64, 60, 55];
    const h = listen(sequence([...am, ...c].map((midi) => ({ midi })), 0.3));
    expect(h.notes.map((n) => n.midi)).toEqual([...am, ...c]);
  });

  it('still hears low notes when the microphone loses the fundamental', () => {
    const notes = [40, 41, 43, 45, 47];
    const h = listen(sequence(notes.map((midi) => ({ midi, highpass: 220 })), 0.45));
    expect(h.notes.map((n) => n.midi)).toEqual(notes);
  });

  it('settles an octave doubt under five ringing bass notes in favour of the note it is waiting for', () => {
    const notes = [40, 41, 43, 45, 47, 48];
    const sig = sequence(notes.map((midi) => ({ midi, highpass: 220 })), 0.45);
    const free = listen(sig);
    expect(free.notes.map((n) => n.midi % 12)).toEqual(notes.map((m) => m % 12));
    const guided = listen(sig, undefined, (l, t) => (l.expected = [notes[Math.max(0, Math.min(5, Math.floor((t - 0.3) / 0.45)))]]));
    expect(guided.notes.map((n) => n.midi)).toEqual(notes);
  });

  it('does not let the expected note win when a clearly different note is played', () => {
    const h = listen(sequence([{ midi: 45 }, { midi: 52 }, { midi: 59 }], 0.45), (l) => (l.expected = [57]));
    expect(h.notes.map((n) => n.midi)).toEqual([45, 52, 59]);
  });

  it('copes with quiet playing, a noisy room and a guitar that is 20 cents flat', () => {
    const notes = [45, 52, 57, 60, 64, 67];
    const h = listen(sequence(notes.map((midi) => ({ midi, amp: 0.03, cents: -20 })), 0.45, 0.003));
    expect(h.notes.map((n) => n.midi)).toEqual(notes);
  });

  it('identifies piano notes, including the same key struck twice', () => {
    const notes = [76, 75, 76, 75, 76, 71, 74, 72, 69, 69, 60, 64];
    const h = listen(sequence(notes.map((midi) => ({ midi, piano: true })), 0.35));
    expect(h.notes.map((n) => n.midi)).toEqual(notes);
  });

  it('follows a finger pattern up and down one string, where each note ends the one before', () => {
    for (const open of [40, 45, 50, 55, 59, 64]) {
      const midis = [5, 6, 7, 8, 8, 7, 6, 5, 5, 7, 6, 8].map((f) => open + f);
      const h = listen(onStrings(midis.map((midi) => ({ midi, string: 0 })), 0.3));
      expect(h.notes.map((n) => n.midi), `string with open note ${open}`).toEqual(midis);
    }
  });

  it('follows the song pattern when a string that is still ringing is plucked again', () => {
    const bar = (bass: number, g: number, b: number, e: number) => [
      { midi: bass, string: 1 },
      { midi: g, string: 3 },
      { midi: b, string: 4 },
      { midi: e, string: 5 },
      { midi: b, string: 4 },
      { midi: g, string: 3 },
    ];
    const notes = [...bar(45, 57, 60, 64), ...bar(48, 55, 60, 64), ...bar(45, 57, 60, 64)];
    for (const gap of [0.26, 0.38, 0.6]) {
      const h = listen(onStrings(notes, gap));
      expect(h.notes.map((n) => n.midi), `gap ${gap}`).toEqual(notes.map((n) => n.midi));
    }
  });

  it('keeps hearing after a minute of playing without a pause', () => {
    const cycle = [45, 57, 60, 64, 60, 57, 48, 55, 60, 64, 60, 55];
    const strings = [1, 3, 4, 5, 4, 3];
    const notes = Array.from({ length: 200 }, (_, i) => ({ midi: cycle[i % 12], string: strings[i % 6] }));
    // as in the app, the listener is told which note is being waited for
    const h = listen(onStrings(notes, 0.3), undefined, (l, t) => (l.expected = [notes[Math.max(0, Math.min(199, Math.floor((t - 0.35) / 0.3)))].midi]));
    expect(h.notes.length).toBe(200);
    expect(h.notes.filter((n, i) => n.midi !== notes[i].midi).length).toBeLessThanOrEqual(2);
    const free = listen(onStrings(notes, 0.3));
    expect(free.notes.length).toBe(200);
    expect(free.notes.filter((n, i) => n.midi !== notes[i].midi).length).toBeLessThanOrEqual(5);
  });

  it('stays silent for room noise and for a muted thump', () => {
    const sig = new Float32Array(SR * 2);
    addNoise(sig, 0.003);
    mixInto(sig, tone({ sr: SR, midi: 55, dur: 0.3, art: 'muted' }), SR);
    const h = listen(sig);
    expect(h.notes).toEqual([]);
  });
});

describe('chord matching', () => {
  const ids = ['Em', 'F#m', 'Am', 'C', 'D', 'G'];

  it('names each strummed chord, also right after a different chord', () => {
    const wrong: string[] = [];
    for (const first of ids) {
      for (const second of ids) {
        if (first === second) continue;
        // the fretting hand lets go of the first chord just before the second is strummed
        const sig = new Float32Array(SR * 3);
        mixInto(sig, strum(chordNotes(CHORDS[first]), SR, 0.88), 0.5 * SR);
        mixInto(sig, strum(chordNotes(CHORDS[second]), SR, 1.5), 1.4 * SR);
        addNoise(sig, 0.0015);
        const h = listen(sig, (l) => {
          l.noteDetection = false;
          l.chordCandidates = ids;
        });
        const got = h.chords.map((c) => c.best);
        if (got.length !== 2 || got[0] !== first || got[1] !== second) wrong.push(`${first} then ${second}: heard ${got.join(',')}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('string check', () => {
  const fsm = chordMidis(CHORDS['F#m']) as number[];

  function check(arts: ('clean' | 'muted' | 'buzz')[], midis = fsm) {
    const sig = new Float32Array(SR * 6);
    midis.forEach((midi, i) => mixInto(sig, tone({ sr: SR, midi, dur: 4, art: arts[i], seed: i + 3 }), (0.5 + i * 0.8) * SR));
    addNoise(sig, 0.0015);
    let next = 0;
    const h = listen(
      sig,
      (l) => (l.noteDetection = false),
      (l, t) => {
        if (next < fsm.length && t >= 0.3 + next * 0.8) l.startStringCheck(fsm[next++]);
      },
    );
    return h.strings.map((s) => s.result);
  }

  it('passes six clean strings of a barre chord while the others ring', () => {
    expect(check(['clean', 'clean', 'clean', 'clean', 'clean', 'clean'])).toEqual(['clean', 'clean', 'clean', 'clean', 'clean', 'clean']);
  });

  it('spots the muted G and the buzzing high e', () => {
    expect(check(['clean', 'clean', 'clean', 'muted', 'clean', 'buzz'])).toEqual(['clean', 'clean', 'clean', 'muted', 'clean', 'buzz']);
  });

  it('spots a buzzing low string and a muted high one', () => {
    expect(check(['buzz', 'clean', 'muted', 'clean', 'buzz', 'muted'])).toEqual(['buzz', 'clean', 'muted', 'clean', 'buzz', 'muted']);
  });

  it('keeps up when the next string is plucked before the last one has been judged', () => {
    const sig = new Float32Array(SR * 5);
    fsm.forEach((midi, i) => mixInto(sig, tone({ sr: SR, midi, dur: 3, seed: i + 3 }), (0.5 + i * 0.4) * SR));
    addNoise(sig, 0.0015);
    const l = new Listener(SR);
    l.noteDetection = false;
    const got: string[] = [];
    let next = 0;
    l.onString = (e) => {
      got.push(e.result);
      if (++next < fsm.length) l.startStringCheck(fsm[next]);
    };
    l.startStringCheck(fsm[0]);
    for (let i = 0; i < sig.length; i += 128) l.push(sig.subarray(i, i + 128));
    expect(got).toEqual(['clean', 'clean', 'clean', 'clean', 'clean', 'clean']);
  });

  it('judges a string that is plucked again while it still sounds, and never gets it wrong', () => {
    // E, A and D ring; G buzzes; then G is plucked again after a pause, the old note ending where the new one begins
    const again = (second: 'clean' | 'muted' | 'buzz', gap: number, seed: number, noise: number): string => {
      const sig = new Float32Array(SR * 7);
      [0, 1, 2].forEach((i) => mixInto(sig, tone({ sr: SR, midi: fsm[i], dur: 2.2, seed: seed + i }), (0.5 + i) * SR));
      mixInto(sig, tone({ sr: SR, midi: fsm[3], dur: 2.2, art: 'buzz', seed: seed + 7 }).subarray(0, Math.floor(gap * SR)), 3.5 * SR);
      mixInto(sig, tone({ sr: SR, midi: fsm[3], dur: 2.2, art: second, seed: seed + 11 }), (3.5 + gap) * SR);
      if (noise) addNoise(sig, noise, seed);
      const l = new Listener(SR);
      l.noteDetection = false;
      const got: string[] = [];
      let next = 0;
      l.onString = (e) => {
        got.push(e.result);
        if (e.result === 'clean') next = Math.min(3, next + 1);
        l.startStringCheck(fsm[next]);
      };
      l.startStringCheck(fsm[0]);
      for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
      return got.slice(3).join(',');
    };
    // with room noise and in complete silence, as the practice instrument has it
    for (const noise of [0.0015, 0]) {
      for (const second of ['clean', 'muted', 'buzz'] as const) {
        for (const gap of [0.6, 1, 1.7]) {
          const results = Array.from({ length: 8 }, (_, i) => again(second, gap, i + 1, noise));
          const right = results.filter((r) => r === 'buzz,' + second).length;
          const unheard = results.filter((r) => r === 'buzz').length;
          const label = `${second} after ${gap} s, noise ${noise}: ${results.join(' | ')}`;
          // a pluck may go unnoticed now and then (the check just keeps waiting), but a verdict must be right
          expect(right + unheard, label).toBe(8);
          expect(right, label).toBeGreaterThanOrEqual(second === 'muted' && gap < 1 ? 5 : 7);
        }
      }
    }
  });

  it('says so when a different string was plucked', () => {
    const played = [...fsm];
    played[3] = OPEN_STRINGS[4] + 2; // the B string instead of G
    const got = check(['clean', 'clean', 'clean', 'clean', 'clean', 'clean'], played);
    expect(got[3]).toBe('wrong');
  });
});

describe('metronome', () => {
  it('does not hear its own click, and still hears quiet notes played right on loud clicks', () => {
    const ticks = new Float32Array(SR * 4);
    addNoise(ticks, 0.0015);
    for (let i = 0; i < 12; i++) mixInto(ticks, click(SR, i % 4 === 0, 0.5), (0.5 + i * 0.26) * SR);
    const alone = listen(ticks);
    expect(alone.onsets).toEqual([]);
    expect(alone.notes).toEqual([]);

    const notes = [45, 52, 57, 60, 64, 67];
    const sig = sequence(notes.map((midi) => ({ midi, amp: 0.03 })), 0.45);
    for (let i = 0; i < 6; i++) mixInto(sig, click(SR, i % 3 === 0, 1), (0.5 + i * 0.45) * SR);
    expect(listen(sig).notes.map((n) => n.midi)).toEqual(notes);

    // a full-volume arpeggio with a click on every note, as when playing along
    const bar = [45, 57, 60, 64, 60, 57, 48, 55, 60, 64, 60, 55];
    const loud = sequence(bar.map((midi) => ({ midi })), 0.3);
    for (let i = 0; i < 12; i++) mixInto(loud, click(SR, i % 3 === 0, 0.5), (0.5 + i * 0.3) * SR);
    expect(listen(loud).notes.map((n) => n.midi)).toEqual(bar);
  });
});

describe('muted hits and ringing notes', () => {
  it('reports hits on muted strings as thuds, and a strummed chord as a chord', () => {
    const sig = new Float32Array(SR * 4);
    addNoise(sig, 0.0015);
    for (const at of [1, 1.4]) mixInto(sig, strum(OPEN_STRINGS, SR, 0.3, { art: 'muted', amp: 0.2 }, 4), at * SR);
    mixInto(sig, strum(chordNotes(CHORDS.Em), SR, 1.5), 2.2 * SR);
    const thuds: number[] = [];
    const h = listen(sig, (l) => {
      l.noteDetection = false;
      l.chordCandidates = ['Em', 'Am', 'C'];
      l.onThud = (e) => thuds.push(e.time);
    });
    expect(thuds.length).toBe(2);
    expect(thuds[0]).toBeCloseTo(1, 1);
    expect(thuds[1]).toBeCloseTo(1.4, 1);
    expect(h.chords.filter((c) => c.best === 'Em' && c.time > 2).length).toBe(1);
  });

  it('does not call notes that ring on thuds', () => {
    const thuds: number[] = [];
    const h = listen(sequence([45, 57, 60, 64, 60, 57].map((midi) => ({ midi })), 0.3), (l) => (l.onThud = (e) => thuds.push(e.time)));
    expect(h.notes.length).toBe(6);
    expect(thuds).toEqual([]);
  });

  it('tells whether the note before was still sounding when the next one began', () => {
    const notes = [45, 57, 60, 64].map((midi) => ({ midi }));
    const ringing = listen(sequence(notes, 0.4));
    expect(ringing.notes[0].held).toBe(-1);
    expect(ringing.notes.slice(1).map((n) => n.held > 0.5)).toEqual([true, true, true]);
    const short = listen(sequence(notes, 0.4, 0.0015, 0.15));
    expect(short.notes.length).toBe(4);
    expect(short.notes.slice(1).map((n) => n.held < 0.05)).toEqual([true, true, true]);
    const legato = listen(sequence([60, 62, 64, 65].map((midi) => ({ midi, piano: true })), 0.35));
    expect(legato.notes.slice(1).map((n) => n.held > 0.4)).toEqual([true, true, true]);
  });
});

describe('measuring one partial', () => {
  it("finds a piano's A to within two cents while a neighbouring key is still sounding", () => {
    for (const a4 of [440, 432.5, 446]) {
      const sig = new Float32Array(SR * 2.5);
      addNoise(sig, 0.0015);
      mixInto(sig, tone({ sr: SR, midi: 70, dur: 1.4, piano: true, a4, amp: 0.2 }), 0.3 * SR);
      mixInto(sig, tone({ sr: SR, midi: 69, dur: 1.4, piano: true, a4 }), 1.0 * SR);
      const got: number[] = [];
      listen(sig, (l) => {
        l.noteDetection = false;
        l.partialBand = [330, 587];
        l.onPartial = (e) => {
          if (e.time > 1.4 && e.time < 2.2) got.push(e.freq);
        };
      });
      expect(got.length, `A = ${a4}`).toBeGreaterThan(10);
      for (const f of got) expect(Math.abs(1200 * Math.log2(f / a4)), `A = ${a4}, measured ${f.toFixed(2)}`).toBeLessThan(2);
    }
  });
});

describe('saving what was heard as a sound file', () => {
  it('writes a WAV file that reads back the same, to 16 bits, and does not wrap around what is too loud', () => {
    const samples = new Float32Array(4800);
    for (let i = 0; i < samples.length; i++) samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR);
    samples[10] = 1.7;
    samples[11] = -1.7;
    const back = decodeWav(new Uint8Array(encodeWav(samples, SR)));
    expect(back.sampleRate).toBe(SR);
    expect(back.samples.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i++) expect(Math.abs(back.samples[i] - Math.max(-1, Math.min(1, samples[i])))).toBeLessThan(1 / 16384);
  });

  it('reads the first channel of a file with two, past the parts that are not sound', () => {
    const frames = 100;
    const b = Buffer.alloc(12 + 24 + 8 + 5 + 1 + 8 + frames * 4);
    let at = 0;
    const put = (text: string): void => void (at += b.write(text, at, 'latin1'));
    const u32 = (n: number): void => void (at = b.writeUInt32LE(n, at));
    const u16 = (n: number): void => void (at = b.writeUInt16LE(n, at));
    put('RIFF');
    u32(b.length - 8);
    put('WAVE');
    put('fmt ');
    u32(16);
    u16(1);
    u16(2);
    u32(44100);
    u32(44100 * 4);
    u16(4);
    u16(16);
    // a chunk of odd length, padded to an even one
    put('LIST');
    u32(5);
    put('hello');
    at++;
    put('data');
    u32(frames * 4);
    for (let i = 0; i < frames; i++) {
      at = b.writeInt16LE(i * 100, at);
      at = b.writeInt16LE(-5, at);
    }
    const back = decodeWav(b);
    expect(back.sampleRate).toBe(44100);
    expect(back.samples.length).toBe(frames);
    expect(back.samples[7]).toBeCloseTo(700 / 32768, 6);
  });

  it('says so when a file is not a WAV file', () => {
    expect(() => decodeWav(new Uint8Array(100))).toThrow('not a WAV file');
  });
});

describe('the sounds of the games', () => {
  const KINDS = ['hit', 'clear', 'blow', 'step', 'win'] as const;

  it('are made only of tones above what the listener analyses, and begin softly', () => {
    for (const kind of KINDS) {
      const s = chime(SR, kind);
      expect(s.length, kind).toBeGreaterThan(0.05 * SR);
      expect(Math.max(...s.map(Math.abs)), kind).toBeLessThan(0.6);
      // no jump at the start or the end
      expect(Math.abs(s[0]), kind).toBeLessThan(0.002);
      expect(Math.abs(s[s.length - 1]), kind).toBeLessThan(0.002);
      // what there is of it below 6 kHz: next to nothing
      let low = 0;
      let all = 0;
      const n = 4096;
      for (let k = 1; k < n / 2; k += 4) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < Math.min(n, s.length); i++) {
          const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.min(n, s.length));
          re += s[i] * win * Math.cos((2 * Math.PI * k * i) / n);
          im -= s[i] * win * Math.sin((2 * Math.PI * k * i) / n);
        }
        const p = re * re + im * im;
        all += p;
        if ((k * SR) / n < 6000) low += p;
      }
      expect(low / all, kind).toBeLessThan(0.001);
    }
  });

  it('are not heard as notes or strums, as loud as a guitar and one after the other', () => {
    const sig = new Float32Array(Math.floor(6 * SR));
    KINDS.forEach((kind, i) => {
      for (let k = 0; k < 4; k++) mixInto(sig, chime(SR, kind, 0.6), (0.6 + i * 1 + k * 0.22) * SR);
    });
    addNoise(sig, 0.0015);
    const heard = listen(sig, (l) => {
      l.chordCandidates = ['Em', 'Am', 'C', 'G'];
    });
    expect(heard.onsets).toEqual([]);
    expect(heard.notes).toEqual([]);
    expect(heard.chords).toEqual([]);
  });

  it('do not keep a strum from being heard, nor change what it is taken for', () => {
    const sig = new Float32Array(Math.floor(3.2 * SR));
    mixInto(sig, strum(chordNotes(CHORDS.Em), SR, 1), 0.5 * SR);
    mixInto(sig, strum(chordNotes(CHORDS.Am), SR, 1.4), 1.5 * SR);
    // a chime right on each strum, and one in between
    for (const at of [0.5, 0.52, 1.0, 1.5, 1.55]) mixInto(sig, chime(SR, 'clear', 0.6), at * SR);
    addNoise(sig, 0.0015);
    const heard = listen(sig, (l) => {
      l.noteDetection = false;
      l.chordCandidates = ['Em', 'Am', 'C', 'G'];
    });
    expect(heard.chords.map((c) => c.best)).toEqual(['Em', 'Am']);
  });
});
