/**
 * Basics: the introductions. Before something is asked of the player for the first time, the app says what
 * it is and shows how it is done: a picture, a few plain sentences, and where it makes sense a "try it"
 * during which the app listens without measuring anything. Each introduction is shown once, before the
 * step that needs it. Together they are the handbook: chapters on the left, the open page on the right,
 * and a way through it from the first page to the last.
 */
import { L } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { findPiece, findSong } from '../music/content';
import { barreStrings, CHORDS, isBlackKey, noteName, pianoChord } from '../music/theory';
import { $, $$, esc, hear, icon, keys, micMeter, pianoEars, voiceEars, type Screen } from '../ui/dom';
import { centsOff, Hold } from '../core/singing';
import { VOICE_CHAPTERS, VOICE_COMES_UP, VOICE_PAGES } from './voicepages';
import { chordBox, chordMarks, keyboard, keyChord, keyRange, LEARN } from '../ui/draw';
import { practiceBar, setSimTarget } from '../ui/practice';

interface Intro {
  id: string;
  title: string;
  points: string[];
  /** the picture: SVG for a viewBox of 520 by 380 */
  art: () => string;
  /** something to try, heard but not measured: so many strums of one of these chords, or these notes in order */
  tryIt?: { say: string; chords?: string[]; notes?: number[]; count: number; piano?: boolean; voice?: boolean };
}

const P = LEARN;
const label = (x: number, y: number, text: string, anchor = 'start', color = P.muted): string => `<text x="${x}" y="${y}" class="lbl" text-anchor="${anchor}" fill="${color}">${text}</text>`;
const lead = (x1: number, y1: number, x2: number, y2: number): string => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${P.faint}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
/** six strings drawn across, thick at the bottom, as the player sees them looking down */
const strings = (x1: number, x2: number, y: number, gap: number): string => [0, 1, 2, 3, 4, 5].map((s) => `<line x1="${x1}" x2="${x2}" y1="${y + (5 - s) * gap}" y2="${y + (5 - s) * gap}" stroke="${P.text}" stroke-width="${1 + (5 - s) * 0.5}" opacity="0.75"/>`).join('');
const arrow = (x: number, y1: number, y2: number, color: string, w = 5): string =>
  `<path d="M${x} ${y1}L${x} ${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/><path d="M${x - 9} ${y2 + (y2 > y1 ? -12 : 12)}L${x} ${y2}L${x + 9} ${y2 + (y2 > y1 ? -12 : 12)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** a strumming pattern over the eight half beats of a bar: D down, U up, a dot where the hand passes without touching */
const pattern = (y: number, name: string, marks: string): string =>
  label(20, y + 6, name, 'start', P.text) +
  marks
    .split('')
    .map((m, i) => {
      const x = 232 + i * 34;
      return m === 'D' ? arrow(x, y - 14, y + 10, P.now, 4) : m === 'U' ? arrow(x, y + 10, y - 14, P.text, 3) : `<circle cx="${x}" cy="${y - 2}" r="2.5" fill="${P.faint}"/>`;
    })
    .join('');

/** read when shown, so that it is in the language chosen at that moment: the pages of the guitar and the piano, then those of the voice */
const INTROS = (): Intro[] => [
  ...INSTRUMENT_INTROS(),
  ...VOICE_PAGES().map((v): Intro => ({ id: v.id, title: v.title, points: v.points, art: v.art, ...(v.tryIt ? { tryIt: { say: v.tryIt.say, notes: v.tryIt.sing, count: v.tryIt.count, voice: true } } : {}) })),
];
const INSTRUMENT_INTROS = (): Intro[] => [
  {
    id: 'hold',
    title: L('The guitar, and how to hold it', 'Die Gitarre und wie du sie hältst'),
    points: [
      L('Sit upright with the waist of the guitar on your right thigh, the neck pointing a little upwards. The right forearm rests on the edge of the body; the shoulders stay loose.', 'Sitz aufrecht, die Taille der Gitarre auf deinem rechten Oberschenkel, der Hals zeigt leicht nach oben. Der rechte Unterarm ruht auf der Kante des Korpus; die Schultern bleiben locker.'),
      L('The left hand holds no weight: the thumb lies behind the neck, the fingers come round to the strings from below.', 'Die linke Hand trägt kein Gewicht: Der Daumen liegt hinter dem Hals, die Finger kommen von unten herum an die Saiten.'),
      L('A pick is held between the pad of the thumb and the side of the index finger, with only its tip showing. Hold it loosely. Without a pick, strum with the pad of the thumb.', 'Das Plektrum hältst du zwischen der Daumenkuppe und der Seite des Zeigefingers, nur seine Spitze schaut heraus. Halte es locker. Ohne Plektrum schlägst du mit der Daumenkuppe an.'),
      L('The thickest string is the low E and is nearest to your face; the thinnest is the high e, nearest to the floor.', 'Die dickste Saite ist die tiefe E-Saite, sie liegt deinem Gesicht am nächsten; die dünnste ist die hohe e-Saite, sie liegt dem Boden am nächsten.'),
    ],
    art: () => {
      let h = `<path d="M40 170C40 90 130 80 175 105C195 116 215 116 235 108C270 96 300 120 300 170C300 220 270 244 235 232C215 224 195 224 175 235C130 260 40 250 40 170z" fill="${P.panel}" stroke="${P.text}" stroke-width="2"/><circle cx="222" cy="170" r="28" fill="${P.bg}" stroke="${P.text}" stroke-width="2"/><rect x="300" y="154" width="150" height="32" fill="${P.panel}" stroke="${P.text}" stroke-width="2"/><path d="M450 148h48l8 44h-56z" fill="${P.panel}" stroke="${P.text}" stroke-width="2"/>`;
      for (const x of [428, 408, 390, 374, 360, 348, 337, 327, 318, 310]) h += `<line x1="${x}" x2="${x}" y1="154" y2="186" stroke="${P.faint}" stroke-width="1.5"/>`;
      for (let k = 0; k < 6; k++) h += `<line x1="119" x2="498" y1="${158 + k * 4.8}" y2="${158 + k * 4.8}" stroke="${P.text}" stroke-width="${(0.7 + (5 - k) * 0.26).toFixed(2)}" opacity="0.75"/>`;
      h += `<rect x="112" y="140" width="14" height="60" rx="3" fill="${P.text}"/><line x1="450" x2="450" y1="151" y2="189" stroke="${P.text}" stroke-width="5"/>`;
      // the pick: the thumb covers the pale part, only the tip shows
      h += `<path d="M50 296q25 -10 50 0q-4 34 -25 54q-21 -20 -25 -54z" fill="${P.now}" opacity="0.3"/><path d="M61 332h28q-4 9 -14 18q-10 -9 -14 -18z" fill="${P.now}"/>`;
      return (
        h +
        label(76, 175, L('body', 'Korpus'), 'middle') +
        label(119, 66, L('bridge', 'Steg'), 'middle') + lead(119, 72, 119, 138) +
        label(222, 46, L('sound hole', 'Schallloch'), 'middle') + lead(222, 52, 222, 140) +
        label(372, 112, L('neck with frets', 'Hals mit Bünden'), 'middle') + lead(372, 118, 372, 152) +
        label(482, 112, L('head', 'Kopf'), 'middle') + lead(482, 118, 482, 146) +
        label(450, 226, L('nut', 'Sattel'), 'middle') + lead(450, 212, 450, 192) +
        label(118, 318, L('the pick: the thumb', 'Plektrum: der Daumen'), 'start', P.text) + label(118, 338, L('covers all but the tip', 'lässt die Spitze frei'), 'start', P.text) +
        label(300, 318, L('top string: low E, thickest', 'oben: tiefe E-Saite, die dickste'), 'start', P.text) + label(300, 338, L('bottom: high e, thinnest', 'unten: hohe e-Saite, die dünnste'), 'start', P.text)
      );
    },
  },
  {
    id: 'count',
    title: L('The beat, and how to count it', 'Der Schlag und wie du ihn zählst'),
    points: [
      L('Music moves on a steady pulse, the beat. The click plays it for you. Most songs group the beats in fours: one group is a bar.', 'Musik bewegt sich auf einem gleichmäßigen Puls, dem Schlag. Der Klick spielt ihn dir vor. Die meisten Songs fassen die Schläge zu Vierergruppen zusammen: Eine Gruppe ist ein Takt.'),
      L('Count along out loud: 1, 2, 3, 4, and again 1. Tap a foot on every count. The 1 is the heavy one, and the click marks it with a higher tick.', 'Zähl laut mit: 1, 2, 3, 4 und wieder 1. Tipp bei jeder Zahl mit dem Fuß. Die 1 ist die betonte, und der Klick markiert sie mit einem höheren Ton.'),
      L('Halfway between two counts is the "and": 1 and 2 and 3 and 4 and. Quick notes fall there, and on the guitar the upstrokes.', 'Genau zwischen zwei Zahlen liegt das „und“: 1 und 2 und 3 und 4 und. Dorthin fallen schnelle Noten, und auf der Gitarre die Aufschläge.'),
      L('The tempo is the number of beats in a minute. 60 is one a second: slow enough to think. Speed comes from playing it slowly and evenly first.', 'Das Tempo ist die Zahl der Schläge pro Minute. 60 ist einer pro Sekunde: langsam genug zum Nachdenken. Schnell wirst du, indem du erst langsam und gleichmäßig spielst.'),
    ],
    art: () => {
      let h = '';
      for (let b = 0; b < 2; b++)
        for (let k = 0; k < 4; k++) {
          const x = 40 + b * 240 + k * 56;
          h += `<rect x="${x}" y="150" width="48" height="70" rx="8" fill="${k === 0 ? P.now : P.panel}" opacity="${k === 0 ? 0.9 : 1}" stroke="${k === 0 ? P.now : P.line}" stroke-width="2"/><text x="${x + 24}" y="196" class="tn" fill="${k === 0 ? P.nowInk : P.text}">${k + 1}</text>` + label(x + 52, 246, '+', 'middle', P.faint);
        }
      return h + `<line x1="270" x2="270" y1="130" y2="240" stroke="${P.text}" stroke-width="2"/>` + label(150, 120, L('one bar', 'ein Takt'), 'middle') + label(390, 120, L('the next bar', 'der nächste Takt'), 'middle') + label(270, 300, L('the click: a higher tick on 1, a plain one on 2, 3 and 4', 'der Klick: höher auf der 1, schlicht auf 2, 3 und 4'), 'middle') + label(270, 330, L('the "and" lies halfway between two counts', 'das „und“ liegt genau zwischen zwei Zahlen'), 'middle');
    },
  },
  {
    id: 'chord',
    title: L('What a chord is', 'Was ein Akkord ist'),
    points: [
      L('A chord is several notes sounding together: you hold a shape with the left hand and strum the strings with the right.', 'Ein Akkord besteht aus mehreren Tönen, die zusammen klingen: Du hältst mit der linken Hand einen Griff und schlägst mit der rechten die Saiten an.'),
      L('Its name is the note it is built on. A plain letter is a major chord, which sounds bright; a small m means minor, which sounds darker. E and Em differ by a single finger.', 'Sein Name ist der Ton, auf dem er aufgebaut ist. Ein einfacher Buchstabe ist ein Durakkord, der hell klingt; ein kleines m bedeutet Moll, das dunkler klingt. E und Em unterscheiden sich um einen einzigen Finger.'),
      L('Most songs get by with three or four chords that take turns. Learning a song is mostly learning its chords and the changes between them.', 'Die meisten Songs kommen mit drei oder vier Akkorden aus, die sich abwechseln. Einen Song lernen heißt vor allem, seine Akkorde und die Wechsel zwischen ihnen zu lernen.'),
      L('Chords that use open strings are the easy ones and come first. The app checks each new chord string by string, so that you hear which string does not ring.', 'Akkorde mit leeren Saiten sind die leichten und kommen zuerst. Die App prüft jeden neuen Akkord Saite für Saite, damit du hörst, welche Saite nicht klingt.'),
    ],
    art: () => chordBox(CHORDS['E'], 50, 100, 170, P, false, undefined, 44) + chordBox(CHORDS['Em'], 300, 100, 170, P, false, undefined, 44) + label(135, 60, L('E: major, bright', 'E: Dur, hell'), 'middle', P.text) + label(385, 60, L('Em: minor, darker', 'Em: Moll, dunkler'), 'middle', P.text) + label(260, 360, L('one finger less, and the sound changes', 'ein Finger weniger, und der Klang ändert sich'), 'middle') + `<path d="M232 190h56m-10 -7l10 7l-10 7" fill="none" stroke="${P.now}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    tryIt: { say: L('If you know Em already: hold it and strum once. Otherwise go on; the chord check shows it.', 'Wenn du Em schon kennst: Greif ihn und schlag einmal an. Sonst mach weiter; der Akkord-Check zeigt ihn dir.'), chords: ['Em'], count: 1 },
  },
  {
    id: 'mute',
    title: L('Ringing, muted and dead strings', 'Klingende, abgedämpfte und tote Saiten'),
    points: [
      L('A string rings until something stops it. Laying the edge of the right hand on the strings stops them all at once: that is muting.', 'Eine Saite klingt, bis etwas sie stoppt. Legst du die Kante der rechten Hand auf die Saiten, verstummen alle auf einmal: Das ist Abdämpfen.'),
      L('A finger that touches a string without pressing it down gives a dull click instead of a note: a dead note. In a chord that is nearly always a finger leaning on the string next to its own.', 'Ein Finger, der eine Saite berührt, ohne sie herunterzudrücken, gibt statt eines Tons ein dumpfes Klacken: einen toten Ton. In einem Akkord ist das fast immer ein Finger, der an der Saite neben seiner eigenen anliegt.'),
      L('The app tells the three apart: a string that rings is clean, one that stops at once is muted, one that rattles against a fret buzzes.', 'Die App unterscheidet die drei: Eine Saite, die klingt, ist sauber; eine, die sofort verstummt, ist abgedämpft; eine, die gegen einen Bund rasselt, schnarrt.'),
      L('In the games, two hits on muted strings and then nothing is the sign for a pause, so that you need not reach for the keyboard.', 'In den Spielen heißen zwei Anschläge auf abgedämpfte Saiten und danach nichts: Pause. So musst du nicht zur Tastatur greifen.'),
    ],
    art: () => {
      const wave = (y: number, amp: (x: number) => number, color: string): string => {
        let d = `M60 ${y}`;
        for (let x = 60; x <= 460; x += 4) d += `L${x} ${(y + amp(x) * Math.sin(x * 0.16)).toFixed(1)}`;
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
      };
      return wave(90, (x) => 26 * Math.exp(-(x - 60) / 520), P.now) + label(60, 46, L('clean: it goes on ringing', 'sauber: sie klingt weiter'), 'start', P.now) + wave(200, (x) => 26 * Math.exp(-(x - 60) / 40), P.text) + label(60, 156, L('muted: it is gone at once', 'abgedämpft: sie ist sofort weg'), 'start', P.text) + wave(310, (x) => (x % 24 < 12 ? 22 : 6) * Math.exp(-(x - 60) / 300), P.bad) + label(60, 266, L('buzzing: it rattles against a fret', 'schnarrt: sie rasselt gegen einen Bund'), 'start', P.bad);
    },
  },
  {
    id: 'slur',
    title: L('Hammer-on and pull-off', 'Hammer-on und Pull-off'),
    points: [
      L('Two ways of getting a second note out of one pluck. Hammer-on: pluck a note, then bring another finger down firmly on a higher fret of the same string. The new note sounds without a second pluck.', 'Zwei Wege, aus einem Zupfen einen zweiten Ton zu holen. Hammer-on: Zupf einen Ton, dann setz einen anderen Finger kräftig auf einen höheren Bund derselben Saite. Der neue Ton klingt, ohne dass du noch einmal zupfst.'),
      L('Pull-off: the other way round. Two fingers are down on one string; pluck, then pull the upper finger off sideways, so that it plucks the string a little. The lower note sounds.', 'Pull-off: umgekehrt. Zwei Finger liegen auf einer Saite; zupf, dann zieh den Finger am höheren Bund seitlich ab, sodass er die Saite ein wenig anzupft. Der tiefere Ton klingt.'),
      L('In tabs they are written as h and p between two fret numbers, or as an arc over them: 5h7, 7p5.', 'In Tabs stehen sie als h und p zwischen zwei Bundzahlen oder als Bogen darüber: 5h7, 7p5.'),
      L('The songs in this app do not need them yet. They are worth knowing because almost every tab you find elsewhere uses them.', 'Die Songs in dieser App brauchen sie noch nicht. Es lohnt sich trotzdem, sie zu kennen, denn fast jede Tabulatur, die du anderswo findest, verwendet sie.'),
    ],
    art: () => {
      let h = '';
      for (let k = 0; k < 6; k++) h += `<line x1="40" x2="480" y1="${110 + k * 36}" y2="${110 + k * 36}" stroke="${P.line}" stroke-width="2"/>`;
      const num = (x: number, f: string): string => `<rect x="${x - 16}" y="167" width="32" height="30" fill="${P.bg}"/><text x="${x}" y="190" class="tn" fill="${P.text}">${f}</text>`;
      const arc = (x: number, mark: string): string => `<path d="M${x - 36} 160q36 -34 72 0" fill="none" stroke="${P.now}" stroke-width="2.5"/><text x="${x}" y="137" class="tn" fill="${P.now}">${mark}</text>`;
      return (
        h + num(110, '5') + num(190, '7') + arc(150, 'h') + num(340, '7') + num(420, '5') + arc(380, 'p') +
        label(150, 326, L('hammer-on', 'Hammer-on'), 'middle', P.text) + label(150, 348, L('pluck 5, then hammer 7', 'zupf 5, dann setz 7 auf'), 'middle') +
        label(380, 326, L('pull-off', 'Pull-off'), 'middle', P.text) + label(380, 348, L('pluck 7, then pull off to 5', 'zupf 7, dann zieh ab auf 5'), 'middle')
      );
    },
  },
  {
    id: 'p-sit',
    title: L('At the piano: sitting, and the hand', 'Am Klavier: Sitzen und die Hand'),
    points: [
      L('Sit in front of the middle of the keyboard, far enough away that the elbows are a little in front of the body, and so high that the forearms are level.', 'Setz dich vor die Mitte der Tastatur, so weit weg, dass die Ellbogen ein wenig vor dem Körper sind, und so hoch, dass die Unterarme waagerecht liegen.'),
      L('Curve the fingers as if holding a ball; the thumb lies on its side. Play with the fingertips and let the weight of the arm do the work.', 'Runde die Finger, als würdest du einen Ball halten; der Daumen liegt auf seiner Seite. Spiel mit den Fingerspitzen und lass das Gewicht des Arms die Arbeit tun.'),
      L('The fingers are numbered the same in both hands: 1 thumb, 2 index, 3 middle, 4 ring, 5 little finger.', 'Die Finger sind in beiden Händen gleich nummeriert: 1 Daumen, 2 Zeigefinger, 3 Mittelfinger, 4 Ringfinger, 5 kleiner Finger.'),
      L('In a five-finger position each finger has its own key and stays over it. The app shows the finger number on every key it asks for.', 'In der Fünffingerlage hat jeder Finger seine eigene Taste und bleibt über ihr. Die App zeigt auf jeder Taste, die sie verlangt, die Nummer des Fingers.'),
    ],
    art: () => keyboard([60, 62, 64, 65, 67].map((midi, i) => ({ midi, fg: i + 1, hot: i === 0 })), P, 60, 1, { x: 30, y: 110, w: 460, h: 190, names: true }) + label(260, 70, L('right hand in C position: thumb on middle C', 'rechte Hand in C-Lage: Daumen auf dem mittleren C'), 'middle', P.text) + label(260, 340, L('one finger for each key, 1 to 5', 'ein Finger für jede Taste, 1 bis 5'), 'middle'),
  },
  {
    id: 'p-keys',
    title: L('Finding the keys', 'Die Tasten finden'),
    points: [
      L('The black keys come in groups of two and three. That pattern repeats along the whole keyboard and is how you find your way.', 'Die schwarzen Tasten kommen in Gruppen zu zwei und zu drei. Dieses Muster wiederholt sich über die ganze Tastatur, und daran findest du dich zurecht.'),
      L('C is the white key just left of a group of two black keys. From there the white keys are D, E, F, G, A, B, and then C again.', 'C ist die weiße Taste direkt links neben einer Gruppe aus zwei schwarzen Tasten. Von dort aus heißen die weißen Tasten D, E, F, G, A, B und dann wieder C.'),
      L('Middle C is the C nearest the middle of the piano, usually near the lock or the maker\'s name. The app calls it C4; the C above it is C5.', 'Das mittlere C ist das C, das der Mitte des Klaviers am nächsten liegt, meist beim Schloss oder beim Namen des Herstellers. Die App nennt es C4; das C darüber ist C5.'),
      L('A black key takes its name from its neighbour: the one right of C is C sharp, written C♯.', 'Eine schwarze Taste bekommt ihren Namen von ihrer Nachbarin: Die rechts neben C ist das Cis, geschrieben C♯.'),
    ],
    art: () => keyboard([{ midi: 60, hot: true }, { midi: 72, hot: true }], P, 60, 2, { x: 16, y: 120, w: 488, h: 170, names: true }) + `<path d="M40 112v-8h56v8M144 112v-8h92v8" fill="none" stroke="${P.faint}" stroke-width="1.5"/>` + label(68, 94, L('a group of two', 'Zweiergruppe'), 'middle') + label(190, 94, L('a group of three', 'Dreiergruppe'), 'middle') + label(260, 340, L('C is always left of the two black keys', 'C liegt immer links von den zwei schwarzen Tasten'), 'middle', P.text),
  },
  {
    id: 'p-notes',
    title: L('Reading the note strip', 'Den Notenstreifen lesen'),
    points: [
      L('The app shows the notes of a phrase as a row of tiles, read from left to right. A tile that sits higher is a higher key, further to the right on the keyboard.', 'Die App zeigt die Noten einer Phrase als Reihe von Kacheln, gelesen von links nach rechts. Eine Kachel, die höher sitzt, ist eine höhere Taste, weiter rechts auf der Tastatur.'),
      L('Each tile carries the name of its key, and under it the finger to use.', 'Jede Kachel trägt den Namen ihrer Taste, und darunter steht der Finger, mit dem du spielst.'),
      L('The keyboard underneath lights the key to play. In the first mode the app waits until it hears that key.', 'Die Tastatur darunter lässt die Taste aufleuchten, die du spielen sollst. Im ersten Modus wartet die App, bis sie diese Taste hört.'),
      L('A wide tile is a long note: hold the key down for as long as the tile is wide.', 'Eine breite Kachel ist ein langer Ton: Halte die Taste so lange gedrückt, wie die Kachel breit ist.'),
    ],
    art: () => {
      const notes: [string, number, number, number][] = [['E4', 2, 3, 1], ['E4', 2, 3, 1], ['F4', 3, 4, 1], ['G4', 4, 5, 1], ['G4', 4, 5, 2]];
      let x = 90;
      let h = `<line x1="90" x2="474" y1="268" y2="268" stroke="${P.line}" stroke-width="1.5"/>` + label(30, 296, L('finger', 'Finger'));
      notes.forEach(([n, lvl, fg, len], i) => {
        const w = 64 * len;
        const y = 232 - lvl * 34;
        h += `<rect x="${x}" y="${y}" width="${w - 8}" height="36" rx="8" fill="${i === 0 ? P.now : P.panel}" stroke="${i === 0 ? P.now : P.line}" stroke-width="2"/><text x="${x + 12}" y="${y + 24}" class="lbl" style="font-weight:700" fill="${i === 0 ? P.nowInk : P.text}">${n}</text>` + label(x + 12, 296, String(fg), 'start', i === 0 ? P.now : P.muted);
        x += w;
      });
      return h + label(90, 60, L('a higher tile is a higher key', 'höhere Kachel, höhere Taste'), 'start', P.text) + label(410, 68, L('a long note', 'ein langer Ton'), 'middle') + lead(410, 74, 410, 92) + `<path d="M90 330h384m-10 -6l10 6l-10 6" fill="none" stroke="${P.faint}" stroke-width="1.5"/>` + label(282, 358, L('read from left to right', 'von links nach rechts lesen'), 'middle');
    },
  },
  {
    id: 'p-chord',
    title: L('What a chord is, on the piano', 'Was ein Akkord ist, am Klavier'),
    points: [
      L('A chord is several keys sounding together. The simplest has three: play a key, leave one out, play one, leave one out, play one.', 'Ein Akkord besteht aus mehreren Tasten, die zusammen klingen. Der einfachste hat drei: Spiel eine Taste, lass eine aus, spiel eine, lass eine aus, spiel eine.'),
      L('Its name is its lowest key. Start on C and it is the chord of C: C, E and G. Start on G and it is G: G, B and D.', 'Sein Name ist seine tiefste Taste. Fängst du auf C an, ist es der C-Akkord: C, E und G. Fängst du auf G an, ist es G: G, B und D.'),
      L('A plain letter is a major chord, which sounds bright; a small m means minor, which sounds darker. Between the two only the middle key differs, by one key to the left.', 'Ein einfacher Buchstabe ist ein Durakkord, der hell klingt; ein kleines m bedeutet Moll, das dunkler klingt. Zwischen beiden unterscheidet sich nur die mittlere Taste, um eine Taste nach links.'),
      L('Most songs get by with three or four chords that take turns. In the app a chord always sits in the same place: its lowest key is the first of that name from middle C upward.', 'Die meisten Songs kommen mit drei oder vier Akkorden aus, die sich abwechseln. In der App liegt ein Akkord immer an derselben Stelle: Seine tiefste Taste ist die erste dieses Namens vom mittleren C aufwärts.'),
    ],
    art: () =>
      keyChord('C', P, { x: 14, y: 120, w: 240, h: 150 }, false, ['C', 'Cm']) +
      keyChord('Cm', P, { x: 266, y: 120, w: 240, h: 150 }, false, ['C', 'Cm']) +
      label(134, 96, L('C: major, bright', 'C: Dur, hell'), 'middle', P.text) +
      label(386, 96, L('Cm: minor, darker', 'Cm: Moll, dunkler'), 'middle', P.text) +
      label(260, 316, L('the middle key moves one to the left,', 'die mittlere Taste rückt eine nach links,'), 'middle') +
      label(260, 338, L('onto a black key, and the sound darkens', 'auf eine schwarze, und der Klang wird dunkler'), 'middle'),
    tryIt: { say: L('Play C, E and G together, with thumb, middle finger and little finger.', 'Spiel C, E und G zusammen, mit Daumen, Mittelfinger und kleinem Finger.'), chords: ['C'], count: 1, piano: true },
  },
  {
    id: 'p-figure',
    title: L('How the app shows a chord', 'Wie die App einen Akkord zeigt'),
    points: [
      L('A chord is shown as a stretch of keyboard that begins at middle C. The keys of the chord are coloured, and each carries the number of the finger that plays it.', 'Ein Akkord erscheint als Stück Tastatur, das beim mittleren C beginnt. Die Tasten des Akkords sind farbig, und jede trägt die Nummer des Fingers, der sie spielt.'),
      L('Three fingers for three keys: 1, 3 and 5. A chord of four keys takes 1, 2, 3 and 5.', 'Drei Finger für drei Tasten: 1, 3 und 5. Ein Akkord aus vier Tasten nimmt 1, 2, 3 und 5.'),
      L('In a piece, a chord that is struck as a whole is one block in the strip, with its name. A block that sits higher is a chord further to the right.', 'In einem Stück ist ein Akkord, der als Ganzes angeschlagen wird, ein Block im Streifen, mit seinem Namen. Ein Block, der höher sitzt, ist ein Akkord weiter rechts.'),
      L('Where a chord is broken into single keys, its name stands above the first of them, and the other keys of the chord stay lightly coloured on the keyboard.', 'Wo ein Akkord in einzelne Tasten gebrochen ist, steht sein Name über der ersten davon, und die anderen Tasten des Akkords bleiben auf der Tastatur leicht gefärbt.'),
    ],
    art: () => {
      // a strip of three chords above the keyboard that shows the middle one
      const blocks: [string, number, boolean][] = [['C', 78, false], ['F', 52, false], ['G', 38, true]];
      let h = `<line x1="60" x2="460" y1="124" y2="124" stroke="${P.line}" stroke-width="1.5"/>`;
      blocks.forEach(([n, y, now], i) => {
        const x = 70 + i * 132;
        h += `<rect x="${x}" y="${y}" width="118" height="34" rx="8" fill="${now ? P.now : P.panel}" stroke="${now ? P.now : P.line}" stroke-width="2"/>`;
        for (let k = 0; k < 3; k++) h += `<line x1="${x + 9}" x2="${x + 17}" y1="${y + 9 + k * 8}" y2="${y + 9 + k * 8}" stroke="${now ? P.nowInk : P.text}" stroke-width="3" stroke-linecap="round" opacity="0.75"/>`;
        h += `<text x="${x + 26}" y="${y + 24}" class="lbl" style="font-weight:700" fill="${now ? P.nowInk : P.text}">${n}</text>`;
      });
      return h + label(260, 24, L('the strip: one block for each chord', 'der Streifen: ein Block für jeden Akkord'), 'middle', P.text) + keyChord('G', P, { x: 30, y: 160, w: 460, h: 170 }, true, ['C', 'F', 'G']) + label(260, 362, L('the keyboard: the keys of the chord to play, with their fingers', 'die Tastatur: die Tasten des Akkords, mit ihren Fingern'), 'middle');
    },
  },
  {
    id: 'p-play',
    title: L('Playing a chord: one sound', 'Einen Akkord spielen: ein Klang'),
    points: [
      L('Lay the fingers on the keys first, without pressing. Thumb, middle finger and little finger are curved, the wrist is level with the hand.', 'Leg die Finger zuerst auf die Tasten, ohne zu drücken. Daumen, Mittelfinger und kleiner Finger sind gerundet, das Handgelenk ist auf einer Höhe mit der Hand.'),
      L('Then let the hand fall from the wrist, all fingers at once, to the bottom of the keys. Fingers that go down one by one give a roll, not a chord.', 'Dann lass die Hand aus dem Handgelenk fallen, alle Finger auf einmal, bis die Tasten ganz unten sind. Finger, die einer nach dem anderen hinuntergehen, ergeben ein Rollen, keinen Akkord.'),
      L('Keep the keys down and listen: every key should be there. If one is missing, it is nearly always the little finger.', 'Halte die Tasten unten und hör hin: Jede Taste sollte zu hören sein. Fehlt eine, ist es fast immer der kleine Finger.'),
      L('The app checks a new chord key by key first, and then as a whole. It need not be loud. It has to be together.', 'Die App prüft einen neuen Akkord erst Taste für Taste und dann als Ganzes. Laut muss er nicht sein. Zusammen muss er sein.'),
    ],
    art: () => {
      const fall = (x0: number, drops: number[], color: string): string => drops.map((d, i) => arrow(x0 + i * 52, 98 + d, 158 + d, color, 5) + `<rect x="${x0 + i * 52 - 20}" y="184" width="40" height="104" rx="5" fill="#fffdf8" stroke="${P.line}" stroke-width="2"/>`).join('');
      return (
        fall(74, [0, 0, 0], P.now) +
        fall(342, [-34, -12, 10], P.text) +
        label(126, 36, L('together: a chord', 'zusammen: ein Akkord'), 'middle', P.now) +
        label(394, 36, L('one after the other: a roll', 'nacheinander: ein Rollen'), 'middle', P.text) +
        `<path d="M104 322l14 14 28 -30" fill="none" stroke="${P.good}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M378 308l32 32M410 308l-32 32" stroke="${P.bad}" stroke-width="5" stroke-linecap="round"/>` +
        `<line x1="260" x2="260" y1="40" y2="350" stroke="${P.line}" stroke-width="1.5" stroke-dasharray="4 6"/>`
      );
    },
    tryIt: { say: L('Play G: the keys G, B and D with fingers 1, 3 and 5, all at once. Twice.', 'Spiel G: die Tasten G, B und D mit den Fingern 1, 3 und 5, alle auf einmal. Zweimal.'), chords: ['G'], count: 2, piano: true },
  },
  {
    id: 'p-move',
    title: L('From chord to chord', 'Von Akkord zu Akkord'),
    points: [
      L('The hand keeps its shape and moves as a whole. Look at the key the thumb is going to, not at the hand: the other fingers follow at their distance.', 'Die Hand behält ihre Form und bewegt sich als Ganzes. Schau auf die Taste, zu der der Daumen geht, nicht auf die Hand: Die anderen Finger folgen in ihrem Abstand.'),
      L('Let go of the old chord a moment before the new one is due, and travel in that moment. The new chord comes on the beat; the old one may be short.', 'Lass den alten Akkord kurz vor dem neuen los und nutz diesen Moment für den Weg. Der neue Akkord kommt auf den Schlag; der alte darf kurz sein.'),
      L('Some chords share keys: C and G both have the G, F and D minor both have F and A. A shared key helps the eye, even though another finger plays it.', 'Manche Akkorde teilen sich Tasten: C und G haben beide das G, F und D-Moll haben beide F und A. Eine gemeinsame Taste hilft dem Auge, auch wenn ein anderer Finger sie spielt.'),
      L('Thirty clean changes in a minute keep a song going. The app measures each change over one calm minute.', 'Dreißig saubere Wechsel pro Minute halten einen Song in Gang. Die App misst jeden Wechsel über eine ruhige Minute.'),
    ],
    art: () => {
      const r = keyRange([60, ...pianoChord('G').midis], true);
      const marks = [...chordMarks('C', false), ...chordMarks('G', true)];
      const W = 480 / Math.round(r.octaves * 7);
      // from the thumb on C to the thumb on G: four white keys to the right
      return (
        keyboard(marks, P, r.lowC, r.octaves, { x: 20, y: 130, w: 480, h: 180, names: true }) +
        `<path d="M${20 + W / 2} 112q${2 * W} -64 ${4 * W} 0" fill="none" stroke="${P.now}" stroke-width="3" stroke-linecap="round"/><path d="M${20 + 4.5 * W - 12} 96l12 16 4 -20" fill="none" stroke="${P.now}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
        label(260, 40, L('from C to G: the thumb leads, four keys to the right', 'von C zu G: der Daumen führt, vier Tasten nach rechts'), 'middle', P.text) +
        label(260, 344, L('pale: where the hand was · blue: where it lands', 'blass: wo die Hand war · blau: wo sie landet'), 'middle')
      );
    },
  },
  {
    id: 'p-black',
    title: L('Black keys', 'Schwarze Tasten'),
    points: [
      L('A black key lies between two white ones and takes its name from a neighbour: the one right of F is F sharp (F♯); seen from G the same key is G flat (G♭).', 'Eine schwarze Taste liegt zwischen zwei weißen und bekommt ihren Namen von einer Nachbarin: Die rechts neben F ist Fis (F♯); von G aus gesehen ist dieselbe Taste Ges (G♭).'),
      L('A small ♯ after a letter means the next key to the right, a ♭ the next key to the left.', 'Ein kleines ♯ hinter einem Buchstaben bedeutet die nächste Taste rechts, ein ♭ die nächste Taste links.'),
      L('Black keys are shorter and higher. Play them with the longer fingers, 2, 3 and 4; thumb and little finger stay on white keys where they can.', 'Schwarze Tasten sind kürzer und liegen höher. Spiel sie mit den längeren Fingern, 2, 3 und 4; Daumen und kleiner Finger bleiben auf weißen Tasten, wo es geht.'),
      L('For a chord with a black key in the middle, such as D (D, F♯ and A), slide the whole hand a little into the keys, so that the middle finger reaches without stretching.', 'Bei einem Akkord mit einer schwarzen Taste in der Mitte, etwa D (D, F♯ und A), schieb die ganze Hand ein wenig in die Tasten hinein, damit der Mittelfinger ohne Strecken hinkommt.'),
    ],
    art: () => {
      const W = 480 / 7;
      const names: [string, number][] = [['C♯', 1], ['D♯', 2], ['F♯', 4], ['G♯', 5], ['A♯', 6]];
      return keyboard(chordMarks('D', true), P, 60, 1, { x: 20, y: 120, w: 480, h: 190, names: true }) + names.map(([n, k]) => label(20 + k * W, 104, n, 'middle', n === 'F♯' ? P.now : P.muted)).join('') + label(260, 50, L('the chord of D: its middle key is the black F♯', 'der D-Akkord: seine mittlere Taste ist das schwarze F♯'), 'middle', P.text) + label(260, 346, L('the middle finger takes the black key', 'der Mittelfinger nimmt die schwarze Taste'), 'middle');
    },
    tryIt: { say: L('Play F sharp, the lowest of the three black keys, with the middle finger.', 'Spiel Fis, die tiefste der drei schwarzen Tasten, mit dem Mittelfinger.'), notes: [66], count: 1, piano: true },
  },
  {
    id: 'p-thumb',
    title: L('Passing the thumb under', 'Der Daumenuntersatz'),
    points: [
      L('Five fingers reach five keys. To go on upward, the thumb passes under the hand: in the scale of C after the third finger, so that it lands on F and the hand has five fresh keys.', 'Fünf Finger erreichen fünf Tasten. Um weiter aufwärts zu spielen, geht der Daumen unter der Hand hindurch: in der C-Dur-Tonleiter nach dem dritten Finger, sodass er auf F landet und die Hand fünf neue Tasten hat.'),
      L('Send the thumb on its way early: as soon as it has played, it travels under the hand while fingers 2 and 3 play.', 'Schick den Daumen früh auf den Weg: Sobald er gespielt hat, wandert er unter der Hand hindurch, während die Finger 2 und 3 spielen.'),
      L('Keep the wrist level and the elbow quiet; the hand does not twist. On the way down the third finger crosses over the thumb in the same way.', 'Halte das Handgelenk waagerecht und den Ellbogen ruhig; die Hand verdreht sich nicht. Abwärts kreuzt der dritte Finger auf dieselbe Weise über den Daumen.'),
      L('The app writes the finger under every note. Where a 1 follows a 3 or a 4 on the way up, the thumb passes under.', 'Die App schreibt unter jede Note den Finger. Wo aufwärts eine 1 auf eine 3 oder 4 folgt, geht der Daumen unter der Hand durch.'),
    ],
    art: () => {
      const scale = [60, 62, 64, 65, 67, 69, 71, 72];
      const fg = [1, 2, 3, 1, 2, 3, 4, 5];
      const W = 480 / 8;
      return (
        keyboard(scale.map((midi, i) => ({ midi, fg: fg[i], hot: i === 3 })), P, 60, 13 / 12, { x: 20, y: 110, w: 480, h: 190, names: true }) +
        `<path d="M${20 + W / 2} 318q${1.5 * W} 46 ${3 * W} 0" fill="none" stroke="${P.now}" stroke-width="3" stroke-linecap="round"/><path d="M${20 + 3.5 * W - 14} 330l14 -12 2 20" fill="none" stroke="${P.now}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
        label(260, 50, L('the scale of C: 1 2 3, then the thumb again', 'die C-Dur-Tonleiter: 1 2 3, dann wieder der Daumen'), 'middle', P.text) +
        label(260, 364, L('the thumb passes under fingers 2 and 3 and lands on F', 'der Daumen geht unter Finger 2 und 3 durch, landet auf F'), 'middle')
      );
    },
    tryIt: { say: L('Play C, D, E and F: fingers 1, 2, 3, and then the thumb again.', 'Spiel C, D, E und F: Finger 1, 2, 3 und dann wieder den Daumen.'), notes: [60, 62, 64, 65], count: 4, piano: true },
  },
  {
    id: 'p-broken',
    title: L('Broken chords', 'Gebrochene Akkorde'),
    points: [
      L('A broken chord is a chord whose keys are played one after the other instead of together. The hand lies on the whole chord all the time; only the fingers take turns.', 'Ein gebrochener Akkord ist ein Akkord, dessen Tasten nacheinander statt zusammen gespielt werden. Die Hand liegt die ganze Zeit auf dem ganzen Akkord; nur die Finger wechseln sich ab.'),
      L('Two common patterns: up and back (bottom, middle, top, middle), and bottom, top, middle, top, which rocks the hand. Piano teachers call the second one an Alberti bass.', 'Zwei häufige Muster: hinauf und zurück (unten, Mitte, oben, Mitte) und unten, oben, Mitte, oben, das die Hand wiegt. Klavierlehrer nennen das zweite einen Alberti-Bass.'),
      L('In a pattern of six the hand opens to the key an octave above the lowest: 1, 2, 3, 5 and back.', 'In einem Muster aus sechs Tönen öffnet sich die Hand bis zur Taste eine Oktave über der tiefsten: 1, 2, 3, 5 und zurück.'),
      L('Keep the fingers close to the keys and let each key ring until its neighbour sounds. Even matters more than fast.', 'Halte die Finger nah an den Tasten und lass jede Taste klingen, bis ihre Nachbarin erklingt. Gleichmäßig ist wichtiger als schnell.'),
    ],
    art: () => {
      const row = (y0: number, name: string, seq: [string, number, number][]): string =>
        label(40, y0 + 60, name, 'start', P.text) +
        seq
          .map(([n, lvl, f], i) => {
            const x = 190 + i * 74;
            const y = y0 + 66 - lvl * 26;
            return `<rect x="${x}" y="${y}" width="62" height="32" rx="8" fill="${i === 0 ? P.now : P.panel}" stroke="${i === 0 ? P.now : P.line}" stroke-width="2"/><text x="${x + 12}" y="${y + 22}" class="lbl" style="font-weight:700" fill="${i === 0 ? P.nowInk : P.text}">${n}</text>` + label(x + 14, y0 + 124, String(f), 'start', i === 0 ? P.now : P.muted);
          })
          .join('') +
        `<line x1="190" x2="486" y1="${y0 + 104}" y2="${y0 + 104}" stroke="${P.line}" stroke-width="1.5"/>`;
      return label(260, 34, L('the chord of C, one key at a time', 'der C-Akkord, eine Taste nach der anderen'), 'middle', P.text) + row(46, L('up and back', 'hinauf und zurück'), [['C', 0, 1], ['E', 1, 3], ['G', 2, 5], ['E', 1, 3]]) + row(206, L('rocking', 'wiegend'), [['C', 0, 1], ['G', 2, 5], ['E', 1, 3], ['G', 2, 5]]) + label(40, 126, L('finger', 'Finger'), 'start') + label(40, 286, L('finger', 'Finger'), 'start');
    },
    tryIt: { say: L('Play C, E, G, E one after the other with fingers 1, 3, 5, 3.', 'Spiel C, E, G, E nacheinander mit den Fingern 1, 3, 5, 3.'), notes: [60, 64, 67, 64], count: 4, piano: true },
  },
  {
    id: 'p-hands',
    title: L('One hand at a time, and the pedal', 'Jeweils eine Hand, und das Pedal'),
    points: [
      L('Everything in this app is played with one hand at a time. The pieces and chords are written for the right hand; the finger gym also trains the left.', 'In dieser App spielst du alles mit jeweils einer Hand. Die Stücke und Akkorde sind für die rechte Hand geschrieben; das Fingertraining übt auch die linke.'),
      L('That is how the piano is learned anyway: each hand alone first. It is also what a microphone can check. With both hands playing it cannot tell for sure which keys were struck.', 'So lernt man Klavier ohnehin: erst jede Hand allein. Das kann auch ein Mikrofon prüfen. Spielen beide Hände, kann es nicht sicher sagen, welche Tasten angeschlagen wurden.'),
      L('When a song sits well in the right hand, try this without the app: the left hand plays only the lowest key of each chord, an octave or two further down, while the right hand goes on as before.', 'Wenn ein Song in der rechten Hand gut sitzt, probier ohne die App Folgendes: Die linke Hand spielt nur die tiefste Taste jedes Akkords, eine oder zwei Oktaven weiter unten, während die rechte Hand wie bisher weiterspielt.'),
      L('The right pedal lets every key ring on after you let go. It makes a broken chord sound full, and it blurs a tune: lift it at every change of chord.', 'Das rechte Pedal lässt jede Taste weiterklingen, nachdem du sie losgelassen hast. Es lässt einen gebrochenen Akkord voll klingen und verwischt eine Melodie: Heb es bei jedem Akkordwechsel an.'),
    ],
    art: () =>
      keyboard([{ midi: 48, hot: true, fg: 5 }], P, 48, 1, { x: 14, y: 130, w: 236, h: 160, names: true }) +
      keyboard(chordMarks('C', true), P, 60, 1, { x: 270, y: 130, w: 236, h: 160, names: true }) +
      label(132, 96, L('left hand: only the lowest key', 'linke Hand: nur die tiefste Taste'), 'middle', P.text) +
      label(388, 96, L('right hand: the chord', 'rechte Hand: der Akkord'), 'middle', P.text) +
      label(260, 336, L('for later, and without the app:', 'für später, und ohne die App:'), 'middle') +
      label(260, 358, L('the app listens to one hand at a time', 'die App hört immer nur einer Hand zu'), 'middle'),
  },
  {
    id: 'tune',
    title: L('Tuning: one string, one peg', 'Stimmen: eine Saite, ein Wirbel'),
    points: [
      L('Every string is wound onto its own peg at the head. Follow the string with a finger to find its peg before you turn.', 'Jede Saite ist am Kopf auf ihren eigenen Wirbel gewickelt. Folge der Saite mit einem Finger bis zu ihrem Wirbel, bevor du drehst.'),
      L('One way tightens the string and raises the note, the other loosens it. Which way that is differs from side to side of the head: make a small turn and watch the dot.', 'In die eine Richtung spannst du die Saite und der Ton steigt, in die andere lockerst du sie. Welche Richtung das ist, hängt von der Seite des Kopfes ab: Dreh ein kleines Stück und beobachte den Punkt.'),
      L('If a string is too high, loosen it to below the note and come back up to it. It holds better that way.', 'Ist eine Saite zu hoch, lockere sie bis unter den Ton und stimm sie dann von unten hinauf. So hält die Stimmung besser.'),
      L('Pluck, let it ring, turn slowly. If the dot does not move while you turn, you have the wrong peg.', 'Zupf an, lass klingen, dreh langsam. Bewegt sich der Punkt beim Drehen nicht, hast du den falschen Wirbel.'),
    ],
    art: () => {
      let h = `<path d="M180 40h160l14 250h-188z" fill="${P.panel}" stroke="${P.line}" stroke-width="2"/><rect x="196" y="290" width="128" height="80" fill="${P.panel}" stroke="${P.line}" stroke-width="2"/><line x1="196" x2="324" y1="290" y2="290" stroke="${P.text}" stroke-width="5"/>`;
      const names = ['E', 'A', 'D', 'G', 'B', 'e'];
      for (let s = 0; s < 6; s++) {
        const left = s < 3;
        const px = left ? 150 : 370;
        const py = left ? 230 - s * 70 : 90 + (s - 3) * 70;
        const sx = 208 + s * 21;
        h += `<path d="M${sx} 370L${sx} 290L${left ? 205 : 315} ${py}" fill="none" stroke="${s === 1 ? P.now : P.text}" stroke-width="${s === 1 ? 2.6 : 1.4}" opacity="${s === 1 ? 1 : 0.6}"/><circle cx="${left ? 205 : 315}" cy="${py}" r="6" fill="${P.bg}" stroke="${P.text}" stroke-width="1.5"/><rect x="${left ? px - 26 : px}" y="${py - 11}" width="26" height="22" rx="6" fill="${s === 1 ? P.now : P.panel}" stroke="${s === 1 ? P.now : P.line}" stroke-width="2"/><line x1="${left ? 150 : 315}" x2="${left ? 205 : 370}" y1="${py}" y2="${py}" stroke="${P.line}" stroke-width="3"/>` + label(left ? px - 36 : px + 36, py + 5, names[s], left ? 'end' : 'start', s === 1 ? P.now : P.muted);
      }
      return h + label(260, 28, L('the head, seen from the front', 'der Kopf, von vorn gesehen'), 'middle');
    },
  },
  {
    id: 'diagram',
    title: L('How to read a chord picture', 'Wie du ein Griffbild liest'),
    points: [
      L('The six upright lines are the strings: the thickest (low E) on the left, the thinnest on the right, as if the guitar stood in front of you.', 'Die sechs senkrechten Linien sind die Saiten: die dickste (tiefe E-Saite) links, die dünnste rechts, als stünde die Gitarre vor dir.'),
      L('The lines across are the frets. The thick line at the top is the nut, where the neck ends.', 'Die waagerechten Linien sind die Bünde. Die dicke Linie oben ist der Sattel, wo der Hals endet.'),
      L('A dot is a fingertip on that string in that fret. Its number is the finger: 1 index, 2 middle, 3 ring, 4 little finger.', 'Ein Punkt ist eine Fingerkuppe auf dieser Saite in diesem Bund. Seine Zahl ist der Finger: 1 Zeigefinger, 2 Mittelfinger, 3 Ringfinger, 4 kleiner Finger.'),
      L('A ring above a string means: play it open. A cross means: leave that string out.', 'Ein Kreis über einer Saite heißt: Spiel sie leer. Ein Kreuz heißt: Lass diese Saite aus.'),
    ],
    art: () =>
      chordBox(CHORDS['Am'], 170, 90, 200, P, false, undefined, 50) +
      label(150, 66, L('leave out', 'auslassen'), 'end') + lead(152, 62, 168, 72) +
      label(392, 66, L('open string', 'leere Saite'), 'start') + lead(390, 62, 372, 74) +
      label(150, 96, L('nut', 'Sattel'), 'end') + lead(152, 92, 168, 91) +
      label(392, 122, L('finger 1 (index)', 'Zeigefinger (1)'), 'start', P.text) + lead(390, 118, 344, 116) +
      label(150, 172, L('fingers 2 and 3', 'Finger 2 und 3'), 'end', P.text) + lead(152, 168, 236, 166) +
      label(150, 250, L('a fret', 'ein Bund'), 'end') + lead(152, 246, 168, 240) +
      label(170, 372, L('thick', 'dick'), 'middle') + label(370, 372, L('thin', 'dünn'), 'middle') + label(270, 372, L('strings', 'Saiten'), 'middle'),
  },
  {
    id: 'press',
    title: L('How to press a string', 'Wie du eine Saite drückst'),
    points: [
      L('Use the tip of the finger and land close behind the fret wire, on the side towards the head, not in the middle of the fret.', 'Nimm die Fingerkuppe und setz sie dicht hinter dem Bundstäbchen auf, auf der Seite zum Kopf hin, nicht in der Mitte des Bundes.'),
      L('Keep the finger arched like a small bridge, so that it does not lean on the string next to it.', 'Halte den Finger gewölbt wie eine kleine Brücke, damit er nicht an der Nachbarsaite anliegt.'),
      L('The thumb sits behind the neck, about opposite the middle finger. Press only as hard as it takes to ring.', 'Der Daumen sitzt hinter dem Hals, etwa gegenüber dem Mittelfinger. Drück nur so fest, wie es zum Klingen nötig ist.'),
      L('A string that is dull or buzzes: nearly always the finger is too far from the fret wire, or another finger touches that string.', 'Klingt eine Saite dumpf oder schnarrt sie, ist fast immer der Finger zu weit vom Bundstäbchen weg, oder ein anderer Finger berührt diese Saite.'),
    ],
    art: () => {
      const neck = (y: number, fx: number, ok: boolean): string =>
        `<rect x="40" y="${y}" width="440" height="26" fill="${P.panel}" stroke="${P.line}" stroke-width="2"/>${[120, 260, 400].map((x) => `<rect x="${x - 3}" y="${y - 8}" width="6" height="10" rx="2" fill="${P.text}"/>`).join('')}<line x1="40" x2="480" y1="${y - 14}" y2="${y - 14}" stroke="${P.text}" stroke-width="2" opacity="0.7"/>` +
        `<path d="M${fx - 16} ${y - 96}q-4 54 6 80q10 6 20 0q10 -26 6 -80z" fill="${ok ? P.now : P.bad}" opacity="0.85"/>` +
        label(fx + 30, y - 60, ok ? L('right behind the wire: rings', 'dicht hinterm Stäbchen: klingt') : L('in the middle of the fret: buzzes', 'mitten im Bund: schnarrt'), 'start', ok ? P.now : P.bad);
      return neck(150, 238, true) + neck(320, 190, false) + label(120, 196, L('fret wire', 'Bundstäbchen'), 'middle') + label(40, 30, L('the neck from the side: head to the left', 'der Hals von der Seite: Kopf links'), 'start');
    },
  },
  {
    id: 'strum',
    title: L('How to strum', 'Wie du anschlägst'),
    points: [
      L('Hold the chord. With the thumb or a pick, brush down across the strings in one loose movement from the wrist: from the thickest string of the chord to the thinnest.', 'Greif den Akkord. Streich mit dem Daumen oder einem Plektrum in einer lockeren Bewegung aus dem Handgelenk abwärts über die Saiten: von der dicksten Saite des Akkords bis zur dünnsten.'),
      L('Strings with a cross in the chord picture are left out: start the stroke below them.', 'Saiten mit einem Kreuz im Griffbild lässt du aus: Setz den Anschlag erst unterhalb von ihnen an.'),
      L('Down (D) goes towards the floor, up (U) comes back. An upstroke only needs the three or four thin strings.', 'Der Abschlag geht zum Boden hin, der Aufschlag kommt zurück. Ein Aufschlag braucht nur die drei oder vier dünnen Saiten.'),
      L('Count evenly: 1, 2, 3, 4. To begin with, one downstroke on every count.', 'Zähl gleichmäßig: 1, 2, 3, 4. Für den Anfang ein Abschlag auf jede Zahl.'),
    ],
    art: () => strings(60, 460, 110, 34) + arrow(200, 84, 306, P.now, 8) + arrow(330, 282, 176, P.text, 6) + label(200, 340, L('D: down, all strings', 'Abschlag: alle Saiten'), 'middle', P.now) + label(330, 160, L('U: up, the thin ones', 'Aufschlag: die dünnen'), 'start', P.text) + label(48, 114, 'e', 'end') + label(48, 284, 'E', 'end') + label(60, 60, L('the strings as you see them looking down: thin at the top', 'die Saiten, wie du von oben auf sie schaust: dünn oben'), 'start'),
    tryIt: { say: L('Hold Em or Am and strum down four times, slowly.', 'Greif Em oder Am und schlag viermal abwärts an, langsam.'), chords: ['Em', 'Am'], count: 4 },
  },
  {
    id: 'patterns',
    title: L('Strumming patterns', 'Schlagmuster'),
    points: [
      L('A pattern says on which counts you strum. The hand swings down and up all the time, like a pendulum, also where it does not touch the strings: that swing is what keeps the time.', 'Ein Muster sagt, auf welchen Zahlen du anschlägst. Die Hand schwingt die ganze Zeit ab und auf wie ein Pendel, auch dort, wo sie die Saiten nicht berührt: Dieses Schwingen hält dich im Takt.'),
      L('Down falls on the counts 1 2 3 4, up on the "and" between them.', 'Abschläge fallen auf die Zahlen 1 2 3 4, Aufschläge auf das „und“ dazwischen.'),
      L('Start with every beat. Then leave strums out, and later add the upstrokes.', 'Fang mit einem Anschlag auf jedem Schlag an. Dann lass Anschläge weg, und später nimm die Aufschläge dazu.'),
      L('The app hears when you strum, not whether it was down or up. What it measures is your timing.', 'Die App hört, wann du anschlägst, nicht ob ab oder auf. Was sie misst, ist dein Timing.'),
    ],
    art: () =>
      ['1', '+', '2', '+', '3', '+', '4', '+'].map((c, i) => label(232 + i * 34, 40, c, 'middle', c === '+' ? P.faint : P.text)).join('') +
      pattern(90, L('Every beat', 'Jeder Schlag'), 'D.D.D.D.') + pattern(150, L('One and three', 'Eins und drei'), 'D...D...') + pattern(210, L('Rest on two', 'Pause auf zwei'), 'D...D.D.') + pattern(270, L('Quick pair on three', 'Schnelles Paar auf drei'), 'D.D.DUD.') + pattern(330, L('The classic', 'Der Klassiker'), 'D.DU.UDU'),
  },
  {
    id: 'pluck',
    title: L('Plucking single strings', 'Einzelne Saiten zupfen'),
    points: [
      L('Plucking (fingerpicking) sounds one string at a time. The thumb plays the three thick strings, the index finger the G string, the middle finger the B string, the ring finger the high e string.', 'Beim Zupfen (Fingerpicking) klingt jeweils eine Saite. Der Daumen spielt die drei dicken Saiten, der Zeigefinger die G-Saite, der Mittelfinger die B-Saite, der Ringfinger die hohe e-Saite.'),
      L('Rest the hand lightly on the guitar and move the fingers, not the arm. The thumb strokes down, the fingers pull up towards the palm.', 'Leg die Hand leicht auf der Gitarre ab und beweg die Finger, nicht den Arm. Der Daumen streicht nach unten, die Finger ziehen nach oben zur Handfläche.'),
      L('A picking pattern repeats over each chord. In Greensleeves: bass string, G, B, e, B, G.', 'Ein Zupfmuster wiederholt sich über jedem Akkord. In Greensleeves: Basssaite, G, B, e, B, G.'),
      L('With a pick it works too: one string at a time, down and up in turn.', 'Mit Plektrum geht es auch: eine Saite nach der anderen, abwechselnd ab und auf.'),
    ],
    art: () =>
      strings(120, 480, 80, 40) +
      ['E', 'A', 'D', 'G', 'B', 'e'].map((n, s) => label(108, 86 + (5 - s) * 40, n, 'end', P.text)).join('') +
      `<path d="M92 290v-88" stroke="${P.now}" stroke-width="3"/>` + label(60, 250, L('thumb', 'Daumen'), 'end', P.now) +
      label(60, 166, L('index', 'Zeigef.'), 'end', P.text) + label(60, 126, L('middle', 'Mittelf.'), 'end', P.text) + label(60, 86, L('ring', 'Ringf.'), 'end', P.text) +
      [[1, 0], [3, 1], [4, 2], [5, 3], [4, 4], [3, 5]].map(([s, k]) => `<circle cx="${170 + k * 56}" cy="${80 + (5 - s) * 40}" r="13" fill="${k === 0 ? P.now : P.text}"/><text x="${170 + k * 56}" y="${85 + (5 - s) * 40}" class="fgr" style="font-size:13px" fill="${P.bg}">${k + 1}</text>`).join('') +
      label(300, 340, L('the pattern over an A minor chord, in the order 1 to 6', 'das Muster über einem A-Moll-Akkord, der Reihe nach 1 bis 6'), 'middle'),
    tryIt: { say: L('Pluck the open A string with the thumb, then the open G string with the index finger.', 'Zupf die leere A-Saite mit dem Daumen, dann die leere G-Saite mit dem Zeigefinger.'), notes: [45, 55], count: 2 },
  },
  {
    id: 'tab',
    title: L('How to read tab', 'Wie du Tabulatur liest'),
    points: [
      L('Six lines, one for each string. The bottom line is the thickest string: as if the guitar lay on your lap with the strings facing you.', 'Sechs Linien, eine für jede Saite. Die unterste Linie ist die dickste Saite: als läge die Gitarre auf deinem Schoß, die Saiten dir zugewandt.'),
      L('A number is the fret to press on that string; 0 is the open string. Read from left to right, one after the other.', 'Eine Zahl ist der Bund, den du auf dieser Saite drückst; 0 ist die leere Saite. Lies von links nach rechts, eins nach dem anderen.'),
      L('Numbers above each other are played together. A slash is one strum of the chord named above the bar.', 'Zahlen übereinander werden zusammen gespielt. Ein Schrägstrich ist ein Anschlag des Akkords, der über dem Takt steht.'),
      L('The blue marker is where you are. In the first mode it waits until it hears the right note.', 'Die blaue Markierung zeigt, wo du bist. Im ersten Modus wartet sie, bis sie den richtigen Ton hört.'),
    ],
    art: () => {
      let h = '';
      ['e', 'B', 'G', 'D', 'A', 'E'].forEach((n, k) => (h += `<line x1="80" x2="490" y1="${90 + k * 36}" y2="${90 + k * 36}" stroke="${P.line}" stroke-width="2"/>` + label(64, 96 + k * 36, n, 'end', P.text)));
      const note = (x: number, s: number, f: number, hot = false): string => `<rect x="${x - 14}" y="${90 + (5 - s) * 36 - 15}" width="28" height="30" fill="${P.bg}"/>${hot ? `<circle cx="${x}" cy="${90 + (5 - s) * 36}" r="17" fill="${P.now}"/>` : ''}<text x="${x}" y="${98 + (5 - s) * 36}" class="tn" fill="${hot ? P.nowInk : P.text}">${f}</text>`;
      h += note(130, 1, 0, true) + note(200, 3, 2) + note(270, 4, 1) + note(340, 5, 0) + note(430, 2, 2) + note(430, 3, 2) + note(430, 4, 1);
      return h + label(130, 52, L('now: A string, open', 'jetzt: A-Saite, leer'), 'middle', P.now) + label(430, 52, L('together', 'zusammen'), 'middle') + label(285, 330, L('left to right is time', 'von links nach rechts läuft die Zeit'), 'middle') + `<path d="M150 340h270m-10 -6l10 6l-10 6" fill="none" stroke="${P.faint}" stroke-width="1.5"/>`;
    },
  },
  {
    id: 'barre',
    title: L('What a barre is', 'Was ein Barré ist'),
    points: [
      L('In a barre the index finger lies flat across several strings in one fret. It takes the place of the nut, and the other fingers build the shape in front of it.', 'Beim Barré liegt der Zeigefinger flach über mehreren Saiten in einem Bund. Er übernimmt die Rolle des Sattels, und die anderen Finger bauen den Griff davor auf.'),
      L('It is position, not strength: close behind the fret wire, rolled a little onto the bony edge of the finger, thumb behind the neck opposite it, elbow in.', 'Es ist eine Frage der Haltung, nicht der Kraft: dicht hinter dem Bundstäbchen, ein wenig auf die knochige Kante des Fingers gerollt, der Daumen hinter dem Hals gegenüber, der Ellbogen nah am Körper.'),
      L('Begin with the small shapes on three or four strings. A full barre takes weeks: a few tries a day do more than one long fight.', 'Fang mit den kleinen Griffen über drei oder vier Saiten an. Ein volles Barré braucht Wochen: Ein paar Versuche am Tag bringen mehr als ein langer Kampf.'),
      L('Check it string by string. Which string does not ring tells you what to shift.', 'Prüf es Saite für Saite. Welche Saite nicht klingt, sagt dir, was du verschieben musst.'),
    ],
    art: () => chordBox(CHORDS['F#m'], 170, 90, 200, P, false, undefined, 50) + label(392, 196, L('the index finger, flat', 'Zeigefinger, flach'), 'start', P.text) + lead(390, 192, 374, 168) + label(150, 290, L('ring and little finger', 'Finger 3 und 4'), 'end', P.text) + lead(152, 286, 208, 268) + label(270, 372, L('F♯ minor: the full shape', 'F♯-Moll: der volle Griff'), 'middle'),
  },
];

const skipAll = (): boolean => {
  const q = new URLSearchParams(location.search);
  return q.has('autostart') && !q.has('intros');
};
/** Has this introduction still to be shown? */
export const unseen = (id: string): boolean => !skipAll() && !store.progress['seen:' + id] && INTROS().some((i) => i.id === id);

/** Shows introductions one after the other, then calls done. Returns what cleans up. */
export function showIntros(root: HTMLElement, ids: string[], done: () => void, railHtml = '', quitLabel = L('Home', 'Start'), again?: { at: number }): () => void {
  const intros = INTROS();
  const pages = ids.map((id) => intros.find((i) => i.id === id)).filter((i): i is Intro => !!i);
  const mode = document.body.dataset.mode;
  document.body.dataset.mode = 'learn';
  let at = again ? Math.max(0, Math.min(pages.length - 1, again.at)) : 0;
  let heard = 0;
  let stopHear: () => void = () => undefined;
  root.innerHTML = `<header class="top"><div><a class="btn quiet" id="quit" href="${again ? '#/basics' : '#/'}">${icon(railHtml ? 'x' : 'left')}${quitLabel}</a></div><div class="c">${railHtml || (again ? '' : `<b>${L('Basics', 'Grundlagen')}</b>`)}</div><div class="r">${micMeter()}</div></header>
    <div class="stage"><div class="two intro"><svg class="fit" id="art" viewBox="0 0 520 380" role="img"></svg>
      <div><p class="eyebrow" id="eb"></p><h1 id="h1"></h1><ul class="points" id="pts"></ul><p class="tip" id="try" hidden></p></div></div></div>${practiceBar()}
    <footer class="bar"><div class="grp"><button class="btn" id="back">${icon('left')}${L('Back', 'Zurück')} <kbd>←</kbd></button><button class="btn primary" id="ok"><span id="oklbl">${L('Got it', 'Verstanden')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button></div><p class="auto">${again ? L('The app listens while you try; nothing is measured. The handbook is at the top left.', 'Die App hört zu, während du es ausprobierst; gemessen wird nichts. Das Handbuch erreichst du oben links.') : L('Shown once. You find all of these again under Basics in the menu.', 'Wird nur einmal gezeigt. Unter Grundlagen im Menü findest du sie alle wieder.')}</p></footer>`;
  const bar = root.querySelector<HTMLElement>('.practice');

  function draw(): void {
    const p = pages[at];
    stopHear();
    heard = 0;
    $('#art', root).innerHTML = p.art();
    $('#art', root).setAttribute('aria-label', L(`Picture: ${p.title}`, `Bild: ${p.title}`));
    $('#eb', root).textContent = again ? L('Basics · try it', 'Grundlagen · ausprobieren') : L(`Before you start · ${at + 1} of ${pages.length}`, `Bevor du anfängst · ${at + 1} von ${pages.length}`);
    if (again) $('#quit', root).setAttribute('href', `#/basics/${p.id}`);
    $('#h1', root).textContent = p.title;
    $('#pts', root).innerHTML = p.points.map((t) => `<li>${esc(t)}</li>`).join('');
    $<HTMLButtonElement>('#back', root).disabled = at === 0;
    $('#back', root).hidden = pages.length < 2;
    $('#oklbl', root).textContent = !again ? L('Got it', 'Verstanden') : at + 1 < pages.length ? L('Next', 'Weiter') : L('Back to the handbook', 'Zurück zum Handbuch');
    // the practice instrument has something to do only where there is something to try
    if (bar) bar.style.display = p.tryIt ? '' : 'none';
    const t = p.tryIt;
    const tryEl = $('#try', root);
    tryEl.hidden = !t;
    setSimTarget(null);
    if (!t) return;
    const show = (): void => {
      tryEl.innerHTML = `<b>${heard >= t.count ? L('Try it: that is it', 'Probier es aus: genau so') : L('Try it', 'Probier es aus')}</b>${esc(t.say)} ${heard ? `<span class="heard">${icon('check')}${L(`heard ${Math.min(heard, t.count)} of ${t.count}`, `${Math.min(heard, t.count)} von ${t.count} gehört`)}</span>` : L('The app listens; nothing is measured.', 'Die App hört zu; gemessen wird nichts.')}`;
      const want = t.notes?.length ? t.notes[Math.min(heard, t.notes.length - 1)] : 57;
      setSimTarget(heard >= t.count ? null : t.chords ? { kind: 'chord', id: t.chords[0], piano: t.piano } : t.voice ? { kind: 'note', midi: want, voice: true } : { kind: 'note', midi: want, piano: t.piano });
    };
    show();
    if (t.voice) {
      // sung: a note counts when it is held for a moment (any octave); with no notes given, any note held
      let hold: Hold | null = null;
      let held = -1;
      let since = -1;
      let last = -1;
      stopHear = hear(
        root,
        {
          onPitch: (e) => {
            if (heard >= t.count) return;
            const midi = e.midi + e.cents / 100;
            const target = t.notes?.length ? t.notes[Math.min(heard, t.notes.length - 1)] : null;
            if (target !== null) {
              if (!hold || hold.target !== target) hold = new Hold(target, 50, 0.3);
              if (hold.push({ t: e.time, midi })) {
                hold = null;
                heard++;
                show();
              }
              return;
            }
            // any note: the same one, within half a semitone, for four tenths of a second
            const m = Math.round(midi);
            if (m !== held || e.time - last > 0.12) {
              held = m;
              since = e.time;
            }
            last = e.time;
            if (e.time - since >= 0.4 && Math.abs(centsOff(midi, m)) <= 50) {
              heard++;
              held = -1;
              show();
              tryEl.innerHTML += ` <span class="heard">${L(`That was ${noteName(m)}.`, `Das war ${noteName(m)}.`)}</span>`;
            }
          },
        },
        voiceEars,
      );
      return;
    }
    stopHear = hear(
      root,
      {
        onChord: (e) => {
          if (t.chords && e.best && t.chords.includes(e.best) && e.score > 0.6) {
            heard++;
            show();
          }
        },
        onNote: (e) => {
          if (t.notes && e.midi === t.notes[Math.min(heard, t.notes.length - 1)]) {
            heard++;
            show();
          }
        },
      },
      (l) => {
        if (t.piano) pianoEars(l);
        l.noteDetection = !!t.notes;
        l.expected = t.notes ?? null;
        l.chordCandidates = t.chords ?? null;
      },
    );
  }
  const next = (): void => {
    store.progress['seen:' + pages[at].id] = Date.now();
    store.save();
    if (at + 1 < pages.length) {
      at++;
      draw();
      return;
    }
    cleanup();
    done();
  };
  const back = (): void => {
    if (at > 0) {
      at--;
      draw();
    }
  };
  const stopKeys = keys({ ' ': next, Enter: next, ArrowRight: next, ArrowLeft: back });
  let cleaned = false;
  function cleanup(): void {
    if (cleaned) return;
    cleaned = true;
    stopHear();
    stopKeys();
    setSimTarget(null);
    if (mode) document.body.dataset.mode = mode;
  }
  $('#ok', root).onclick = next;
  $('#back', root).onclick = back;
  if (!pages.length) {
    cleanup();
    done();
  } else draw();
  return cleanup;
}

/** Which introductions belong before a screen, given what it is opened with. */
function introsFor(name: string, params: string[]): string[] {
  const piano = store.settings.instrument === 'piano';
  const voice = store.settings.instrument === 'voice';
  if (name === 'range') return ['v-stand', 'v-warm', 'v-range'];
  if (name === 'hold') return ['v-stand', 'v-warm', 'v-steady'];
  if (name === 'match') return ['v-match', 'v-lane'];
  if (name === 'sing') return ['v-lane', 'v-steps'];
  if (name === 'run' && (params[0] === 'sing' || params[0] === 'ssong')) return ['v-match', 'v-steps'];
  if (voice && name === 'stride') return ['count', 'v-steps'];
  if (name === 'tuner') return params[0] === 'piano' ? ['p-keys'] : params[0] ? [] : ['hold', 'tune'];
  if (name === 'keys') return ['p-sit', 'p-chord', 'p-figure', 'p-play'];
  if (piano && name === 'change') return ['p-play', 'p-move'];
  if (piano && name === 'stride') return ['count', 'p-play', 'p-move'];
  if (name === 'run' && params[0] === 'kchanges') return ['p-sit', 'p-play', 'p-move'];
  if (name === 'chord') {
    const ids = params.filter((p) => CHORDS[p]);
    return ['chord', 'diagram', 'press', ...(ids.length && ids.every((c) => barreStrings(CHORDS[c]).length > 0) ? ['barre'] : [])];
  }
  if (name === 'change') return ['strum'];
  if (name === 'stride') return ['count', 'strum', 'patterns'];
  if (name === 'piano') {
    // what this piece asks for beyond five fingers on white keys
    const piece = findPiece(params[0]);
    const notes = piece.phrases.flat();
    const crossing = notes.some((n, i) => i > 0 && !!n.fg && !!notes[i - 1].fg && ((n.midi > notes[i - 1].midi && n.fg === 1 && notes[i - 1].fg! > 1) || (n.midi < notes[i - 1].midi && notes[i - 1].fg === 1 && n.fg > 1)));
    const black = notes.some((n) => (n.chord ? pianoChord(n.chord).midis.some(isBlackKey) : isBlackKey(n.midi)));
    return ['p-sit', 'p-keys', 'p-notes', ...(piece.kind === 'chords' ? ['p-figure'] : []), ...(piece.kind === 'broken' ? ['p-figure', 'p-broken'] : []), ...(black ? ['p-black'] : []), ...(crossing ? ['p-thumb'] : [])];
  }
  if (name === 'run') return params[0] === 'changes' ? ['strum', 'mute'] : params[0] === 'fingers' ? ['tab', 'mute'] : params[0] === 'keys' || params[0] === 'piece' ? ['p-sit', 'p-keys'] : ['mute'];
  if (name === 'song') {
    const song = findSong(params[0]);
    const strummed = song.bars.every((b) => b.notes.every((n) => n.strum));
    return strummed ? ['tab', 'strum'] : song.bars.some((b) => b.chord) ? ['tab', 'pluck'] : ['tab'];
  }
  return [];
}

/** A screen that is preceded, the first time, by the introductions it needs. */
export function withIntro(name: string, screen: Screen): Screen {
  return (root, params, ctx) => {
    const ids = introsFor(name, params).filter(unseen);
    if (!ids.length) return screen(root, params, ctx);
    let stop: void | (() => void) = showIntros(
      root,
      ids,
      () => {
        stop = screen(root, params, ctx);
      },
      ctx?.rail,
      ctx ? L('End session', 'Session beenden') : L('Home', 'Start'),
    );
    return () => stop?.();
  };
}

interface Chapter {
  title: string;
  about: string;
  ids: string[];
}

/** The handbook of each instrument: its chapters, and in them the pages in the order to read them. */
const CHAPTERS = (): Record<Instrument, Chapter[]> => ({
  voice: VOICE_CHAPTERS(),
  guitar: [
    { title: L('First things', 'Am Anfang'), about: L('The guitar in your hands, in tune, and the beat.', 'Die Gitarre in deinen Händen, gestimmt, und der Schlag.'), ids: ['hold', 'tune', 'count'] },
    { title: L('Chords', 'Akkorde'), about: L('What they are, how their pictures are read, how to press.', 'Was sie sind, wie du ihre Griffbilder liest, wie du die Saiten drückst.'), ids: ['chord', 'diagram', 'press'] },
    { title: L('The strumming hand', 'Die Anschlagshand'), about: L('One stroke, then patterns, and how to stop the strings.', 'Ein Anschlag, dann Muster, und wie du die Saiten abdämpfst.'), ids: ['strum', 'patterns', 'mute'] },
    { title: L('Single notes', 'Einzelne Töne'), about: L('Plucking, reading tab, and notes that are not plucked.', 'Zupfen, Tabulatur lesen, und Töne, die nicht gezupft werden.'), ids: ['pluck', 'tab', 'slur'] },
    { title: L('For later', 'Für später'), about: L('The barre: a matter of weeks, never of one evening.', 'Das Barré: eine Sache von Wochen, nie von einem Abend.'), ids: ['barre'] },
  ],
  piano: [
    { title: L('At the piano', 'Am Klavier'), about: L('How to sit, and where the keys are.', 'Wie du sitzt, und wo die Tasten liegen.'), ids: ['p-sit', 'p-keys'] },
    { title: L('Reading and counting', 'Lesen und Zählen'), about: L('The strip the notes are written on, and the beat.', 'Der Streifen, auf dem die Noten stehen, und der Schlag.'), ids: ['p-notes', 'count'] },
    { title: L('Chords', 'Akkorde'), about: L('What they are, how they are shown, how to strike and how to move.', 'Was sie sind, wie sie gezeigt werden, wie du sie anschlägst und wechselst.'), ids: ['p-chord', 'p-figure', 'p-play', 'p-move'] },
    { title: L('Beyond five fingers', 'Über fünf Finger hinaus'), about: L('Black keys, the thumb passing under, chords broken into keys.', 'Schwarze Tasten, der Daumenuntersatz, Akkorde in einzelne Tasten gebrochen.'), ids: ['p-black', 'p-thumb', 'p-broken'] },
    { title: L('For later', 'Für später'), about: L('The other hand, and the pedal.', 'Die andere Hand, und das Pedal.'), ids: ['p-hands'] },
  ],
});
const ORDER: Record<Instrument, string[]> = { guitar: CHAPTERS().guitar.flatMap((c) => c.ids), piano: CHAPTERS().piano.flatMap((c) => c.ids), voice: CHAPTERS().voice.flatMap((c) => c.ids) };
const INSTRUMENTS: Instrument[] = ['guitar', 'piano', 'voice'];
const instName = (i: Instrument): string => (i === 'piano' ? L('piano', 'Klavier') : i === 'voice' ? L('voice', 'Stimme') : L('guitar', 'Gitarre'));

/** Where a page of the handbook comes up by itself: before which step the app shows it. */
const COMES_UP = (): Record<string, string> => ({
  ...VOICE_COMES_UP(),
  hold: L('before the tuner, the first time', 'vor dem Stimmgerät, beim ersten Mal'),
  tune: L('before the tuner', 'vor dem Stimmgerät'),
  count: L('before Stepping stones, the rhythm game', 'vor dem Rhythmusspiel Trittsteine'),
  chord: L('before the first chord check', 'vor dem ersten Akkord-Check'),
  diagram: L('before the first chord check', 'vor dem ersten Akkord-Check'),
  press: L('before the first chord check', 'vor dem ersten Akkord-Check'),
  strum: L('before the first chord changes and the first strummed song', 'vor den ersten Akkordwechseln und dem ersten angeschlagenen Song'),
  patterns: L('before Stepping stones, and in songs with a strumming pattern', 'vor dem Spiel Trittsteine und in Songs mit einem Schlagmuster'),
  mute: L('before the first game: two muted hits pause it', 'vor dem ersten Spiel: Zwei gedämpfte Anschläge halten es an'),
  pluck: L('before the first song with a picking pattern', 'vor dem ersten Song mit einem Zupfmuster'),
  tab: L('before the first song and the finger gym', 'vor dem ersten Song und dem Fingertraining'),
  slur: L('nowhere yet: the app cannot hear a slur, so there is no exercise for it', 'noch nirgends: Die App kann Hammer-on und Pull-off nicht hören, darum gibt es keine Übung dazu'),
  barre: L('before the first barre chord in the chord check', 'vor dem ersten Barréakkord im Akkord-Check'),
  'p-sit': L('before the first piece and the first game', 'vor dem ersten Stück und dem ersten Spiel'),
  'p-keys': L('before the first piece, and when the app is matched to the piano', 'vor dem ersten Stück, und wenn die App auf das Klavier eingestimmt wird'),
  'p-notes': L('before the first piece', 'vor dem ersten Stück'),
  'p-chord': L('before the first chord check on the piano', 'vor dem ersten Akkord-Check am Klavier'),
  'p-figure': L('before the first chord check, and the first piece of chords', 'vor dem ersten Akkord-Check und dem ersten Stück aus Akkorden'),
  'p-play': L('before the first chord check, the chord changes and Stepping stones', 'vor dem ersten Akkord-Check, den Akkordwechseln und dem Spiel Trittsteine'),
  'p-move': L('before the first chord changes on the piano', 'vor den ersten Akkordwechseln am Klavier'),
  'p-black': L('before the first piece with a black key', 'vor dem ersten Stück mit einer schwarzen Taste'),
  'p-thumb': L('before the first piece in which the thumb passes under', 'vor dem ersten Stück mit Daumenuntersatz'),
  'p-broken': L('before the first piece of broken chords', 'vor dem ersten Stück mit gebrochenen Akkorden'),
  'p-hands': L('nowhere by itself: it is about what the app leaves to you', 'nirgends von selbst: Es geht um das, was die App dir überlässt'),
});

/**
 * The handbook: the chapters with their pages on the left, the open page on the right. It opens on the
 * first page that has not been read. Or, with "try" after the name of a page: that page on its own, with
 * the app listening.
 */
export const basics: Screen = (root, [id, how]) => {
  const inst = store.settings.instrument;
  const known = (k: string | undefined): k is string => !!k && INTROS().some((i) => i.id === k);
  if (known(id) && how === 'try') return showIntros(root, [id], () => (location.hash = `/basics/${id}`), '', L('The handbook', 'Handbuch'), { at: 0 });
  // a page of another instrument's handbook can be opened by its address: it is shown among its own
  const shown: Instrument = known(id) && !ORDER[inst].includes(id) ? (INSTRUMENTS.find((i) => ORDER[i].includes(id)) ?? inst) : inst;
  const pages = ORDER[shown];
  const book = CHAPTERS()[shown];
  const others = INSTRUMENTS.filter((i) => i !== inst);
  const read = (k: string): boolean => !!store.progress['seen:' + k];
  const intro = (k: string): Intro => INTROS().find((i) => i.id === k)!;
  let open = known(id) ? id : (pages.find((k) => !read(k)) ?? pages[0]);

  root.innerHTML = `<div class="page book">
    <div class="bookhead">
      <div><p class="kick">${L('Basics', 'Grundlagen')} · ${instName(shown)}</p><h1>${L('The handbook', 'Das Handbuch')}</h1>
        <p class="lede">${L('How it is done, page by page. The app shows a page by itself before the step that needs it; here they all are.', 'Wie es geht, Seite für Seite. Die App zeigt jede Seite von selbst vor dem Schritt, der sie braucht; hier stehen sie alle.')}</p></div>
      <div class="readmeter" id="meter"></div>
    </div>
    <div class="bookgrid">
      <nav class="toc" id="toc" aria-label="${L('Contents', 'Inhalt')}"></nav>
      <article class="leaf" id="leaf" aria-live="polite"></article>
    </div>
    <p class="note">${L(`The ${instName(others[0])} and the ${instName(others[1])} have handbooks of their own: switch at the top right.`, `${others.map((o) => (o === 'voice' ? 'Die Stimme' : o === 'piano' ? 'Das Klavier' : 'Die Gitarre')).join(' und ')} haben eigene Handbücher: Wechsle oben rechts.`)}</p>
  </div>`;

  function draw(): void {
    const n = pages.indexOf(open);
    const p = intro(open);
    const chapter = book.findIndex((c) => c.ids.includes(open));
    const done = pages.filter(read).length;
    $('#meter', root).innerHTML = `<b>${done}<small>${L(` of ${pages.length} read`, ` von ${pages.length} gelesen`)}</small></b><span class="segs" role="img" aria-label="${L(`${done} of ${pages.length} pages read`, `${done} von ${pages.length} Seiten gelesen`)}">${book.map((c) => `<span>${c.ids.map((k) => `<i class="${read(k) ? 'on' : ''}${k === open ? ' cur' : ''}"></i>`).join('')}</span>`).join('')}</span>`;
    $('#toc', root).innerHTML = book
      .map(
        (c, ci) => `<section class="chap"><h2><span class="num">${ci + 1}</span><span>${esc(c.title)}<small>${esc(c.about)}</small></span><em>${c.ids.filter(read).length}/${c.ids.length}</em></h2>
        <ol>${c.ids
          .map((k) => {
            const i = intro(k);
            return `<li><a href="#/basics/${k}" data-page="${k}" class="${read(k) ? 'read' : 'new'}"${k === open ? ' aria-current="page"' : ''}><svg class="thumb" viewBox="0 0 520 380" aria-hidden="true">${i.art()}</svg><span><b>${esc(i.title)}</b><small>${read(k) ? L('read', 'gelesen') : L('new', 'neu')}${i.tryIt ? L(' · with something to try', ' · mit etwas zum Ausprobieren') : ''}</small></span><i class="tick" aria-hidden="true">${read(k) ? icon('check') : ''}</i></a></li>`;
          })
          .join('')}</ol></section>`,
      )
      .join('');
    const prev = pages[n - 1];
    const next = pages[n + 1];
    $('#leaf', root).innerHTML = `<div class="pic"><svg viewBox="0 0 520 380" role="img" aria-label="${L(`Picture: ${esc(p.title)}`, `Bild: ${esc(p.title)}`)}">${p.art()}</svg></div>
      <div class="txt">
        <p class="eyebrow">${L(`Chapter ${chapter + 1} · ${esc(book[chapter].title)} · page ${n + 1} of ${pages.length}`, `Kapitel ${chapter + 1} · ${esc(book[chapter].title)} · Seite ${n + 1} von ${pages.length}`)}</p>
        <h2 id="ttl">${esc(p.title)}</h2>
        <ul class="points">${p.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${p.tryIt ? `<p class="tip tryit"><b>${L('Try it', 'Probier es aus')}</b>${esc(p.tryIt.say)} <a class="btn" href="#/basics/${p.id}/try">${L('Try it now: the app listens', 'Jetzt ausprobieren: Die App hört zu')}${icon('right')}</a></p>` : ''}
        <p class="used"><b>${L('Comes up', 'Erscheint')}</b> ${esc(COMES_UP()[p.id] ?? L('when it is needed', 'bei Bedarf'))}.</p>
        <div class="turn">
          <button class="btn quiet" id="prev"${prev ? '' : ' disabled'}>${icon('left')}${L('Back', 'Zurück')} <kbd>←</kbd></button>
          ${next ? `<button class="btn primary" id="next"><span><small>${L('Next', 'Weiter')}</small>${esc(intro(next).title)}</span> <kbd>→</kbd></button>` : `<a class="btn primary" id="next" href="#/"><span><small>${L('That was the last page', 'Das war die letzte Seite')}</small>${L("To today's session", 'Zur heutigen Session')}</span>${icon('right')}</a>`}
        </div>
      </div>`;
    $$('[data-page]', root).forEach(
      (el) =>
        (el.onclick = (e) => {
          e.preventDefault();
          turn(el.dataset.page!);
        }),
    );
    const back = root.querySelector<HTMLButtonElement>('#prev');
    if (back) back.onclick = () => prev && turn(prev);
    const on = root.querySelector<HTMLElement>('button#next');
    if (on) on.onclick = forward;
    else
      $('#next', root).onclick = () => {
        store.progress['seen:' + open] = Date.now();
        store.save();
      };
  }

  /** Opens a page, without leaving the handbook: the address follows, the contents stay where they are. */
  function turn(k: string, mark = true): void {
    open = k;
    if (mark && !read(k)) {
      store.progress['seen:' + k] = Date.now();
      store.save();
    }
    history.replaceState(null, '', `#/basics/${k}`);
    draw();
    root.querySelector<HTMLElement>('#toc a[aria-current]')?.scrollIntoView({ block: 'nearest' });
  }

  /** On to the next page: the one that is open has been read. */
  function forward(): void {
    const n = pages.indexOf(open);
    if (!read(open)) {
      store.progress['seen:' + open] = Date.now();
      store.save();
    }
    if (pages[n + 1]) turn(pages[n + 1], false);
    else draw();
  }

  draw();
  // opened on a page by its address: the contents show where it is
  if (known(id)) root.querySelector<HTMLElement>('#toc a[aria-current]')?.scrollIntoView({ block: 'nearest' });
  return keys({
    ArrowRight: forward,
    ' ': forward,
    Enter: forward,
    ArrowLeft: () => {
      const n = pages.indexOf(open);
      if (n > 0) turn(pages[n - 1]);
    },
  });
};
