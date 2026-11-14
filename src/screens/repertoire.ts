/**
 * The repertoire: what the player can play. A song gets in when every part of it has been played clean at
 * full speed; from then on it comes back at growing gaps, from cold, and this page shows how each one
 * stands: since when, how fast at best, how the last cold try went, and when it is due again.
 */
import { dayMonth, L } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { finished } from '../music/difficulty';
import { everything, type Freshness, relDay, repertoire, type RepertoireItem, songSkills, whatStays } from '../music/review';
import { $, $$, esc, icon, keys, type Screen } from '../ui/dom';
import { hasTakes, loadTake, TAKE_RATE, takeFile, takeMeta } from '../core/takes';

/** The progress pages under one entry: the path, the repertoire, the course over weeks. */
export const progressTabs = (at: 'progress' | 'repertoire' | 'trends'): string =>
  `<nav class="tabs" aria-label="${L('Progress', 'Fortschritt')}">${(
    [
      ['progress', L('Path', 'Weg')],
      ['repertoire', L('Repertoire', 'Repertoire')],
      ['trends', L('Over the weeks', 'Über die Wochen')],
    ] as const
  )
    .map(([k, label]) => `<a href="#/${k}"${k === at ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('')}</nav>`;

/** Where a song of the instrument is opened, and with what. */
export const lessonHref = (inst: Instrument, id: string, rung = ''): string => `#/${inst === 'voice' ? 'sing' : inst === 'piano' ? 'piano' : 'song'}/${encodeURIComponent(id)}${rung ? '/' + rung : ''}`;

const FRESH = (): Record<Freshness, [string, string]> => ({
  fresh: [L('kept', 'sitzt'), L('played cold and clean at its last visit', 'beim letzten Besuch kalt und sauber gespielt')],
  due: [L('due', 'fällig'), L('time to play it again from cold', 'Zeit, es wieder aus dem Stand zu spielen')],
  slipped: [L('slipped', 'verrutscht'), L('the last visit fell apart: it comes back with the click', 'der letzte Besuch ging schief: Es kommt mit Klick wieder')],
});

/** The songs nearest to getting in: begun, most of their parts at full speed already. */
function nearest(inst: Instrument): { id: string; title: string; done: number; of: number }[] {
  return everything(inst)
    .filter((x) => !finished(inst, x.id))
    .map((x) => {
      const ks = songSkills(inst, x.id);
      return { id: x.id, title: x.title, done: ks.filter((k) => store.skills.level(k) >= 4).length, of: ks.length, begun: ks.some((k) => store.skills.get(k)) };
    })
    .filter((x) => x.begun && x.of > 0)
    .sort((a, b) => b.done / b.of - a.done / a.of)
    .slice(0, 3);
}

/**
 * The recordings of one song: the first one ever made and the latest, side by side, each with its bars to
 * pick and listen to. What weeks of practice did, heard rather than read.
 */
export const takesPage: Screen = (root, [id]) => {
  const inst = store.settings.instrument;
  const title = everything(inst).find((x) => x.id === id)?.title ?? id;
  const both = (['first', 'last'] as const).map((w) => ({ w, meta: takeMeta(inst, id, w) })).filter((x) => x.meta);
  // one recording only (the first is the latest): shown once
  const shown = both.length === 2 && both[0].meta!.t === both[1].meta!.t ? both.slice(1) : both;
  root.innerHTML = `<div class="page">
    ${progressTabs('repertoire')}
    <div><p class="kick">${L('Your recordings', 'Deine Aufnahmen')}</p><h1>${esc(title)}</h1>
      <p class="lede">${L('Made when you played it all the way through. They stay in this browser; nothing is sent anywhere. Pick a bar to hear just that bar; the green ones the app heard clean.', 'Entstanden, als du es ganz durchgespielt hast. Sie bleiben in diesem Browser; nichts wird irgendwohin geschickt. Wähl einen Takt, um nur ihn zu hören; die grünen hat die App sauber gehört.')}</p></div>
    ${
      shown.length
        ? shown
            .map(
              ({ w, meta }) => `<section class="takecard" data-w="${w}">
      <p class="k">${w === 'first' ? L('Your first recording', 'Deine erste Aufnahme') : L('The latest', 'Die neueste')} · ${dayMonth(meta!.t)} · ${meta!.tempo} % · ${L(`${meta!.bars.filter((b) => b.clean).length} of ${meta!.bars.length} clean`, `${meta!.bars.filter((b) => b.clean).length} von ${meta!.bars.length} sauber`)}</p>
      <div class="barmap">${meta!.bars.map((b, k) => `<button class="bm ${b.clean ? 'ok' : 'bad'}" data-k="${k}" aria-label="${L(`bar ${b.bar + 1}`, `Takt ${b.bar + 1}`)}">${b.bar + 1}</button>`).join('')}</div>
      <div class="row"><button class="btn" data-play>${L('Listen to all of it', 'Ganz anhören')}</button><button class="btn quiet" data-save>${L('Save as a file', 'Als Datei speichern')}</button></div>
    </section>`,
            )
            .join('')
        : `<p class="note">${L('No recording of it yet: one is made whenever it is played to the end at full speed (rung 3).', 'Noch keine Aufnahme davon: Eine entsteht, wann immer es im vollen Tempo bis zum Ende gespielt wird (Stufe 3).')}</p>`
    }
    <div class="row"><a class="btn" href="#/repertoire">${icon('left')}${L('Repertoire', 'Repertoire')}</a><a class="btn quiet" href="${lessonHref(inst, id, '3')}">${L('Play it all now', 'Jetzt ganz spielen')}</a><span class="note" id="msg"></span></div>
  </div>`;
  let source: AudioBufferSourceNode | null = null;
  let ctx: AudioContext | null = null;
  const stop = (): void => {
    try {
      source?.stop();
    } catch {
      // already ended
    }
    source = null;
  };
  /** Plays part of a kept recording through the speakers: this page does not listen, so no microphone is needed. */
  const play = async (w: 'first' | 'last', from = 0, to = Infinity): Promise<void> => {
    stop();
    const s = await loadTake(inst, id, w);
    if (!s) return void ($('#msg', root).textContent = L('This recording could not be read from the browser.', 'Diese Aufnahme ließ sich nicht aus dem Browser lesen.'));
    ctx ??= new AudioContext();
    const part = s.subarray(Math.floor(from * TAKE_RATE), Math.min(s.length, Math.floor(to * TAKE_RATE)));
    const buf = ctx.createBuffer(1, part.length, TAKE_RATE);
    buf.getChannelData(0).set(part);
    source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start();
  };
  $$('.takecard', root).forEach((card) => {
    const w = card.dataset.w as 'first' | 'last';
    const meta = takeMeta(inst, id, w)!;
    card.querySelector<HTMLElement>('[data-play]')!.onclick = () => void play(w);
    card.querySelector<HTMLElement>('[data-save]')!.onclick = async () => {
      const blob = await takeFile(inst, id, w);
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${id}-${w}-${new Date(meta.t).toISOString().slice(0, 10)}.wav`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    card.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => {
      const bar = meta.bars[Number(b.dataset.k)];
      b.onclick = () => void play(w, Math.max(0, bar.from - 0.15), bar.to + 0.4);
    });
  });
  return () => {
    stop();
    void ctx?.close();
  };
};

/** Does coming back keep them: the songs that came back often against the others, or why it is too early to say. */
function stayPanel(inst: Instrument, now: number): string {
  const r = whatStays(inst, now);
  const pct = (v: number): string => `${Math.round(v * 100)} %`;
  const body = r.enough
    ? L(
        `Songs that came back twice or more (${r.often.n}): at the first try of a later day, ${pct(r.often.kept)} of their best was left. The others (${r.seldom.n}): ${pct(r.seldom.kept)}. ${r.often.kept > r.seldom.kept + 0.05 ? 'Coming back keeps them, for you.' : r.seldom.kept > r.often.kept + 0.05 ? 'So far the songs that came back less kept more: harder songs come back more often, so this may change.' : 'So far there is little between them.'}`,
        `Songs, die zweimal oder öfter wiederkamen (${r.often.n}): Beim ersten Versuch eines späteren Tages war ${pct(r.often.kept)} ihres besten Werts übrig. Die anderen (${r.seldom.n}): ${pct(r.seldom.kept)}. ${r.often.kept > r.seldom.kept + 0.05 ? 'Das Wiederkommen hält sie, bei dir.' : r.seldom.kept > r.often.kept + 0.05 ? 'Bisher haben die seltener wiedergekehrten mehr behalten: Schwere Songs kommen öfter wieder, das kann sich noch ändern.' : 'Bisher liegt wenig zwischen ihnen.'}`,
      )
    : L(
        `Too early to say: it takes five songs a side, each a month or longer in your repertoire (now ${r.often.n} that came back twice or more, ${r.seldom.n} others). Then this shows whether coming back keeps your songs better than leaving them.`,
        `Noch zu früh: Es braucht fünf Songs auf jeder Seite, jeder einen Monat oder länger in deinem Repertoire (jetzt ${r.often.n}, die zweimal oder öfter wiederkamen, ${r.seldom.n} andere). Dann zeigt sich hier, ob das Wiederkommen deine Songs besser hält als das Liegenlassen.`,
      );
  return `<div class="stay"><p class="k">${L('Does coming back keep them?', 'Hält das Wiederkommen die Songs?')}</p><p>${body}</p></div>`;
}

export const repertoirePage: Screen = (root) => {
  const inst = store.settings.instrument;
  const now = Date.now();
  const items = repertoire(inst, now);
  const due = items.filter((x) => x.freshness !== 'fresh' && x.due <= now);
  const word = inst === 'piano' ? [L('piece', 'Stück'), L('pieces', 'Stücke')] : [L('song', 'Song'), L('songs', 'Songs')];
  const name = { guitar: L('Guitar', 'Gitarre'), piano: L('Piano', 'Klavier'), voice: L('Voice', 'Stimme') }[inst];
  const near = items.length ? [] : nearest(inst);
  const tempo = (v: number): string => (v > 0 ? `${v} %` : '–');
  const row = (x: RepertoireItem): string => {
    const [tag, why] = FRESH()[x.freshness];
    return `<li data-id="${esc(x.id)}">
      <div><b>${esc(x.title)}</b><small>${L(`in your repertoire since ${dayMonth(x.since)} · last played ${relDay(x.last || x.since, now)}`, `im Repertoire seit ${dayMonth(x.since)} · zuletzt gespielt ${relDay(x.last || x.since, now)}`)}</small></div>
      <span class="num"><small>${L('best', 'bester Wert')}</small>${tempo(x.best)}</span>
      <span class="num"><small>${L('last cold try', 'zuletzt kalt')}</small>${tempo(x.cold)}</span>
      <span class="fresh ${x.freshness}" title="${esc(why)}"><b>${tag}</b><small>${x.due <= now ? L('due now', 'jetzt fällig') : L(`next visit ${relDay(x.due, now)}`, `nächster Besuch ${relDay(x.due, now)}`)}</small></span>
      <span class="row">${hasTakes(inst, x.id) ? `<a class="btn quiet" href="#/takes/${encodeURIComponent(x.id)}">${L('Recordings', 'Aufnahmen')}</a>` : ''}<a class="btn" href="${lessonHref(inst, x.id, 'review')}">${L('From cold', 'Aus dem Stand')}</a><a class="btn quiet" href="${lessonHref(inst, x.id, '3')}">${L('Play it all', 'Ganz spielen')}${icon('right')}</a></span>
    </li>`;
  };
  root.innerHTML = `<div class="page">
    ${progressTabs('repertoire')}
    <div><p class="kick">${L(`Your repertoire · ${name}`, `Dein Repertoire · ${name}`)}</p>
      <h1>${items.length ? L(`You can play ${items.length} ${items.length === 1 ? word[0] : word[1]}.`, `Das kannst du spielen: ${items.length} ${items.length === 1 ? word[0] : word[1]}.`) : L(`Nothing in your repertoire yet.`, `Noch nichts in deinem Repertoire.`)}</h1>
      <p class="lede">${L(
        `A ${word[0]} gets in when every part of it has been played clean at full speed. From then on it comes back at growing gaps (3 days, 10, 30, 90, 180), two lines from cold: what is played again like that is what stays. A visit that falls apart brings it back the next day, with the click.`,
        `Ein ${word[0]} kommt hinein, wenn jeder Teil davon sauber im vollen Tempo gespielt wurde. Danach kommt es in wachsenden Abständen wieder (3 Tage, 10, 30, 90, 180), zwei Zeilen aus dem Stand: Was so wiederholt wird, bleibt. Geht ein Besuch schief, kommt es am nächsten Tag mit Klick wieder.`,
      )}</p></div>
    ${due.length ? `<div class="duebox"><p><b>${L(`Due today: ${due.map((x) => esc(x.title)).join(', ')}.`, `Heute fällig: ${due.map((x) => esc(x.title)).join(', ')}.`)}</b> ${L("Today's session takes the first of them; or play one now.", 'Die heutige Session nimmt den ersten davon; oder spiel jetzt einen.')}</p><a class="btn primary" id="go" href="${lessonHref(inst, due[0].id, 'review')}">${L(`Play ${esc(due[0].title)} from cold`, `${esc(due[0].title)} aus dem Stand spielen`)} <kbd>${L('Space', 'Leertaste')}</kbd></a></div>` : ''}
    ${
      items.length
        ? `<ul class="rep" aria-label="${L('Your repertoire', 'Dein Repertoire')}">${items.map(row).join('')}</ul>`
        : `<div class="duebox"><p>${
            near.length
              ? L(`Nearest to getting in: ${near.map((x) => `<a href="${lessonHref(inst, x.id)}">${esc(x.title)}</a> (${x.done} of ${x.of} parts at full speed)`).join(', ')}.`, `Am nächsten dran: ${near.map((x) => `<a href="${lessonHref(inst, x.id)}">${esc(x.title)}</a> (${x.done} von ${x.of} Teilen im vollen Tempo)`).join(', ')}.`)
              : L("Today's session works towards the first one.", 'Die heutige Session arbeitet auf den ersten hin.')
          }</p><a class="btn" href="#/songs">${inst === 'piano' ? L('All pieces', 'Alle Stücke') : L('All songs', 'Alle Songs')}</a></div>`
    }
    ${stayPanel(inst, now)}
    <p class="note">${L('Best is the slowest part of it at its best; the last cold try is the first try of the last day it was played, the honest one.', 'Der beste Wert ist der langsamste Teil in seiner besten Form; „zuletzt kalt“ ist der erste Versuch am letzten Tag, an dem es gespielt wurde, der ehrliche.')}</p>
  </div>`;
  $$('.rep li', root).forEach((li) => li.setAttribute('tabindex', '-1'));
  return keys({ ' ': () => due[0] && (location.hash = lessonHref(inst, due[0].id, 'review').slice(1)) });
};
