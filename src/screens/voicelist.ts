/**
 * The songs to sing: easiest first, by what they ask of a voice (how wide, how big the leaps, how quick).
 * Each row says where the song will lie in this voice, since every song is moved into the singer's range.
 */
import { L } from '../core/i18n';
import { store } from '../core/store';
import { finished, LEVELS } from '../music/difficulty';
import { songsToSing, sungPhraseKey, voiceProfile, type SongToSing, type VoiceProfile } from '../music/voicebook';
import { noteName } from '../music/theory';
import { $, $$, cap, esc, icon, type Screen } from '../ui/dom';
import { pips } from './home';
import { currentId } from './session';
import { placeFor, rangeMeasured } from './sing';

/** What the list shows, kept while the app is open. */
const view: { level: number | null; q: string; pick: string } = { level: null, q: '', pick: '' };

/** By line as shown: "Traditional" in the language shown. */
const byLine = (by: string): string => (by === 'Traditional' ? L('Traditional', 'Traditionell') : by);

export const voiceLibrary: Screen = (root) => {
  const items = songsToSing().map((s) => ({ s, p: voiceProfile(s) }));
  const cur = currentId('voice');
  if (view.level === null) view.level = items.find((it) => it.s.id === cur)?.p.level ?? 1;
  const count = (lv: number): number => items.filter((it) => it.p.level === lv).length;
  const grade = (p: VoiceProfile): string => `<span class="grade g${p.level}" role="img" aria-label="${L(`Difficulty ${p.level} of 4: ${LEVELS[p.level]}`, `Schwierigkeit ${p.level} von 4: ${LEVELS[p.level]}`)}">${[1, 2, 3, 4].map((i) => `<i class="${i <= p.level ? 'on' : ''}"></i>`).join('')}<b>${LEVELS[p.level]}</b></span>`;
  /** the singer's level in a song: the lowest of its phrases, as a whole number */
  const level = (s: SongToSing): number => {
    const ks = [...new Set(s.phrases.map((_, k) => sungPhraseKey(s, k)))];
    return Math.floor(ks.reduce((sum, k) => sum + store.skills.level(k), 0) / ks.length);
  };
  /** where the song lies in this voice: its lowest and highest note, moved */
  const lies = (s: SongToSing): string => {
    const midis = s.phrases.flat().map((n) => n.midi);
    const k = placeFor(s);
    return L(`In your voice: ${noteName(Math.min(...midis) + k)} to ${noteName(Math.max(...midis) + k)}.`, `In deiner Stimme: ${noteName(Math.min(...midis) + k)} bis ${noteName(Math.max(...midis) + k)}.`);
  };
  type Item = { s: SongToSing; p: VoiceProfile };
  const recent = store.recent.voice ?? [];
  /** begun and not finished: the songs to come back to */
  const needsWork = ({ s }: Item): boolean => !finished('voice', s.id) && level(s) < 4 && s.phrases.some((_, k) => store.skills.get(sungPhraseKey(s, k)));
  const PICKS: [string, string, (it: Item) => boolean][] = [
    ['', L('Everything', 'Alles'), () => true],
    ['favs', L('Favourites', 'Favoriten'), ({ s }) => store.isFav('voice', s.id)],
    ['recent', L('Sung lately', 'Zuletzt gesungen'), ({ s }) => recent.includes(s.id)],
    ['work', L('Needs work', 'Braucht Arbeit'), needsWork],
  ];

  root.innerHTML = `<div class="page">
    <div><p class="kick">${L(`Voice · ${items.length} songs`, `Stimme · ${items.length} ${items.length === 1 ? 'Song' : 'Songs'}`)}</p><h1>${L('What do you want to sing?', 'Was willst du singen?')}</h1>
      <p class="lede">${L(
        `Easiest first. The level says what a song asks of a voice: how wide it is, how big its leaps are, how quick it goes. Every song is moved into your range${rangeMeasured() ? '' : ' (until it is measured, into a middle voice)'}, and you sing it with its words, or, where it has none, in solfège (do re mi). The one you open goes into today's session.`,
        `Das Leichteste zuerst. Die Stufe sagt, was ein Song von einer Stimme verlangt: wie weit er reicht, wie groß seine Sprünge sind, wie schnell er geht. Jeder Song wird in deinen Umfang gelegt${rangeMeasured() ? '' : ' (bis er gemessen ist, in eine mittlere Stimme)'}, und du singst ihn mit seinem Text, oder, wo er keinen hat, in Solmisation (do re mi). Was du öffnest, kommt in die heutige Session.`,
      )}</p></div>
    <div class="libbar">
      <div class="seg" role="group" aria-label="${L('Level', 'Stufe')}">${[0, 1, 2, 3, 4].map((lv) => `<button data-level="${lv}" aria-pressed="${view.level === lv}">${lv ? LEVELS[lv] : L('All', 'Alle')} <small>${lv ? count(lv) : items.length}</small></button>`).join('')}</div>
      <div class="seg" role="group" aria-label="${L('Show', 'Zeigen')}">${PICKS.map(([k, name, f]) => `<button data-pick="${k}" aria-pressed="${view.pick === k}">${name}${k ? ` <small>${items.filter(f).length}</small>` : ''}</button>`).join('')}</div>
      <input id="q" type="search" placeholder="${L('Search: title or composer', 'Suche: Titel oder Komponist')}" aria-label="${L('Search the songs', 'Songs durchsuchen')}" value="${esc(view.q)}">
    </div>
    <p class="note" id="shown" aria-live="polite"></p>
    <ul class="lib" id="list"></ul>
    <div class="row"><a class="btn" href="#/import">${L('Add a melody of your own', 'Eigene Melodie hinzufügen')}</a></div>
  </div>`;

  const row = ({ s, p }: Item): string => {
    const here = s.id === cur;
    const fin = finished('voice', s.id);
    const lv = level(s);
    return `<li${here ? ' class="cur"' : ''}>
        <div><b>${esc(s.title)}</b>${s.by ? `<span class="by">${esc(byLine(s.by))}</span>` : ''}${grade(p)}
          <small>${esc(cap(p.reasons.join(' · ')))}</small>
          <small class="you">${esc(lies(s))} ${fin ? L('You sing it at full speed.', 'Im vollen Tempo gesungen.') : L(`${s.phrases.length} phrases.`, `${s.phrases.length} Phrasen.`)}</small></div>
        ${here ? `<span class="tag up">${L("in today's session", 'in der heutigen Session')}</span>` : '<span></span>'}<span class="lvl">${pips(lv)}<small>${fin ? L('done', 'erledigt') : L(`your level: ${lv} of 5`, `deine Stufe: ${lv} von 5`)}</small></span>
        <span class="row"><button class="btn quiet star" data-fav="${esc(s.id)}" aria-pressed="${store.isFav('voice', s.id)}" aria-label="${L(`Favourite: ${esc(s.title)}`, `Favorit: ${esc(s.title)}`)}">${store.isFav('voice', s.id) ? '★' : '☆'}</button><a class="btn" href="#/sing/${encodeURIComponent(s.id)}">${L('Open', 'Öffnen')}${icon('right')}</a></span>
      </li>`;
  };

  function list(): void {
    const words = view.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const picked = PICKS.find(([k]) => k === view.pick)?.[2] ?? (() => true);
    const match = (it: Item): boolean => {
      const { s, p } = it;
      if (!picked(it)) return false;
      // a pick of its own looks through every level, as a search does
      if (!words.length) return !!view.pick || !view.level || p.level === view.level;
      const hay = `${s.title} ${s.by ?? ''} ${s.by === 'Traditional' ? byLine(s.by) : ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    const shown = items.filter(match);
    // sung lately: the latest first
    if (view.pick === 'recent') shown.sort((a, b) => recent.indexOf(a.s.id) - recent.indexOf(b.s.id));
    let h = '';
    let lv = 0;
    for (const it of shown) {
      if ((!view.level || words.length || view.pick) && view.pick !== 'recent' && it.p.level !== lv) {
        lv = it.p.level;
        const n = shown.filter((x) => x.p.level === lv).length;
        h += `<li class="sep"><b>${LEVELS[lv]}</b><small>${n} ${n === 1 ? 'Song' : 'Songs'}</small></li>`;
      }
      h += row(it);
    }
    $('#list', root).innerHTML = h;
    $$('[data-fav]', root).forEach(
      (b) =>
        (b.onclick = () => {
          const on = store.toggleFav('voice', b.dataset.fav!);
          store.save();
          b.setAttribute('aria-pressed', String(on));
          b.textContent = on ? '★' : '☆';
        }),
    );
    $('#shown', root).textContent = !shown.length ? (view.pick === 'favs' && !words.length ? L('No favourites yet: the star on a row makes one.', 'Noch keine Favoriten: Der Stern in einer Zeile macht einen.') : view.pick === 'recent' && !words.length ? L('Nothing sung yet.', 'Noch nichts gesungen.') : L('Nothing found. Try another word, or another level.', 'Nichts gefunden. Versuch ein anderes Wort oder eine andere Stufe.')) : words.length ? L(`${shown.length} found for "${view.q.trim()}", in every level.`, `${shown.length} gefunden für „${view.q.trim()}“, in allen Stufen.`) : '';
  }
  $$('[data-level]', root).forEach(
    (b) =>
      (b.onclick = () => {
        view.level = Number(b.dataset.level);
        view.pick = '';
        $$('[data-level]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        $$('[data-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pick === '')));
        list();
      }),
  );
  $$('[data-pick]', root).forEach(
    (b) =>
      (b.onclick = () => {
        view.pick = b.dataset.pick!;
        $$('[data-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        list();
      }),
  );
  const q = $<HTMLInputElement>('#q', root);
  q.oninput = () => {
    view.q = q.value;
    list();
  };
  list();
};
