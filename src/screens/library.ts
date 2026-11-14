/** The songs and pieces there are, and adding your own from a text tab or from note names. */
import { L } from '../core/i18n';
import { store } from '../core/store';
import { songLines, type PianoPiece, type Song } from '../music/content';
import { parseNotes, parseTab } from '../music/import';
import { $, $$, cap, esc, go, icon, type Screen } from '../ui/dom';
import { LEARN, noteStrip, tabLine } from '../ui/draw';
import { pips } from './home';
import { describe, pieceMaterial, songMaterial, type Material } from './learn';
import { SING_ALONG } from '../music/lyrics';
import { finished, LEVELS, pieceProfile, piecesByDifficulty, readiness, songProfile, songsByDifficulty, type Profile } from '../music/difficulty';
import { currentId } from './session';
import { chordName } from '../music/theory';
import { voiceLibrary } from './voicelist';

const refresh = (): void => void dispatchEvent(new HashChangeEvent('hashchange'));

/** Who wrote it, as shown: the one credit that is a word, "Traditional", is said in the language shown. */
const byLine = (by: string): string => (by === 'Traditional' ? L('Traditional', 'Traditionell') : by);

/** What the list shows, kept while the app is open so that coming back from a song finds the list as it was left. */
const view: { level: number | null; kind: string; q: string; inst: string; pick: string } = { level: null, kind: '', q: '', inst: '', pick: '' };

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

  root.innerHTML = `<div class="page">
    <div><p class="kick">${piano ? L(`Piano · ${items.length} pieces`, `Klavier · ${items.length} ${items.length === 1 ? 'Stück' : 'Stücke'}`) : L(`Guitar · ${items.length} songs`, `Gitarre · ${items.length} ${items.length === 1 ? 'Song' : 'Songs'}`)}</p><h1>${L('What do you want to learn?', 'Was willst du lernen?')}</h1>
      <p class="lede">${L(
        `Easiest first. The level says what ${piano ? 'a piece' : 'a song'} asks for, and the line under it which of its chords already ring for you. The one you open goes into today's session; when all of it has been played clean at full speed, the session moves on to the next.${piano ? ' Songs are here as chords for the right hand, in the key that lies best under it.' : ''}`,
        `Das Leichteste zuerst. Die Stufe sagt, was ${piano ? 'ein Stück' : 'ein Song'} verlangt, und die Zeile darunter, welche seiner Akkorde bei dir schon klingen. Was du öffnest, kommt in die heutige Session; wenn alles davon sauber im vollen Tempo gespielt ist, geht die Session zum nächsten weiter.${piano ? ' Songs stehen hier als Akkorde für die rechte Hand, in der Tonart, die ihr am besten liegt.' : ''}`,
      )}</p></div>
    ${
      filters
        ? `<div class="libbar">
        <div class="seg" role="group" aria-label="${L('Level', 'Stufe')}">${[0, 1, 2, 3, 4].map((lv) => `<button data-level="${lv}" aria-pressed="${view.level === lv}">${lv ? LEVELS[lv] : L('All', 'Alle')} <small>${lv ? count(lv) : items.length}</small></button>`).join('')}</div>
        <div class="seg" role="group" aria-label="${L('Kind', 'Art')}">${KINDS.map(([k, name]) => `<button data-kind="${k}" aria-pressed="${view.kind === k}">${name}</button>`).join('')}</div>
        <div class="seg" role="group" aria-label="${L('Show', 'Zeigen')}">${PICKS.map(([k, name, f]) => `<button data-pick="${k}" aria-pressed="${view.pick === k}">${name}${k ? ` <small>${items.filter(f).length}</small>` : ''}</button>`).join('')}</div>
        <input id="q" type="search" placeholder="${L(`Search: title, ${piano ? 'composer' : 'artist'} or chord`, `Suche: Titel, ${piano ? 'Komponist' : 'Künstler'} oder Akkord`)}" aria-label="${L(`Search the ${piano ? 'pieces' : 'songs'}`, `${piano ? 'Stücke' : 'Songs'} durchsuchen`)}" value="${esc(view.q)}">
      </div>`
        : ''
    }
    ${key ? `<p class="note keychord">${L(`The chord that opens most songs: <b>${esc(name(key[0]))}</b>, ${key[1]} ${key[1] === 1 ? 'song lacks' : 'songs lack'} only it.`, `Der Griff, der die meisten Songs öffnet: <b>${esc(name(key[0]))}</b>, ${key[1]} ${key[1] === 1 ? 'Song fehlt' : 'Songs fehlt'} nur er.`)} <a href="#/${piano ? 'keys' : 'chord'}/${encodeURIComponent(key[0])}">${L('Learn it now', 'Jetzt lernen')}</a></p>` : ''}
    <p class="note" id="shown" aria-live="polite"></p>
    <ul class="lib" id="list"></ul>
    <div class="row"><a class="btn" href="#/compose">${L('Make a chord progression of your own', 'Eine eigene Akkordfolge machen')}</a><a class="btn" href="#/import">${piano ? L('Add a melody of your own', 'Eigene Melodie hinzufügen') : L('Add a song from a tab', 'Song aus einer Tabulatur hinzufügen')}</a><span class="note" id="msg"></span></div>
  </div>`;

  const row = (it: Item): string => {
    const here = it.id === cur || it.basic?.id === cur || it.hands?.id === cur;
    const fin = finished(inst, it.id);
    const names = it.p.chords.map(name);
    const why = it.p.reasons.filter((r) => !/^\d+ (chords?|Akkorde?)$/.test(r));
    return `<li${here ? ' class="cur"' : ''}>
          <div><b>${esc(it.title)}</b>${it.exercise ? `<span class="tag">${L('exercise', 'Übung')}</span>` : it.by ? `<span class="by">${esc(byLine(it.by))}</span>` : ''}${grade(it.p)}
            <small>${names.length ? `<span class="chs">${names.map(esc).join(' · ')}</span> ` : ''}${esc(cap(why.join(' · ')))}</small>
            <small class="you">${it.p.chords.length || !piano ? esc(readiness(it.p).text) + ' ' : ''}${fin ? L('You play it at full speed.', 'Im vollen Tempo gespielt.') : L('Next: ' + describe(it.m).toLowerCase() + '.', 'Als Nächstes: ' + describe(it.m) + '.')}${it.basic ? ` <a href="#/${open}/${encodeURIComponent(it.basic.id)}">${L(`Basic version: the same chords, ${piano ? 'struck as a whole' : 'strummed'}`, `Einfache Fassung: dieselben Akkorde, ${piano ? 'als Ganzes angeschlagen' : 'angeschlagen'}`)}</a>` : ''}${it.hands ? ` <a href="#/${open}/${encodeURIComponent(it.hands.id)}">${it.hands.id.endsWith('~together') ? L('Both hands together: a bass under the melody', 'Beide Hände zusammen: ein Bass unter der Melodie') : L('Both hands: the root in the left, then the chord', 'Beide Hände: der Grundton links, dann der Akkord')}</a>` : ''}${!piano && SING_ALONG[it.id] ? ` <a href="#/singalong/${encodeURIComponent(it.id)}">${L('Sing and play: the words under the chords', 'Singen und spielen: der Text unter den Akkorden')}</a>` : ''}${it.guitar ? ` <span class="otherkey">${L(`On the guitar the song has ${it.guitar.map((c) => esc(chordName(c))).join(', ')}: here it is in the key that lies best under the hand.`, `Auf der Gitarre hat der Song ${it.guitar.map((c) => esc(chordName(c))).join(', ')}: Hier steht er in der Tonart, die am besten unter der Hand liegt.`)}</span>` : ''}</small></div>
          ${here ? `<span class="tag up">${L("in today's session", 'in der heutigen Session')}</span>` : '<span></span>'}<span class="lvl">${pips(level(it.m))}<small>${fin ? L('done', 'erledigt') : L(`your level: ${level(it.m)} of 5`, `deine Stufe: ${level(it.m)} von 5`)}</small></span>
          <span class="row"><button class="btn quiet star" data-fav="${esc(it.id)}" aria-pressed="${store.isFav(inst, it.id)}" aria-label="${L(`Favourite: ${esc(it.title)}`, `Favorit: ${esc(it.title)}`)}">${store.isFav(inst, it.id) ? '★' : '☆'}</button>${it.custom ? `<button class="btn quiet" data-del="${esc(it.id)}">${L('Remove', 'Entfernen')}</button>` : ''}<a class="btn" href="#/${open}/${encodeURIComponent(it.id)}">${L('Open', 'Öffnen')}${icon('right')}</a></span>
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
        $$('[data-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pick === '')));
        list();
      }),
  );
  $$('[data-pick]', root).forEach(
    (b) =>
      (b.onclick = () => {
        view.pick = b.dataset.pick ?? '';
        $$('[data-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        list();
      }),
  );
  $$('[data-kind]', root).forEach(
    (b) =>
      (b.onclick = () => {
        view.kind = b.dataset.kind ?? '';
        $$('[data-kind]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        list();
      }),
  );
  const q = root.querySelector<HTMLInputElement>('#q');
  if (q)
    q.oninput = () => {
      view.q = q.value;
      list();
    };
  list();
};

const TAB_EXAMPLE = `e|-----0-----0---|-----0-----0---|
B|---1---1-----1-|---1---1-----1-|
G|-2-------2-----|-0-------0-----|
D|---------------|---------------|
A|-0-------------|-3-------------|
E|---------------|---------------|`;

export const importer: Screen = (root) => {
  const voice = store.settings.instrument === 'voice';
  // a voice types a melody by its note names, as the piano does
  const piano = store.settings.instrument === 'piano' || voice;
  root.innerHTML = `<div class="page">
    <div><a class="btn quiet" href="#/songs">${icon('left')}${piano && !voice ? L('Pieces', 'Stücke') : L('Songs', 'Songs')}</a></div>
    <div><p class="kick">${voice ? L('Voice · your own melody', 'Stimme · deine eigene Melodie') : piano ? L('Piano · your own melody', 'Klavier · deine eigene Melodie') : L('Guitar · your own song', 'Gitarre · dein eigener Song')}</p><h1>${piano ? L('Type a melody.', 'Tipp eine Melodie ein.') : L('Paste a tab.', 'Füg eine Tabulatur ein.')}</h1>
      <p class="lede">${
        piano
          ? L(
              'Note names with their octave, left to right: <b>E4 E4 F4 G4</b>. A new line starts a new phrase. <b>F#4</b> and <b>Bb3</b> are black keys, <b>C4:2</b> is twice as long, <b>E4(3)</b> is played with finger 3.',
              'Notennamen mit ihrer Oktave, von links nach rechts: <b>E4 E4 F4 G4</b>. Eine neue Zeile beginnt eine neue Phrase. <b>F#4</b> und <b>Bb3</b> sind schwarze Tasten, <b>C4:2</b> ist doppelt so lang, <b>E4(3)</b> wird mit Finger 3 gespielt.',
            )
          : L(
              'A text tab as you find them everywhere: six lines, the high e string on top, fret numbers on dashes, bars split by <b>|</b>. Numbers in the same column are played together.',
              'Eine Tabulatur als Text, wie man sie überall findet: sechs Zeilen, die hohe e-Saite oben, Bundnummern auf Strichen, Takte getrennt durch <b>|</b>. Zahlen in derselben Spalte werden zusammen gespielt.',
            )
      }</p></div>
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
