/** The songs and pieces there are, and adding your own from a text tab or from note names. */
import { L } from '../core/i18n';
import { store } from '../core/store';
import { deleteTakes } from '../core/takes';
import { formParts, partsOf, songLines, wholeSeconds, wholeSong, type PianoPiece, type Song } from '../music/content';
import { parseChordSheet } from '../music/chordsheet';
import { STRUMS } from '../music/songwriting';
import { notesHelp, parseNotes, parseTab } from '../music/import';
import { $, $$, cap, esc, go, icon, type Screen } from '../ui/dom';
import { LEARN, noteStrip, tabLine } from '../ui/draw';
import { pips } from './home';
import { describe, pieceMaterial, songMaterial, type Material } from '../music/material';
import { SING_ALONG } from '../music/lyrics';
import { finished, LEVELS, pieceProfile, piecesByDifficulty, readiness, songProfile, songsByDifficulty, type Profile } from '../music/difficulty';
import { dueReviews, repertoire } from '../music/review';
import { currentId } from './session';
import { chordName } from '../music/theory';
import { voiceLibrary } from './voicelist';
import { songPage } from './songpage';

const refresh = (): void => void dispatchEvent(new HashChangeEvent('hashchange'));

/** Who wrote it, as shown: the one credit that is a word, "Traditional", is said in the language shown. */
const byLine = (by: string): string => (by === 'Traditional' ? L('Traditional', 'Traditionell') : by);

/** What the list shows, kept while the app is open so that coming back from a song finds the list as it was left. */
const view: { level: number | null; kind: string; q: string; inst: string; pick: string } = { level: null, kind: '', q: '', inst: '', pick: '' };

/** Opens the list with a kind or a pick chosen: from a skill on the Learn page to the songs that use it. */
export function openSongs(how: { kind?: string; pick?: string }): void {
  Object.assign(view, { inst: store.settings.instrument, level: 0, q: '', kind: how.kind ?? '', pick: how.pick ?? '' });
  go('/songs');
}

interface Item {
  id: string;
  title: string;
  by: string;
  custom?: boolean;
  m: Material;
  p: Profile;
  /** the basic version: the same chords, strummed on the guitar or struck as a whole on the piano */
  basic?: { id: string };
  /** piano: the chords the song has on the guitar, where the piano plays it in another key */
  guitar?: string[];
  /** piano: the version for both hands */
  hands?: { id: string };
  /** an exercise of the app's own, not a song */
  exercise?: boolean;
}

export const library: Screen = (root, params, ctx) => {
  if (store.settings.instrument === 'voice') return voiceLibrary(root, params, ctx);
  // #/songs/<id>: the page of one song or piece, before it is played
  if (params[0]) return songPage(root, params, ctx);
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const all = piano ? [] : songsByDifficulty();
  const pieces = piano ? piecesByDifficulty() : [];
  const basicOf = new Map(pieces.filter((p) => p.of && !p.hands).map((p) => [p.of!, p]));
  const handsOf = new Map(pieces.filter((p) => p.hands).map((p) => [p.of!, p]));
  const items: Item[] = piano
    ? pieces.filter((p) => !p.of).map((p) => ({ id: p.id, title: p.title, by: p.by ?? '', custom: p.custom, m: pieceMaterial(p), p: pieceProfile(p), basic: basicOf.get(p.id), hands: handsOf.get(p.id), guitar: p.guitar }))
    : all.filter((s) => !s.of).map((s) => ({ id: s.id, title: s.title, by: s.by ?? '', custom: s.custom, m: songMaterial(s), p: songProfile(s), basic: all.find((x) => x.of === s.id), exercise: s.exercise }));
  const cur = currentId(inst);
  // the other instrument has other kinds and its own place in the list
  if (view.inst !== inst) Object.assign(view, { level: null, kind: '', q: '', inst, pick: '' });
  const open = piano ? 'piano' : 'song';
  const name = (c: string): string => chordName(c, piano);
  // a long list opens on the level of the song that is being learned; a short one shows everything
  const filters = items.length > 12;
  if (view.level === null) view.level = filters ? (items.find((it) => it.id === cur || it.basic?.id === cur)?.p.level ?? 1) : 0;
  if (!filters) Object.assign(view, { level: 0, kind: '', q: '' });
  // the level as four bars, so that it reads at a glance
  const grade = (p: Profile): string => `<span class="grade g${p.level}" role="img" aria-label="${L(`Difficulty ${p.level} of 4: ${LEVELS[p.level]}`, `Schwierigkeit ${p.level} von 4: ${LEVELS[p.level]}`)}">${[1, 2, 3, 4].map((i) => `<i class="${i <= p.level ? 'on' : ''}"></i>`).join('')}<b>${LEVELS[p.level]}</b></span>`;
  const level = (m: Material): number => {
    const ks = [...new Set(m.lines.flatMap((l) => l.bars.map(m.skill)))];
    return Math.floor(ks.reduce((sum, k) => sum + store.skills.level(k), 0) / ks.length);
  };
  const KINDS: [string, string][] = piano
    ? [
        ['', L('All kinds', 'Alle Arten')],
        ['melody', L('Tunes', 'Melodien')],
        ['chords', L('Chords', 'Akkorde')],
        ['broken', L('Broken chords', 'Gebrochene Akkorde')],
      ]
    : [
        ['', L('All kinds', 'Alle Arten')],
        ['strummed', L('Chords to strum', 'Akkorde zum Anschlagen')],
        ['picked', L('Picking', 'Zupfen')],
        ['melody', L('Tunes', 'Melodien')],
        ['exercise', L('Exercises', 'Übungen')],
      ];
  const count = (lv: number): number => items.filter((it) => it.p.level === lv).length;
  // what can be played now: every chord of it rings already; and what one chord more would open
  const fresh = new Map(items.map((it) => [it.id, it.p.chords.length ? readiness(it.p).fresh : null]));
  const ready = (it: Item): boolean => fresh.get(it.id)?.length === 0;
  const oneMore = (it: Item): boolean => fresh.get(it.id)?.length === 1;
  const opens = new Map<string, number>();
  for (const it of items) if (oneMore(it)) opens.set(fresh.get(it.id)![0], (opens.get(fresh.get(it.id)![0]) ?? 0) + 1);
  const key = [...opens].sort((a, b) => b[1] - a[1])[0];
  const recent = store.recent[inst] ?? [];
  /** begun and not finished, or due to be played again: the weakest first */
  const needsWork = (it: Item): boolean => !finished(inst, it.id) && level(it.m) < 4 && it.m.lines.some((l) => l.bars.some((b) => store.skills.get(it.m.skill(b))));
  const PICKS: [string, string, (it: Item) => boolean][] = [
    ['', L('Everything', 'Alles'), () => true],
    ['favs', L('Favourites', 'Favoriten'), (it) => store.isFav(inst, it.id)],
    ['recent', L('Played lately', 'Zuletzt gespielt'), (it) => recent.includes(it.id)],
    ['work', L('Needs work', 'Braucht Arbeit'), needsWork],
    ['ready', L('Playable now', 'Jetzt spielbar'), ready],
    ['one', L('One chord short', 'Ein Griff fehlt'), oneMore],
  ];

  // the shelf: what is worth playing now, before the list
  const due = dueReviews(inst, Date.now())[0];
  const curItem = items.find((it) => it.id === cur || it.basic?.id === cur || it.hands?.id === cur);
  const reps = repertoire(inst, Date.now()).length;
  const shelf = [
    due
      ? `<section class="paper shelfcard"><p class="kick">${L('Due today · repertoire', 'Heute fällig · Repertoire')}</p><h3>${esc(due.title)}</h3><p class="note">${L('Two lines from cold, at full speed: what has stayed.', 'Zwei Zeilen aus dem Stand, im vollen Tempo: was geblieben ist.')}</p><div class="row"><a class="btn primary" href="#/${open}/${encodeURIComponent(due.id)}/review">${L('Play from cold', 'Aus dem Stand spielen')}</a></div></section>`
      : `<section class="paper shelfcard"><p class="kick">${L('Your repertoire', 'Dein Repertoire')}</p><h3>${reps ? L(`${reps} ${reps === 1 ? 'song' : 'songs'} you can play`, `${reps} ${reps === 1 ? 'Song' : 'Songs'}, die du spielen kannst`) : L('Nothing in it yet', 'Noch nichts darin')}</h3><p class="note">${L('A song gets in when all of it has been played clean at full speed; it comes back at growing gaps.', 'Ein Song kommt hinein, wenn alles davon sauber im vollen Tempo gespielt ist; er kommt in wachsenden Abständen wieder.')}</p><div class="row"><a class="btn" href="#/repertoire">${L('Your repertoire', 'Dein Repertoire')}</a></div></section>`,
    curItem
      ? `<section class="paper shelfcard"><p class="kick">${L("In today's session", 'In der heutigen Session')}</p><h3>${esc(curItem.title)}</h3><p class="note">${esc(cap(describe(curItem.m)))}.</p><div class="row"><a class="btn" href="#/${open}/${encodeURIComponent(cur)}">${L('Open', 'Öffnen')}${icon('right')}</a></div></section>`
      : '',
    key
      ? `<section class="paper shelfcard"><p class="kick">${L('One chord away', 'Ein Griff entfernt')}</p><h3>${L(`${esc(name(key[0]))} opens ${key[1]} ${key[1] === 1 ? 'song' : 'songs'}`, `${esc(name(key[0]))} öffnet ${key[1]} ${key[1] === 1 ? 'Song' : 'Songs'}`)}</h3><p class="note keychord">${L(`The chord that opens most songs: <b>${esc(name(key[0]))}</b>, ${key[1]} ${key[1] === 1 ? 'song lacks' : 'songs lack'} only it.`, `Der Griff, der die meisten Songs öffnet: <b>${esc(name(key[0]))}</b>, ${key[1]} ${key[1] === 1 ? 'Song fehlt' : 'Songs fehlt'} nur er.`)}</p><div class="row"><a class="btn" href="#/${piano ? 'keys' : 'chord'}/${encodeURIComponent(key[0])}">${L(`Learn ${esc(name(key[0]))}`, `${esc(name(key[0]))} lernen`)}</a></div></section>`
      : '',
  ].join('');
  root.innerHTML = `<div class="page bare songsp">
    <section class="paper songhead">
      <div class="songtop"><div><p class="kick">${piano ? L(`Piano · ${items.length} pieces`, `Klavier · ${items.length} ${items.length === 1 ? 'Stück' : 'Stücke'}`) : L(`Guitar · ${items.length} songs`, `Gitarre · ${items.length} ${items.length === 1 ? 'Song' : 'Songs'}`)}</p><h1>${piano ? L('What do you want to play?', 'Was willst du spielen?') : L('What do you want to play?', 'Was willst du spielen?')}</h1></div>
        ${filters ? `<input id="q" type="search" placeholder="${L(`Title, ${piano ? 'composer' : 'artist'} or chord`, `Titel, ${piano ? 'Komponist' : 'Künstler'} oder Akkord`)}" aria-label="${L(`Search the ${piano ? 'pieces' : 'songs'}`, `${piano ? 'Stücke' : 'Songs'} durchsuchen`)}" value="${esc(view.q)}">` : ''}</div>
      ${
        filters
          ? `<div class="libbar">
        <div class="seg" role="group" aria-label="${L('Level', 'Stufe')}">${[0, 1, 2, 3, 4].map((lv) => `<button data-level="${lv}" aria-pressed="${view.level === lv}">${lv ? LEVELS[lv] : L('All', 'Alle')} <small>${lv ? count(lv) : items.length}</small></button>`).join('')}</div>
        <label class="drop">${L('Kind', 'Art')} <select id="kindsel">${KINDS.map(([k, nm]) => `<option value="${k}"${view.kind === k ? ' selected' : ''}>${nm}</option>`).join('')}</select></label>
        <label class="drop">${L('Show', 'Zeigen')} <select id="picksel">${PICKS.map(([k, nm, f]) => `<option value="${k}"${view.pick === k ? ' selected' : ''}>${nm}${k ? ` (${items.filter(f).length})` : ''}</option>`).join('')}</select></label>
        <span class="ownlinks"><a class="btn quiet" href="#/compose">${icon('right')}${L('Your own song', 'Dein eigener Song')}</a>${piano ? '' : `<a class="btn quiet" href="#/import/sheet">${icon('right')}${L('Paste a chord sheet', 'Akkordblatt einfügen')}</a>`}<a class="btn quiet" href="#/import">${icon('right')}${piano ? L('A melody of your own', 'Eigene Melodie') : L('Paste a tab', 'Tabulatur einfügen')}</a>${piano ? '' : `<a class="btn quiet" href="#/singalongs">${icon('right')}${L('Sing and play', 'Singen und spielen')}</a>`}</span>
      </div>`
          : ''
      }
    </section>
    ${shelf ? `<div class="shelf">${shelf}</div>` : ''}
    <section class="paper songlist">
      <p class="note" id="shown" aria-live="polite"></p>
      <ul class="lib" id="list"></ul>
      <p class="note libkey"><b class="chipn">G</b> ${L('rings clean for you', 'klingt bei dir sauber')} <b class="chipn new">A7</b> ${L('new for you', 'neu für dich')}</p>
      <div class="row">${piano ? '' : `<a class="btn" href="#/import/sheet">${L('Add any song from its chord sheet', 'Jeden Song aus seinem Akkordblatt hinzufügen')}</a>`}<a class="btn" href="#/compose">${L('Make a chord progression of your own', 'Eine eigene Akkordfolge machen')}</a><a class="btn" href="#/import">${piano ? L('Add a melody of your own', 'Eigene Melodie hinzufügen') : L('Add a song from a tab', 'Song aus einer Tabulatur hinzufügen')}</a><span class="note" id="msg"></span></div>
    </section>
  </div>`;

  const row = (it: Item): string => {
    const here = it.id === cur || it.basic?.id === cur || it.hands?.id === cur;
    const fin = finished(inst, it.id);
    const names = it.p.chords.map(name);
    const why = it.p.reasons.filter((r) => !/^\d+ (chords?|Akkorde?)$/.test(r));
    return `<li class="${here ? 'cur' : ''}" data-open="#/songs/${encodeURIComponent(it.id)}">
          <div><b>${esc(it.title)}</b>${it.exercise ? `<span class="tag">${L('exercise', 'Übung')}</span>` : it.by ? `<span class="by">${esc(byLine(it.by))}</span>` : ''}${here ? `<span class="pill">${L('today', 'heute')}</span>` : ''}${fin ? `<span class="pill done">${L('done', 'erledigt')}</span>` : ''}
            <small>${esc(cap(why.join(' · ')))}</small>
            <small class="you sr">${it.p.chords.length || !piano ? esc(readiness(it.p).text) + ' ' : ''}${fin ? L('You play it at full speed.', 'Im vollen Tempo gespielt.') : L('Next: ' + describe(it.m).toLowerCase() + '.', 'Als Nächstes: ' + describe(it.m) + '.')}</small>
            <small class="links2">${it.basic ? ` <a href="#/songs/${encodeURIComponent(it.basic.id)}">${L(`Basic version: the same chords, ${piano ? 'struck as a whole' : 'strummed'}`, `Einfache Fassung: dieselben Akkorde, ${piano ? 'als Ganzes angeschlagen' : 'angeschlagen'}`)}</a>` : ''}${it.hands ? ` <a href="#/songs/${encodeURIComponent(it.hands.id)}">${it.hands.id.endsWith('~together') ? L('Both hands together: a bass under the melody', 'Beide Hände zusammen: ein Bass unter der Melodie') : L('Both hands: the root in the left, then the chord', 'Beide Hände: der Grundton links, dann der Akkord')}</a>` : ''}${!piano && SING_ALONG[it.id] ? ` <a href="#/singalong/${encodeURIComponent(it.id)}">${L('Sing and play: the words under the chords', 'Singen und spielen: der Text unter den Akkorden')}</a>` : ''}${it.guitar ? ` <span class="otherkey">${L(`On the guitar the song has ${it.guitar.map((c) => esc(chordName(c))).join(', ')}: here it is in the key that lies best under the hand.`, `Auf der Gitarre hat der Song ${it.guitar.map((c) => esc(chordName(c))).join(', ')}: Hier steht er in der Tonart, die am besten unter der Hand liegt.`)}</span>` : ''}</small></div>
          <span class="chs2">${names.length ? it.p.chords.map((c) => `<b class="chipn${fresh.get(it.id)?.includes(c) ? ' new' : ''}">${esc(name(c))}</b>`).join('') : `<small>${piano ? L('one hand', 'eine Hand') : L('single notes', 'Einzeltöne')}</small>`}</span>${grade(it.p)}<span class="lvl">${pips(level(it.m))}<small>${fin ? L('done', 'erledigt') : L(`yours: ${level(it.m)} of 5`, `deine: ${level(it.m)} von 5`)}</small></span>
          <span class="row"><button class="btn quiet star" data-fav="${esc(it.id)}" aria-pressed="${store.isFav(inst, it.id)}" aria-label="${L(`Favourite: ${esc(it.title)}`, `Favorit: ${esc(it.title)}`)}">${store.isFav(inst, it.id) ? '★' : '☆'}</button>${it.custom ? `<button class="btn quiet" data-del="${esc(it.id)}">${L('Remove', 'Entfernen')}</button>` : ''}<a class="btn quiet openit" href="#/songs/${encodeURIComponent(it.id)}" aria-label="${L(`Open ${esc(it.title)}`, `${esc(it.title)} öffnen`)}">${icon('right')}</a></span>
        </li>`;
  };

  function list(): void {
    const q = view.q.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const picked = PICKS.find(([k]) => k === view.pick)?.[2] ?? (() => true);
    const match = (it: Item): boolean => {
      if (view.kind === 'exercise' ? !it.exercise : view.kind && it.p.kind !== view.kind) return false;
      if (!picked(it)) return false;
      // a pick of its own looks through every level, as a search does
      if (!words.length) return !!view.pick || !view.level || it.p.level === view.level;
      // a search looks through every level: whoever types a name wants that song, whatever its level
      const hay = `${it.title} ${it.by}${it.by === 'Traditional' ? ' ' + byLine(it.by) : ''}`.toLowerCase();
      const chords = it.p.chords.map((c) => name(c).toLowerCase().replace('♯', '#').replace('♭', 'b'));
      return words.every((w) => hay.includes(w) || chords.includes(w));
    };
    const shown = items.filter(match);
    // played lately: the latest first
    if (view.pick === 'recent') shown.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
    let h = '';
    let lv = 0;
    for (const it of shown) {
      if ((!view.level || words.length || view.pick) && view.pick !== 'recent' && filters && it.p.level !== lv) {
        lv = it.p.level;
        const n = shown.filter((x) => x.p.level === lv).length;
        h += `<li class="sep"><b>${LEVELS[lv]}</b><small>${L(`${n} ${piano ? 'pieces' : 'songs'}`, `${n} ${piano ? (n === 1 ? 'Stück' : 'Stücke') : n === 1 ? 'Song' : 'Songs'}`)}</small></li>`;
      }
      h += row(it);
    }
    $('#list', root).innerHTML = h;
    $$('[data-fav]', root).forEach(
      (b) =>
        (b.onclick = () => {
          const on = store.toggleFav(inst, b.dataset.fav!);
          store.save();
          b.setAttribute('aria-pressed', String(on));
          b.textContent = on ? '★' : '☆';
        }),
    );
    $('#shown', root).textContent = !filters ? '' : !shown.length ? (view.pick === 'favs' && !words.length ? L('No favourites yet: the star on a row makes one.', 'Noch keine Favoriten: Der Stern in einer Zeile macht einen.') : view.pick === 'recent' && !words.length ? L('Nothing played yet.', 'Noch nichts gespielt.') : L('Nothing found. Try another word, or another level.', 'Nichts gefunden. Versuch ein anderes Wort oder eine andere Stufe.')) : words.length ? L(`${shown.length} found for "${view.q.trim()}", in every level.`, `${shown.length} gefunden für „${view.q.trim()}“, auf allen Stufen.`) : '';
    $$('[data-del]', root).forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.del!;
          if (b.dataset.armed !== '1') {
            b.dataset.armed = '1';
            b.textContent = L('Click again to remove', 'Zum Entfernen noch einmal klicken');
            return;
          }
          if (piano) store.pieces = store.pieces.filter((p) => p.id !== id);
          else store.songs = store.songs.filter((s) => s.id !== id);
          if (store.current[inst] === id) delete store.current[inst];
          for (const k of Object.keys(store.skills.data)) if (k.startsWith(`bar:${id}:`)) delete store.skills.data[k];
          delete store.progress[id];
          // its recordings go with it (and, for a piece, the recordings of singing its tune)
          void deleteTakes(inst, id);
          if (piano) void deleteTakes('voice', `${id.replace(/~keys$/, '')}~voice`);
          store.save();
          refresh();
        }),
    );
  }

  $$('[data-level]', root).forEach(
    (b) =>
      (b.onclick = () => {
        view.level = Number(b.dataset.level);
        // a level asked for shows that level: a pick of its own (which looks through every level) gives way
        view.pick = '';
        $$('[data-level]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (picksel) picksel.value = '';
        list();
      }),
  );
  const kindsel = root.querySelector<HTMLSelectElement>('#kindsel');
  if (kindsel)
    kindsel.onchange = () => {
      view.kind = kindsel.value;
      list();
    };
  const picksel = root.querySelector<HTMLSelectElement>('#picksel');
  if (picksel)
    picksel.onchange = () => {
      view.pick = picksel.value;
      list();
    };
  // a click anywhere on a row opens the song, as its arrow does
  $('#list', root).addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a, button, input')) return;
    const li = t.closest<HTMLElement>('li[data-open]');
    if (li) location.hash = li.dataset.open!;
  });
  const q = root.querySelector<HTMLInputElement>('#q');
  if (q)
    q.oninput = () => {
      view.q = q.value;
      list();
    };
  list();
};

/** The ways of adding a song of your own on the guitar, as a switch at the top of the page that adds one. */
const ownWays = (on: 'sheet' | 'tab'): string =>
  `<nav class="seg" aria-label="${L('How to add it', 'Wie du ihn hinzufügst')}"><a href="#/import/sheet"${on === 'sheet' ? ' aria-current="true"' : ''}>${L('Chord sheet', 'Akkordblatt')}</a><a href="#/import"${on === 'tab' ? ' aria-current="true"' : ''}>${L('Tab', 'Tabulatur')}</a><a href="#/compose">${L('Chord progression', 'Akkordfolge')}</a></nav>`;

/** The strumming patterns a song from a chord sheet can be played in, with what the trainer calls them. */
const SHEET_STRUMS = (): [keyof typeof STRUMS, string][] => [
  ['folk', L('Down, down-up · 4/4', 'Ab, ab-auf · 4/4')],
  ['beat', L('Every beat · 4/4', 'Jeder Schlag · 4/4')],
  ['half', L('On one and three · 4/4', 'Auf eins und drei · 4/4')],
  ['pop', L('Down, down-up, up-down-up · 4/4', 'Ab, ab-auf, auf-ab-auf · 4/4')],
  ['waltz', L('Three-four', 'Dreivierteltakt')],
  ['lilt', L('Three-four with upstrokes', 'Dreivierteltakt mit Aufschlägen')],
  ['roll', L('Six-eight', 'Sechsachteltakt')],
];

/** A sheet to try it with: the broadside words of Whiskey in the Jar (1871), as a song site would print them. */
const SHEET_EXAMPLE = (): string =>
  [
    'Whiskey in the Jar',
    'Traditional',
    '',
    '[Verse 1]',
    'G'.padEnd(32) + 'Em',
    'As I was a walking over Wicklow mountain,',
    'C'.padEnd(48) + 'G',
    'I met with Colonel Powers, and his money he was counting,',
    'G'.padEnd(27) + 'Em',
    'I pulled out my sword, and likewise my rapier,',
    'C'.padEnd(35) + 'G'.padEnd(9) + 'Em',
    "Saying, stand and deliver, for I'm a bold deceiver.",
    '',
    '[Chorus]',
    'D',
    'Mush a ring a do a da,',
    'G',
    'Whack fol the daddy O,',
    'C',
    'Whack fol the daddy O,',
    'G'.padEnd(27) + 'D'.padEnd(5) + 'G',
    "There's whiskey in the jar.",
    '',
    '[Verse 2]',
    "It's when I got the money it was a pretty penny,",
    'I put it in my pocket, and I took it home to Molly;',
    'She said, my dearest Pat, I never will deceive you,',
    "But the devil's in the women, they never can be easy.",
    '',
    '[Chorus]',
  ].join('\n');

/**
 * #/import/sheet: a song from a chord sheet, chords over words as song sites print them. What it makes of the sheet
 * shows as it is typed: the parts in the order they are sung, each line with its chords over its words, and what
 * was simplified or could not be played. Saved, it is one of the player's own songs and its page opens.
 */
export const sheetImporter: Screen = (root) => {
  root.innerHTML = `<div class="page">
    <div><a class="btn quiet" href="#/songs">${icon('left')}${L('Songs', 'Songs')}</a></div>
    <div class="cs-head"><p class="kick">${L('Guitar · your own song', 'Gitarre · dein eigener Song')}</p><h1>${L('Paste a chord sheet.', 'Füg ein Akkordblatt ein.')}</h1>
      <p class="lede">${L('The chords above the words, as song sites print them, with <b>[Verse]</b>, <b>[Chorus]</b> and the like over the parts. The app makes parts, lines and the whole song of it.', 'Die Akkorde über dem Text, so wie Songseiten sie zeigen, mit <b>[Verse]</b>, <b>[Chorus]</b> und Ähnlichem über den Teilen. Die App macht daraus Teile, Zeilen und den ganzen Song.')}</p>
      <p class="note">${L('It stays on this computer: nothing is sent anywhere.', 'Er bleibt auf diesem Rechner: Nichts wird irgendwohin geschickt.')}</p>
      ${ownWays('sheet')}</div>
    <div class="cs-two">
      <div class="cs-in">
        <textarea id="sheet" rows="18" spellcheck="false" aria-label="${L('The chord sheet', 'Das Akkordblatt')}" placeholder="${esc('[Verse]\nG                  Em\nAs I was a walking over Wicklow mountain\n\n[Chorus]\nD\nMush a ring a do a da')}"></textarea>
        <div class="row"><button class="btn quiet" id="example">${L('Fill in an example', 'Beispiel einfügen')}</button></div>
        <div class="field"><label for="title">${L('Title', 'Titel')}</label><input id="title" type="text" maxlength="60" placeholder="${L('My song', 'Mein Song')}"></div>
        <div class="field"><label for="artist">${L('Artist', 'Künstler')}</label><input id="artist" type="text" maxlength="60"></div>
        <div class="field"><label for="bpm">${L('Tempo', 'Tempo')}<small>${L('Beats a minute at full speed: 70 is slow, 120 brisk.', 'Schläge pro Minute im vollen Tempo: 70 ist langsam, 120 flott.')}</small></label><input id="bpm" type="number" min="40" max="200" step="1" value="90"></div>
        <div class="field"><label for="pattern">${L('Strumming', 'Schlagmuster')}</label><select id="pattern">${SHEET_STRUMS().map(([k, name]) => `<option value="${k}">${esc(name)}</option>`).join('')}</select></div>
        <div class="field"><label for="per">${L('Bars per chord', 'Takte pro Akkord')}<small>${L('How long each chord is held. A line with a single chord holds it twice as long.', 'Wie lange jeder Akkord gehalten wird. Eine Zeile mit nur einem Akkord hält ihn doppelt so lang.')}</small></label><select id="per"><option value="1">1</option><option value="2">2</option><option value="4">4</option></select></div>
        <div class="field"><label for="transpose">${L('Transpose', 'Transponieren')}<small>${L('Moves every chord up or down, for a key with chords the app has.', 'Verschiebt jeden Akkord nach oben oder unten, in eine Tonart mit Akkorden, die die App kennt.')}</small></label><select id="transpose">${[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((t) => `<option value="${t}"${t === 0 ? ' selected' : ''}>${t === 0 ? L('As written', 'Wie notiert') : L(`${t > 0 ? '+' : '−'}${Math.abs(t)} ${Math.abs(t) === 1 ? 'semitone' : 'semitones'}`, `${t > 0 ? '+' : '−'}${Math.abs(t)} ${Math.abs(t) === 1 ? 'Halbton' : 'Halbtöne'}`)}</option>`).join('')}</select></div>
      </div>
      <div class="cs-out">
        <div id="found" class="cs-found" aria-live="polite"></div>
        <div id="sheetprev" class="cs-prev" aria-label="${L('How the song will be played', 'So wird der Song gespielt')}"></div>
        <div class="row"><button class="btn primary" id="save" disabled>${L('Save and open', 'Speichern und öffnen')}</button></div>
      </div>
    </div>
  </div>`;
  const src = $<HTMLTextAreaElement>('#sheet', root);
  const save = $<HTMLButtonElement>('#save', root);
  const value = (sel: string): string => $<HTMLInputElement>(sel, root).value;
  let made: Song | null = null;
  let tempoTyped = false;

  function read(): void {
    const r = parseChordSheet(src.value, {
      id: 'my-' + Date.now().toString(36),
      title: value('#title'),
      by: value('#artist'),
      bpm: Math.min(200, Math.max(40, Number(value('#bpm')) || 90)),
      pattern: value('#pattern') as keyof typeof STRUMS,
      perChord: Number(value('#per')) || 1,
      transpose: Number(value('#transpose')) || 0,
    });
    // a ChordPro sheet that names its title, artist or tempo fills them in, as long as nothing was typed there
    if (r.title && !value('#title')) $<HTMLInputElement>('#title', root).placeholder = r.title;
    if (r.by && !value('#artist')) $<HTMLInputElement>('#artist', root).placeholder = r.by;
    if (r.bpm && !tempoTyped) $<HTMLInputElement>('#bpm', root).value = String(r.bpm);
    made = r.song;
    save.disabled = !made;
    const notes: string[] = [];
    if (made) {
      const parts = formParts(made);
      const secs = wholeSeconds(made);
      notes.push(`<p><b>${L(`${partsOf(made).length} ${partsOf(made).length === 1 ? 'part' : 'parts'}, sung ${parts.length} ${parts.length === 1 ? 'time' : 'times'} round: about ${Math.max(1, Math.round(secs / 60))} min.`, `${partsOf(made).length} ${partsOf(made).length === 1 ? 'Teil' : 'Teile'}, ${parts.length}-mal gesungen: etwa ${Math.max(1, Math.round(secs / 60))} Min.`)}</b> ${L('This is how it will be played:', 'So wird er gespielt:')}</p>`);
    }
    if (r.capo) notes.push(`<p>${L(`The sheet asks for a capo on fret ${r.capo}: the chords are the shapes you play with it.`, `Das Blatt will einen Kapodaster im ${r.capo}. Bund: Die Akkorde sind die Griffe, die du damit spielst.`)} ${store.settings.capo === r.capo ? L('Your capo is set to that fret.', 'Dein Kapodaster ist auf diesen Bund eingestellt.') : `<button class="btn quiet" id="capoit">${L(`Set the capo to fret ${r.capo}`, `Kapodaster auf den ${r.capo}. Bund stellen`)}</button>`}</p>`);
    if (r.simplified.length) notes.push(`<p>${L('Simplified', 'Vereinfacht')}: ${r.simplified.map((x) => `${esc(x.from)} → ${esc(chordName(x.to))}`).join(', ')}</p>`);
    if (r.unknown.length)
      notes.push(
        `<p class="cs-warn">${L(`The app has no shape for ${r.unknown.map(esc).join(', ')}: those bars keep the chord before.`, `Für ${r.unknown.map(esc).join(', ')} kennt die App keinen Griff: Diese Takte behalten den Akkord davor.`)}${r.suggest !== null ? ` <button class="btn quiet" id="moveit" data-t="${r.suggest}">${L(`Transpose ${r.suggest > 0 ? '+' : '−'}${Math.abs(r.suggest)}: every chord playable`, `Um ${r.suggest > 0 ? '+' : '−'}${Math.abs(r.suggest)} transponieren: alle Akkorde spielbar`)}</button>` : ''}</p>`,
      );
    for (const p of r.problems) notes.push(`<p>${esc(p)}</p>`);
    if (r.skipped) notes.push(`<p class="note">${L(`${r.skipped} ${r.skipped === 1 ? 'line' : 'lines'} left out: tab, notes about the song and the like.`, `${r.skipped} ${r.skipped === 1 ? 'Zeile' : 'Zeilen'} weggelassen: Tabulatur, Angaben zum Song und Ähnliches.`)}</p>`);
    $('#found', root).innerHTML = src.value.trim() ? notes.join('') : '';
    $('#sheetprev', root).innerHTML = made ? preview(made, r.lines) : '';
    root.querySelector<HTMLButtonElement>('#capoit')?.addEventListener('click', () => {
      store.settings.capo = r.capo;
      store.save();
      read();
    });
    root.querySelector<HTMLButtonElement>('#moveit')?.addEventListener('click', (e) => {
      $<HTMLSelectElement>('#transpose', root).value = (e.currentTarget as HTMLElement).dataset.t!;
      read();
    });
  }

  /** The whole song as it will be played: each time round of a part under its name, each line its chords over its words. */
  function preview(song: Song, lines: Record<string, number[][]>): string {
    const whole = wholeSong(song);
    return formParts(song)
      .map((p) => {
        const start = partsOf(song).find((x) => x.name === p.part)!.from;
        const rows = (lines[p.part] ?? [whole.slice(p.from, p.to).map((f) => f.index)])
          .map((ln) => `<div class="cs-line">${ln.map((b, i) => {
            const f = whole[p.from + b - start];
            const c = song.bars[b].notes.map((n) => n.strum).filter((x, k, a): x is string => !!x && a.indexOf(x) === k);
            const prev = i > 0 ? song.bars[ln[i - 1]].notes.map((n) => n.strum).pop() : undefined;
            return `<span class="cs-bar"><b>${c.length > 1 || c[0] !== prev ? esc(c.map((x) => chordName(x)).join(' ')) : ''}</b><span>${esc((f?.words ?? '').replace(/-$/, '‑'))}</span></span>`;
          }).join('')}</div>`)
          .join('');
        return `<section class="cs-part"><h3>${esc(p.label)}</h3>${rows}</section>`;
      })
      .join('');
  }

  src.oninput = read;
  $$('#title, #artist, #pattern, #per, #transpose', root).forEach((el) => (el.oninput = read));
  $('#bpm', root).oninput = () => {
    tempoTyped = true;
    read();
  };
  $('#example', root).onclick = () => {
    src.value = SHEET_EXAMPLE();
    if (!value('#title')) $<HTMLInputElement>('#title', root).value = 'Whiskey in the Jar';
    if (!value('#artist')) $<HTMLInputElement>('#artist', root).value = 'Traditional';
    read();
  };
  save.onclick = () => {
    read();
    if (!made) return;
    store.songs.push(made);
    store.current.guitar = made.id;
    store.save();
    go(`/songs/${made.id}`);
  };
  read();
};

const TAB_EXAMPLE = `e|-----0-----0---|-----0-----0---|
B|---1---1-----1-|---1---1-----1-|
G|-2-------2-----|-0-------0-----|
D|---------------|---------------|
A|-0-------------|-3-------------|
E|---------------|---------------|`;

export const importer: Screen = (root, params, ctx) => {
  const voice = store.settings.instrument === 'voice';
  // a voice types a melody by its note names, as the piano does
  const piano = store.settings.instrument === 'piano' || voice;
  // #/import/sheet: a song from a chord sheet (the guitar's way in for any song)
  if (params[0] === 'sheet' && !piano) return sheetImporter(root, params, ctx);
  root.innerHTML = `<div class="page">
    <div><a class="btn quiet" href="#/songs">${icon('left')}${piano && !voice ? L('Pieces', 'Stücke') : L('Songs', 'Songs')}</a></div>
    <div><p class="kick">${voice ? L('Voice · your own melody', 'Stimme · deine eigene Melodie') : piano ? L('Piano · your own melody', 'Klavier · deine eigene Melodie') : L('Guitar · your own song', 'Gitarre · dein eigener Song')}</p><h1>${piano ? L('Type a melody.', 'Tipp eine Melodie ein.') : L('Paste a tab.', 'Füg eine Tabulatur ein.')}</h1>
      <p class="lede">${
        piano
          ? notesHelp()
          : L(
              'A text tab as you find them everywhere: six lines, the high e string on top, fret numbers on dashes, bars split by <b>|</b>. Numbers in the same column are played together.',
              'Eine Tabulatur als Text, wie man sie überall findet: sechs Zeilen, die hohe e-Saite oben, Bundnummern auf Strichen, Takte getrennt durch <b>|</b>. Zahlen in derselben Spalte werden zusammen gespielt.',
            )
      }</p>${piano ? '' : ownWays('tab')}</div>
    <div class="field"><label for="title">${L('Title', 'Titel')}</label><input id="title" type="text" maxlength="60" placeholder="${piano ? L('My melody', 'Meine Melodie') : L('My song', 'Mein Song')}"></div>
    <textarea id="src" rows="${piano ? 6 : 9}" spellcheck="false" aria-label="${piano ? L('The notes', 'Die Noten') : L('The tab', 'Die Tabulatur')}" placeholder="${piano ? 'E4 E4 F4 G4 | G4 F4 E4 D4' : esc(TAB_EXAMPLE)}"></textarea>
    <div>
      <div class="field"><label for="npm">${L('Speed', 'Tempo')}<small>${L('Notes a minute at full speed, counting the shortest common note.', 'Noten pro Minute im vollen Tempo, gezählt nach der kürzesten häufigen Note.')}</small></label><input id="npm" type="number" min="30" max="480" step="1" value="${piano ? 120 : 160}"></div>
      <div class="field"><label for="beat">${L('Metronome', 'Metronom')}<small>${L('How many of those notes go by between two clicks.', 'Wie viele dieser Noten zwischen zwei Klicks vergehen.')}</small></label><select id="beat"><option value="1">${L('a click on every note', 'ein Klick auf jede Note')}</option><option value="2" selected>${L('a click on every second note', 'ein Klick auf jede zweite Note')}</option><option value="3">${L('a click on every third note', 'ein Klick auf jede dritte Note')}</option><option value="4">${L('a click on every fourth note', 'ein Klick auf jede vierte Note')}</option></select></div>
      ${piano ? '' : `<div class="field"><label for="rhythm">${L('Read the spacing as rhythm', 'Abstände als Rhythmus lesen')}<small>${L('Notes that stand further apart are held longer. Off: every note is equally long.', 'Noten, die weiter auseinanderstehen, werden länger gehalten. Aus: Jede Note ist gleich lang.')}</small></label><input id="rhythm" type="checkbox" checked></div>`}
    </div>
    <p class="note" id="found" aria-live="polite"></p>
    <svg class="fit" id="preview" viewBox="0 0 1180 ${piano ? 180 : 186}" role="img" aria-label="${L('How the first line will look', 'So sieht die erste Zeile aus')}" hidden></svg>
    <div class="row"><button class="btn primary" id="save" disabled>${L('Save and open', 'Speichern und öffnen')}</button><button class="btn quiet" id="example">${L('Fill in an example', 'Beispiel einfügen')}</button></div>
  </div>`;
  const src = $<HTMLTextAreaElement>('#src', root);
  const save = $<HTMLButtonElement>('#save', root);
  const num = (id: string, lo: number, hi: number, fallback: number): number => Math.min(hi, Math.max(lo, Number($<HTMLInputElement>('#' + id, root).value) || fallback));
  let made: Song | PianoPiece | null = null;

  function read(): void {
    const title = $<HTMLInputElement>('#title', root).value.trim() || (piano ? L('My melody', 'Meine Melodie') : L('My song', 'Mein Song'));
    const noteDur = 60 / num('npm', 30, 480, 120);
    const beat = num('beat', 1, 4, 2);
    const id = 'my-' + Date.now().toString(36);
    let problems: string[];
    let count = 0;
    let svg = '';
    made = null;
    if (piano) {
      const r = parseNotes(src.value);
      problems = r.problems;
      count = r.notes;
      if (r.notes) {
        made = { id, title, hand: 'right hand', noteDur, beat, phrases: r.phrases, custom: true };
        svg = noteStrip(r.phrases[0], () => 'up', LEARN).svg;
      }
    } else {
      const r = parseTab(src.value, $<HTMLInputElement>('#rhythm', root).checked);
      problems = r.problems;
      count = r.steps;
      if (r.steps) {
        const song: Song = { id, title, noteDur, beat, bars: r.bars, custom: true };
        made = song;
        svg = tabLine({ bars: songLines(song)[0].map((b) => ({ notes: song.bars[b].notes })), look: () => 'up' }, LEARN).svg;
      }
    }
    const parts = made
      ? 'phrases' in made
        ? L(`${made.phrases.length} ${made.phrases.length === 1 ? 'phrase' : 'phrases'}`, `${made.phrases.length} ${made.phrases.length === 1 ? 'Phrase' : 'Phrasen'}`)
        : L(`${made.bars.length} ${made.bars.length === 1 ? 'bar' : 'bars'}`, `${made.bars.length} ${made.bars.length === 1 ? 'Takt' : 'Takten'}`)
      : '';
    $('#found', root).innerHTML = src.value.trim() ? `${made ? L(`<b>Found ${count} ${count === 1 ? 'note' : 'notes'} in ${parts}.</b> This is the first ${piano ? 'phrase' : 'line'}:`, `<b>${count} ${count === 1 ? 'Note' : 'Noten'} in ${parts} gefunden.</b> Das ist die erste ${piano ? 'Phrase' : 'Zeile'}:`) : ''} ${problems.map(esc).join(' ')}` : '';
    $('#preview', root).toggleAttribute('hidden', !made);
    $('#preview', root).innerHTML = svg;
    save.disabled = !made;
  }

  src.oninput = read;
  $$('#title, #npm, #beat, #rhythm', root).forEach((el) => (el.onchange = read));
  $('#example', root).onclick = () => {
    src.value = piano ? 'C4 D4 E4 C4 | C4 D4 E4 C4\nE4 F4 G4:2 | E4 F4 G4:2' : TAB_EXAMPLE;
    read();
  };
  save.onclick = () => {
    read();
    if (!made) return;
    if ('phrases' in made) {
      store.pieces.push(made);
      if (voice) store.current.voice = `${made.id}~voice`;
      else store.current.piano = made.id;
    } else {
      store.songs.push(made);
      store.current.guitar = made.id;
    }
    store.save();
    go(voice ? `/sing/${made.id}~voice` : `/${piano ? 'piano' : 'song'}/${made.id}`);
  };
};
