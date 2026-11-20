/** Noise Floor: choosing a run, playing it, the boss, the upgrades between waves and the debrief. */
import { engine } from '../audio/engine';
import { L, lang, num } from '../core/i18n';
import { store, type RunRow, type RunSummary } from '../core/store';
import { MuteGesture } from '../game/gesture';
import { currentPiece, currentSong, currentSongToSing, pairKey } from '../music/difficulty';
import { chordBoss, isPianoRun, isVoiceRun, LAND_Y, poolFor, Run, scaleBoss, sungPool, voicePool, voiceScaleBoss, type Boss, type Foe, type Phrase, type RunEvent, type RunType } from '../game/run';
import { centsOff, Hold, type Frame } from '../core/singing';
import { sungPhraseKey } from '../music/voicebook';
import { placeFor, voiceEars, voiceRange } from './sing';
import { CHORD_PAIRS, KEY_PAIRS, PIANO_PIECES, shapeOf, SONGS } from '../music/content';
import { changeTip, chordName, CHORDS, keyTip, noteName, STRING_FULL, stringName, strumIs } from '../music/theory';
import { $, cap, esc, go, hear, keys, learnRing, micMeter, pianoEars, type Screen } from '../ui/dom';
import { armed, bossChord, menuOn, pickHint, pickMenu, pickState, slowly, STRUM, tenths } from './runkit';
import { groovePlan, grooveRun } from './nightrun';
import { grooveOf } from '../game/groove';
import { nightDate, nightLog } from '../game/night';
import { chordBox, keyboard, keyChord, keyRange, NF, NFX, type KeyMark } from '../ui/draw';
import { hourOf, STORM, Watch } from '../ui/watch';
import { practiceBar, setSimTarget } from '../ui/practice';
import { PATTERNS } from '../game/stride';
import { pips, skillLabel } from './home';
import { stringTip } from './chordcheck';

// getters: the names are read when they are shown, in the language of that moment
const NAMES: Record<RunType, string> = {
  get fingers() { return L('Finger run', 'Fingerrunde'); },
  get changes() { return L('Changes run', 'Wechselrunde'); },
  get song() { return L('Song run', 'Songrunde'); },
  get keys() { return L('Key run', 'Tastenrunde'); },
  get piece() { return L('Piece run', 'Stückrunde'); },
  get kchanges() { return L('Changes run', 'Wechselrunde'); },
  get sing() { return L('Voice run', 'Stimmrunde'); },
  get ssong() { return L('Song run', 'Songrunde'); },
};
const TYPES: RunType[] = ['fingers', 'changes', 'song', 'keys', 'piece', 'kchanges', 'sing', 'ssong'];

/** The skill of keeping the beat in a pattern of Stepping stones, on the guitar, the piano or with the voice. */
export const beatKey = (pattern: string, piano: boolean | 'voice'): string => `beat:${piano === 'voice' ? 'v.' : piano ? 'p.' : ''}${pattern}`;

/** The speed a kind of run starts at, a whole percent: what is stored may come from a backup file. */
const storedSpeed = (type: RunType): number => {
  const v = Number(store.speeds[type]);
  return Number.isFinite(v) ? Math.round(v) : 60;
};

/**
 * The chords a run of chord changes may ask for: those that have rung clean in the chord check at least
 * once. Em and Am, the two easiest, always count, so that there is a first run.
 */
export function knownChords(piano = false): Set<string> {
  if (piano) {
    // on the piano C and G are the first two
    const known = new Set(['C', 'G']);
    for (const key of Object.keys(store.skills.data)) if (key.startsWith('chord:p.') && store.skills.level(key) >= 1) known.add(key.slice(8));
    return known;
  }
  const known = new Set(['Em', 'Am']);
  for (const id of Object.keys(CHORDS)) if (store.skills.level('chord:' + id) >= 1) known.add(id);
  return known;
}

/** The change between chords the player knows that is furthest from 30 a minute, or null when all are there. */
export function weakestChange(piano = false): [string, string] | null {
  const known = knownChords(piano);
  const shape = (c: string): string => (piano ? c : shapeOf(c).id);
  const open = (piano ? KEY_PAIRS : CHORD_PAIRS).filter(([a, b]) => known.has(shape(a)) && known.has(shape(b)) && store.skills.level(pairKey(a, b, piano)) < 3);
  const [first] = open.sort((x, y) => (store.skills.get(pairKey(x[0], x[1], piano))?.best ?? 0) - (store.skills.get(pairKey(y[0], y[1], piano))?.best ?? 0));
  return first ?? null;
}

/** The phrases a run of this kind draws from, for the song or piece that is being learned. */
function pool(type: RunType): Phrase[] {
  if (type === 'sing') return voicePool(...voiceRange());
  if (type === 'ssong') {
    const s = currentSongToSing();
    return sungPool(s, placeFor(s), (k) => sungPhraseKey(s, k));
  }
  const made = poolFor(type, type === 'song' ? currentSong() : type === 'piece' ? currentPiece() : undefined);
  if (type === 'changes') {
    // a run drills what the hand already knows: a new chord is met in the chord check first
    const known = knownChords();
    return made.filter((p) => p.pair!.every((c) => known.has(shapeOf(c).id)));
  }
  if (type === 'kchanges') {
    const known = knownChords(true);
    return made.filter((p) => p.pair!.every((c) => known.has(c)));
  }
  return made.length ? made : poolFor(type, type === 'song' ? SONGS[0] : PIANO_PIECES[0]);
}

export const nfStart: Screen = (root) => {
  const now = Date.now();
  const piano = store.settings.instrument === 'piano';
  const voice = store.settings.instrument === 'voice';
  const skillKeys = (type: RunType): string[] => [...new Set(pool(type).map((p) => p.key))];
  const avgLevel = (type: RunType): number => skillKeys(type).reduce((sum, k) => sum + store.skills.level(k), 0) / skillKeys(type).length;
  const weakest = (type: RunType): string => {
    const k = skillKeys(type).reduce((a, b) => (store.skills.weight(b, now) > store.skills.weight(a, now) ? b : a));
    return L(`${skillLabel(k)}: level ${store.skills.level(k)}`, `${skillLabel(k)}: Stufe ${store.skills.level(k)}`);
  };
  const types: { type: RunType; tag: string; name: string; text: string }[] = voice
    ? [
        { type: 'sing', tag: L('Voice', 'Stimme'), name: L('Voice gym', 'Stimmtraining'), text: L('Short sung patterns: a step, a third, do-mi-sol, five notes up and down, in keys that suit your voice. Trains finding the next note.', 'Kurze gesungene Muster: ein Schritt, eine Terz, Do-mi-sol, fünf Töne auf und ab, in Tonarten, die zu deiner Stimme passen. Trainiert, den nächsten Ton zu finden.') },
        { type: 'ssong', tag: L('Song', 'Song'), name: L('Song run', 'Songrunde'), text: L(`The phrases of ${currentSongToSing().title}, the weak ones more often.`, `Die Phrasen aus ${currentSongToSing().title}, die schwachen öfter.`) },
      ]
    : piano
    ? [
        { type: 'keys', tag: L('Fingers', 'Finger'), name: L('Finger gym', 'Fingertraining'), text: L('Five-finger patterns in three hand positions, right hand and left. Trains even, independent fingers.', 'Fünffingermuster in drei Handpositionen, rechte und linke Hand. Trainiert gleichmäßige, unabhängige Finger.') },
        { type: 'kchanges', tag: L('Changes', 'Wechsel'), name: L('Chord changes', 'Akkordwechsel'), text: L('Pairs of chords come at you. Every clean change is a hit, and your slow pairs come more often.', 'Akkordpaare kommen auf dich zu. Jeder saubere Wechsel ist ein Treffer, und deine langsamen Paare kommen öfter.') },
        { type: 'piece', tag: L('Piece', 'Stück'), name: L('Piece run', 'Stückrunde'), text: L(`${pool('piece').some((p) => p.kind === 'keys') ? 'Phrases' : 'The chord changes'} of ${currentPiece().title}, the weak ones more often.`, `${pool('piece').some((p) => p.kind === 'keys') ? 'Die Phrasen' : 'Die Akkordwechsel'} aus ${currentPiece().title}, die schwachen öfter.`) },
      ]
    : [
        { type: 'fingers', tag: L('Fingers', 'Finger'), name: L('Finger gym', 'Fingertraining'), text: L('Spider and skip patterns at the fifth fret, one finger per fret.', 'Spinnen- und Sprungmuster am fünften Bund, ein Finger pro Bund.') },
        { type: 'changes', tag: L('Changes', 'Wechsel'), name: L('Chord changes', 'Akkordwechsel'), text: L('Chords drift in on a groove: play one to strike it.', 'Akkorde treiben auf einem Groove heran: Spiel einen, um ihn zu treffen.') },
        { type: 'song', tag: L('Song', 'Song'), name: L('Song run', 'Songrunde'), text: L(`${pool('song').some((p) => p.kind === 'tab') ? 'Bars' : 'The chord changes'} of ${currentSong().title}, the weak ones more often.`, `${pool('song').some((p) => p.kind === 'tab') ? 'Die Takte' : 'Die Akkordwechsel'} aus ${currentSong().title}, die schwachen öfter.`) },
      ];
  const suggested = types.reduce((a, b) => (avgLevel(b.type) < avgLevel(a.type) ? b : a)).type;
  // tonight's night comes first, on the guitar: the run of the day, the same all day
  const plan = !piano && !voice ? groovePlan(true, now) : null;
  const nightCard = plan
    ? (() => {
        const log = nightLog(store.progress, plan.today, 3);
        const tonight = log.find((e) => e.day === plan.today);
        const before = log.filter((e) => e.day !== plan.today).slice(0, 2);
        const date = nightDate(plan.today, lang());
        const groove = grooveOf(plan.song) ? L(`on the groove of ${plan.song.title}`, `auf dem Groove von ${plan.song.title}`) : L('on a groove of your changes', 'auf einem Groove deiner Wechsel');
        return `<a class="card night-card" href="#/night" id="nightcard"><div class="night-card-text"><span class="k">${L('Tonight', 'Heute Nacht')} · ${esc(plan.rule!.name)}</span><h2>${L(`The night of ${date}`, `Die Nacht vom ${date}`)}</h2><p>${esc(plan.rule!.text)} ${esc(L(`Three waves ${groove}, about four minutes.`, `Drei Wellen ${groove}, etwa vier Minuten.`))}</p><span class="meta">${tonight ? L(`Best tonight: ${num(tonight.best)}`, `Bestwert heute: ${num(tonight.best)}`) : L('Not played yet tonight', 'Heute noch nicht gespielt')}${before.map((e) => ` · ${esc(nightDate(e.day, lang()))}: ${num(e.best)}`).join('')}</span></div><div class="night-card-go"><div class="night-card-chords" aria-label="${L('Its chords', 'Ihre Akkorde')}">${plan.chords.map((c) => `<b>${esc(chordName(c))}</b>`).join('')}</div><span class="night-card-key">${L('Play', 'Spielen')} <kbd>${L('Space', 'Leertaste')}</kbd></span></div></a>`;
      })()
    : '';
  // Freestyle, on the guitar: a solo of the player's own, as wide as the night
  const freeBest = Math.max(0, ...Object.entries(store.best).filter(([k]) => k.startsWith('free:')).map(([, v]) => v));
  const freeCard =
    !piano && !voice
      ? `<a class="card free-card" href="#/free" id="freecard"><div class="night-card-text"><span class="k">${L('Freestyle · 90 seconds', 'Freestyle · 90 Sekunden')}</span><h2>${L('A solo is a line of tricks.', 'Ein Solo ist eine Linie aus Tricks.')}</h2><p>${L('Play what you like over the band. Land the line on E, or lose it.', 'Spiel über die Band, was du willst. Lande die Linie auf E, oder verlier sie.')}</p><span class="meta">${freeBest ? L(`Your best: ${num(freeBest)}`, `Dein Bestwert: ${num(freeBest)}`) : L('All six open strings are in the scale.', 'Alle sechs leeren Saiten gehören zur Tonleiter.')}</span></div><div class="night-card-go"><span class="night-card-key">${L('Play', 'Spielen')} <kbd>${types.length + 2}</kbd></span></div></a>`
      : '';
  const grooveBpm = Number(store.speeds.groove) > 0 ? Math.round(Number(store.speeds.groove)) : 66;
  root.innerHTML = `<div class="page mid">
    <div>
      <p class="kick">${L(`Games · ${voice ? 'voice' : piano ? 'piano' : 'guitar'} · run ${store.runs.length + 1}`, `Spiele · ${voice ? 'Stimme' : piano ? 'Klavier' : 'Gitarre'} · Runde ${store.runs.length + 1}`)}</p>
      <h1>${L('Choose a game.', 'Wähl ein Spiel.')}</h1>
      <p class="lede">${menuOn() ? L(`${piano ? 'Play the key' : 'Strum the chord'} on a card, or press its number.`, piano ? 'Spiel die Taste einer Karte, oder drück ihre Nummer.' : 'Schlag den Akkord einer Karte an, oder drück ihre Nummer.') : L(`Press ${types.map((_, i) => i + 1).join(', ')}, or click a card.`, `Drück ${types.map((_, i) => i + 1).join(', ')} oder klick eine Karte an.`)}${voice ? L(' Sing on “la”; any octave counts.', ' Sing auf „la“; jede Oktave zählt.') : ''}</p>${pickState()}
    </div>
    <div class="cards${types.length >= 3 ? ' four' : ''}">${nightCard}${freeCard}${types
      .map(
        (t, i) => `<a class="card${t.type === suggested ? ' sug' : ''}" href="#/run/${t.type}"><span class="k">${t.tag}${t.type === suggested ? L(' · suggested', ' · empfohlen') : ''}</span><h2>${t.name}</h2><p>${esc(t.text)}</p>
        <span class="meta">${t.type === 'changes' ? L(`Starts at ${grooveBpm} bpm`, `Beginnt bei ${grooveBpm} bpm`) : L(`Starts at ${storedSpeed(t.type)}% speed`, `Beginnt bei ${storedSpeed(t.type)} % Tempo`)} · ${L(`weakest: ${esc(weakest(t.type))}`, `am schwächsten: ${esc(weakest(t.type))}`)}</span><span class="pick">${pickHint(i, piano)}</span></a>`,
      )
      .join('')}<a class="card" href="#/stride"><span class="k">${L('Rhythm', 'Rhythmus')}</span><h2>${L('Stepping stones', 'Trittsteine')}</h2><p>${voice ? L('One sung “ta” on every stone, in time with the click; the note changes every bar.', 'Ein gesungenes „ta“ auf jeden Stein, im Takt mit dem Klick; der Ton wechselt jeden Takt.') : L(`One ${piano ? 'chord' : 'strum'} on every stone, in time with the click, through a chord change.`, `Ein ${piano ? 'Akkord' : 'Anschlag'} auf jeden Stein, im Takt mit dem Klick, über einen Akkordwechsel hinweg.`)}</p>
        <span class="meta">${L(`Four ${piano || voice ? 'rhythms' : 'strumming patterns'} · weakest: `, `Vier ${piano || voice ? 'Rhythmen' : 'Schlagmuster'} · am schwächsten: `)}${esc(PATTERNS.reduce((a, b) => (store.skills.level(beatKey(b.id, voice ? 'voice' : piano)) < store.skills.level(beatKey(a.id, voice ? 'voice' : piano)) ? b : a)).name)}</span><span class="pick"><span>${L(`Press ${types.length + 1}`, `Drück ${types.length + 1}`)}</span></span></a></div>
    ${menuOn() ? `<div class="row">${micMeter()}</div>` : ''}
  </div>`;
  const pick = (i: number): void => {
    if (types[i]) go('/run/' + types[i].type);
  };
  // the place the games are played in, behind the cards: the lighthouse in the rose evening
  const canvas = document.createElement('canvas');
  canvas.className = 'world';
  canvas.setAttribute('aria-hidden', 'true');
  root.prepend(canvas);
  const scene = new Watch(canvas, 0);
  const due = slowly();
  let raf = requestAnimationFrame(function frame(ts: number): void {
    raf = requestAnimationFrame(frame);
    if (!due(ts)) return;
    scene.measure();
    scene.draw(null, ts / 1000, false);
  });
  const stopMenu = pickMenu(root, pick, piano);
  const stopKeys = keys({ ' ': () => plan && go('/night'), '1': () => pick(0), '2': () => pick(1), '3': () => (types[2] ? pick(2) : go('/stride')), '4': () => types.length >= 3 && go('/stride'), '5': () => !!freeCard && go('/free') });
  return () => {
    cancelAnimationFrame(raf);
    stopMenu();
    stopKeys();
  };
};

/** A phrase for the piano as a small contour: one dash per note, higher notes higher. */
function contour(p: Phrase, x0: number, y0: number, w: number, h: number, hit: number, lk: boolean): string {
  const midis = p.keys.map((k) => k.midi);
  const hi = Math.max(...midis);
  const lo = Math.min(hi - 4, ...midis);
  const step = Math.min(w / 5, w / midis.length);
  return midis.map((m, k) => `<rect x="${(x0 + k * step).toFixed(1)}" y="${(y0 + ((hi - m) / (hi - lo)) * (h - 6)).toFixed(1)}" width="${(step - 4).toFixed(1)}" height="6" rx="2" fill="${k < hit ? NFX.dim : lk && k === hit ? NF.now : NF.text}"/>`).join('');
}

/** The keys of a phrase with their finger numbers, the one to play filled. */
function phraseKeys(p: Phrase, hit: number): KeyMark[] {
  const marks = new Map<number, KeyMark>();
  for (const k of p.keys) if (!marks.has(k.midi)) marks.set(k.midi, { midi: k.midi, fg: k.fg });
  const cur = p.keys[hit];
  if (cur) marks.set(cur.midi, { midi: cur.midi, fg: cur.fg, hot: true });
  return [...marks.values()];
}

/** The locked phrase at full size, read left to right, and what comes next. */
function consoleSvg(f: Foe, nx: Foe | null): string {
  const p = f.phrase;
  let h = '';
  if (p.kind === 'tab') {
    const sp = Math.min(150, 620 / p.notes.length);
    const cur = p.notes[Math.min(f.hit, p.notes.length - 1)];
    h += p.chord
      ? `<text x="8" y="26" class="ck">${L('HOLD', 'HALTE')}</text><text x="8" y="66" class="cn">${shapeOf(p.chord).name}</text>` + chordBox(shapeOf(p.chord), 96, 52, 104, NF, false, undefined, 32)
      : p.position
        ? `<text x="8" y="26" class="ck">POSITION</text><text x="8" y="66" class="cn">${L(`Fret ${p.position}`, `${p.position}. Bund`)}</text><text x="8" y="96" class="ck">${L('ONE FINGER', 'EIN FINGER')}</text><text x="8" y="114" class="ck">${L('PER FRET', 'PRO BUND')}</text>`
        : `<text x="8" y="26" class="ck">${L('MELODY', 'MELODIE')}</text><text x="8" y="66" class="cn">${f.hit}/${f.need}</text>`;
    h += `<text x="230" y="26" class="lk" fill="${NF.now}">${L('LOCKED', 'IM VISIER')} · ${f.id} · ${esc(p.label)}</text>`;
    h += `<text x="960" y="28" class="ins" text-anchor="end">${cur.fg ? L(`Fret ${cur.f} with finger ${cur.fg}`, `${cur.f}. Bund mit Finger ${cur.fg}`) : L(`Pluck the ${STRING_FULL[cur.s]} string${p.chord ? '' : cur.f ? ', fret ' + cur.f : ', open'}`, `Zupf die ${stringName(cur.s)}${p.chord ? '' : cur.f ? ', ' + cur.f + '. Bund' : ', leer'}`)}</text>`;
    for (let k = 0; k < 6; k++) h += `<line x1="230" x2="960" y1="${56 + k * 26}" y2="${56 + k * 26}" stroke="${NFX.rule}" stroke-width="1.5"/>`;
    [290, 960].forEach((x) => (h += `<line x1="${x}" x2="${x}" y1="56" y2="186" stroke="${NF.faint}" stroke-width="2"/>`));
    ['T', 'A', 'B'].forEach((c, k) => (h += `<text x="258" y="${98 + k * 32}" class="clef" style="font-size:24px" fill="${NFX.dim}">${c}</text>`));
    if (p.notes[0].fg) h += `<text x="232" y="214" class="clab" fill="${NF.muted}">FINGER</text>`;
    p.notes.forEach((n, k) => {
      const x = 340 + k * sp;
      for (const s of [n, ...(n.more ?? [])]) {
        const y = 56 + (5 - s.s) * 26;
        h +=
          k === f.hit
            ? `<circle cx="${x}" cy="${y}" r="21" fill="${NF.now}"/><text x="${x}" y="${y + 10.5}" class="tn big" fill="${NF.nowInk}">${s.f}</text>`
            : `<rect x="${x - 15}" y="${y - 14}" width="30" height="28" fill="${NF.panel}"/><text x="${x}" y="${y + 10.5}" class="tn big" fill="${k < f.hit ? NFX.dim : NF.text}">${s.f}</text>`;
      }
      if (n.fg) h += `<text x="${x}" y="215" class="nnum" style="fill:${k === f.hit ? NF.now : NF.muted}">${n.fg}</text>`;
    });
  } else if (p.kind === 'keys' && p.voice) {
    // sung: the notes as tiles with their names in the scale, and the tune's shape, higher notes higher
    const cur = p.keys[Math.min(f.hit, p.keys.length - 1)];
    const sp = Math.min(104, 730 / p.keys.length);
    h += `<text x="8" y="26" class="ck">${L('SING', 'SING')}</text><text x="8" y="66" class="cn">${f.hit}/${f.need}</text><text x="8" y="96" class="ck">${L('ON “LA”', 'AUF „LA“')}</text><text x="8" y="114" class="ck">${L('ANY OCTAVE', 'JEDE OKTAVE')}</text>`;
    h += `<text x="230" y="26" class="lk" fill="${NF.now}">${L('LOCKED', 'IM VISIER')} · ${f.id} · ${esc(p.label)}</text>`;
    h += `<text x="960" y="28" class="ins" text-anchor="end">${L(`Sing ${noteName(cur.midi)} and hold it`, `Sing ${noteName(cur.midi)} und halte ihn`)}</text>`;
    p.keys.forEach((n, k) => {
      const x = 230 + k * sp;
      const now = k === f.hit;
      h += `<rect x="${x}" y="42" width="${sp - 8}" height="40" rx="3" fill="${now ? NF.now : NF.panel}" stroke="${now ? NF.now : NFX.rule}" stroke-width="1.5"/><text x="${x + (sp - 8) / 2}" y="70" class="tn" style="font-size:${sp < 80 ? 19 : 24}px" fill="${now ? NF.nowInk : k < f.hit ? NFX.dim : NF.text}">${noteName(n.midi).replace(/\d+$/, '')}</text>`;
      if (p.words?.[k]) h += `<text x="${x + (sp - 8) / 2}" y="102" class="nnum" style="fill:${now ? NF.now : NF.muted}">${p.words[k]}</text>`;
    });
    // the tune's shape under its tiles: each note a dash at its height, higher notes higher
    const ms = p.keys.map((n) => n.midi);
    const top = Math.max(...ms);
    const span = Math.max(4, top - Math.min(...ms));
    p.keys.forEach((n, k) => {
      const yy = 122 + ((top - n.midi) / span) * 80;
      h += `<rect x="${230 + k * sp + 6}" y="${yy.toFixed(1)}" width="${sp - 20}" height="7" rx="3" fill="${k < f.hit ? NFX.dim : k === f.hit ? NF.now : NF.text}"/>`;
    });
  } else if (p.kind === 'keys') {
    const cur = p.keys[Math.min(f.hit, p.keys.length - 1)];
    const sp = Math.min(104, 730 / p.keys.length);
    h += `<text x="8" y="26" class="ck">${p.hand === 'left' ? L('LEFT HAND', 'LINKE HAND') : L('RIGHT HAND', 'RECHTE HAND')}</text>`;
    h += p.place ? `<text x="8" y="66" class="cn">${p.place.split(/[ -]/)[0]}</text><text x="8" y="96" class="ck">POSITION</text><text x="8" y="114" class="ck">${p.hand === 'left' ? L('LITTLE FINGER ON ', 'KLEINER FINGER AUF ') : L('THUMB ON ', 'DAUMEN AUF ')}${p.place[0]}</text>` : `<text x="8" y="66" class="cn">${f.hit}/${f.need}</text><text x="8" y="96" class="ck">${L('NOTES', 'NOTEN')}</text>`;
    h += `<text x="230" y="26" class="lk" fill="${NF.now}">${L('LOCKED', 'IM VISIER')} · ${f.id} · ${esc(p.label)}</text>`;
    h += `<text x="960" y="28" class="ins" text-anchor="end">${L(`Play ${noteName(cur.midi)}${cur.fg ? ` with finger ${cur.fg}` : ''}`, `Spiel ${noteName(cur.midi)}${cur.fg ? ` mit Finger ${cur.fg}` : ''}`)}</text>`;
    p.keys.forEach((n, k) => {
      const x = 230 + k * sp;
      const now = k === f.hit;
      h += `<rect x="${x}" y="42" width="${sp - 8}" height="40" rx="3" fill="${now ? NF.now : NF.panel}" stroke="${now ? NF.now : NFX.rule}" stroke-width="1.5"/><text x="${x + (sp - 8) / 2}" y="70" class="tn" style="font-size:${sp < 80 ? 19 : 24}px" fill="${now ? NF.nowInk : k < f.hit ? NFX.dim : NF.text}">${noteName(n.midi)}</text>`;
      if (n.fg) h += `<text x="${x + (sp - 8) / 2}" y="102" class="nnum" style="fill:${now ? NF.now : NF.muted}">${n.fg}</text>`;
    });
    const r = keyRange(p.keys.map((k) => k.midi), true);
    h += keyboard(phraseKeys(p, f.hit), NF, r.lowC, r.octaves, { x: 230, y: 112, w: 730, h: 108 });
  } else {
    const [a, b] = p.pair!;
    const tgt = Run.target(f);
    const col = (id: string): string => (id === tgt ? NF.now : NF.muted);
    const back = tgt === a && f.hit > 0;
    const name = (id: string): string => (p.piano ? chordName(id, true) : shapeOf(id).name);
    const size = (id: string): string => (name(id).length > 4 ? 'font-size:20px;' : '');
    h += `<text x="8" y="26" class="ck">${L('CHANGE', 'WECHSEL')}</text><text x="8" y="66" class="cn">${Math.max(0, f.hit - 1)} / ${f.need - 1}</text><text x="8" y="96" class="ck">${L('CLEAN CHANGES', 'SAUBERE WECHSEL')}</text>`;
    // how to make the change that comes next: which fingers stay, which keep their shape
    const from = f.hit === 0 ? a : tgt === a ? b : a;
    const to = f.hit === 0 ? b : tgt;
    h += `<text x="230" y="26" class="ct" fill="${NF.now}">${f.hit === 0 ? L(`Then to ${esc(name(to))}: `, `Dann zu ${esc(name(to))}: `) : ''}${esc(p.piano ? keyTip(from, to) : changeTip(shapeOf(from), shapeOf(to)))}</text><text x="838" y="60" class="ins">${L(`${f.hit === 0 ? (p.piano ? 'Play' : 'Strum') : 'Change to'} ${name(tgt)}`, f.hit === 0 ? (p.piano ? `Spiel ${name(tgt)}` : `Schlag ${name(tgt)} an`) : `Wechsel zu ${name(tgt)}`)}</text>`;
    if (p.piano) {
      // the two chords as keys, side by side over the same stretch of keyboard
      h += `<text x="364" y="68" class="cn" text-anchor="middle" style="font-size:24px;fill:${col(a)}">${name(a)}</text>` + keyChord(a, NF, { x: 232, y: 78, w: 264, h: 136 }, tgt === a, [a, b]);
      h += `<path d="M${back ? 544 : 508} 146h${back ? -36 : 36}m${back ? 10 : -10} -8l${back ? -10 : 10} 8 ${back ? 10 : -10} 8" fill="none" stroke="${NF.now}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      h += `<text x="688" y="68" class="cn" text-anchor="middle" style="font-size:24px;fill:${col(b)}">${name(b)}</text>` + keyChord(b, NF, { x: 556, y: 78, w: 264, h: 136 }, tgt === b, [a, b]);
    } else {
      h += `<text x="322" y="146" class="cn" text-anchor="end" style="${size(a)}fill:${col(a)}">${shapeOf(a).name}</text>` + chordBox(shapeOf(a), 342, 54, 135, NF, tgt === a, undefined, 33);
      h += `<path d="M${back ? 540 : 504} 136h${back ? -36 : 36}m${back ? 10 : -10} -8l${back ? -10 : 10} 8 ${back ? 10 : -10} 8" fill="none" stroke="${NF.now}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      h += `<text x="640" y="146" class="cn" text-anchor="end" style="${size(b)}fill:${col(b)}">${shapeOf(b).name}</text>` + chordBox(shapeOf(b), 660, 54, 135, NF, tgt === b, undefined, 33);
    }
    const lastGap = f.gaps[f.gaps.length - 1];
    h += `<text x="838" y="98" class="ck">${L('LAST CHANGE', 'LETZTER WECHSEL')}</text><text x="838" y="132" class="rd">${lastGap ? tenths(lastGap) + ' s' : '–'}</text><text x="838" y="162" class="ck">${L('30 A MINUTE = 2.0 S', '30 PRO MINUTE = 2,0 S')}</text>`;
  }
  if (nx) {
    const q = nx.phrase;
    h += `<text x="1004" y="26" class="lk" fill="${NF.muted}">${L('NEXT', 'DANACH')}</text><text x="1004" y="46" class="clab" fill="${NF.muted}">${q.kind === 'chg' ? L('CHANGE', 'WECHSEL') : esc(q.label)}</text>`;
    if (q.kind === 'tab') {
      for (let k = 0; k < 6; k++) h += `<line x1="1004" x2="1194" y1="${72 + k * 17}" y2="${72 + k * 17}" stroke="${NFX.rule}" stroke-width="1.2"/>`;
      const sp = Math.min(46, 176 / q.notes.length);
      q.notes.forEach((n, k) => {
        const x = 1020 + k * sp;
        const y = 72 + (5 - n.s) * 17;
        h += `<rect x="${x - 7}" y="${y - 8}" width="14" height="16" fill="${NF.panel}"/><text x="${x}" y="${y + 5.5}" class="nnum">${n.f}</text>`;
      });
    } else if (q.kind === 'keys') h += contour(q, 1004, 72, 190, 80, 0, false);
    else h += `<text x="1004" y="120" class="cn" style="font-size:28px;fill:${NF.muted}">${esc(q.label)}</text>`;
  }
  return h;
}

export const nfRun: Screen = (root, [t, short, again], ctx) => {
  const type: RunType = TYPES.find((x) => x === t) ?? (store.settings.instrument === 'voice' ? 'sing' : store.settings.instrument === 'piano' ? 'keys' : 'song');
  // the guitar's changes are played on a groove, with the band (screens/nightrun.ts)
  if (type === 'changes') return grooveRun(root, ctx, { night: false, waves: Number(short) || 0, again: !!again });
  const piano = isPianoRun(type);
  const voice = isVoiceRun(type);
  // the first run of a kind starts slowly
  const startSpeed = Math.max(50, Math.min(130, storedSpeed(type)));
  const began = Date.now();
  const phrases = pool(type);
  const run = new Run(type, phrases, (k) => store.skills.weight(k, began), {
    speed: startSpeed,
    // as a step of the guided session a run is short and has no boss
    waves: ctx ? 2 : Math.max(1, Math.min(6, Number(short) || 6)),
    boss: ctx ? null : voice ? voiceScaleBoss(...voiceRange()) : piano ? scaleBoss(store.skills.level('scale:C') >= 4 ? 'G' : 'C') : chordBoss(bossChord()),
  });
  const hasNotes = phrases.some((p) => p.kind !== 'chg');
  const hasChords = phrases.some((p) => p.kind === 'chg');
  const mutePause = !piano && !voice && store.settings.mutePause;
  /** the Mute of the piano and of the voice is a scale, drawn on a keyboard */
  const keyed = piano || voice;
  const previous = store.lastRun(type);
  const ups: string[] = [];
  let view = '';
  let paused = false;
  let raf = 0;
  let last = 0;
  let bannerTimer = 0;
  /** the picture: one canvas for the whole run, so that the evening goes on from wave to wave */
  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.className = 'world';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', L('A lighthouse at nightfall. Noise comes in over the sea, each piece with a phrase on a slip of paper. The framed one is the one you are playing.', 'Ein Leuchtturm bei Einbruch der Nacht. Rauschen kommt über das Meer, jeder Fetzen mit einer Phrase auf einem Zettel. Der eingerahmte ist der, den du gerade spielst.'));
  // for looking at an hour of the night without playing up to it: ?hour=3 in the address
  const hourShift = Number(new URLSearchParams(location.search).get('hour')) || 0;
  const scene = new Watch(canvas, hourOf(1, run.waves) + hourShift);
  /** the run is over and its picture is coming to an end, before the debrief takes its place */
  let closing = 0;
  let debriefed = false;
  let chordSet = '';
  let bossTip = '';
  /** two hits on muted strings and then nothing pause the run and start it again */
  const gesture = new MuteGesture();
  let stopMenu: () => void = () => undefined;
  let summary: RunSummary | null = null;
  let restarted: void | (() => void);
  /**
   * Nothing moves before the player is ready: first what this run is and what it will ask for, then, on the
   * player's signal, a count of four with the first phrase already on show, and only then does the noise fall.
   */
  let gate: 'brief' | 'count' | 'go' = 'brief';
  let countTimers: number[] = [];
  /** the chords this run can ask for, in the shapes it will show */
  const runChords = [...new Set(phrases.flatMap((p) => (p.kind === 'chg' ? p.pair! : p.chord ? [p.chord] : [])).map((c) => (piano ? c : shapeOf(c).id)))];

  root.innerHTML = `<header class="hud">
      <div class="g"><a class="hb leave" href="${ctx ? '#/' : '#/nf'}">${ctx ? L('✕ End session', '✕ Session beenden') : L('‹ Games', '‹ Spiele')}</a><span class="k" style="color:var(--now)">${ctx ? ctx.label + ' · ' : ''}${NAMES[type]}</span><span class="k">${L('Wave', 'Welle')}</span><b><span id="wave">1</span><small>/${run.waves}</small></b></div>
      <div class="g"><span class="k">${L('Score', 'Punkte')}</span><b id="score">0</b><span class="mult" id="mult">×1</span></div>
      <div class="g"><span class="k">${L('Lamp', 'Lampe')}</span><span class="integ" id="integ"></span>${micMeter()}<button class="hb" id="pause" aria-pressed="false"><span>${L('Pause', 'Pause')}</span><kbd>${L('Space', 'Leertaste')}</kbd></button>${ctx ? `<button class="hb" id="skipstep">${L('Next step', 'Nächster Schritt')}</button>` : ''}</div>
    </header>
    <div id="mid" style="flex:1;display:flex;flex-direction:column;position:relative"></div>
    ${practiceBar()}
    <footer class="hints" id="hints"></footer>`;
  const mid = $('#mid', root);
  // the picture lies behind everything, the whole run long
  root.prepend(canvas);

  function banner(text: string, ms = 1800, big = false): void {
    const el = $('#banner', root);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('count', big);
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => (el.hidden = true), ms);
  }

  /** Before the run: what it is, what it will ask for, and how to start it. */
  function brief(): void {
    view = 'brief';
    mid.dataset.gate = gate;
    const l = engine.listener;
    if (l) {
      l.cancelStringCheck();
      l.expected = null;
      // the start signal from the instrument: one of the run's chords, or any note where there are no chords
      l.chordCandidates = !hasNotes && runChords.length ? runChords : null;
      l.noteDetection = hasNotes && !voice;
    }
    const names = runChords.map((c) => chordName(c, piano));
    const title =
      type === 'changes' || type === 'kchanges'
        ? L(`Chord changes: ${names.length > 4 ? `${names.length} chords` : names.join(names.length === 2 ? ' and ' : ', ')}`, `Akkordwechsel: ${names.length > 4 ? `${names.length} Akkorde` : names.join(names.length === 2 ? ' und ' : ', ')}`)
        : type === 'fingers'
          ? L('Finger gym: one finger per fret', 'Fingertraining: ein Finger pro Bund')
          : type === 'keys'
            ? L('Finger gym: five fingers, five keys', 'Fingertraining: fünf Finger, fünf Tasten')
            : type === 'sing'
              ? L('Voice gym: sung patterns', 'Stimmtraining: gesungene Muster')
              : type === 'ssong'
                ? L(`Song run: ${currentSongToSing().title}`, `Songrunde: ${currentSongToSing().title}`)
                : type === 'song'
              ? L(`Song run: ${currentSong().title}`, `Songrunde: ${currentSong().title}`)
              : L(`Piece run: ${currentPiece().title}`, `Stückrunde: ${currentPiece().title}`);
    // one line: the first wave shows the rest
    const what = voice
      ? L('Sing the tune of the framed piece on “la” to strike it. Any octave counts.', 'Sing die Melodie des eingerahmten Teils auf „la“, um es zu treffen. Jede Oktave zählt.')
      : hasNotes
        ? piano
          ? L('Play the keys of the framed piece, left to right, to strike it.', 'Spiel die Tasten des eingerahmten Teils von links nach rechts, um es zu treffen.')
          : L('Play the tab of the framed piece, left to right, to strike it.', 'Spiel die Tabulatur des eingerahmten Teils von links nach rechts, um es zu treffen.')
        : L(`${piano ? 'Play' : 'Strum'} its two chords in turn, there and back, to strike a piece.`, `${piano ? 'Spiel' : 'Schlag'} seine zwei Akkorde abwechselnd${piano ? '' : ' an'}, hin und zurück, um ein Teil zu treffen.`);
    const start = menuOn() ? (hasNotes ? L('or play any note', 'oder spiel irgendeinen Ton') : L(`or ${piano ? 'play' : 'strum'} ${names.length > 1 ? 'one of these chords' : names[0]}`, piano ? `oder spiel ${names.length > 1 ? 'einen dieser Akkorde' : names[0]}` : `oder schlag ${names.length > 1 ? 'einen dieser Akkorde' : names[0]} an`)) : '';
    mid.innerHTML = `<div class="page mid" id="brief">
        <div><p class="kick">${ctx ? ctx.label + ' · ' : ''}${NAMES[type]} · ${L(`${run.waves} ${run.waves === 1 ? 'wave' : 'waves'}${run.boss ? ', then the Mute' : ''}`, `${run.waves} ${run.waves === 1 ? 'Welle' : 'Wellen'}${run.boss ? ', dann die Stille' : ''}`)}</p><h1>${esc(title)}</h1></div>
        <div class="${runChords.length ? 'brief2' : 'side'}">
          ${runChords.length ? `<div class="shapes${runChords.length > 3 ? ' many' : ''}${piano ? ' keysfig' : ''}" role="list" aria-label="${L('The chords of this run', 'Die Akkorde dieser Runde')}">${runChords.map((c) => (piano ? `<figure role="listitem"><svg viewBox="0 0 220 150" role="img" aria-label="${L(`The keys of ${chordName(c, true)}`, `Die Tasten von ${chordName(c, true)}`)}">${keyChord(c, NF, { x: 4, y: 8, w: 212, h: 134 }, false, runChords)}</svg><figcaption>${chordName(c, true)}</figcaption></figure>` : `<figure role="listitem"><svg viewBox="0 0 170 190" role="img" aria-label="${L(`Chord diagram of ${CHORDS[c].name}`, `Griffbild von ${CHORDS[c].name}`)}">${chordBox(CHORDS[c], 30, 34, 110, NF, false, undefined, 28)}</svg><figcaption>${CHORDS[c].name}</figcaption></figure>`)).join('')}</div>` : ''}
          <div class="side">
            <p class="lede">${what}</p>
            <div class="row"><button class="btn primary big" id="begin">${L('Start', 'Starten')} <kbd>${L('Space', 'Leertaste')}</kbd></button><span class="note">${start ? L(cap(start) + ' to start. ', cap(start) + ', um zu starten. ') : ''}${L('It counts to four first.', 'Erst wird bis vier gezählt.')}</span></div>
          </div>
        </div>
      </div>`;
    $('#hints', root).innerHTML = '';
    $('#begin', root).onclick = begin;
    // nothing to pause yet
    $('#pause', root).hidden = true;
    hud();
  }

  /** The player is ready: the first piece of noise appears, four counts, then it falls. */
  function begin(): void {
    if (gate !== 'brief') return;
    gate = 'count';
    mid.dataset.gate = gate;
    $('#pause', root).hidden = false;
    // the first phrase is on show during the count, so that the hand can get ready
    run.update(0);
    layout();
    drawPlaying();
    scene.draw(run, performance.now() / 1000, false);
    const BEAT = 0.75;
    const t0 = engine.now() + 0.25;
    for (let k = 0; k < 4; k++) {
      if (store.settings.click > 0) engine.tick(t0 + k * BEAT, k === 0, store.settings.click, store.settings.clickSound === 'click');
      countTimers.push(window.setTimeout(() => banner(String(k + 1), BEAT * 1000 + 200, true), (0.25 + k * BEAT) * 1000));
    }
    countTimers.push(
      window.setTimeout(() => {
        gate = 'go';
        mid.dataset.gate = gate;
        last = 0;
        banner(L('Go', 'Los'), 700, true);
      }, (0.25 + 4 * BEAT) * 1000),
    );
  }

  /** Rebuilds the middle of the screen when the run moves on to another phase. */
  function layout(): void {
    view = run.state;
    stopMenu();
    stopMenu = () => undefined;
    const l = engine.listener;
    if (l) {
      l.cancelStringCheck();
      l.expected = null;
      l.chordCandidates = null;
      l.noteDetection = view === 'playing' && hasNotes && !voice;
    }
    chordSet = '';
    setSimTarget(null);
    if (view === 'playing') {
      mid.innerHTML = `<div class="arena" id="arena"><div class="banner" id="banner" hidden></div></div>
        <div class="console"><svg id="con" viewBox="0 0 1200 226" role="img" aria-label="${L('The locked phrase at full size, read left to right, with the next phrase on the right', 'Die anvisierte Phrase in voller Größe, von links nach rechts gelesen, rechts daneben die nächste Phrase')}"></svg></div>`;
      scene.over = $('#arena', root);
      scene.aim(hourOf(run.wave, run.waves) + hourShift);
      const perks = [...run.perks].map((id) => ({ grid: L('even timing ×2', 'gleichmäßiges Timing ×2'), ring: L('ringing notes ×2', 'klingende Noten ×2'), chain: L('chain to ×12', 'Kette bis ×12'), slow: L('heavy air', 'schwere Luft'), shield: L('spare wick', 'Ersatzdocht'), burst: L('clean sweep', 'reiner Tisch'), change: L('quick change ×2', 'schneller Wechsel ×2') })[id]).filter(Boolean);
      $('#hints', root).innerHTML = `<span><b>${L('Pause', 'Pause')}</b>${L(`Space${mutePause ? ' or two muted hits' : ''}`, `Leertaste${mutePause ? ' oder zwei gedämpfte Anschläge' : ''}`)}</span>${perks.length ? `<span><b>${L('Upgrades', 'Upgrades')}</b>${perks.join(' · ')}</span>` : ''}`;
    } else if (view === 'boss') {
      const b = run.boss!;
      mid.innerHTML = `<div class="arena" id="boss" aria-label="${L(`The Mute: a black disc over the sea, held shut by a ring of seals, one for each ${voice ? 'note of the scale' : piano ? 'key of the scale' : 'string of the chord'}`, `Die Stille: eine schwarze Scheibe über dem Meer, verschlossen von einem Ring aus Siegeln, ${voice ? 'eines für jeden Ton der Tonleiter' : piano ? 'eines für jede Taste der Tonleiter' : 'eines für jede Saite des Akkords'}`)}"><div class="banner" id="banner" hidden></div></div>
        <div class="bossc${keyed ? ' wide' : ''}"><svg id="bbox" viewBox="${keyed ? '0 0 460 200' : '0 0 230 200'}" role="img" aria-label="${keyed ? L('Keyboard with the notes of the scale', 'Tastatur mit den Tönen der Tonleiter') : L('Chord diagram', 'Griffbild')}"></svg><div><h1 id="bh1" aria-live="polite"></h1><p class="tip" id="btip"></p><div class="tiles${keyed ? ' eight' : ''}" id="btiles" role="list" aria-label="${voice ? L('Result for each note', 'Ergebnis für jeden Ton') : L(`Result for each ${piano ? 'key' : 'string'}`, `Ergebnis für jede ${piano ? 'Taste' : 'Saite'}`)}"></div></div></div>`;
      $('#hints', root).innerHTML = `<span><b>${L('The Mute', 'Die Stille')}</b>${voice ? L(`${b.name}: a seal breaks when its note is held on pitch`, `${b.name}: Ein Siegel bricht, wenn sein Ton sauber gehalten wird`) : L(`${b.name}: a seal breaks when its ${piano ? 'key' : 'string'} rings clean`, `${b.name}: Ein Siegel bricht, wenn seine ${piano ? 'Taste' : 'Saite'} sauber klingt`)}</span><span><b>${L('No clock', 'Keine Uhr')}</b>${L('take your time', 'lass dir Zeit')}</span><span><button class="hb" id="giveup">${L('Leave the Mute', 'Die Stille verlassen')} <kbd>G</kbd></button></span>`;
      $('#giveup', root).onclick = () => run.bossGiveUp();
      scene.over = $('#boss', root);
      scene.aim(STORM);
      banner(L('The Mute', 'Die Stille'), 2200);
      drawBoss();
    } else if (view === 'perk') {
      scene.over = null;
      mid.innerHTML = `<div class="page mid"><div><p class="kick">${L(`Wave ${run.wave} of ${run.waves} cleared`, `Welle ${run.wave} von ${run.waves} geschafft`)}</p><h1>${L('Pick one.', 'Wähl eins.')}</h1>${pickState()}</div>
        <div class="cards">${run.offered.map((p, i) => `<button class="card" data-perk="${p.id}"><h2>${p.name}</h2><p>${p.text}</p><span class="pick">${pickHint(i, piano)}</span></button>`).join('')}</div></div>`;
      $('#hints', root).innerHTML = '';
      const pick = (i: number): void => {
        if (run.offered[i]) run.choosePerk(run.offered[i].id);
      };
      mid.querySelectorAll<HTMLElement>('[data-perk]').forEach((b, i) => (b.onclick = () => pick(i)));
      stopMenu = pickMenuKeepingRun(pick);
    } else {
      // the results are kept at once; the picture gets a moment to end before the debrief takes its place
      settle();
      scene.end(run.state === 'won');
      if (root.querySelector('#banner')) {
        banner(run.state === 'won' ? L('The light held', 'Das Licht hat gehalten') : L('The light is out', 'Das Licht ist aus'), 4000);
        closing = window.setTimeout(debrief, 2600);
      } else debrief();
    }
  }

  /** The upgrade menu listens through the run's own connection to the listener, so it only changes what it listens for. */
  function pickMenuKeepingRun(pick: (i: number) => void): () => void {
    const l = engine.listener;
    if (!l || !menuOn()) return () => undefined;
    // the run was just being played: the menu listens only once the instrument has been quiet
    const gate = armed(root, pick, piano);
    if (piano) {
      l.noteDetection = true;
      menuPick = (midi, conf) => {
        const i = [0, 2, 4].indexOf(midi % 12);
        gate.heard(i >= 0 && conf > 0.7 ? i : -1);
      };
    } else {
      l.chordCandidates = STRUM;
      menuStrum = (id, score, margin) => {
        const i = STRUM.indexOf(id);
        gate.heard(i >= 0 && score > 0.8 && margin > 0.12 ? i : -1);
      };
    }
    return () => {
      gate.stop();
      menuPick = null;
      menuStrum = null;
    };
  }
  let menuPick: ((midi: number, conf: number) => void) | null = null;
  let menuStrum: ((id: string, score: number, margin: number) => void) | null = null;

  /** What goes with the picture of a wave: what the listener is to expect, and the phrase at full size. */
  function drawPlaying(): void {
    const l = run.locked();
    const lis = engine.listener;
    if (lis) {
      const want = run.expectedMidis();
      lis.expected = want.length ? want : null;
      const ids = run.chordIds();
      if (ids.join() !== chordSet) {
        chordSet = ids.join();
        lis.chordCandidates = ids.length ? ids : null;
      }
    }
    // the console is only drawn again when what it shows has changed
    const shown = l ? `${l.id}:${l.hit}:${l.gaps.length}:${run.nextUp()?.id ?? ''}` : `wave${run.wave}`;
    if (shown !== conShown) {
      conShown = shown;
      $('#con', root).innerHTML = l ? consoleSvg(l, run.nextUp()) : `<text x="600" y="120" class="ins" text-anchor="middle" style="fill:${NF.muted}">${L(`Wave ${run.wave}: incoming`, `Welle ${run.wave}: im Anflug`)}</text>`;
    }

    // for whoever watches from outside: how far the nearest piece has come, 0 at the edge, 1 at the lamp
    canvas.dataset.near = l ? (l.y / LAND_Y).toFixed(3) : '';
    const p = l?.phrase;
    setSimTarget(!l || !p ? null : p.voice ? { kind: 'note', midi: p.midis[l.hit][0], voice: true } : p.kind === 'chg' ? { kind: 'chord', id: Run.target(l), piano: p.piano } : { kind: 'note', midi: p.midis[l.hit][0], piano: p.kind === 'keys', string: p.kind === 'tab' ? p.notes[l.hit].s : undefined });
  }
  let conShown = '';

  function drawBoss(): void {
    const b = run.boss;
    if (!b || view !== 'boss') return;
    const n = b.steps.length;
    const at = Math.min(b.at, n - 1);
    const st = b.steps[at];
    const lastRes = b.results[b.at];
    const failed = lastRes && lastRes !== 'clean';
    if (b.chord) {
      const chord = CHORDS[b.chord];
      const marks = chord.frets.map((f, i) => {
        const k = b.steps.findIndex((x) => x.string === i);
        return f < 0 ? null : k === b.at ? 'now' : b.results[k];
      });
      $('#bbox', root).innerHTML = `<text x="8" y="26" class="ck">${L('HOLD', 'HALTE')}</text><text x="8" y="66" class="cn" style="font-size:${chord.name.length > 4 ? 19 : 36}px">${chord.name}</text>` + chordBox(chord, 114, 44, 100, NF, false, marks, 29);
      $('#bh1', root).innerHTML = failed
        ? L(`${st.label} ${lastRes === 'muted' ? 'is muted' : lastRes === 'buzz' ? 'buzzes' : 'was not it'}. Pluck the <em>${STRING_FULL[st.string!]} string</em> again.`, `${lastRes === 'muted' ? `Die ${st.label}-Saite ist abgedämpft` : lastRes === 'buzz' ? `Die ${st.label}-Saite schnarrt` : `Das war nicht die ${st.label}-Saite`}. Zupf die <em>${stringName(st.string!)}</em> noch einmal.`)
        : L(`Hold ${chord.name}. Pluck the <em>${STRING_FULL[st.string!]} string</em>.`, `Halte ${chord.name}. Zupf die <em>${stringName(st.string!)}</em>.`);
      $('#btip', root).textContent = bossTip || L('One string at a time, low to high. A seal only breaks when its string rings clean.', 'Eine Saite nach der anderen, von tief nach hoch. Ein Siegel bricht nur, wenn seine Saite sauber klingt.');
    } else {
      const marks: KeyMark[] = b.steps.map((x, i) => ({ midi: x.midi, fg: x.fg, hot: i === b.at, done: b.results[i] === 'clean' }));
      const r = keyRange(b.steps.map((x) => x.midi), true);
      $('#bbox', root).innerHTML = keyboard(marks, NF, r.lowC, r.octaves, { x: 4, y: 8, w: 452, h: 184 });
      if (voice) {
        $('#bh1', root).innerHTML = failed ? L(`Not yet. Sing <em>${noteName(st.midi)}</em> (${st.label}) again and hold it.`, `Noch nicht. Sing <em>${noteName(st.midi)}</em> (${st.label}) noch einmal und halte ihn.`) : L(`Sing <em>${noteName(st.midi)}</em> (${st.label}) and hold it.`, `Sing <em>${noteName(st.midi)}</em> (${st.label}) und halte ihn.`);
        $('#btip', root).textContent = bossTip || L('One note at a time, up the scale. A seal breaks when its note is held on pitch for half a second; any octave counts.', 'Ein Ton nach dem anderen, die Tonleiter hinauf. Ein Siegel bricht, wenn sein Ton eine halbe Sekunde sauber gehalten wird; jede Oktave zählt.');
      } else
      $('#bh1', root).innerHTML = failed
        ? L(`${st.label} ${lastRes === 'wrong' ? 'was not it' : 'was cut short'}. Play <em>${noteName(st.midi)}</em> again and hold it.`, `${lastRes === 'wrong' ? `Das war nicht ${st.label}` : `${st.label} war zu kurz`}. Spiel <em>${noteName(st.midi)}</em> noch einmal und halte ihn.`)
        : L(`Play <em>${noteName(st.midi)}</em> with finger ${st.fg} and let it ring.`, `Spiel <em>${noteName(st.midi)}</em> mit Finger ${st.fg} und lass ihn klingen.`);
      if (!voice) $('#btip', root).textContent = bossTip || (st.fg === 1 && at > 0 ? L('Pass the thumb under the third finger to reach this key.', 'Führ den Daumen unter dem dritten Finger durch, um diese Taste zu erreichen.') : L('One key at a time, going up. A seal only breaks when its key rings on.', 'Eine Taste nach der anderen, aufwärts. Ein Siegel bricht nur, wenn seine Taste weiterklingt.'));
    }
    // the word on each tile, in German too (the class keeps the English result)
    const DE: Record<string, string> = { clean: 'sauber', muted: 'abgedämpft', buzz: 'schnarrt', wrong: 'falsch', short: 'zu kurz', now: 'jetzt', next: 'danach' };
    $('#btiles', root).innerHTML = b.steps
      .map((x, i) => {
        const r = b.results[i];
        const word = r === 'muted' && piano ? 'short' : (r ?? (i === b.at ? 'now' : 'next'));
        return `<div class="tile ${r ?? ''}${i === b.at ? ' now' : ''}" role="listitem"${i === b.at ? ' aria-current="true"' : ''}><b>${x.label}</b><span>${L(word, DE[word])}</span></div>`;
      })
      .join('');
    // when the last seal is down there is nothing left to listen for
    if (run.state !== 'boss') {
      $('#bh1', root).textContent = L('Every seal is down.', 'Alle Siegel sind gebrochen.');
      $('#btip', root).textContent = '';
      setSimTarget(null);
      return;
    }
    if (voice) {
      setSimTarget({ kind: 'note', midi: st.midi, voice: true });
      return;
    }
    setSimTarget({ kind: 'note', midi: st.midi, piano, string: st.string });
    engine.listener?.startStringCheck(st.midi);
  }

  /** The run is over: store what it proved. */
  function settle(): void {
    const now = Date.now();
    for (const m of run.measurements()) {
      if (!m.key.startsWith('chord:') && !m.key.startsWith('scale:')) continue;
      const ch = store.skills.record(m.key, m.value, now, m.strings);
      if (ch.after > ch.before) ups.push(L(`${skillLabel(m.key)}: level ${ch.after}`, `${skillLabel(m.key)}: Stufe ${ch.after}`));
    }
    const rows: RunRow[] = [...run.stats].map(([key, s]) => ({ key, label: s.label, sent: s.sent, cleared: s.cleared, avg: s.times.length ? s.times.reduce((a, b) => a + b, 0) / s.times.length : 0 }));
    summary = { t: now, type, score: run.score, wave: run.wave, waves: run.waves, rows };
    store.runs.push(summary);
    store.best[type] = Math.max(store.best[type] ?? 0, run.score);
    store.speeds[type] = Math.round(Math.max(50, Math.min(130, run.speed)));
    store.save();
  }

  /** What the run made the player play, and how it went: one sentence, three gains, the way on; the table behind "Details". */
  function debrief(): void {
    if (debriefed || !summary) return;
    debriefed = true;
    clearTimeout(closing);
    scene.over = null;
    const now = summary.t;
    const rows = summary.rows;
    const b: Boss | null = run.boss;
    const weak = rows.filter((r) => r.cleared < r.sent).sort((a, c) => a.cleared / a.sent - c.cleared / c.sent)[0] ?? rows.slice().sort((a, c) => c.avg - a.avg)[0];
    const unit = hasNotes ? (hasChords ? 's' : L('s per phrase', 's pro Phrase')) : L('s per change', 's pro Wechsel');
    const head = run.state === 'over' ? L(`The light went out in wave ${run.wave}: ${num(run.score)} points.`, `Das Licht ging in Welle ${run.wave} aus: ${num(run.score)} Punkte.`) : L(`The light held: ${num(run.score)} points.`, `Das Licht hat gehalten: ${num(run.score)} Punkte.`);
    const sent = rows.reduce((n, r) => n + r.sent, 0);
    const cleared = rows.reduce((n, r) => n + r.cleared, 0);
    const what = voice ? L('notes', 'Töne') : piano ? L('keys', 'Tasten') : L('strings', 'Saiten');
    const gains = [
      ...ups.slice(0, 1).map((u) => u + '.'),
      ...(previous && run.score >= (store.best[type] ?? 0) ? [L('Your best run of this kind so far.', 'Deine beste Runde dieser Art bisher.')] : []),
      ...(b && b.startT >= 0 ? [L(`The Mute: ${b.results.filter((r) => r === 'clean').length} of ${b.steps.length} ${what} clean.`, `Die Stille: ${b.results.filter((r) => r === 'clean').length} von ${b.steps.length} ${what} sauber.`)] : []),
      ...(sent ? [L(`${cleared} of ${sent} pieces struck.`, `${cleared} von ${sent} Teilen getroffen.`)] : []),
      ...(weak ? [L(`Next time more of ${weak.label}, at ${storedSpeed(type)}% speed.`, `Nächstes Mal mehr von ${weak.label}, bei ${storedSpeed(type)} % Tempo.`)] : []),
    ];
    mid.innerHTML = `<div class="page mid">
      <div><p class="kick">${NAMES[type]} · ${Math.max(1, Math.round((now - began) / 60000))} min</p>
        <h1>${head}</h1></div>
      <ul class="night-gains">${gains
        .slice(0, 3)
        .map((g) => `<li>${esc(g)}</li>`)
        .join('')}</ul>
      <div class="row">${ctx ? `<button class="btn primary" id="rerun">${L('Next step', 'Weiter')} <kbd>${L('Space', 'Leertaste')}</kbd></button><span class="note">${L(`Next: ${esc(ctx.after)}.`, `Als Nächstes: ${esc(ctx.after)}.`)}</span>` : `<button class="btn primary" id="rerun">${L('Again', 'Nochmal')} <kbd>${L('Space', 'Leertaste')}</kbd></button><a class="btn" id="onward" href="#/nf">${L('Go on', 'Weiter')}</a>`}</div>
      <details class="night-more"><summary>${L('Details', 'Details')}</summary><div class="scroll"><table><thead><tr><th>${L('Phrase', 'Phrase')}</th><th>${L('Level', 'Stufe')}</th><th class="n">${L('Sent', 'Geschickt')}</th><th class="n">${L('Cleared', 'Geschafft')}</th><th class="n">${L(`Avg ${unit}`, `Schnitt ${unit}`)}</th><th class="n">${L('vs last run', 'vs. letzte Runde')}</th></tr></thead><tbody>
        ${rows
          .map((r) => {
            const old = previous?.rows.find((o) => o.key === r.key);
            const diff = old && old.avg && r.avg ? r.avg - old.avg : null;
            return `<tr><td>${esc(r.label)}${r === weak && (r.cleared < r.sent || rows.length > 1) ? `<span class="tag weak">${L('weakest', 'am schwächsten')}</span>` : ''}</td><td>${pips(store.skills.level(r.key))}</td><td class="n">${r.sent}</td><td class="n">${r.cleared}</td><td class="n">${r.avg ? tenths(r.avg) + ' s' : '–'}</td><td class="n">${diff === null ? '–' : (diff <= 0 ? '−' : '+') + tenths(Math.abs(diff)) + ' s'}</td></tr>`;
          })
          .join('')}
        ${b ? `<tr><td>${L('The Mute', 'Die Stille')} · ${b.name}</td><td>${pips(store.skills.level(b.key))}</td><td class="n">1</td><td class="n">${L(`${b.results.filter((r) => r === 'clean').length} of ${b.steps.length} ${voice ? 'notes' : piano ? 'keys' : 'strings'}`, `${b.results.filter((r) => r === 'clean').length} von ${b.steps.length} ${voice ? 'Tönen' : piano ? 'Tasten' : 'Saiten'}`)}</td><td class="n">${b.endT >= 0 ? tenths(b.endT - b.startT) + ' s' : '–'}</td><td class="n">–</td></tr>` : ''}
      </tbody></table></div></details>
    </div>`;
    $('#hints', root).innerHTML = '';
    $('#pause', root).hidden = true;
    $('#rerun', root).onclick = rerun;
  }

  function rerun(): void {
    if (ctx) {
      ctx.next();
      return;
    }
    dispose();
    // the same run again: no need to explain it twice, but it still counts in
    restarted = nfRun(root, [type, short ?? '', 'again']);
  }

  function onEvent(e: RunEvent, ts: number): void {
    if (e.type === 'hit') {
      scene.hit(e.id);
      engine.chime('hit', store.settings.chimes);
    } else if (e.type === 'clear') {
      scene.cleared(e.id, `${e.bonus ? e.bonus + ' ' : ''}+${e.gain}`);
      engine.chime('clear', store.settings.chimes);
      if (e.value !== null) {
        const ch = store.skills.record(e.key, e.value, Date.now());
        if (ch.after > ch.before) {
          ups.push(L(`${skillLabel(e.key)}: level ${ch.after}`, `${skillLabel(e.key)}: Stufe ${ch.after}`));
          store.save();
          banner(L(`${skillLabel(e.key)} · level ${ch.after}`, `${skillLabel(e.key)} · Stufe ${ch.after}`), 2600);
        }
      }
    } else if (e.type === 'floor') {
      scene.landed(e.id);
      engine.chime('blow', store.settings.chimes);
      banner(L('The lamp was struck', 'Die Lampe wurde getroffen'));
    } else if (e.type === 'miss') scene.missed();
    else if (e.type === 'wave') banner(L(`Wave ${e.wave}`, `Welle ${e.wave}`));
    void ts;
  }

  function hud(): void {
    $('#wave', root).textContent = String(run.wave);
    $('#score', root).textContent = num(run.score);
    $('#mult', root).textContent = '×' + run.mult;
    const integ = $('#integ', root);
    if (integ.childElementCount !== run.maxIntegrity || integ.querySelectorAll('.f').length !== run.integrity) integ.innerHTML = Array.from({ length: run.maxIntegrity }, (_, i) => `<i class="${i < run.integrity ? 'f' : ''}"></i>`).join('');
  }

  function frame(ts: number): void {
    raf = requestAnimationFrame(frame);
    const backdrop = gate === 'brief' || debriefed;
    if (backdrop && !backdropDue(ts)) return;
    // the picture's size is read before anything is written into the page in this frame
    scene.measure();
    if (backdrop) {
      scene.draw(gate === 'brief' ? null : run, ts / 1000, false);
      return;
    }
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    if (!paused && gate === 'go') run.update(dt);
    if (gate === 'go' && gesture.due(engine.listener?.time ?? 0)) setPaused(!paused);
    for (const e of run.events.splice(0)) onEvent(e, ts);
    if (run.state !== view && !summary) layout();
    if (view === 'playing' && !summary) drawPlaying();
    scene.draw(run, ts / 1000, !paused && gate === 'go');
    hud();
  }
  const backdropDue = slowly();

  /**
   * Notes are timed on the listener's clock, which goes on through a pause: the run is told how long the
   * pause was, and what was played during it does not count, even when it is reported a moment after.
   */
  let pausedAt = -1;
  let playFrom = -Infinity;
  function setPaused(v: boolean): void {
    if (summary || view !== 'playing' || gate !== 'go' || v === paused) return;
    conShown = '';
    paused = v;
    if (v) pausedAt = engine.now();
    else if (pausedAt >= 0) {
      playFrom = engine.now();
      run.resumed(playFrom - pausedAt);
      pausedAt = -1;
    }
    const b = $('#pause', root);
    b.setAttribute('aria-pressed', String(v));
    $('span', b).textContent = v ? L('Resume', 'Weiter') : L('Pause', 'Pause');
    if (v) banner(mutePause ? L('Paused · Space or two muted hits to go on', 'Pausiert · Leertaste oder zwei gedämpfte Anschläge, um weiterzumachen') : L('Paused', 'Pausiert'), 1e9);
    else $('#banner', root)?.setAttribute('hidden', '');
  }

  /*
   * The voice: a note of a phrase counts once it has been held on pitch (any octave) for a quarter of a
   * second; a note held clearly elsewhere for nearly half a second breaks the chain. The same note twice
   * needs a new start (a breath, a new "la"). A seal of the Mute needs its note held for half a second.
   */
  const tol = store.settings.voiceTol;
  let onNote: { midi: number; since: number; last: number; told: boolean } | null = null;
  let elsewhere = { midi: NaN, since: -1, last: -1, told: false };
  let bossHold: Hold | null = null;
  let bossWrong = -1;
  let bossLast = -1;
  function sungFrame(f: Frame): void {
    if (gate !== 'go' || paused || f.t < playFrom) return;
    if (view === 'boss') return bossFrame(f);
    if (view !== 'playing') return;
    if (onNote && f.t - onNote.last > 0.12) onNote = null;
    const target = run.expectedMidis().find((m) => Math.abs(centsOff(f.midi, m)) <= tol);
    if (target !== undefined) {
      if (!onNote || onNote.midi !== target) onNote = { midi: target, since: f.t, last: f.t, told: false };
      onNote.last = f.t;
      elsewhere.since = -1;
      if (!onNote.told && f.t - onNote.since >= 0.25) {
        onNote.told = true;
        run.note(target, f.t);
      }
      return;
    }
    // still on the note just sung: nothing new
    if (onNote && Math.abs(centsOff(f.midi, onNote.midi)) <= tol) {
      onNote.last = f.t;
      return;
    }
    const m = Math.round(f.midi);
    if (elsewhere.midi !== m || f.t - elsewhere.last > 0.12) elsewhere = { midi: m, since: f.t, last: f.t, told: false };
    elsewhere.last = f.t;
    if (!elsewhere.told && f.t - elsewhere.since >= 0.45) {
      elsewhere.told = true;
      run.note(m, f.t);
    }
  }
  function bossFrame(f: Frame): void {
    const b = run.boss;
    if (!b || run.state !== 'boss') return;
    const st = b.steps[b.at];
    if (!bossHold || bossHold.target !== st.midi) bossHold = new Hold(st.midi, tol, 0.5);
    const off = centsOff(f.midi, st.midi);
    if (bossHold.push(f)) {
      const due = b.at;
      run.bossString('clean', f.t);
      scene.seal(due, true);
      engine.chime((run.state as string) === 'won' ? 'win' : 'clear', store.settings.chimes);
      bossTip = '';
      bossHold = null;
      bossWrong = -1;
      drawBoss();
    } else if (Math.abs(off) > tol) {
      if (bossWrong < 0 || f.t - bossLast > 0.12) bossWrong = f.t;
      if (f.t - bossWrong > 0.9) {
        bossWrong = -1;
        run.bossString('wrong', f.t);
        scene.seal(b.at, false);
        const heard = noteName(Math.round(f.midi)).replace(/\d+$/, '');
        bossTip = L(`That was ${heard}. ${st.label} is ${off < 0 ? 'higher' : 'lower'}.`, `Das war ${heard}. ${st.label} liegt ${off < 0 ? 'höher' : 'tiefer'}.`);
        drawBoss();
      }
    } else bossWrong = -1;
    bossLast = f.t;
  }

  const stopHear = voice
    ? hear(
        root,
        {
          onPitch: (e) => sungFrame({ t: e.time, midi: e.midi + e.cents / 100 }),
          onOnset: () => {
            // a new start on the note just sung: it may count again
            if (onNote?.told) onNote = null;
          },
        },
        voiceEars,
      )
    : hear(
    root,
    {
      onNote: (e) => {
        if (gate !== 'go') {
          if (gate === 'brief' && menuOn() && hasNotes && e.conf > 0.6) begin();
          return;
        }
        gesture.played(e.time);
        if (view === 'perk') menuPick?.(e.midi, e.conf);
        else if (!paused && view === 'playing' && e.time >= playFrom) run.note(e.midi, e.time, e.held);
      },
      onChord: (e) => {
        if (gate !== 'go') {
          if (gate === 'brief' && menuOn() && !hasNotes && e.best && e.score > 0.7 && e.margin > 0.1) begin();
          return;
        }
        if (e.best && e.score > 0.6 && e.margin > 0.08) gesture.played(e.time);
        if (view === 'perk') {
          if (e.best) menuStrum?.(e.best, e.score, e.margin);
        } else if (!paused && view === 'playing' && e.time >= playFrom) {
          // the chord a piece is waiting for is given when the strum fits it; otherwise what was heard for sure
          const want = run.wanted().find((c) => strumIs(e, c, piano));
          if (want) run.chord(want, e.time);
          else if (e.best && e.score > 0.6 && e.margin > 0.08) run.chord(e.best, e.time);
        }
      },
      onString: (e) => {
        const b = run.boss;
        if (view !== 'boss' || !b || run.state !== 'boss') return;
        const st = b.steps[b.at];
        if (e.result === 'clean' && !piano) learnRing(e.ring);
        const due = b.at;
        run.bossString(e.result, e.time);
        scene.seal(due, e.result === 'clean');
        if (e.result === 'clean') engine.chime((run.state as string) === 'won' ? 'win' : 'clear', store.settings.chimes);
        bossTip = e.result === 'clean' ? '' : b.chord ? stringTip(b.chord, st.string!, e.result, e.heard) + (e.heard !== null && e.result === 'wrong' ? L(` (${noteName(e.heard)} heard)`, ` (${noteName(e.heard)} gehört)`) : '') : e.result === 'wrong' ? L(`That was ${e.heard === null ? 'another key' : noteName(e.heard)}.`, `Das war ${e.heard === null ? 'eine andere Taste' : noteName(e.heard)}.`) : L('Keep the key down until the seal breaks.', 'Halte die Taste unten, bis das Siegel bricht.');
        drawBoss();
      },
      // the gesture for a pause: see MuteGesture
      ...(mutePause
        ? {
            onThud: (e) => {
              if (view === 'playing' && gate === 'go') gesture.thud(e.time, e.hit);
            },
            onOnset: (e) => {
              if (gate === 'go') gesture.onset(e.time);
            },
          }
        : {}),
    },
    piano ? pianoEars : undefined,
  );
  const stopKeys = keys({
    ' ': () => (debriefed ? rerun() : summary ? debrief() : gate === 'brief' ? begin() : setPaused(!paused)),
    g: () => run.bossGiveUp(),
    '1': () => run.state === 'perk' && run.offered[0] && run.choosePerk(run.offered[0].id),
    '2': () => run.state === 'perk' && run.offered[1] && run.choosePerk(run.offered[1].id),
    '3': () => run.state === 'perk' && run.offered[2] && run.choosePerk(run.offered[2].id),
  });
  $('#pause', root).onclick = () => setPaused(!paused);
  if (ctx) $('#skipstep', root).onclick = ctx.next;

  function dispose(): void {
    cancelAnimationFrame(raf);
    clearTimeout(bannerTimer);
    clearTimeout(closing);
    countTimers.forEach((id) => clearTimeout(id));
    countTimers = [];
    engine.clearTicks();
    stopMenu();
    stopHear();
    stopKeys();
    setSimTarget(null);
  }

  brief();
  if (again) begin();
  raf = requestAnimationFrame(frame);
  return () => {
    if (restarted) restarted();
    else dispose();
  };
};
