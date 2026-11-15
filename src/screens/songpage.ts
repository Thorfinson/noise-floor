/**
 * The page of a song or a piece, before anything is played: hear it first, what it asks of you, and the way
 * through it, from the first line to keeping it. Opened from the song list and the start page (#/songs/<id>);
 * the lesson is one click away. Nothing listens here: it is a page to read and to hear.
 */
import { barUnits, tuneOf } from '../music/accompany';
import { songSound, type SongSound } from '../audio/songsound';
import { L } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { findPiece, findSong, noteTimes, type Song } from '../music/content';
import { chordKey, finished, pieceProfile, songProfile } from '../music/difficulty';
import { pieceMaterial, songMaterial, suggest, type Material } from '../music/material';
import { relDay, reviewKey } from '../music/review';
import { STRUM_PATTERNS, strumPatternOf } from '../music/strums';
import { CHORDS, pianoChord } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { $, $$, esc, icon, keys, type Screen } from '../ui/dom';
import { chordBox, LEARN } from '../ui/draw';
import { frame } from './frame';

const byLine = (by: string): string => (by === 'Traditional' ? L('Traditional', 'Traditionell') : by);
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Down and up strokes over their counts: the pattern of a strummed song as arrows. */
function strokes(slots: string, count: string[], beat: number): string {
  const o: string[] = [];
  [...slots].forEach((c, i) => {
    const x = 26 + i * 40;
    const main = i % beat === 0;
    if (c === 'D') o.push(`<path d="M${x} 8 v44 m-10 -13 l10 14 l10 -14" stroke="currentColor" stroke-width="${main ? 5 : 4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    else if (c === 'U') o.push(`<path d="M${x} 56 v-44 m-10 13 l10 -14 l10 14" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`);
    else o.push(`<circle cx="${x}" cy="32" r="3.5" fill="currentColor" opacity=".4"/>`);
    o.push(`<text x="${x}" y="86" font-size="${main ? 19 : 15}" font-weight="${main ? 700 : 400}" fill="currentColor" opacity="${main ? 1 : 0.55}" text-anchor="middle">${esc(count[i] ?? '')}</text>`);
  });
  return `<svg class="sp-strokes" viewBox="0 0 ${slots.length * 40 + 12} 96" role="img" aria-label="${esc(slots.replace(/D/g, '↓').replace(/U/g, '↑').replace(/\./g, '·'))}">${o.join('')}</svg>`;
}

/** Two bars of strums as the lesson writes them: one slash a strum, the chord over the bar it begins in. */
function slashes(a: string, b: string): string {
  const o: string[] = [];
  for (let j = 0; j < 4; j++) o.push(`<line x1="18" x2="292" y1="${30 + j * 12}" y2="${30 + j * 12}" stroke="currentColor" stroke-width="1" opacity=".35"/>`);
  [22, 157, 292].forEach((x) => o.push(`<line x1="${x}" x2="${x}" y1="30" y2="66" stroke="currentColor" stroke-width="1.4" opacity=".55"/>`));
  [a, b].forEach((c, k) => {
    o.push(`<text x="${52 + k * 135}" y="20" font-size="17" font-weight="700" fill="currentColor" text-anchor="middle">${esc(c)}</text>`);
    for (let i = 0; i < 3; i++) {
      const x = 52 + k * 135 + i * 38;
      o.push(`<line x1="${x - 5}" y1="64" x2="${x + 5}" y2="32" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`);
    }
  });
  return `<svg class="sp-slashes" viewBox="0 0 310 74" role="img" aria-label="${esc(L(`${a}, then ${b}: three strums each`, `${a}, dann ${b}: je drei Anschläge`))}">${o.join('')}</svg>`;
}

/**
 * The strumming of a song none of the trainer's patterns describes, read off its first full bar of strums:
 * a stroke on each strum, a dot where the hand passes without one, the counts under them.
 */
function ownPattern(song: Song): { name: string; about: string; slots: string; count: string[]; beat: number } | undefined {
  const bar = song.bars.find((b) => b.notes.length > 1 && b.notes.every((n) => n.strum));
  if (!bar) return undefined;
  const { at, total } = noteTimes(bar.notes);
  // half beats where a strum falls between the counts, whole beats otherwise
  const half = at.some((t) => t % 1 !== 0) ? 2 : 1;
  const slots = Array.from({ length: Math.round(total * half) }, (_, i) => {
    const k = at.findIndex((t) => Math.abs(t * half - i) < 1e-6);
    return k < 0 ? '.' : (bar.notes[k] as { up?: boolean }).up ? 'U' : 'D';
  }).join('');
  const count = Array.from({ length: slots.length }, (_, i) => (i % half === 0 ? String(i / half + 1) : '+'));
  const n = bar.notes.length;
  const ups = slots.includes('U');
  const beats = Math.round(total);
  return {
    name: ups ? L(`${n} strums to a bar, down and up`, `${n} Anschläge pro Takt, ab und auf`) : L(`${n} strums to a bar, all down`, `${n} Anschläge pro Takt, alle nach unten`),
    about: L(`Count along: ${count.filter((c) => c !== '+').join(' ')}, then again from 1. The first of each bar is a little stronger.`, `Zähl mit: ${count.filter((c) => c !== '+').join(' ')}, dann wieder ab 1. Der erste jedes Takts ist etwas kräftiger.`) + (beats === 3 ? L(' Three to a bar: a waltz.', ' Drei pro Takt: ein Walzer.') : ''),
    slots,
    count,
    beat: half,
  };
}

/** A chord picture as the lesson draws it, or the name alone on the piano. */
function chordPic(id: string, piano: boolean): string {
  if (piano) return `<b class="sp-chordname">${esc(pianoChord(id).name)}</b>`;
  const c = CHORDS[id];
  return c ? `<svg viewBox="0 0 240 210" role="img" aria-label="${esc(c.name)}">${chordBox(c, 40, 30, 150, LEARN, false, undefined, 34)}</svg>` : `<b class="sp-chordname">${esc(id)}</b>`;
}

/** Everything the page and the session's first hearing say about a song or a piece, worked out once. */
function about(id: string) {
  const inst: Instrument = store.settings.instrument === 'piano' ? 'piano' : 'guitar';
  const piano = inst === 'piano';
  const song = piano ? null : findSong(id);
  const piece = piano ? findPiece(id) : null;
  const m: Material = song ? songMaterial(song) : pieceMaterial(piece!);
  const title = song?.title ?? piece!.title;
  const by = song?.by ?? piece?.by ?? '';
  const profile = song ? songProfile(song) : pieceProfile(piece!);
  const strummed = !!song && profile.kind === 'strummed';
  const tune = song && strummed ? tuneOf(song) : null;
  const unitWord = (n: number): string => (piano ? L(n === 1 ? 'phrase' : 'phrases', n === 1 ? 'Phrase' : 'Phrasen') : L(n === 1 ? 'line' : 'lines', n === 1 ? 'Zeile' : 'Zeilen'));
  const Unit = piano ? L('Phrase', 'Phrase') : L('Line', 'Zeile');
  const chordName = (c: string): string => (piano ? pianoChord(c).name : (CHORDS[c]?.name ?? c));
  // the strumming: one of the trainer's patterns, or else what the song's first full bar does, strum by strum
  const trainer = song && strummed ? STRUM_PATTERNS().find((p) => p.id === strumPatternOf(song)) : undefined;
  const pattern: { name: string; about: string; slots: string; count: string[]; beat: number } | undefined = trainer ?? (song && strummed ? ownPattern(song) : undefined);
  const seconds = m.lines.reduce((s, l) => s + l.units, 0) * m.noteDur;

  // where each bar begins, in note units (the material's lines are whole bars of the song)
  const barStart: number[] = [];
  (song ? barUnits(song) : []).reduce((u, n) => (barStart.push(u), u + n), 0);
  const words = tune?.words ?? null;
  const flat = words ? words.flatMap((w, k) => w.map((s) => ({ s, k }))) : [];
  const aligned = !!tune && flat.length === tune.melody.length;

  // how far the player has come
  const lvl = (ks: string[]): number => Math.min(...ks.map((k) => store.skills.level(k)));
  const lineState = m.lines.map((l, li) => ({ learned: lvl([...new Set(l.bars.map(m.skill))]) >= 1, tempo: suggest(m, li).tempo, full: lvl([...new Set(l.bars.map(m.skill))]) >= 4 }));
  const begun = lineState.some((s) => s.learned);

  // the song as lines: the chord where it changes, the words under it (every syllable to light up as it is sung)
  const cell = (b: number, first: boolean): string => {
    const c = m.chordOf(b);
    // with words, the chord stands where it changes; without, every bar is named (faint where it stays) so the line reads as a chart
    const change = !!c && (first || c !== m.chordOf(b - 1));
    const show = !!c && (change || !words);
    const from = flat.findIndex((x) => x.k === b);
    const ws = words?.[b] ?? [];
    return `<div class="sp-bar"><span class="sp-c${change ? '' : ' same'}" data-bar="${b}">${show ? esc(chordName(c!)) : ''}</span><span class="sp-w">${ws.map((w, i) => `<s data-n="${from + i}">${w === '_' ? '' : esc(w.endsWith('-') ? w.slice(0, -1) + '‑' : w + ' ')}</s>`).join('')}</span></div>`;
  };
  const sheet = piano
    ? `<div class="sp-phrases">${m.lines.map((_, li) => `<span class="sp-ph" data-line="${li}">${Unit} ${li + 1}</span>`).join('')}</div>`
    : m.lines.map((l, li) => `<div class="sp-line" data-line="${li}"><span class="sp-ln">${Unit} ${li + 1}</span>${l.bars.map((b, i) => cell(b, i === 0)).join('')}</div>`).join('');
  const listenSub = tune ? L('The tune and the chords, as the song goes', 'Melodie und Akkorde, so wie der Song geht') : strummed ? L('The chords, as the song goes', 'Die Akkorde, so wie der Song geht') : L('As it is played', 'So, wie es gespielt wird');
  return { inst, piano, song, piece, m, title, by, profile, strummed, tune, Unit, unitWord, chordName, pattern, seconds, barStart, words, flat, aligned, lineState, begun, sheet, listenSub };
}
type About = ReturnType<typeof about>;

/** The controls of hearing it: play (P), the speed, and, where there is a tune, the tune and the chords each on or off. */
function controls(s: About, primary: boolean): string {
  return `<div class="sp-player">
    <button class="btn${primary ? ' primary' : ''} big" id="sp-play">${icon('play')}<span>${L('Play the song', 'Song abspielen')}</span> <kbd>P</kbd></button>
    <span class="sp-seg" role="group" aria-label="${L('Speed', 'Tempo')}"><button data-s="0.7" aria-pressed="false">${L('Slower', 'Langsamer')}</button><button data-s="1" aria-pressed="true">${L('As written', 'Wie notiert')}</button></span>
    ${s.tune ? `<label class="sp-tog"><input type="checkbox" id="sp-tune" checked> ${L('Tune', 'Melodie')}</label><label class="sp-tog"><input type="checkbox" id="sp-chords" checked> ${L('Chords', 'Akkorde')}</label>` : ''}
    <span class="sp-time" id="sp-time">0:00 / ${clock(s.seconds)}</span>
  </div>`;
}

/** Plays the song in an audio context of its own (nothing listens while it does) and lights up the sheet as it goes. */
function player(root: HTMLElement, s: About, onHeard: () => void): { play: (lines?: [number, number]) => void; stop: () => void; close: () => void } {
  const { m, tune, piano, barStart, flat, aligned } = s;
  let actx: AudioContext | null = null;
  let playing: { src: AudioBufferSourceNode; raf: number } | null = null;
  let shownLine: HTMLElement | null = null;
  const playBtn = $<HTMLButtonElement>('#sp-play', root);
  const speed = (): number => Number(root.querySelector('.sp-seg [aria-pressed="true"]')?.getAttribute('data-s')) || 1;
  const lightsOut = (): void => {
    $$('.sp-w s', root).forEach((el) => el.classList.remove('now', 'sung'));
    $$('.sp-c, .sp-ph', root).forEach((el) => el.classList.remove('on'));
    $$('.sp-line', root).forEach((el) => el.classList.remove('cur'));
  };
  function stop(): void {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    try {
      playing.src.stop();
    } catch {
      // already over
    }
    playing = null;
    lightsOut();
    playBtn.innerHTML = `${icon('play')}<span>${L('Play the song', 'Song abspielen')}</span> <kbd>P</kbd>`;
  }
  function play(lines?: [number, number]): void {
    if (playing) return stop();
    actx ??= new AudioContext();
    void actx.resume();
    const withTune = !tune || (root.querySelector<HTMLInputElement>('#sp-tune')?.checked ?? true);
    const withChords = !tune || (root.querySelector<HTMLInputElement>('#sp-chords')?.checked ?? true);
    const sound: SongSound = songSound(m, { sr: actx.sampleRate, speed: lines ? 1 : speed(), instrument: withChords, tune: withTune ? tune?.melody : null, lines, a4: guitarA4(), pianoA4: store.settings.pianoA4 });
    const buf = actx.createBuffer(1, sound.samples.length, actx.sampleRate);
    buf.getChannelData(0).set(sound.samples);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    const at = actx.currentTime + 0.05;
    src.start(at);
    playing = { src, raf: 0 };
    playBtn.innerHTML = `${icon('pause')}<span>${L('Stop', 'Stopp')}</span> <kbd>P</kbd>`;
    const end = at + sound.samples.length / actx.sampleRate;
    const time = root.querySelector('#sp-time');
    const tick = (): void => {
      if (!playing || !actx) return;
      const now = actx.currentTime;
      const u = sound.from + (now - at - sound.t0) / sound.unit;
      if (time) time.textContent = `${clock(Math.max(0, now - at))} / ${clock(end - at)}`;
      if (piano) {
        let li = 0;
        while (li + 1 < sound.starts.length && sound.starts[li + 1] <= u) li++;
        $$('.sp-ph', root).forEach((p) => p.classList.toggle('on', u >= 0 && Number(p.dataset.line) === li));
      } else {
        let b = 0;
        while (b + 1 < barStart.length && barStart[b + 1] <= u) b++;
        $$('.sp-c', root).forEach((c) => c.classList.toggle('on', u >= 0 && Number(c.dataset.bar) === b));
        $$('.sp-line', root).forEach((l) => l.classList.toggle('cur', m.lines[Number(l.dataset.line)].bars.includes(b)));
        // in the session's short sheet the line being sung is kept in sight; the page itself is left where the player scrolled it
        const cur = root.querySelector<HTMLElement>('.sp-sheet.compact .sp-line.cur');
        if (cur && cur !== shownLine) {
          shownLine = cur;
          cur.scrollIntoView({ block: 'nearest' });
        }
        if (aligned && withTune) {
          let n = -1;
          while (n + 1 < tune!.melody.length && tune!.melody[n + 1].u <= u) n++;
          // a held syllable ("_") keeps the one before it lit
          let lit = n;
          while (lit > 0 && flat[lit].s === '_') lit--;
          $$('.sp-w s', root).forEach((el) => {
            const i = Number(el.dataset.n);
            el.classList.toggle('now', i === lit);
            el.classList.toggle('sung', i < lit);
          });
        }
      }
      if (now < end) playing.raf = requestAnimationFrame(tick);
      else {
        stop();
        if (!lines) onHeard();
      }
    };
    playing.raf = requestAnimationFrame(tick);
  }
  playBtn.onclick = () => play();
  $$<HTMLButtonElement>('.sp-seg button', root).forEach(
    (b) =>
      (b.onclick = () => {
        $$('.sp-seg button', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (playing) {
          stop();
          play();
        }
      }),
  );
  return {
    play,
    stop,
    close: () => {
      stop();
      void actx?.close();
    },
  };
}

export const songPage: Screen = (root, [id]) => {
  const s = about(id);
  const { inst, piano, m, title, by, profile, strummed, tune, Unit, unitWord, chordName, pattern, seconds, words, lineState, begun } = s;
  const done = finished(inst, m.id);
  const review = store.reviews[reviewKey(inst, m.id)];
  const nextLine = Math.max(0, lineState.findIndex((x) => !x.learned));

  const sayLine = (li: number): string => {
    const l = m.lines[li];
    if (words) {
      const t = l.bars.flatMap((b) => words[b] ?? []).filter((w) => w && w !== '_').map((w) => (w.endsWith('-') ? w.slice(0, -1) : w + ' ')).join('').trim();
      if (t) return esc(t);
    }
    if (!piano) {
      const cs = l.bars.map((b) => m.chordOf(b)).filter((c): c is string => !!c);
      return cs.filter((c, i) => c !== cs[i - 1]).map((c) => esc(chordName(c))).join(' – ');
    }
    return '';
  };
  const what = !strummed
    ? piano
      ? L('You play it phrase by phrase, then the whole piece.', 'Du spielst es Phrase für Phrase, dann das ganze Stück.')
      : L('You play the tune, note by note, line by line.', 'Du spielst die Melodie, Ton für Ton, Zeile für Zeile.')
    : tune
      ? L('You strum the chords; the tune is what is sung over them.', 'Du schlägst die Akkorde an; die Melodie ist das, was darüber gesungen wird.')
      : L('You strum the chords, line by line.', 'Du schlägst die Akkorde an, Zeile für Zeile.');
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${by === 'Traditional' ? 'traditional song' : by}`.trim())}`;
  const recording = `<a href="${esc(search)}" target="_blank" rel="noopener noreferrer">${L('Find a recording', 'Eine Aufnahme suchen')} ↗</a>`;
  const known = (c: string): boolean => store.skills.level(chordKey(c, piano)) >= 1;
  const chords = profile.chords;
  // the next thing to do, as the lesson would choose it: a line not learned yet, the click, or the whole song
  const allLearned = lineState.every((x) => x.learned);
  const allFull = lineState.every((x) => x.full);
  const start = !begun
    ? L(`Start with ${Unit.toLowerCase()} 1`, `Mit ${Unit} 1 beginnen`)
    : !allLearned
      ? L(`Go on with ${Unit.toLowerCase()} ${nextLine + 1}`, `Weiter mit ${Unit} ${nextLine + 1}`)
      : !allFull && !done
        ? L('Go on with the click', 'Weiter mit Klick')
        : piano
          ? L('Play the whole piece', 'Das ganze Stück spielen')
          : L('Play the whole song', 'Den ganzen Song spielen');
  const lessonBase = `#/${piano ? 'piano' : 'song'}/${encodeURIComponent(m.id)}`;
  // the lesson opens at a line: #/song/<id>/<rung>/<line>, the line counted from 1
  const lesson = !begun ? lessonBase : !allLearned ? `${lessonBase}/1/${nextLine + 1}` : !allFull && !done ? lessonBase : `${lessonBase}/3`;

  root.innerHTML = `<div class="page bare songp">
    <div><a class="btn quiet" href="#/songs">${icon('left')}${piano ? L('All pieces', 'Alle Stücke') : L('All songs', 'Alle Songs')}</a></div>
    <section class="paper sp-head">
      <p class="kick">${piano ? L('Piece', 'Stück') : L('Song', 'Song')}${by ? ` · ${esc(byLine(by))}` : ''}</p>
      <h1>${esc(title)}</h1>
      <p class="lede">${what} ${begun ? '' : L('Hear it once, then learn it a line at a time.', 'Hör ihn dir einmal an, dann lernst du ihn Zeile für Zeile.')}</p>
      <div class="sp-facts"><span>${m.lines.length} ${unitWord(m.lines.length)}</span>${chords.length ? `<span>${L(`${chords.length} ${chords.length === 1 ? 'chord' : 'chords'}`, `${chords.length} ${chords.length === 1 ? 'Akkord' : 'Akkorde'}`)}: ${chords.map((c) => esc(chordName(c))).join(' ')}</span>` : ''}${pattern ? `<span>${esc(pattern.name)}</span>` : ''}<span>${seconds < 90 ? L(`about ${Math.round(seconds / 5) * 5} seconds`, `etwa ${Math.round(seconds / 5) * 5} Sekunden`) : L(`about ${Math.round(seconds / 60)} minutes`, `etwa ${Math.round(seconds / 60)} Minuten`)}</span></div>
    </section>

    <section class="paper sp-listen" aria-labelledby="sp-hear">
      <div class="sectitle"><h2 id="sp-hear"><span class="spno">1</span>${L('Hear it first', 'Erst anhören')}</h2><span class="note">${s.listenSub}</span></div>
      ${controls(s, !begun)}
      <div class="sp-sheet" id="sp-sheet">${s.sheet}</div>
      <p class="sp-note">${
        strummed && !tune
          ? L(`The app has no tune for this song yet: you hear its chords alone. ${recording} opens a search on YouTube in a new tab.`, `Für diesen Song hat die App noch keine Melodie: Du hörst nur seine Akkorde. ${recording} öffnet eine Suche auf YouTube in einem neuen Tab.`)
          : words
            ? L(`The words show where each chord changes. Or hear the song sung by people: ${recording} (YouTube, in a new tab).`, `Der Text zeigt, wo jeder Akkord wechselt. Oder hör den Song von Menschen gesungen: ${recording} (YouTube, in einem neuen Tab).`)
            : L(`Or hear it played by people: ${recording} (YouTube, in a new tab).`, `Oder hör es von Menschen gespielt: ${recording} (YouTube, in einem neuen Tab).`)
      }</p>
    </section>

    <div class="sp-two">
      <section class="paper sp-asks" aria-labelledby="sp-asksh">
        <div class="sectitle"><h2 id="sp-asksh"><span class="spno">2</span>${L('What it asks of you', 'Was er von dir verlangt')}</h2></div>
        ${
          chords.length
            ? `<div class="sp-chords">${chords
                .map((c) => `<div class="sp-chord${known(c) ? '' : ' new'}">${chordPic(c, piano)}<b>${esc(chordName(c))}</b><small>${known(c) ? `${icon('check')}${L('you can play it', 'kannst du')}` : L('new for you', 'neu für dich')}</small>${known(c) ? '' : `<a href="#/${piano ? 'keys' : 'chord'}/${encodeURIComponent(c)}">${L(`Learn ${esc(chordName(c))} first`, `Erst ${esc(chordName(c))} lernen`)}</a>`}</div>`)
                .join('')}</div>`
            : `<p class="note">${piano ? L('Single keys, one hand: no chords to know first.', 'Einzelne Tasten, eine Hand: keine Akkorde vorab.') : L('Single notes: no chords to know first.', 'Einzeltöne: keine Akkorde vorab.')}</p>`
        }
        ${
          pattern
            ? `<div class="sp-blk">${strokes(pattern.slots, pattern.count, pattern.beat)}<div><h3>${esc(pattern.name)}</h3><p>${esc(pattern.about)}</p><button class="btn quiet" id="sp-strum">${icon('play')}${L(`Hear ${Unit.toLowerCase()} 1`, `${Unit} 1 anhören`)}</button></div></div>`
            : ''
        }
        ${strummed ? `<div class="sp-blk">${slashes(chordName(chords[0] ?? 'G'), chordName(chords[1] ?? chords[0] ?? 'C'))}<div><h3>${L('How a line is written', 'Wie eine Zeile notiert ist')}</h3><p>${L('Each slash is one strum. The chord name stands where the chord changes, and holds until the next one.', 'Jeder Strich ist ein Anschlag. Der Akkordname steht dort, wo der Akkord wechselt, und gilt bis zum nächsten.')}</p></div></div>` : ''}
      </section>

      <section class="paper sp-way" aria-labelledby="sp-wayh">
        <div class="sectitle"><h2 id="sp-wayh"><span class="spno">3</span>${L('Your way through it', 'Dein Weg hindurch')}</h2></div>
        <ol class="sp-steps">
          <li id="sp-heard"><span class="dot">1</span><h3>${L('Hear it', 'Anhören')} <span>· ${L('once is enough', 'einmal genügt')}</span></h3></li>
          <li class="${done ? 'ok' : 'cur'}"><span class="dot">${done ? icon('check') : '2'}</span><h3>${piano ? L('Phrase by phrase', 'Phrase für Phrase') : L('Line by line', 'Zeile für Zeile')}</h3><div class="body">
            <div class="sp-lines">${m.lines.map((_, li) => `<a class="sp-l" href="${lessonBase}/${lineState[li].learned ? 2 : 1}/${li + 1}" data-line="${li}"><b>${Unit} ${li + 1}</b><em>${sayLine(li)}</em><span class="sp-rp"><i class="${lineState[li].learned ? 'ok' : ''}">${lineState[li].learned ? icon('check') : '1'} ${L('Learn', 'Lernen')}</i><i class="${lineState[li].full ? 'ok' : ''}">2 ${lineState[li].learned && !lineState[li].full ? `${lineState[li].tempo} %` : L('Click', 'Klick')}</i></span></a>`).join('')}</div>
            <div class="sp-key"><p><i>1</i><span><b>${L('Learn', 'Lernen')}:</b> ${L('no clock. The app waits until it hears each strum, so you can look at your fingers.', 'ohne Uhr. Die App wartet, bis sie jeden Anschlag hört, so kannst du auf deine Finger schauen.')}</span></p><p><i>2</i><span><b>${L('With the click', 'Mit Klick')}:</b> ${L('the same line in time, slow at first, faster when it goes well.', 'dieselbe Zeile im Takt, erst langsam, schneller, wenn es gut geht.')}</span></p></div>
          </div></li>
          <li class="${done ? 'ok' : ''}"><span class="dot">${done ? icon('check') : '3'}</span><h3>${piano ? L('The whole piece', 'Das ganze Stück') : L('The whole song', 'Der ganze Song')} <span>· ${L('start to end, full speed', 'von Anfang bis Ende, volles Tempo')}</span></h3><div class="body"><p>${L('Recorded, so you can listen back. Clean once: it joins your repertoire.', 'Aufgenommen, damit du es dir anhören kannst. Einmal sauber: Es kommt in dein Repertoire.')}</p></div></li>
          <li class="${review ? 'ok' : ''}"><span class="dot">${review ? icon('check') : '4'}</span><h3>${L('Keep it', 'Behalten')} <span>· ${review ? L(`next visit ${relDay(review.due)}`, `nächster Besuch ${relDay(review.due)}`) : L('it comes back in a few days', 'es kommt in ein paar Tagen wieder')}</span></h3><div class="body"><p>${L('Played from cold, without warming up, at growing gaps, so that it stays in your hands.', 'Aus dem Stand gespielt, ohne Aufwärmen, in wachsenden Abständen, damit es in deinen Händen bleibt.')}</p></div></li>
        </ol>
        <div class="row"><a class="btn${begun ? ' primary' : ''} big" id="sp-start" href="${lesson}">${start}${icon('right')} <kbd>${L('Space', 'Leertaste')}</kbd></a></div>
        <p class="note">${L('Nothing starts before you play the first chord.', 'Nichts beginnt, bevor du den ersten Akkord spielst.')}</p>
      </section>
    </div>
  </div>`;

  let heard = false;
  const p = player(root, s, () => {
    // heard once: the next thing to do is the first line, so the blue moves there
    if (heard) return;
    heard = true;
    $('#sp-play', root).classList.remove('primary');
    $('#sp-start', root).classList.add('primary');
    const h = $('#sp-heard', root);
    h.classList.add('ok');
    $('.dot', h).innerHTML = icon('check');
  });
  root.querySelector<HTMLButtonElement>('#sp-strum')?.addEventListener('click', () => {
    p.stop();
    p.play([0, 0]);
  });
  const stopKeys = keys({
    p: () => p.play(),
    // Space: the next thing to do, as the blue button says it
    ' ': () => (heard || begun ? (location.hash = lesson) : p.play()),
  });
  return () => {
    p.close();
    stopKeys();
  };
};

/**
 * In a session: a song or piece not begun yet is heard first, on a screen of its own in the step's frame;
 * "Start with line 1" (or Space, once it has been heard) puts the lesson in the same place. A song begun
 * before goes straight to its lesson.
 */
export function hearFirst(lesson: Screen): Screen {
  return (root, params, ctx) => {
    const s = about(params[0]);
    if (!ctx || s.begun) return lesson(root, params, ctx);
    root.innerHTML = frame(
      `${esc(s.title)}`,
      `<div class="sp-pre">
        <div class="say"><p class="eyebrow">${esc(ctx.label)} · ${s.piano ? L('A new piece', 'Ein neues Stück') : L('A new song', 'Ein neuer Song')}</p><h1>${L(`Hear it first: <em>${esc(s.title)}</em>`, `Erst anhören: <em>${esc(s.title)}</em>`)}</h1><p class="sub">${s.listenSub}. ${L(`Then you learn it ${s.Unit.toLowerCase()} by ${s.Unit.toLowerCase()}.`, `Dann lernst du ihn ${s.Unit} für ${s.Unit}.`)}</p></div>
        ${controls(s, true)}
        <div class="sp-sheet compact">${s.sheet}</div>
      </div>`,
      `<div class="grp do"><button class="btn" id="sp-go">${L(`Start with ${s.Unit.toLowerCase()} 1`, `Mit ${s.Unit} 1 beginnen`)}${icon('right')} <kbd>${L('Space', 'Leertaste')}</kbd></button></div>`,
      ctx,
    );
    let heard = false;
    let inner: void | (() => void);
    const p = player(root, s, () => {
      heard = true;
      $('#sp-play', root).classList.remove('primary');
      $('#sp-go', root).classList.add('primary');
    });
    const go = (): void => {
      p.close();
      stopKeys();
      inner = lesson(root, params, ctx);
    };
    $('#sp-go', root).onclick = go;
    const stopKeys = keys({ p: () => p.play(), ' ': () => (heard ? go() : p.play()) });
    return () => {
      p.close();
      stopKeys();
      inner?.();
    };
  };
}
