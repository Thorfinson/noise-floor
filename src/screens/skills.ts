/**
 * Learn: the path and the skills in one place. At the top, where the player is on the path, as a painted map
 * of stepping stones, with the one thing to go on with. Under it every skill of the instrument, in the order of
 * the handbook's chapters, and for the skill that is open: its pages to read, what to practise it with, and the
 * level the microphone has measured. What used to be spread over Basics, Tools, Games and Progress.
 */
import { dayMonth, L } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { KEY_CHORDS } from '../music/content';
import { learningPath, OPEN_CHORDS, type Stage } from '../music/path';
import { $, $$, esc, icon, keys, type Screen } from '../ui/dom';
import { LANDS, Trail, type StoneState } from '../ui/trail';
import { handbookOf, pageOf } from './basics';
import { openSongs } from './library';
import { focusChord } from './session';

interface Practice {
  label: string;
  note: string;
  href: string;
  /** opened in the toolbox, over this page */
  tool?: string;
}

/** What each page of the handbook is practised with. */
function trainers(inst: Instrument): Record<string, Practice[]> {
  const stones: Practice = { label: L('Stepping stones', 'Trittsteine'), note: L('The rhythm game: one strum on every stone', 'Das Rhythmusspiel: ein Anschlag auf jeden Stein'), href: '#/stride' };
  const rhythm: Practice = { label: L('Reading rhythm', 'Rhythmus lesen'), note: L('Note values with the click, six levels', 'Notenwerte mit dem Klick, sechs Stufen'), href: '#/rhythm' };
  const ear: Practice = { label: L('By ear', 'Nach Gehör'), note: inst === 'voice' ? L('A note given, the distance named: sing the second', 'Ein Ton gegeben, der Abstand genannt: Sing den zweiten') : L('Motifs played back, chords told apart', 'Motive nachspielen, Akkorde unterscheiden'), href: '#/ear' };
  return {
    hold: [{ label: L('Guitar tuner', 'Stimmgerät'), note: L('String by string, which way to turn', 'Saite für Saite, in welche Richtung du drehst'), href: '#/tuner', tool: 'tuner' }],
    count: [stones, rhythm],
    chord: [{ label: L('Chord check', 'Akkord-Check'), note: L('String by string, no clock', 'Saite für Saite, ohne Uhr'), href: `#/chord/${encodeURIComponent(focusChord())}` }],
    diagram: [{ label: L('Chord library', 'Griffbibliothek'), note: L('Every shape, with fingers', 'Jeder Griff, mit Fingern'), href: '#/chords', tool: 'chords' }],
    press: [{ label: L('Chord changes', 'Akkordwechsel'), note: L('One change without a clock, then one calm minute', 'Ein Wechsel ohne Uhr, dann eine ruhige Minute'), href: '#/change' }],
    strum: [{ label: L('Strumming', 'Schlagmuster'), note: L('Patterns of the right hand: muted, on one chord, with a change', 'Muster der rechten Hand: abgedämpft, auf einem Akkord, mit Wechsel'), href: '#/strum' }],
    patterns: [stones],
    pluck: [{ label: L('Finger gym', 'Fingertraining'), note: L('Spider, reverse and skip patterns, one finger per fret', 'Spinne, rückwärts und mit Sprung, ein Finger pro Bund'), href: '#/run/fingers' }],
    slur: [{ label: L('Hammer-on and pull-off', 'Hammer-on und Pull-off'), note: L('Six patterns; the app hears whether each note sounds', 'Sechs Muster; die App hört, ob jeder Ton klingt'), href: '#/slur' }],
    ear: [ear],
    pent: [{ label: L('Play freely', 'Frei spielen'), note: L('Five notes over a drone: the app shows what it heard, no score', 'Fünf Töne über einem Bordun: Die App zeigt, was sie gehört hat, ohne Wertung'), href: '#/jam' }],
    'p-broken': [{ label: L('Play freely', 'Frei spielen'), note: L('Five notes over a chord: the app shows what it heard, no score', 'Fünf Töne über einem Akkord: Die App zeigt, was sie gehört hat, ohne Wertung'), href: '#/jam' }],
    'v-harmony': [{ label: L('Play freely', 'Frei spielen'), note: L('Sing phrases over a drone: no score', 'Sing Phrasen über einem Bordun: ohne Wertung'), href: '#/jam' }],
    barre: [{ label: L('Chord check: F', 'Akkord-Check: F'), note: L('The small barre first, a few tries a day', 'Erst das kleine Barré, ein paar Versuche am Tag'), href: '#/chord/F' }],
    'p-keys': [{ label: L('Piano pitch', 'Tonhöhe des Klaviers'), note: L('Where your piano’s A is', 'Wo das A deines Klaviers liegt'), href: '#/tuner/piano', tool: 'tuner/piano' }],
    'p-sit': [{ label: L('Five-finger run', 'Fünf-Finger-Runde'), note: L('Patterns for each hand, in the game', 'Muster für jede Hand, im Spiel'), href: '#/run/keys' }],
    'p-chord': [{ label: L('Chord check', 'Akkord-Check'), note: L('Key by key, then the chord as a whole', 'Taste für Taste, dann der ganze Akkord'), href: `#/keys/${encodeURIComponent(KEY_CHORDS[0])}` }],
    'p-figure': [{ label: L('Chord library', 'Griffbibliothek'), note: L('Every chord as keys', 'Jeder Akkord als Tasten'), href: '#/chords', tool: 'chords' }],
    'p-move': [{ label: L('Chord changes', 'Akkordwechsel'), note: L('Two chords, then one calm minute', 'Zwei Akkorde, dann eine ruhige Minute'), href: '#/change' }],
    'p-play': [stones],
    'p-notes': [rhythm],
    'p-thumb': [{ label: L('Scales', 'Tonleitern'), note: L('Thumb under, every key ringing on', 'Daumen unter, jede Taste klingt weiter'), href: '#/run/keys/1' }],
    'v-warm': [{ label: L('Your range', 'Dein Stimmumfang'), note: L('A low note and a high one, both comfortable', 'Ein tiefer und ein hoher Ton, beide bequem'), href: '#/range' }],
    'v-match': [{ label: L('Match the tone', 'Töne treffen'), note: L('Five notes sung back, in cents', 'Fünf Töne nachgesungen, in Cent'), href: '#/match' }],
    'v-steady': [{ label: L('Hold a tone', 'Einen Ton halten'), note: L('Five seconds, as steady as you can', 'Fünf Sekunden, so ruhig wie möglich'), href: '#/hold' }],
    'v-steps': [{ label: L('Voice gym', 'Stimmrunde'), note: L('Steps, thirds and do-mi-sol, in the game', 'Schritte, Terzen und do-mi-sol, im Spiel'), href: '#/run/sing' }],
    'v-interval': [ear],
    'v-range': [{ label: L('Your range', 'Dein Stimmumfang'), note: L('Measured again', 'Neu gemessen'), href: '#/range' }],
  };
}

/** Which stages of the path measure the skill of each page. */
const STAGES_OF: Record<string, string[]> = {
  count: ['rhythm'],
  chord: ['open'],
  press: ['changes'],
  strum: ['strums'],
  pluck: ['picking', 'fingers'],
  slur: ['slurs'],
  riff: ['riffs'],
  pent: ['pent'],
  ear: ['ear'],
  barre: ['barre'],
  'p-sit': ['hands'],
  'p-notes': ['rhythm'],
  'p-chord': ['chords', 'morekeys'],
  'p-move': ['kchanges'],
  'p-thumb': ['scales'],
  'p-hands': ['bothhands'],
  'p-together': ['together'],
  'v-match': ['vfirst', 'vfine'],
  'v-steps': ['vpatterns', 'vscale'],
  'v-interval': ['ear'],
};

/** Songs that use a skill: the list, opened with its kind or pick chosen. */
function songsOf(inst: Instrument, ids: string[]): { label: string; kind?: string; pick?: string } | null {
  const has = (k: string): boolean => ids.includes(k);
  if (inst === 'voice') return null;
  if (inst === 'piano') {
    if (has('p-chord')) return { label: L('Pieces of chords', 'Stücke aus Akkorden'), kind: 'chords' };
    if (has('p-broken')) return { label: L('Pieces of broken chords', 'Stücke mit gebrochenen Akkorden'), kind: 'broken' };
    if (has('p-notes')) return { label: L('Tunes', 'Melodien'), kind: 'melody' };
    return null;
  }
  if (has('chord')) return { label: L('Songs you can play now', 'Songs, die du jetzt spielen kannst'), pick: 'ready' };
  if (has('strum')) return { label: L('Songs to strum', 'Songs zum Anschlagen'), kind: 'strummed' };
  if (has('pluck')) return { label: L('Songs to pick', 'Songs zum Zupfen'), kind: 'picked' };
  if (has('riff')) return { label: L('Riffs, licks and power chords', 'Riffs, Licks und Powerchords'), kind: 'exercise' };
  if (has('ear')) return { label: L('Tunes to find by ear', 'Melodien zum Heraushören'), kind: 'melody' };
  return null;
}

/** The skills of an instrument: the handbook's chapters, each with its practice and its stages. */
function skillsOf(inst: Instrument, stages: Stage[]): { title: string; about: string; pages: string[]; practise: Practice[]; stages: Stage[]; songs: ReturnType<typeof songsOf> }[] {
  const train = trainers(inst);
  return handbookOf(inst).map((c) => {
    const seen = new Set<string>();
    const practise = c.ids.flatMap((id) => train[id] ?? []).filter((p) => !seen.has(p.href) && seen.add(p.href));
    const ids = [...new Set(c.ids.flatMap((id) => STAGES_OF[id] ?? []))];
    return { title: c.title, about: c.about, pages: c.ids, practise, stages: ids.map((id) => stages.find((s) => s.id === id)).filter((s): s is Stage => !!s), songs: songsOf(inst, c.ids) };
  });
}

export const learnPage: Screen = (root, [which]) => {
  const now = Date.now();
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const stages = learningPath(inst, now);
  const main = stages.filter((s) => s.state !== 'side');
  const here = main.find((s) => s.state === 'here');
  const doneStages = main.filter((s) => s.state === 'done').length;
  const skills = skillsOf(inst, stages);
  const read = (k: string): boolean => !!store.progress['seen:' + k];
  /** the stage whose sheet is open: where the player is, until another is picked */
  let picked = (here ?? main[main.length - 1]).id;
  const total = (s: Stage): number => s.items.length;
  const share = (s: Stage): number => (total(s) ? Math.round((100 * s.done) / total(s)) : 0);
  const where = (s: Stage): string => (s.state === 'done' ? L('done', 'erledigt') : s.state === 'here' ? L('you are here', 'du bist hier') : s.state === 'side' ? L('beside the path', 'neben dem Weg') : L('ahead', 'noch vor dir'));
  // the skill open below: asked for by its number, or the one the path is at, or the first with a page unread
  const atStage = skills.findIndex((k) => k.stages.some((s) => s.id === picked));
  let skill = Math.max(0, Math.min(skills.length - 1, which !== undefined && /^\d+$/.test(which) ? Number(which) - 1 : atStage >= 0 ? atStage : skills.findIndex((k) => k.pages.some((p) => !read(p)))));
  const stopAt = (i: number): number => 13 + (64 * i) / Math.max(1, main.length - 1);
  const stopWide = Math.min(20, 64 / Math.max(1, main.length - 1));
  const instName = inst === 'voice' ? L('voice', 'Stimme') : piano ? L('piano', 'Klavier') : L('guitar', 'Gitarre');

  root.innerHTML = `<div class="page bare learnhub">
    <section class="paper wayhead2">
      <div class="wayhead">
        <div><p class="kick">${L(`Learn · ${instName}`, `Lernen · ${instName}`)}${here ? ` · ${L(`stage ${main.indexOf(here) + 1} of ${main.length}`, `Etappe ${main.indexOf(here) + 1} von ${main.length}`)}` : ''}</p>
          <h1>${here ? esc(here.title) : L('Every stage of the path is done.', 'Jede Etappe des Wegs ist geschafft.')}</h1>
          <p class="lede">${here ? `${L(`${here.done} of ${total(here)} done.`, `${here.done} von ${total(here)} erledigt.`)}${here.next ? L(` Next: <b>${esc(here.next)}</b>.`, ` Als Nächstes: <b>${esc(here.next)}</b>.`) : ''}` : L('What is left is beside the path: the skills below.', 'Was bleibt, liegt neben dem Weg: die Fähigkeiten unten.')} ${L('The session works on this by itself; every stone on the map can be picked, and nothing is locked.', 'Die Session arbeitet von selbst daran; jeder Stein auf der Karte lässt sich wählen, und nichts ist gesperrt.')}</p></div>
        <div class="row">${here?.next ? `<a class="btn primary" id="goon" href="${here.nextHref ?? '#/session'}">${L(`Go on with: ${esc(here.next)}`, `Weiter mit: ${esc(here.next)}`)}${icon('right')}</a>` : ''}<a class="btn${here?.next ? '' : ' primary'}" href="#/session">${L("Today's session", 'Heutige Session')}</a></div>
      </div>
      <div class="journey">
        <canvas id="waymap" role="img" aria-label="${L('The path as a way over stepping stones: one stone for each stage. The stones of the stages that are done are lit, and the wanderer stands where you are.', 'Der Weg als Pfad über Trittsteine: ein Stein für jede Etappe. Die Steine der geschafften Etappen leuchten, und der Wanderer steht, wo du bist.')}"></canvas>
        <div class="stops" role="tablist" aria-label="${L('The stages of the path', 'Die Etappen des Wegs')}">${main
          .map((s, i) => `<button class="stop" role="tab" id="stop-${s.id}" data-stage="${s.id}" style="left:${(stopAt(i) - stopWide / 2).toFixed(2)}%;width:${stopWide.toFixed(2)}%" aria-selected="${s.id === picked}" aria-controls="stage"><span class="sr">${L(`Stage ${i + 1}: ${esc(s.title)}. ${s.done} of ${total(s)}, ${where(s)}.`, `Etappe ${i + 1}: ${esc(s.title)}. ${s.done} von ${total(s)}, ${where(s)}.`)}</span></button>`)
          .join('')}</div>
      </div>
      <section class="sheet" id="stage" role="tabpanel" aria-live="polite"></section>
    </section>
    <section class="skillsec" aria-labelledby="sktitle">
      <div class="sectitle"><h2 id="sktitle">${L('Skills', 'Fähigkeiten')}</h2><a href="#/basics">${L('The whole handbook', 'Das ganze Handbuch')}</a></div>
      <div class="skillgrid">
        <nav class="paper skilllist" aria-label="${L('Skills', 'Fähigkeiten')}" id="skilllist"></nav>
        <article class="paper skillpage" id="skill" aria-live="polite"></article>
      </div>
    </section>
  </div>`;

  const sheet = $('#stage', root);
  function show(): void {
    const s = stages.find((x) => x.id === picked) ?? main[0];
    const n = main.indexOf(s);
    // a stage of chords can be confirmed: all of them in a row, from memory
    const check = s.id === 'open' ? { key: 'check:open', href: `#/chord/check/${OPEN_CHORDS.join('/')}`, say: L('all eight in a row, from memory', 'alle acht hintereinander, aus dem Kopf') } : s.id === 'chords' ? { key: 'check:keys', href: `#/keys/check/${KEY_CHORDS.join('/')}`, say: L('all six in a row, from memory', 'alle sechs hintereinander, aus dem Kopf') } : null;
    const confirmed = !!check && s.done === total(s);
    sheet.innerHTML = `<header class="shd ${s.state}">
        <span class="badge">${s.state === 'done' ? icon('check') : n >= 0 ? n + 1 : '+'}</span>
        <div><p class="k">${n >= 0 ? L(`Stage ${n + 1} of ${main.length}`, `Etappe ${n + 1} von ${main.length}`) : L('Beside the path', 'Neben dem Weg')} · ${where(s)}</p><h2>${esc(s.title)}</h2><p>${esc(s.goal)}</p></div>
        <div class="prog"><b>${s.done}<small>${L(` of ${total(s)}`, ` von ${total(s)}`)}</small></b><span class="meter"><i style="width:${share(s)}%"></i></span></div>
      </header>
      ${
        confirmed
          ? store.progress[check!.key]
            ? `<p class="note">${L(`Stage confirmed on ${dayMonth(store.progress[check!.key])}: ${check!.say}.`, `Etappe bestätigt am ${dayMonth(store.progress[check!.key])}: ${check!.say}.`)}</p>`
            : `<p><a class="btn" href="${check!.href}">${L(`Stage check: ${check!.say}`, `Etappen-Check: ${check!.say}`)}</a></p>`
          : s.next && s.id !== here?.id
            ? `<p class="go"><a class="btn" href="${s.nextHref ?? '#/session'}">${L(`Go on with: ${esc(s.next)}`, `Weiter mit: ${esc(s.next)}`)}${icon('right')}</a></p>`
            : ''
      }
      <ul class="items">${s.items
        .map((i) => `<li class="${i.state}${i.rusty ? ' rusty' : ''}">${i.href ? `<a href="${i.href}">` : '<span>'}<i class="st" aria-hidden="true">${i.state === 'done' ? icon('check') : ''}</i><b>${esc(i.label)}</b><small>${esc(i.rusty ? L('rusty: play it again', 'eingerostet: spiel es noch einmal') : i.note || (i.state === 'new' ? L('new', 'neu') : ''))}</small>${i.href ? '</a>' : '</span>'}</li>`)
        .join('')}</ul>
      <p class="note legend"><span class="key done"></span>${L('done', 'erledigt')} <span class="key work"></span>${L('in work', 'in Arbeit')} <span class="key new"></span>${L('still new', 'noch neu')} <span class="key rusty"></span>${L('done, but not played for a week', 'erledigt, aber eine Woche nicht gespielt')}</p>`;
    $$('.stop', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.stage === picked)));
  }

  /** the skills on the left; the open one on the right: read, practise, your level */
  function drawSkills(): void {
    $('#skilllist', root).innerHTML = skills
      .map((k, i) => {
        const r = k.pages.filter(read).length;
        const st = k.stages[0];
        const said = st ? L(`${st.done} of ${total(st)}`, `${st.done} von ${total(st)}`) : L(`${r} of ${k.pages.length} read`, `${r} von ${k.pages.length} gelesen`);
        return `<a href="#/learn/${i + 1}" data-skill="${i}"${i === skill ? ' aria-current="true"' : ''}><span class="num">${i + 1}</span><span><b>${esc(k.title)}</b><small>${esc(said)}${k.pages.some((p) => !read(p)) ? `<em>${L('new pages', 'neue Seiten')}</em>` : ''}</small></span><span class="meter"><i style="width:${st ? share(st) : Math.round((100 * r) / Math.max(1, k.pages.length))}%"></i></span></a>`;
      })
      .join('');
    const k = skills[skill];
    $('#skill', root).innerHTML = `<header class="skhead"><div><p class="kick">${L(`Skill ${skill + 1} of ${skills.length}`, `Fähigkeit ${skill + 1} von ${skills.length}`)}</p><h2>${esc(k.title)}</h2><p class="lede">${esc(k.about)}</p></div>
        <figure class="skpic"><svg viewBox="0 0 520 380" aria-hidden="true">${pageOf(k.pages[0])?.art() ?? ''}</svg></figure></header>
      <div class="skcols">
        <section><p class="k">${icon('book')}${L('Read', 'Lesen')}</p><ul class="sklist">${k.pages
          .map((id) => {
            const pg = pageOf(id);
            return pg ? `<li><a href="#/basics/${id}" class="${read(id) ? 'done' : 'new'}"><i class="st" aria-hidden="true">${read(id) ? icon('check') : ''}</i><span><b>${esc(pg.title)}</b><small>${read(id) ? L('read', 'gelesen') : L('new', 'neu')}${pg.tryIt ? L(' · with something to try', ' · mit etwas zum Ausprobieren') : ''}</small></span></a></li>` : '';
          })
          .join('')}</ul></section>
        <section><p class="k">${icon('hands')}${L('Practise', 'Üben')}</p><ul class="sklist">${[
          ...k.practise.map((p) => `<li><a href="${p.href}"${p.tool ? ` data-toolbox="${p.tool}"` : ''}><i class="st go" aria-hidden="true">${icon('right')}</i><span><b>${esc(p.label)}</b><small>${esc(p.note)}</small></span></a></li>`),
          ...k.stages.filter((s) => s.next && s.nextHref).map((s) => `<li><a href="${s.nextHref}"><i class="st go" aria-hidden="true">${icon('right')}</i><span><b>${esc(s.next)}</b><small>${L(`Next in ${esc(s.short)}`, `Als Nächstes in ${esc(s.short)}`)}</small></span></a></li>`),
        ].join('') || `<li class="none">${L('Nothing to measure here: read it, then play.', 'Hier gibt es nichts zu messen: lies es, dann spiel.')}</li>`}</ul></section>
        <section><p class="k">${icon('progress')}${L('Your level', 'Deine Stufe')}</p>${
          k.stages.length
            ? k.stages.map((s) => `<button class="sklevel" data-stage="${s.id}"><span><b>${esc(s.short)}</b><small>${L(`${s.done} of ${total(s)}`, `${s.done} von ${total(s)}`)} · ${where(s)}</small></span><span class="meter"><i style="width:${share(s)}%"></i></span></button>`).join('')
            : `<p class="note">${L(`${k.pages.filter(read).length} of ${k.pages.length} pages read. The microphone measures nothing here.`, `${k.pages.filter(read).length} von ${k.pages.length} Seiten gelesen. Das Mikrofon misst hier nichts.`)}</p>`
        }${k.songs ? `<button class="btn quiet" id="sksongs">${icon('songs')}${esc(k.songs.label)}${icon('right')}</button>` : ''}</section>
      </div>`;
    $$('[data-skill]', root).forEach(
      (a) =>
        (a.onclick = (e) => {
          e.preventDefault();
          skill = Number(a.dataset.skill);
          history.replaceState(null, '', `#/learn/${skill + 1}`);
          drawSkills();
        }),
    );
    // a stage of the skill opens its sheet up on the map
    $$('.sklevel', root).forEach(
      (b) =>
        (b.onclick = () => {
          picked = b.dataset.stage!;
          show();
          $('#stage', root).scrollIntoView({ behavior: 'smooth', block: 'center' });
        }),
    );
    const songs = root.querySelector<HTMLButtonElement>('#sksongs');
    if (songs && k.songs) songs.onclick = () => openSongs(k.songs!);
  }

  $$('.stop', root).forEach(
    (b) =>
      (b.onclick = () => {
        picked = b.dataset.stage!;
        show();
      }),
  );
  show();
  drawSkills();

  // the map: the way as stepping stones in the land the player has got to
  const trail = new Trail($<HTMLCanvasElement>('#waymap', root), Math.min(LANDS.length - 1, Math.floor((doneStages * LANDS.length) / Math.max(1, main.length))), 215);
  const stones = main.map((_, i) => ({ at: i, chord: String(i + 1), bar: i }));
  const states = main.map((s): StoneState => (s.state === 'done' ? 'hit' : 'ahead'));
  const walker = here ? main.indexOf(here) : main.length - 1 + 0.8;
  if (!here) trail.end(true);
  let raf = requestAnimationFrame(function frame(ts: number): void {
    trail.draw({ beat: 0, stones, states, bars: main.length, name: (c) => c, count: () => '', map: { walker, mark: main.findIndex((s) => s.id === picked), label: (i) => [main[i].short, L(`${main[i].done} of ${total(main[i])}`, `${main[i].done} von ${total(main[i])}`)] } }, ts / 1000);
    raf = requestAnimationFrame(frame);
  });
  const stopKeys = keys({
    ArrowRight: () => {
      const i = main.findIndex((s) => s.id === picked);
      picked = main[Math.min(main.length - 1, i + 1)].id;
      show();
    },
    ArrowLeft: () => {
      const i = main.findIndex((s) => s.id === picked);
      picked = main[Math.max(0, i < 0 ? 0 : i - 1)].id;
      show();
    },
  });
  return () => {
    cancelAnimationFrame(raf);
    stopKeys();
  };
};
