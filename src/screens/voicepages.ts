/**
 * The handbook of the voice: what a beginner needs to know before and while singing with the app. Each page
 * is a picture, a few plain sentences and, where it helps, something to try while the app listens. The
 * pages are read when they are shown, in the language chosen at that moment.
 */
import { L } from '../core/i18n';
import { noteName } from '../music/theory';
import { LEARN } from '../ui/draw';

export interface VoicePage {
  id: string;
  title: string;
  points: string[];
  /** the picture: SVG for a viewBox of 520 by 380 */
  art: () => string;
  /** something to try: these notes sung one after the other (any octave), heard but not measured */
  tryIt?: { say: string; sing: number[]; count: number };
}

const P = LEARN;
const label = (x: number, y: number, text: string, anchor = 'start', color = P.muted): string => `<text x="${x}" y="${y}" class="lbl" text-anchor="${anchor}" fill="${color}">${text}</text>`;

/** Rows of a small pitch lane, from lo to hi, in a box. */
function rows(x: number, y: number, w: number, h: number, lo: number, hi: number, names = true): { svg: string; yOf: (m: number) => number } {
  const n = hi - lo + 1;
  const rh = h / n;
  const yOf = (m: number): number => y + h - (m - lo + 0.5) * rh;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fbf6ee" stroke="${P.line}" stroke-width="1.5"/>`;
  for (let m = lo; m <= hi; m++) {
    if ([1, 3, 6, 8, 10].includes(m % 12)) s += `<rect x="${x + 1}" y="${yOf(m) - rh / 2}" width="${w - 2}" height="${rh}" fill="rgba(38,38,46,0.06)"/>`;
    if (names && (m % 12 === 0 || m === lo)) s += label(x - 8, yOf(m) + 5, noteName(m), 'end', P.faint);
  }
  return { svg: s, yOf };
}

/** a person standing, seen from the side, drawn with a few lines */
function figure(x: number, y: number): string {
  return (
    `<circle cx="${x}" cy="${y}" r="26" fill="none" stroke="${P.text}" stroke-width="3"/>` +
    `<path d="M${x} ${y + 26}v118M${x} ${y + 144}l-22 98M${x} ${y + 144}l22 98M${x} ${y + 52}l-34 64M${x} ${y + 52}l34 64" fill="none" stroke="${P.text}" stroke-width="3" stroke-linecap="round"/>`
  );
}

export const VOICE_PAGES = (): VoicePage[] => [
  {
    id: 'v-stand',
    title: L('Standing and breathing', 'Stehen und atmen'),
    points: [
      L('Stand with the feet a hip-width apart, the knees soft, the head level, as if a thread pulled the top of it gently up. The shoulders hang loose.', 'Stell dich hüftbreit hin, die Knie locker, den Kopf gerade, als zöge ein Faden ihn sanft nach oben. Die Schultern hängen locker.'),
      L('Breathe in low: the belly and the sides widen, the shoulders stay where they are. Breathing in quickly through the mouth is fine; it is how singers breathe between lines.', 'Atme tief ein: Bauch und Flanken weiten sich, die Schultern bleiben, wo sie sind. Schnell durch den Mund einzuatmen ist in Ordnung; so atmen Sänger zwischen zwei Zeilen.'),
      L('Singing rides on the breath going out. Try it: breathe in low and let the air out on a long, even “sss” for ten seconds or more.', 'Singen reitet auf dem ausströmenden Atem. Probier es: tief einatmen und die Luft auf einem langen, gleichmäßigen „sss“ zehn Sekunden oder länger ausströmen lassen.'),
      L('Sitting works too, upright on the front of the chair. Lying on the sofa does not.', 'Sitzen geht auch, aufrecht auf der vorderen Stuhlkante. Auf dem Sofa liegen nicht.'),
    ],
    art: () =>
      figure(170, 70) +
      `<ellipse cx="170" cy="198" rx="44" ry="30" fill="${P.now}" opacity="0.14"/>` +
      `<path d="M226 198h52m-10 -8l10 8-10 8M114 198h-52m10 -8l-10 8 10 8" fill="none" stroke="${P.now}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
      label(300, 120, L('shoulders stay down', 'Schultern bleiben unten'), 'start', P.text) +
      label(300, 204, L('belly and sides widen', 'Bauch und Flanken weiten sich'), 'start', P.now) +
      label(300, 290, L('feet hip-width, knees soft', 'Füße hüftbreit, Knie locker'), 'start', P.text) +
      label(300, 340, L('out on a long “sss”', 'aus auf einem langen „sss“'), 'start', P.muted),
  },
  {
    id: 'v-warm',
    title: L('Warming up', 'Einsingen'),
    points: [
      L('A voice is a muscle: two or three minutes of warming up before singing make it easier and safer.', 'Die Stimme ist ein Muskel: Zwei, drei Minuten Einsingen vor dem Singen machen es leichter und schonen sie.'),
      L('Hum on “mm” in the middle of the voice, lips closed, teeth apart. You should feel a buzz on the lips.', 'Summ auf „mm“ in der Mitte deiner Stimme, Lippen zu, Zähne auseinander. Auf den Lippen sollte es kribbeln.'),
      L('Then glide: on “ng” or “oo”, slide slowly from low to high and back, like a siren. Lip trills (“brrr”) do the same and are kind to the voice.', 'Dann gleiten: auf „ng“ oder „u“ langsam von tief nach hoch und zurück, wie eine Sirene. Lippenflattern („brrr“) tut dasselbe und schont die Stimme.'),
      L('Nothing in a warm-up should be loud or hurt. If the voice feels rough, sing less today.', 'Nichts beim Einsingen soll laut sein oder wehtun. Fühlt sich die Stimme rau an, sing heute weniger.'),
    ],
    art: () => {
      const r = rows(80, 60, 400, 230, 48, 67);
      let d = `M90 ${r.yOf(50)}`;
      for (let i = 1; i <= 40; i++) {
        const x = 90 + i * 9.5;
        const m = 50 + 14 * Math.sin((Math.PI * i) / 40);
        d += `L${x} ${r.yOf(m).toFixed(1)}`;
      }
      return r.svg + `<path d="${d}" fill="none" stroke="${P.now}" stroke-width="4" stroke-linecap="round"/>` + label(280, 40, L('a siren: low to high and back, slowly', 'eine Sirene: langsam von tief nach hoch und zurück'), 'middle', P.text) + label(280, 330, L('on “ng”, “oo” or a lip trill', 'auf „ng“, „u“ oder mit Lippenflattern'), 'middle');
    },
  },
  {
    id: 'v-match',
    title: L('Finding a note', 'Einen Ton treffen'),
    points: [
      L('Listen to the note first and hear it inside before you sing. Then sing it softly on “ah”.', 'Hör dir den Ton erst an und hör ihn innerlich, bevor du singst. Dann sing ihn leise auf „ah“.'),
      L('If you are not on it, slide slowly up or down until it locks in: the sound gets calm, almost as if it merged with the note in your head. The dot on the screen says which way to go.', 'Wenn du nicht drauf bist, gleite langsam hoch oder runter, bis er einrastet: der Klang wird ruhig, fast als verschmölze er mit dem Ton in deinem Kopf. Der Punkt auf dem Bildschirm zeigt, in welche Richtung.'),
      L('Any octave counts. A man singing a note an octave below a woman sings the same note.', 'Jede Oktave zählt. Ein Mann, der einen Ton eine Oktave tiefer singt als eine Frau, singt denselben Ton.'),
      L('Many adults believe they cannot sing in tune. Almost all of them can learn it: it is listening and adjusting, practised a few minutes a day.', 'Viele Erwachsene glauben, sie könnten nicht sauber singen. Fast alle können es lernen: Es ist Hinhören und Nachjustieren, ein paar Minuten am Tag geübt.'),
    ],
    art: () => {
      const r = rows(80, 50, 400, 250, 53, 64);
      let d = `M110 ${r.yOf(55.2)}`;
      for (let i = 1; i <= 30; i++) d += `L${110 + i * 10} ${r.yOf(55.2 + Math.min(3, (i / 14) * 3) + (i > 16 ? 0.25 * Math.sin(i) : 0)).toFixed(1)}`;
      return (
        r.svg +
        `<rect x="250" y="${r.yOf(58) - 10}" width="210" height="20" rx="8" fill="${P.good}"/>` +
        `<path d="${d}" fill="none" stroke="${P.now}" stroke-width="4" stroke-linecap="round"/>` +
        label(130, r.yOf(55) + 34, L('too low: slide up', 'zu tief: hochgleiten'), 'start', P.text) +
        label(355, r.yOf(58) - 22, L('locked in', 'eingerastet'), 'middle', P.good) +
        label(280, 340, L('the line is your voice, the bar is the note', 'die Linie ist deine Stimme, der Balken der Ton'), 'middle')
      );
    },
    tryIt: { say: L('Sing any note on “ah” and hold it for a moment: the app shows which note it is.', 'Sing irgendeinen Ton auf „ah“ und halte ihn kurz: Die App zeigt, welcher Ton es ist.'), sing: [], count: 1 },
  },
  {
    id: 'v-lane',
    title: L('Reading the pitch lane', 'Die Tonhöhen-Spur lesen'),
    points: [
      L('The lane is read from left to right. Each bar is a note to sing; a higher bar is a higher note, a longer bar a longer one.', 'Die Spur liest man von links nach rechts. Jeder Balken ist ein Ton zum Singen; ein höherer Balken ist ein höherer Ton, ein längerer Balken ein längerer.'),
      L('One row is a semitone; the darker rows are the black keys of a piano. Two rows apart is a whole step, as in do–re.', 'Eine Zeile ist ein Halbton; die dunkleren Zeilen sind die schwarzen Tasten eines Klaviers. Zwei Zeilen Abstand sind ein Ganzton, wie bei do–re.'),
      L('The line is your voice. A bar you have sung turns green. In the first mode the app waits on each note until you have held it; the ring around the dot fills while you hold.', 'Die Linie ist deine Stimme. Ein gesungener Balken wird grün. Im ersten Modus wartet die App auf jedem Ton, bis du ihn gehalten hast; der Ring um den Punkt füllt sich, während du hältst.'),
      L('With the click, a line moves through the lane; sing each note as it reaches it.', 'Mit Klick wandert eine Linie durch die Spur; sing jeden Ton, wenn sie ihn erreicht.'),
    ],
    art: () => {
      const r = rows(90, 50, 400, 230, 57, 66);
      const bars: [number, number, number][] = [[60, 0, 1], [60, 1, 1], [62, 2, 1], [64, 3, 1], [64, 4, 2]];
      let s = r.svg;
      bars.forEach(([m, a, len], i) => {
        s += `<rect x="${100 + a * 64}" y="${r.yOf(m) - 10}" width="${len * 64 - 8}" height="20" rx="8" fill="${i < 2 ? P.good : i === 2 ? P.now : P.panel}" stroke="${i > 2 ? P.line : 'none'}" stroke-width="2"/>`;
      });
      s += `<path d="M104 ${r.yOf(59.6)}L150 ${r.yOf(60)}L230 ${r.yOf(60.1)}L250 ${r.yOf(61)}L262 ${r.yOf(61.6)}" fill="none" stroke="${P.now}" stroke-width="3.5" stroke-linecap="round"/><circle cx="262" cy="${r.yOf(61.6)}" r="9" fill="${P.now}" stroke="#fffdf8" stroke-width="3"/>`;
      return s + label(290, 30, L('higher bar, higher note', 'höherer Balken, höherer Ton'), 'middle', P.text) + label(290, 320, L('read from left to right', 'von links nach rechts lesen'), 'middle') + label(290, 345, L('green: sung · blue: now', 'grün: gesungen · blau: jetzt'), 'middle');
    },
  },
  {
    id: 'v-steady',
    title: L('Holding a tone', 'Einen Ton halten'),
    points: [
      L('A held tone needs an even breath: breathe in low, then let the air out at the same rate the whole time.', 'Ein gehaltener Ton braucht einen gleichmäßigen Atem: tief einatmen, dann die Luft die ganze Zeit gleich schnell ausströmen lassen.'),
      L('Keep the vowel the same from start to end, and the loudness too. Most wobble comes from a tone that gets louder or softer, or from a vowel that changes.', 'Behalte denselben Vokal vom Anfang bis zum Ende, und dieselbe Lautstärke. Das meiste Wackeln kommt von einem Ton, der lauter oder leiser wird, oder von einem Vokal, der sich ändert.'),
      L('A little natural waver is fine; what you aim for is a line that stays flat on the bar.', 'Ein wenig natürliches Schwanken ist in Ordnung; Ziel ist eine Linie, die flach auf dem Balken bleibt.'),
      L('Start in the middle of the voice and not loud. Steadiness comes first, power later.', 'Fang in der Mitte deiner Stimme an und nicht laut. Erst die Ruhe, die Kraft kommt später.'),
    ],
    art: () => {
      const r = rows(80, 60, 400, 220, 55, 62);
      const line = (y0: number, amp: number, color: string): string => {
        let d = `M95 ${y0}`;
        for (let x = 95; x <= 465; x += 6) d += `L${x} ${(y0 + amp * Math.sin(x / 9) * (0.5 + 0.5 * Math.sin(x / 40))).toFixed(1)}`;
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`;
      };
      return r.svg + `<rect x="95" y="${r.yOf(60) - 10}" width="370" height="20" rx="8" fill="${P.panel}" stroke="${P.line}" stroke-width="2"/>` + line(r.yOf(60), 2, P.now) + line(r.yOf(57), 14, P.bad) + label(280, 40, L('steady: a flat line on the bar', 'ruhig: eine flache Linie auf dem Balken'), 'middle', P.now) + label(280, 320, L('wobbly: louder and softer, the vowel changing', 'wackelig: lauter und leiser, der Vokal ändert sich'), 'middle', P.bad);
    },
  },
  {
    id: 'v-range',
    title: L('Range and registers', 'Stimmumfang und Register'),
    points: [
      L('Every voice has a range: from the lowest note it sings easily to the highest. The app measures yours and moves every song into it.', 'Jede Stimme hat einen Umfang: vom tiefsten Ton, den sie leicht singt, bis zum höchsten. Die App misst deinen und legt jeden Song hinein.'),
      L('Low notes are sung in chest voice, which you feel vibrate in the chest; high notes in head voice, which is lighter. Between them many voices crack or flip: that is normal and gets smoother with practice.', 'Tiefe Töne singst du mit Bruststimme, die du in der Brust vibrieren spürst; hohe mit Kopfstimme, die leichter ist. Dazwischen kippt bei vielen Stimmen der Klang: Das ist normal und wird mit Übung glatter.'),
      L('Do not push for high notes. A high note that needs force is outside your range for now; the range grows by itself over weeks.', 'Drück nicht für hohe Töne. Ein hoher Ton, der Kraft braucht, liegt im Moment außerhalb deines Umfangs; der Umfang wächst über Wochen von selbst.'),
      L('Untrained voices usually have about an octave and a half. Bass, baritone, tenor, alto, mezzo and soprano are names for where a range lies, not for how good a voice is.', 'Ungeübte Stimmen haben meist etwa anderthalb Oktaven. Bass, Bariton, Tenor, Alt, Mezzo und Sopran sind Namen dafür, wo ein Umfang liegt, nicht dafür, wie gut eine Stimme ist.'),
    ],
    art: () => {
      const types: [string, number, number][] = [
        [L('bass', 'Bass'), 41, 60],
        [L('baritone', 'Bariton'), 45, 64],
        [L('tenor', 'Tenor'), 48, 67],
        [L('alto', 'Alt'), 53, 72],
        [L('mezzo', 'Mezzo'), 55, 74],
        [L('soprano', 'Sopran'), 58, 77],
      ];
      const x = (m: number): number => 130 + ((m - 40) / 39) * 360;
      let s = '';
      for (const m of [40, 48, 60, 72, 79]) s += `<line x1="${x(m)}" x2="${x(m)}" y1="60" y2="320" stroke="${P.line}" stroke-width="1.5"/>` + label(x(m), 345, noteName(m), 'middle', P.faint);
      types.forEach(([n, lo, hi], i) => {
        const y = 80 + i * 42;
        s += `<rect x="${x(lo)}" y="${y}" width="${x(hi) - x(lo)}" height="24" rx="10" fill="${P.now}" opacity="${0.35 + i * 0.1}"/>` + label(120, y + 17, n, 'end', P.text);
      });
      return s + label(310, 40, L('where untrained voices usually sing', 'wo ungeübte Stimmen meist singen'), 'middle', P.text);
    },
  },
  {
    id: 'v-steps',
    title: L('Steps and leaps', 'Schritte und Sprünge'),
    points: [
      L('Most melodies move in steps: to the neighbouring note, up or down. Steps are the easiest to sing; Ode to Joy is nearly all steps.', 'Die meisten Melodien bewegen sich in Schritten: zum Nachbarton, hoch oder runter. Schritte singen sich am leichtesten; die Ode an die Freude besteht fast nur aus Schritten.'),
      L('A leap skips notes: a third (two steps), a fifth (four). Hear the target in your head before you jump, then land on it softly.', 'Ein Sprung lässt Töne aus: eine Terz (zwei Schritte), eine Quinte (vier). Hör das Ziel im Kopf, bevor du springst, und lande dann sanft darauf.'),
      L('Known songs help: a fifth up is the start of “Twinkle, Twinkle”, a fourth up the start of “Here Comes the Bride”.', 'Bekannte Lieder helfen: Eine Quinte aufwärts ist der Anfang von „Morgen kommt der Weihnachtsmann“, eine Quarte aufwärts der von „Oh Tannenbaum“.'),
      L('The same note twice needs a new syllable or a tiny breath, so that the app hears two notes.', 'Derselbe Ton zweimal braucht eine neue Silbe oder einen winzigen Atem, damit die App zwei Töne hört.'),
    ],
    art: () => {
      const r = rows(90, 50, 400, 240, 60, 67);
      const notes: [number, number][] = [[60, 0], [62, 1], [64, 2], [65, 3], [67, 4], [64, 5.4], [60, 6.4]];
      let s = r.svg;
      notes.forEach(([m, a], i) => (s += `<rect x="${100 + a * 54}" y="${r.yOf(m) - 10}" width="46" height="20" rx="8" fill="${i < 5 ? P.now : P.good}" opacity="${i < 5 ? 0.8 : 1}"/>`));
      return s + label(210, 35, L('steps', 'Schritte'), 'middle', P.now) + label(420, 35, L('leaps', 'Sprünge'), 'middle', P.good) + label(290, 330, L('think the target first, then leap', 'erst das Ziel denken, dann springen'), 'middle');
    },
    tryIt: { say: L('Sing three steps up: do, re, mi (any octave).', 'Sing drei Schritte aufwärts: do, re, mi (jede Oktave).'), sing: [60, 62, 64], count: 3 },
  },
  {
    id: 'v-interval',
    title: L('Intervals: how far to the next note', 'Intervalle: wie weit zum nächsten Ton'),
    points: [
      L('An interval is the distance between two notes. A step is the next note of the scale; a third leaves one out; a fifth is the distance from do to sol.', 'Ein Intervall ist der Abstand zwischen zwei Tönen. Ein Schritt ist der nächste Ton der Tonleiter; eine Terz lässt einen aus; eine Quinte ist der Abstand von do zu sol.'),
      L('Singers find them through songs that begin with them: "Amazing Grace" starts with a fourth up, "Twinkle, Twinkle" with a fifth. Sing the start of the song in your head, and stop on its second note.', 'Sänger finden sie über Lieder, die damit beginnen: „Amazing Grace“ beginnt mit einer Quarte hinauf, „Morgen kommt der Weihnachtsmann“ mit einer Quinte. Sing den Anfang des Lieds im Kopf und bleib auf seinem zweiten Ton stehen.'),
      L('The app sings the first note and names the distance; you sing the note that far away and hold it. T lets you hear the target, but then it counts as helped.', 'Die App singt den ersten Ton und nennt den Abstand; du singst den Ton, der so weit entfernt ist, und hältst ihn. T lässt dich den Zielton hören, aber dann zählt es als geholfen.'),
    ],
    art: () => {
      const r = rows(60, 50, 420, 250, 57, 74);
      let s = r.svg;
      const pairs: [number, number, string][] = [[60, 62, L('step', 'Schritt')], [60, 64, L('third', 'Terz')], [62, 67, L('fourth', 'Quarte')], [60, 67, L('fifth', 'Quinte')]];
      pairs.forEach(([a, b, name], k) => {
        const x = 90 + k * 100;
        s += `<rect x="${x}" y="${r.yOf(a) - 8}" width="34" height="16" rx="6" fill="${P.now}" opacity="0.8"/><rect x="${x + 40}" y="${r.yOf(b) - 8}" width="34" height="16" rx="6" fill="${P.good}"/>`;
        s += label(x + 37, 325, name, 'middle', P.text);
      });
      return s + label(270, 360, L('blue: the app sings · green: you sing', 'blau: die App singt · grün: du singst'), 'middle');
    },
  },
  {
    id: 'v-harmony',
    title: L('A second voice', 'Eine zweite Stimme'),
    points: [
      L('Two voices a third apart are the sound of choirs and of folk songs sung together. The second voice follows the tune, a third below it, step for step.', 'Zwei Stimmen im Abstand einer Terz sind der Klang von Chören und gemeinsam gesungenen Volksliedern. Die zweite Stimme folgt der Melodie, eine Terz darunter, Schritt für Schritt.'),
      L('It is harder than it looks: the tune pulls you up to it. Sing the second voice alone first, with the line; then with the app singing the tune.', 'Es ist schwerer, als es aussieht: Die Melodie zieht dich zu sich hinauf. Sing die zweite Stimme zuerst allein, mit der Linie; dann, während die App die Melodie singt.'),
      L('Use headphones: through speakers the microphone would hear the app instead of you.', 'Nimm Kopfhörer: Über Lautsprecher würde das Mikrofon die App statt dich hören.'),
    ],
    art: () => {
      const r = rows(60, 50, 420, 250, 52, 72);
      let s = r.svg;
      const tune = [64, 65, 67, 67, 65, 64, 62, 60];
      const low = [60, 62, 64, 64, 62, 60, 59, 57];
      tune.forEach((m, i) => (s += `<rect x="${80 + i * 50}" y="${r.yOf(m) - 7}" width="42" height="14" rx="6" fill="${P.faint}"/><rect x="${80 + i * 50}" y="${r.yOf(low[i]) - 7}" width="42" height="14" rx="6" fill="${P.now}"/>`));
      return s + label(270, 330, L('grey: the tune · blue: the voice a third below', 'grau: die Melodie · blau: die Stimme eine Terz darunter'), 'middle');
    },
  },
  {
    id: 'v-care',
    title: L('Looking after your voice', 'Die Stimme pflegen'),
    points: [
      L('Ten minutes a day do more than an hour once a week, and they are kinder to the voice.', 'Zehn Minuten am Tag bringen mehr als eine Stunde einmal die Woche, und sie schonen die Stimme.'),
      L('Drink water while you practise. Dry air and coffee dry the voice out.', 'Trink beim Üben Wasser. Trockene Luft und Kaffee trocknen die Stimme aus.'),
      L('Stop when the voice gets hoarse, scratchy or tired, and never sing through pain. Rest it for a day.', 'Hör auf, wenn die Stimme heiser, kratzig oder müde wird, und sing nie gegen Schmerzen an. Gönn ihr einen Tag Ruhe.'),
      L('If hoarseness lasts longer than two weeks, see a doctor: that is not something practice fixes.', 'Hält Heiserkeit länger als zwei Wochen an, geh zum Arzt: Das behebt kein Üben.'),
    ],
    art: () =>
      `<rect x="120" y="90" width="80" height="170" rx="16" fill="${P.now}" opacity="0.16" stroke="${P.now}" stroke-width="3"/><path d="M128 150h64" stroke="${P.now}" stroke-width="3"/>` +
      `<circle cx="360" cy="170" r="70" fill="none" stroke="${P.text}" stroke-width="3"/><path d="M360 120v50l34 22" fill="none" stroke="${P.text}" stroke-width="4" stroke-linecap="round"/>` +
      label(160, 300, L('water', 'Wasser'), 'middle', P.text) +
      label(360, 280, L('ten minutes a day', 'zehn Minuten am Tag'), 'middle', P.text) +
      label(260, 345, L('hoarse or sore: rest', 'heiser oder wund: Pause'), 'middle', P.bad),
  },
];

/** The chapters of the voice's handbook: their pages in the order to read them. */
export const VOICE_CHAPTERS = (): { title: string; about: string; ids: string[] }[] => [
  { title: L('First things', 'Das Erste'), about: L('How to stand and breathe, and how to warm up.', 'Wie man steht und atmet, und wie man sich einsingt.'), ids: ['v-stand', 'v-warm'] },
  { title: L('Notes', 'Töne'), about: L('Finding a note, reading the lane, holding a tone.', 'Einen Ton treffen, die Spur lesen, einen Ton halten.'), ids: ['v-match', 'v-lane', 'v-steady'] },
  { title: L('Songs', 'Songs'), about: L('Steps and leaps, and the beat.', 'Schritte und Sprünge, und der Takt.'), ids: ['v-steps', 'count'] },
  { title: L('By ear', 'Nach Gehör'), about: L('Intervals, and a second voice.', 'Intervalle, und eine zweite Stimme.'), ids: ['v-interval', 'v-harmony'] },
  { title: L('Your voice', 'Deine Stimme'), about: L('Its range, and how to look after it.', 'Ihr Umfang, und wie man sie pflegt.'), ids: ['v-range', 'v-care'] },
];

/** Where each page comes up by itself. */
export const VOICE_COMES_UP = (): Record<string, string> => ({
  'v-stand': L('before the first session of singing', 'vor der ersten Gesangs-Session'),
  'v-warm': L('before the first session of singing', 'vor der ersten Gesangs-Session'),
  'v-match': L('before the first matching of tones', 'vor dem ersten Töne-Treffen'),
  'v-lane': L('before the first song', 'vor dem ersten Song'),
  'v-steady': L('before the first held tone', 'vor dem ersten gehaltenen Ton'),
  'v-range': L('before the range is measured', 'bevor der Stimmumfang gemessen wird'),
  'v-steps': L('before the first song', 'vor dem ersten Song'),
  'v-care': L('nowhere by itself: read it once', 'nirgends von selbst: lies sie einmal'),
  'v-interval': L('before the first intervals', 'vor den ersten Intervallen'),
  'v-harmony': L('when the second voice is first sung', 'wenn die zweite Stimme zum ersten Mal gesungen wird'),
});
