/**
 * Words to sing, for the songs of the voice book whose words are as free of copyright as their tunes:
 * traditional words, and words by poets dead for more than seventy years (Jane Taylor 1806, Sarah Josepha Hale
 * 1830, Friedrich Schiller 1785, Robert Burns 1788, John Newton 1779, John Mason Neale 1853, Thomas Oliphant
 * 1862, James Lord Pierpont 1857, Franz Wiedemann 1860, Hoffmann von Fallersleben 1835, Ernst Anschütz 1824,
 * W. W. Fosdick 1861, Stephen Foster 1848, Patty and Mildred Hill 1893, William Arms Fisher 1922, who died in
 * 1948), and the lullaby of Des Knaben Wunderhorn (1808) that Brahms set. Each song is in the language it is
 * sung in; the Habanera's first lines (Henri Meilhac and Ludovic Halévy, 1875) are placed as the score of the
 * Wikipedia article on the aria places them; Korobeiniki has Nikolay Nekrasov's verse (1861) as Wikipedia's
 * article gives it, in Latin letters. No source with its words under the notes of this tune was found (the
 * Wikipedia scores and the ABC collections give the notes alone): its syllables are placed here by the tune
 * itself, the rhymes (korobushka, zaznobushka; parcha, plecha) on the same turns of it, the last syllable of
 * a line held where the line has a note more. The themes of instrumental music, which have no words, are sung in solfège: the names of their
 * notes in movable do (sungWords).
 *
 * Two syllables sung as one, as Spanish and French run a vowel into the next, are joined by "‿".
 *
 * One string per phrase of the voice book, one syllable per note, separated by spaces. A syllable that goes on
 * in the next one ends in "-"; "_" is a note the syllable before is held over (as "zing" over two notes in
 * "A-ma-zing grace"). The tests check that every phrase has exactly as many syllables as notes.
 */
import { L } from '../core/i18n';

export const LYRICS: Record<string, string[]> = {
  'twinkle~voice': ['Twin- kle twin- kle lit- tle star', 'How I won- der what you are', 'Up a- bove the world so high', 'Like a dia- mond in the sky', 'Twin- kle twin- kle lit- tle star', 'How I won- der what you are'],
  'mary-lamb~voice': ['Ma- ry had a lit- tle lamb', 'lit- tle lamb, lit- tle lamb', 'Ma- ry had a lit- tle lamb, its', 'fleece was white as snow'],
  'hot-cross-buns~voice': ['Hot cross buns, hot cross buns', 'One a pen- ny, two a pen- ny, hot cross buns'],
  'row-your-boat~voice': ['Row, row, row your boat', 'gent- ly down the stream', 'Mer- ri- ly, mer- ri- ly, mer- ri- ly, mer- ri- ly', 'life is but a dream'],
  'london-bridge~voice': ['Lon- don Bridge is fall- ing down', 'fall- ing down, fall- ing down', 'Lon- don Bridge is fall- ing down', 'my fair la- dy'],
  'frere-jacques~voice': ['Frè- re Jac- ques, frè- re Jac- ques', 'dor- mez- vous? Dor- mez- vous?', 'Son- nez les ma- ti- nes, son- nez les ma- ti- nes', 'ding, dang, dong, ding, dang, dong'],
  'alle-meine-entchen~voice': ['Al- le mei- ne Ent- chen', 'schwim- men auf dem See', 'schwim- men auf dem See', 'Köpf- chen in das Was- ser', 'Schwänz- chen in die Höh'],
  'haenschen-klein~voice': ['Häns- chen klein ging al- lein', 'in die wei- te Welt hin- ein', 'Stock und Hut steht ihm gut', 'ist gar wohl- ge- mut', 'A- ber Mut- ter wei- net sehr', 'hat ja nun kein Häns- chen mehr', 'Da be- sinnt sich das Kind', 'eilt nach Haus ge- schwind'],
  'kuckuck~voice': ['Ku- ckuck, Ku- ckuck', "ruft's aus dem Wald", 'Las- set uns sin- gen', 'tan- zen und sprin- gen', 'Früh- ling, Früh- ling', 'wird es nun bald'],
  'au-clair~voice': ['Au clair de la lu- ne', 'mon a- mi Pier- rot', 'Prê- te- moi ta plu- me', 'pour é- crire un mot', 'Ma chan- delle est mor- te', "je n'ai plus de feu", 'Ou- vre- moi ta por- te', "pour l'a- mour de Dieu"],
  'amazing-grace-piano~voice': ['A- ma- zing _ grace, how sweet the sound', 'that saved a _ wretch like me'],
  'auld-lang-syne~voice': ['Should auld ac- quain- tance be for- got, and', 'ne- ver brought to mind? Should', 'auld ac- quain- tance be for- got, and', "days o' auld lang syne"],
  'jingle-bells~voice': ['Jin- gle bells, jin- gle bells', 'jin- gle all the way', 'Oh what fun it is to ride in a', 'one- horse o- pen sleigh, hey!', 'Jin- gle bells, jin- gle bells', 'jin- gle all the way', 'Oh what fun it is to ride in a', 'one- horse o- pen sleigh'],
  'skip-to-my-lou~voice': ['Lou, Lou, skip to my Lou', 'Lou, Lou, skip to my Lou', 'Lou, Lou, skip to my Lou', 'Skip to my Lou, my dar- ling'],
  'fuchs~voice': ['Fuchs, du hast die Gans ge- stoh- len', 'gib sie wie- der her', 'gib sie wie- der her', 'Sonst wird dich der Jä- ger ho- len', 'mit dem Schieß- ge- wehr _ _', 'sonst wird dich der Jä- ger ho- len', 'mit dem Schieß- ge- wehr'],
  'old-macdonald~voice': ['Old Mac- Don- ald had a farm', 'E- I- E- I- O, and', 'on his farm he had a cow', 'E- I- E- I- O', 'With a moo moo here and a moo moo there', 'Here a moo, there a moo, ev- ery- where a moo moo', 'Old Mac- Don- ald had a farm', 'E- I- E- I- O'],
  'aura-lee~voice': ['As the black- bird in the spring', "'neath the wil- low tree, sat and piped, I", 'heard him sing, sing- ing Au- ra', 'Lee. Au- ra Lee, Au- ra Lee', 'maid of gol- den hair, sun- shine came a-', 'long with thee, and swal- lows in the air'],
  'alouette~voice': ['A- lou- et- te, gen- ti- l‿a- lou- et- te', 'A- lou- et- te, je te plu- me- rai'],
  'happy-birthday~voice': ['Hap- py birth- day to you, hap- py', 'birth- day to you, hap- py', 'birth- day, dear friend _ hap- py', 'birth- day to you'],
  'oh-susanna~voice': ['I come from A- la- ba-', 'ma with my ban- jo on my knee', "_ I'm go- ing to Lou- si-", 'a- na, my true love for to see', '_ Oh! Su- san- na, oh', "don't you cry for me, for I", 'come from A- la- ba- ma with my', 'ban- jo on my knee'],
  'la-cucaracha~voice': ['La cu- ca- ra- cha, la cu- ca-', 'ra- cha, ya no pue- de ca- mi-', 'nar, por- que no tie- ne, por- que le', 'fal- ta las dos pa- ti- tas de‿a- trás'],
  'drunken-sailor~voice': ['What shall we do with a', 'drun- ken sai- lor? What shall we do with a', 'drun- ken sai- lor? What shall we do with a', 'drun- ken sai- lor, ear- ly in the', 'mor- ning? Way hay and up she ri- ses', 'Way hay and up she ri- ses', 'Way hay and up she ri- ses', 'ear- ly in the mor- ning'],
  'goin-home~voice': ["Go- in' home, go- in' home", "I'm a- go- in' home; qui- et- like", "some still day, I'm jes' go- in' home"],
  'when-the-saints~voice': ['Oh when the saints go march- ing', 'in, oh when the saints go', 'march- ing in, Oh Lord, I', 'want to be in that num- ber, when the', 'saints go march- ing in'],
  'go-tell-aunt-rhody~voice': ['Go tell Aunt Rho- dy', 'go tell Aunt Rho- _ dy', 'go tell Aunt Rho- dy, the', 'old grey goose is dead'],
  'brahms-lullaby~voice': ["Gu- ten A- bend, gut' Nacht, mit Ro-", 'sen be- dacht, mit Näg- lein be-', 'steckt, schlupf un- ter die Deck. Mor-', 'gen früh, wenn Gott will'],
  'korobeiniki~voice': ['Oy, pol- nym pol- na mo-', 'ya ko- ro- bush- ka _', "Yest' i si- tets i par- cha", 'Po- zha- ley, du- sha- za- zno- bush- ka _', 'Mo- lo- dets- ko- go ple- cha _'],
  'habanera~voice': ["L'a- mour est un oi- seau re- bel- le", 'que nul ne peut _ _ ap- _ pri- voi- ser'],
  'yankee-doodle~voice': ['Yan- kee Doo- dle went to town a-', 'ri- ding on a po- ny', 'Stuck a fea- ther in his cap and', 'called it ma- ca- ro- ni'],
  'ode-to-joy~voice': ['Freu- de, schö- ner Göt- ter- fun- ken', 'Toch- ter aus E- ly- si- um', 'Wir be- tre- ten feu- er- trun- ken', 'Himm- li- sche, dein Hei- lig- tum'],
  'sur-le-pont~voice': ["Sur le pont d'A- vi- gnon", "l'on y dan- se, l'on y dan- se", "Sur le pont d'A- vi- gnon", "l'on y dan- se tous en rond"],
  'good-king-wenceslas~voice': ['Good King Wen- ces- las looked out', 'on the feast of Ste- phen', 'When the snow lay round a- bout', 'deep and crisp and e- ven', 'Bright- ly shone the moon that night', 'though the frost was cru- el', 'When a poor man came in sight', 'gath- er- ing win- ter fu- el'],
  'deck-the-halls~voice': ['Deck the halls with boughs of hol- ly', 'Fa la la la la, la la la la', "'Tis the sea- son to be jol- ly", 'Fa la la la la, la la la la', 'Don we now our gay ap- pa- rel', 'Fa la la, la la la, la la la', 'Troll the an- cient Yule- tide car- ol', 'Fa la la la la, la la la la'],
  'lieber-augustin~voice': ['O du lie- ber Au- gus- tin', 'Au- gus- tin, Au- gus- tin', 'O du lie- ber Au- gus- tin', 'al- les ist hin', "Geld ist weg, Mädl ist weg", 'al- les weg, al- les weg', 'O du lie- ber Au- gus- tin', 'al- les ist hin'],
};

/** The syllables of a phrase, one per note; empty when the song has no words here. */
export function syllables(songId: string, phrase: number): string[] {
  const line = LYRICS[songId]?.[phrase];
  return line ? line.split(/\s+/).filter(Boolean) : [];
}

/** The syllables of movable do, by semitones above do: raised notes are di, ri, fi, si, the lowered seventh te. */
const SOLFA = (): string[] => ['do', 'di', 're', 'ri', 'mi', 'fa', 'fi', L('sol', 'so'), 'si', 'la', 'te', 'ti'];

/**
 * Where do lies for a tune: the major scale that leaves out the fewest of its notes. A tune in minor gets the
 * do of its relative major, so that its tonic is la, as Kodály teaches it.
 */
export function doOf(midis: number[]): number {
  const major = [0, 2, 4, 5, 7, 9, 11];
  const out = (r: number): number => midis.filter((m) => !major.includes((((m - r) % 12) + 12) % 12)).length;
  const fewest = Math.min(...Array.from({ length: 12 }, (_, r) => out(r)));
  const fit = Array.from({ length: 12 }, (_, r) => r).filter((r) => out(r) === fewest);
  // where several scales hold the tune alike, the one its last note ends it in: on do, or on la in minor
  const last = (((midis[midis.length - 1] ?? 0) % 12) + 12) % 12;
  return fit.find((r) => r === last) ?? fit.find((r) => (r + 9) % 12 === last) ?? fit[0];
}

/**
 * What to sing under each note of a phrase: the words, where the song has words free to sing; otherwise the
 * names of its notes in solfège (do re mi), which the voice gym already sings and which trains reading a tune.
 */
export function sungWords(songId: string, phrase: number, phrases: { midi: number }[][]): { words: string[]; solfa: boolean } {
  const words = syllables(songId, phrase);
  if (words.length) return { words, solfa: false };
  const d = doOf(phrases.flat().map((n) => n.midi));
  return { words: (phrases[phrase] ?? []).map((n) => SOLFA()[(((n.midi - d) % 12) + 12) % 12]), solfa: true };
}

/** How a syllable is shown under its note: a held note shows nothing. */
export const shown = (s: string): string => (s === '_' ? '' : s);

/**
 * The songs of chords whose words are free: the melody with words that lies over them, from which bar of the
 * chords it begins, whether the chords go through it twice, and its upbeat where the melody does not say.
 */
export const SING_ALONG: Record<string, { voice: string; at?: number; repeat?: boolean; lead?: number }> = {
  'oh-susanna-chords': { voice: 'oh-susanna~voice' },
  'skip-to-my-lou': { voice: 'skip-to-my-lou~voice', repeat: true },
  'auld-lang-syne-chords': { voice: 'auld-lang-syne~voice', repeat: true },
  'jingle-bells-chords': { voice: 'jingle-bells~voice', at: 16 },
  'la-cucaracha-chords': { voice: 'la-cucaracha~voice', repeat: true },
  'drunken-sailor-chords': { voice: 'drunken-sailor~voice' },
  'amazing-grace-chords': { voice: 'amazing-grace-piano~voice', lead: 1 },
};

/**
 * Where a sung line has one syllable more than the played melody has notes, the sung version repeats a held
 * note for it, as song sheets do: "that num-ber" on one long F becomes two F's. Per song: the phrase, the note
 * and how its length is shared.
 */
export const SUNG_SPLITS: Record<string, { phrase: number; note: number; into: number[] }[]> = {
  'when-the-saints~voice': [{ phrase: 3, note: 5, into: [4, 1] }],
  'go-tell-aunt-rhody~voice': [{ phrase: 2, note: 4, into: [1, 1] }],
};
