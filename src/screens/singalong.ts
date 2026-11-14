/**
 * Singing and playing at once: a song's chords over its words, bar by bar, with the click counted in, and
 * under headphones the melody or a backing to sing to. The app listens to the guitar only: a bar turns green
 * when its chord was heard in it. Nothing is measured. On real recordings with a singer mixed in as loud as
 * the guitar, the chord of 94% of the stretches was still heard, but a strum here and there was covered by
 * the voice (87% of the strums named right, against 95% without a voice; tests/real/singbench.ts), so a level
 * from it would not be fair.
 */
import { backing } from '../audio/backing';
import { engine } from '../audio/engine';
import { mixInto, tone } from '../audio/synth';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { barUnits, chordsOf, said, sheet, singAlongSongs } from '../music/accompany';
import { SING_ALONG } from '../music/lyrics';
import { guitarA4 } from '../music/tuning';
import { findSong, noteTimes, shapeOf } from '../music/content';
import { $, esc, hear, keys, type Screen } from '../ui/dom';
import { setSimTarget } from '../ui/practice';
import { frame } from './learn';


export const singAlong: Screen = (root, [id]) => {
  if (!id || !SING_ALONG[id]) return chooser(root);
  const song = findSong(id);
  const sh = sheet(song)!;
  const units = barUnits(song);
  const starts: number[] = [];
  units.reduce((u, n) => (starts.push(u), u + n), 0);
  const total = starts[starts.length - 1] + units[units.length - 1];
  const PER = 4;
  let tempo = 100;
  let running = false;
  let t0 = 0;
  let unit = 1;
  let raf = 0;
  let melodyOn = false;
  let backingOn = store.settings.backing;
  let shownBar = -2;
  const heardBars = new Set<number>();
  const ids = [...new Set(song.bars.flatMap((_, k) => chordsOf(song, k)))];

  root.innerHTML = frame(
    `<b>${L('Sing and play', 'Singen und spielen')}</b> · ${esc(song.title)}`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <div class="leadsheet" id="sheet"></div>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('The app listens to the guitar only: a bar turns green when its chord was heard. Nothing is measured.', 'Die App hört nur auf die Gitarre: Ein Takt wird grün, wenn sein Akkord gehört wurde. Gemessen wird nichts.')}</p></div>`,
    `<div class="grp"><button class="btn primary" id="go"><span>${L('Start', 'Starten')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet" id="slower" aria-label="${L('Slower by 5%', 'Um 5 % langsamer')}">−5 % <kbd>−</kbd></button><b id="tempo"></b><button class="btn quiet" id="faster" aria-label="${L('Faster by 5%', 'Um 5 % schneller')}">+5 % <kbd>+</kbd></button></div>
     <div class="grp"><button class="btn quiet tog" id="melody" aria-pressed="false">${L('The melody (headphones)', 'Die Melodie (Kopfhörer)')} <kbd>H</kbd></button><button class="btn quiet tog" id="backing" aria-pressed="${backingOn}">${L('Backing (headphones)', 'Begleitung (Kopfhörer)')} <kbd>A</kbd></button></div>`,
    undefined,
    ['#/song/' + encodeURIComponent(song.id), song.title],
  );

  const say = (cls: string, text: string): void => {
    const el = $('#fbk', root);
    el.className = `fbk ${cls}`;
    el.textContent = text;
  };
  const barAt = (t: number): number => {
    const u = (t - t0) / unit;
    if (u < 0) return -1;
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1] <= u + 1e-6) k++;
    return u >= total ? song.bars.length : k;
  };
  const name = (c: string): string => shapeOf(c).name;

  function draw(cur: number): void {
    const line = Math.max(0, Math.floor(Math.max(0, Math.min(cur, song.bars.length - 1)) / PER));
    const rows = [line, line + 1].filter((r) => r * PER < song.bars.length);
    $('#sheet', root).innerHTML = rows
      .map(
        (r) =>
          `<div class="sline">${song.bars
            .slice(r * PER, r * PER + PER)
            .map((_, j) => {
              const k = r * PER + j;
              return `<div class="sbar${k === cur ? ' cur' : ''}${heardBars.has(k) ? ' heard' : ''}"><b>${chordsOf(song, k).map(name).map(esc).join(' · ')}</b><span>${esc(said(sh.words[k])) || '&nbsp;'}</span></div>`;
            })
            .join('')}</div>`,
      )
      .join('');
    const lines = Math.ceil(song.bars.length / PER);
    $('#eb', root).textContent = L(`Line ${line + 1} of ${lines} · ${tempo}%`, `Zeile ${line + 1} von ${lines} · ${tempo} %`);
    if (!running) {
      $('#h1', root).textContent = L('Play the chords, and sing the words.', 'Spiel die Akkorde, und sing den Text.');
      $('#sub', root).textContent = L('One bar is counted in. Strum on every beat, or the pattern you know; sing over it.', 'Ein Takt wird eingezählt. Schlag auf jeden Schlag an, oder das Muster, das du kennst; sing darüber.');
    } else if (cur < 0) {
      $('#h1', root).textContent = L('Get ready…', 'Mach dich bereit …');
      $('#sub', root).textContent = L(`First chord: ${name(chordsOf(song, 0)[0])}`, `Erster Akkord: ${name(chordsOf(song, 0)[0])}`);
    } else if (cur < song.bars.length) {
      const now = chordsOf(song, cur);
      const next = cur + 1 < song.bars.length ? chordsOf(song, cur + 1)[0] : '';
      $('#h1', root).innerHTML = `<em>${esc(now.map(name).join(' · '))}</em>${next && next !== now[now.length - 1] ? ` <small>→ ${esc(name(next))}</small>` : ''}`;
      $('#sub', root).textContent = said(sh.words[cur]);
    }
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
    engine.clearTicks();
    setSimTarget(null);
    $('#go span', root).textContent = L('Start', 'Starten');
  }

  function finish(): void {
    stop();
    const withChord = song.bars.length;
    say(heardBars.size >= withChord * 0.9 ? 'good' : 'info', L(`${heardBars.size} of ${withChord} bars: their chord was heard. A voice can cover a strum now and then; that is why nothing here is measured.`, `${heardBars.size} von ${withChord} Takten: Ihr Akkord wurde gehört. Eine Stimme kann hin und wieder einen Anschlag überdecken; darum wird hier nichts gemessen.`));
    draw(song.bars.length - 1);
  }

  function start(): void {
    if (!engine.ctx) return;
    heardBars.clear();
    unit = (song.noteDur * 100) / tempo;
    const beat = song.beat * unit;
    const count = Math.round(units[0] / song.beat);
    const begin = engine.now() + 0.2;
    t0 = begin + count * beat;
    const vol = store.settings.click;
    const low = store.settings.clickSound === 'click';
    for (let k = 0; k < count; k++) engine.tick(begin + k * beat, k === 0, vol, low);
    for (let k = 0; k < song.bars.length; k++) for (let c = 0; c < units[k] / song.beat - 1e-6; c++) engine.tick(t0 + (starts[k] + c * song.beat) * unit, c === 0, vol, low);
    const sr = engine.ctx.sampleRate;
    if (backingOn) {
      const chords = song.bars.flatMap((b, k) => {
        const at = noteTimes(b.notes).at;
        return b.notes.map((n, j) => ({ u: starts[k] + at[j], id: n.strum! })).filter((c, j, a) => c.id && (j === 0 || a[j - 1].id !== c.id));
      });
      const clicks = song.bars.flatMap((_, k) => Array.from({ length: Math.round(units[k] / song.beat) }, (_, c) => ({ u: starts[k] + c * song.beat, accent: c === 0 })));
      engine.playAt(t0, backing({ chords, clicks, units: total, unit, sr, a4: guitarA4() }), 0.9);
    }
    if (melodyOn) {
      // the melody as a soft line to sing to; under headphones only, or the microphone hears it as notes
      const notes = sh.melody;
      const from = Math.min(0, ...notes.map((n) => n.u));
      const out = new Float32Array(Math.ceil(((total - from) * unit + 2) * sr));
      notes.forEach((n, i) => mixInto(out, tone({ sr, midi: n.midi, dur: Math.max(0.25, n.len * unit), a4: guitarA4(), seed: i + 3, amp: 0.25 }), (n.u - from) * unit * sr));
      engine.playAt(t0 + from * unit, out, 0.8);
    }
    running = true;
    $('#go span', root).textContent = L('Stop', 'Stopp');
    say('info', L('Listening to the guitar.', 'Hört auf die Gitarre.'));
    const tick = (): void => {
      const cur = barAt(engine.now());
      if (cur >= song.bars.length) return finish();
      if (cur !== shownBar) {
        shownBar = cur;
        draw(cur);
        setSimTarget({ kind: 'chord', id: chordsOf(song, Math.max(0, cur))[0] });
      }
      raf = requestAnimationFrame(tick);
    };
    shownBar = -2;
    tick();
  }

  const stopEars = hear(
    root,
    {
      onChord: (e) => {
        if (!running || !e.best || e.score < 0.6 || e.margin < 0.08) return;
        // a strum just before a bar begins belongs to that bar
        for (const k of [barAt(e.time + 0.15), barAt(e.time)])
          if (k >= 0 && k < song.bars.length && chordsOf(song, k).includes(e.best) && !heardBars.has(k)) {
            heardBars.add(k);
            shownBar = -2;
            break;
          }
      },
    },
    (l) => {
      l.noteDetection = false;
      l.chordCandidates = ids;
    },
  );

  const setTempo = (d: number): void => {
    if (running) return;
    tempo = Math.max(50, Math.min(125, tempo + 5 * d));
    $('#tempo', root).textContent = `${tempo}%`;
    draw(-1);
  };
  const toggleMelody = (): void => {
    melodyOn = !melodyOn;
    $('#melody', root).setAttribute('aria-pressed', String(melodyOn));
  };
  const toggleBacking = (): void => {
    backingOn = !backingOn;
    $('#backing', root).setAttribute('aria-pressed', String(backingOn));
  };
  const go = (): void => (running ? (stop(), draw(-1), say('info', L('Stopped.', 'Angehalten.'))) : start());
  $('#go', root).onclick = go;
  $('#slower', root).onclick = () => setTempo(-1);
  $('#faster', root).onclick = () => setTempo(1);
  $('#melody', root).onclick = toggleMelody;
  $('#backing', root).onclick = toggleBacking;
  $('#tempo', root).textContent = `${tempo}%`;
  const stopKeys = keys({ ' ': go, '-': () => setTempo(-1), '+': () => setTempo(1), '=': () => setTempo(1), h: toggleMelody, a: toggleBacking });
  draw(-1);
  say('info', L('The melody and the backing are for headphones: through speakers the microphone would hear them as your playing.', 'Melodie und Begleitung sind für Kopfhörer: Über Lautsprecher würde das Mikrofon sie als dein Spiel hören.'));
  return () => {
    stop();
    stopEars();
    stopKeys();
  };
};

/** The songs whose words can be sung while their chords are played. */
export const singAlongList: Screen = (root) => chooser(root);

function chooser(root: HTMLElement): void {
  const songs = singAlongSongs();
  root.innerHTML = `<div class="page"><div><p class="kick">${L('Sing and play', 'Singen und spielen')}</p><h1>${L('Accompany yourself.', 'Begleite dich selbst.')}</h1>
    <p class="lede">${L('The chords of a song over its words, bar by bar: play them and sing. The app listens to the guitar and shows which chords it heard; your voice is yours, nothing is measured.', 'Die Akkorde eines Songs über seinem Text, Takt für Takt: Spiel sie und sing dazu. Die App hört auf die Gitarre und zeigt, welche Akkorde sie gehört hat; deine Stimme gehört dir, gemessen wird nichts.')}</p></div>
    <ul class="lib">${songs.map((s) => `<li><div><b>${esc(s.title)}</b><small>${esc([...new Set(s.bars.flatMap((_, k) => chordsOf(s, k)))].map((c) => shapeOf(c).name).join(' · '))}</small></div><span></span><span></span><span class="row"><a class="btn" href="#/singalong/${encodeURIComponent(s.id)}">${L('Open', 'Öffnen')}</a></span></li>`).join('')}</ul></div>`;
}
