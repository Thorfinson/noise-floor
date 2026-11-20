/**
 * The words of whole songs: every verse and chorus of a song of chords, bar by bar, in the order they are sung.
 * How a sheet reads is said at withWords() in songwriting.ts: "[Part]" begins one time round of a part of the
 * chart, each bar's words end in "|", a word that goes on in the next bar ends in "-", and "[Chorus=Verse]" is a
 * chorus sung to the bars of the verse.
 *
 * Only words that belong to everybody in the USA and in the EU: traditional words, and words by authors dead for
 * more than seventy years, printed before 1930. Each was taken from the printed source named above it (scans on
 * archive.org, Wikisource, Project Gutenberg, hymnary.org, the National Library of Scotland), not from memory;
 * where a song has many versions, a common traditional one was taken, and where a verse of the common modern
 * version is known only from a print after 1930, it was left out. The minstrel dialect of Stephen Foster's songs is
 * written in plain spelling, and verses with slurs or demeaning lines are left out.
 *
 * Which syllable falls in which bar was worked out against the song's tune in tunes.ts (or its words in
 * lyrics.ts), which was itself compared with published notation, and against old scores with the words under the
 * notes where there are any (ABC files with words on abcnotation.com). A pickup goes with the bar it leads into,
 * so that each line of words begins with its own first word; a bar where a note is only held has no words.
 */
export const SONG_WORDS: Record<string, string> = {
  // The robbery story of the broadside "There's Whisky in the Jar" (Poet's Box, Glasgow, 16 December 1871, verses 2
  // to 5 of its 8: https://digital.nls.uk/broadsides/broadside.cfm/id/15111); the chorus lines "Mush a ring a do a
  // da" and "There's whisky in the jar" are the broadside's, "Whack fol the daddy O" is from "Captain Kelly" in the
  // Journal of American Folk-Lore 25 (1912), p. 152
  // (https://archive.org/stream/journalofamefolk25ameruoft/journalofamefolk25ameruoft_djvu.txt). The familiar
  // "Kerry mountains" text is first printed in 1939, so it is not used. Syllables placed after John Chambers' ABC
  // with words (abcnotation.com, Kilgary Mountain) over Colin Hume's tune.
  'whiskey-in-the-jar': `
[Verse]
As I was a walking | over | Wicklow | mountain, |
I met with Colonel | Powers, and his | money he was | counting, |
I pulled out my | sword, and | likewise my | rapier, |
Saying, stand and de- | liver, for I'm | a bold de- | ceiver. |
[Chorus]
Mush a ring a do a | da, | Whack fol the | daddy O, |
Whack fol the | daddy O, | There's whiskey in the | jar. |
[Verse]
It's when I got the | money it | was a pretty | penny, |
I put it in my | pocket, and I | took it home to | Molly; |
She said, my dearest | Pat, I | never will de- | ceive you, |
But the devil's in the | women, they | never can be | easy. |
[Chorus]
Mush a ring a do a | da, | Whack fol the | daddy O, |
Whack fol the | daddy O, | There's whiskey in the | jar. |
[Verse]
I went to Molly's | chamber, you'll | think it little | wonder, |
I laid my head up- | on her bed | for to get a | slumber; |
But as I lay | sleeping, I | knew not of the | matter, |
She unloaded my | two pistols, and | filled them full of | water. |
[Chorus]
Mush a ring a do a | da, | Whack fol the | daddy O, |
Whack fol the | daddy O, | There's whiskey in the | jar. |
[Verse]
And as I lay | sleeping, I | dreamed of my pretty | Molly, |
I saw Colonel | Powers, and | four stout able | fellows, |
I flew to my | pistols, but I | found I was mis- | taken, |
Out flashed the | water, and a | prisoner I was | taken. |
[Chorus]
Mush a ring a do a | da, | Whack fol the | daddy O, |
Whack fol the | daddy O, | There's whiskey in the | jar. |
`,

  // A. B. Paterson, Old Bush Songs, 4th edition, Sydney 1924, pp. 59-60, "A Wild Rover No More"
  // (https://archive.org/details/oldbushsongs0004abpa), all four verses, and its chorus. The familiar "And it's no,
  // nay, never" chorus is first printed in 1960, so Paterson's two lines are sung over the chorus's bars instead.
  'wild-rover': `
[Verse]
I've been a wild | rover this | many a | year, | |
And spent all my | money on | whisky and | beer; | |
But now I'm re- | turning with | gold in great | store, | |
And I never | shall play the wild | rover no | more. | |
[Chorus]
Nay, | no, | never! | |
| never no | more; | |
I nev- | er shall | play the | wild |
rover | no | more. | |
[Verse]
I dropt into a | shanty I | used to fre- | quent, | |
And told the | landlady my | money was | spent; | |
I asked her for | credit; she | answered me | Nay, | |
Such custom as | yours I can | get every | day. | |
[Chorus]
Nay, | no, | never! | |
| never no | more; | |
I nev- | er shall | play the | wild |
rover | no | more. | |
[Verse]
Putting hand in my | pocket, I | drew forth sovereigns | bright; | |
The landlady's | eyes sparkled | then with de- | light; | |
Said she, I've whisky and | brandy and | wines of the | best, | |
And those words I | just told you were | only in | jest. | |
[Chorus]
Nay, | no, | never! | |
| never no | more; | |
I nev- | er shall | play the | wild |
rover | no | more. | |
[Verse]
I'll go home to my | parents, tell | them what I've | done, | |
And ask them to | forgive their | prodigal | son; | |
And if they will | do it, as | they've oft done be- | fore, | |
I never | shall play the wild | rover no | more. | |
[Chorus]
Nay, | no, | never! | |
| never no | more; | |
I nev- | er shall | play the | wild |
rover | no | more. | |
`,

  // Robert Ford, Vagabond Songs and Ballads of Scotland, 1904, pp. 145-146 (https://archive.org/details/vagabondsongsan02fordgoog;
  // the same in the first series of 1899), score and words, its Scots spellings kept: the tune in tunes.ts is Ford's.
  'loch-lomond': `
[Verse]
By yon bonnie banks, and by | yon bonnie braes, |
Where the sun shines bright on Loch | Lomond, |
Where me and my true love were | ever wont to gae, |
On the bonnie, bonnie banks o' Loch | Lomond. |
[Chorus]
O, ye'll tak' the high road, and | I'll tak' the low road, |
And I'll be in Scotland a- | fore ye; |
But me and my true love will | never meet again |
On the bonnie, bonnie banks o' Loch | Lomond. |
[Verse]
'Twas there that we parted in | yon shady glen, |
On the steep, steep side o' Ben | Lomond, |
Where in purple hue the | Hieland hills we view, |
And the moon coming out in the | gloamin'. |
[Chorus]
O, ye'll tak' the high road, and | I'll tak' the low road, |
And I'll be in Scotland a- | fore ye; |
But me and my true love will | never meet again |
On the bonnie, bonnie banks o' Loch | Lomond. |
[Verse]
The wee birdies sing, and the | wild flowers spring, |
And in sunshine the waters are | sleepin'; |
But the broken heart it kens nae | second spring again, |
Tho' the waefu' may cease frae their | greetin'. |
[Chorus]
O, ye'll tak' the high road, and | I'll tak' the low road, |
And I'll be in Scotland a- | fore ye; |
But me and my true love will | never meet again |
On the bonnie, bonnie banks o' Loch | Lomond. |
`,

  // Verse 1 and the chorus as Cecil Sharp, English Folk-Chanteys (1914), No. VII has them
  // (https://archive.org/details/englishfolkchant00shar), "Way hay" as in Frank Shay, Iron Men and Wooden Ships
  // (1924); verses 2 to 6 from R. R. Terry, The Shanty Book, Part I (1921), No. 14
  // (https://archive.org/details/TheShantyBook). They agree with the words of the voice book (lyrics.ts).
  'drunken-sailor-chords': `
[Verse]
What shall we do with a | drunken sailor? |
What shall we do with a | drunken sailor? |
What shall we do with a | drunken sailor, |
early in the | morning? |
[Chorus]
Way hay and | up she rises |
Way hay and | up she rises |
Way hay and | up she rises |
early in the | morning |
[Verse]
Put him in the long-boat | until he's sober, |
Put him in the long-boat | until he's sober, |
Put him in the long-boat | until he's sober, |
early in the | morning. |
[Chorus]
Way hay and | up she rises |
Way hay and | up she rises |
Way hay and | up she rises |
early in the | morning |
[Verse]
Pull out the plug and | wet him all over, |
Pull out the plug and | wet him all over, |
Pull out the plug and | wet him all over, |
early in the | morning. |
[Chorus]
Way hay and | up she rises |
Way hay and | up she rises |
Way hay and | up she rises |
early in the | morning |
[Verse]
Put him in the scuppers with a | hose-pipe on him, |
Put him in the scuppers with a | hose-pipe on him, |
Put him in the scuppers with a | hose-pipe on him, |
early in the | morning. |
[Chorus]
Way hay and | up she rises |
Way hay and | up she rises |
Way hay and | up she rises |
early in the | morning |
[Verse]
Heave him by the leg in a | running bowlin', |
Heave him by the leg in a | running bowlin', |
Heave him by the leg in a | running bowlin', |
early in the | morning. |
[Chorus]
Way hay and | up she rises |
Way hay and | up she rises |
Way hay and | up she rises |
early in the | morning |
[Verse]
Tie him to the taffrail when she's | yard-arm under, |
Tie him to the taffrail when she's | yard-arm under, |
Tie him to the taffrail when she's | yard-arm under, |
early in the | morning. |
[Chorus]
Way hay and | up she rises |
Way hay and | up she rises |
Way hay and | up she rises |
early in the | morning |
`,

  // W. H. Hills, Students' Songs, 1887 edition, p. 29 (copyright 1881; https://archive.org/details/studentssongsco00hillgoog):
  // all four verses and the chorus; verse 1 as The Service Song Book (Association Press, 1917), No. 63 has it
  // (https://archive.org/details/sgbooka00youn). Placed over the score of Wikipedia's article, which the tune follows.
  'my-bonnie': `
[Verse]
My Bonnie lies | over the | ocean, | |
My Bonnie lies | over the | sea; | |
My Bonnie lies | over the | ocean, | |
Oh, bring back my | Bonnie to | me. | |
[Chorus]
Bring | back, | bring | back, |
Bring back my | Bonnie to | me, to | me. |
Bring | back, | bring | back, |
Oh, bring back my | Bonnie to | me. | |
[Verse]
Oh, blow, ye winds, | over the | ocean, | |
And blow, ye winds, | over the | sea; | |
Oh, blow, ye winds, | over the | ocean, | |
And bring back my | Bonnie to | me. | |
[Chorus]
Bring | back, | bring | back, |
Bring back my | Bonnie to | me, to | me. |
Bring | back, | bring | back, |
Oh, bring back my | Bonnie to | me. | |
[Verse]
Last night as I | lay on my | pillow, | |
Last night as I | lay on my | bed, | |
Last night as I | lay on my | pillow, | |
I dreamed that my | Bonnie was | dead. | |
[Chorus]
Bring | back, | bring | back, |
Bring back my | Bonnie to | me, to | me. |
Bring | back, | bring | back, |
Oh, bring back my | Bonnie to | me. | |
[Verse]
The winds have blown | over the | ocean, | |
The winds have blown | over the | sea, | |
The winds have blown | over the | ocean, | |
And brought back my | Bonnie to | me. | |
[Chorus]
Bring | back, | bring | back, |
Bring back my | Bonnie to | me, to | me. |
Bring | back, | bring | back, |
Oh, bring back my | Bonnie to | me. | |
`,

  // Percy Montrose's words (1884) as Waite's College Songs (1887) prints them
  // (https://en.wikisource.org/wiki/College_Songs/Oh_My_Darling_Clementine): verses 1 to 4 and 7. "Canon" is
  // spelled canyon; the later "How I missed her" verse is not in the old prints.
  clementine: `
[Verse]
In a cavern, in a | canyon, |
Excavating for a | mine, |
Dwelt a miner, forty- | niner, |
And his daughter, Clemen- | tine. |
[Chorus]
Oh my darling, oh my | darling, |
Oh my darling Clemen- | tine, |
You are lost and gone for- | ever, |
Dreadful sorry, Clemen- | tine. |
[Verse]
Light she was, and like a | fairy, |
And her shoes were number | nine, |
Herring boxes, without | topses, |
Sandals were for Clemen- | tine. |
[Chorus]
Oh my darling, oh my | darling, |
Oh my darling Clemen- | tine, |
You are lost and gone for- | ever, |
Dreadful sorry, Clemen- | tine. |
[Verse]
Drove she ducklings to the | water, |
Every morning just at | nine, |
Hit her foot against a | splinter, |
Fell into the foaming | brine. |
[Chorus]
Oh my darling, oh my | darling, |
Oh my darling Clemen- | tine, |
You are lost and gone for- | ever, |
Dreadful sorry, Clemen- | tine. |
[Verse]
Ruby lips above the | water, |
Blowing bubbles, soft and | fine, |
Alas, for me! I was no | swimmer, |
So I lost my Clemen- | tine. |
[Chorus]
Oh my darling, oh my | darling, |
Oh my darling Clemen- | tine, |
You are lost and gone for- | ever, |
Dreadful sorry, Clemen- | tine. |
[Verse]
In my dreams she still doth | haunt me, |
Robed in garments soaked in | brine; |
Though in life I used to | hug her, |
Now she's dead, I'll draw the | line. |
[Chorus]
Oh my darling, oh my | darling, |
Oh my darling Clemen- | tine, |
You are lost and gone for- | ever, |
Dreadful sorry, Clemen- | tine. |
`,

  // Carl Sandburg, The American Songbag (1927), pp. 130-131, traditional words he had from Gilbert R. Combs and the
  // R. W. Gordon collection (https://archive.org/details/americansongbag029895mbp/page/n157): stanzas 1, 3 and 7
  // and the chorus, which is sung to the same sixteen bars as the verses.
  'red-river-valley': `
[Verse]
From this valley they | say you are | going, | |
We will miss your bright | eyes and sweet | smile, | |
For they say you are | taking the | sunshine | |
That brightens our | pathway a- | while. | |
[Chorus=Verse]
Come and sit by my | side if you | love me, | |
Do not hasten to | bid me a- | dieu, | |
But remember the | Red River | Valley | |
And the girl that has | loved you so | true. | |
[Verse]
Won't you think of the | valley you're | leaving? | |
Oh how lonely, how | sad it will | be. | |
Oh think of the | fond heart you're | breaking, | |
And the grief you are | causing me to | see? | |
[Chorus=Verse]
Come and sit by my | side if you | love me, | |
Do not hasten to | bid me a- | dieu, | |
But remember the | Red River | Valley | |
And the girl that has | loved you so | true. | |
[Verse]
As you go to your | home by the | ocean, | |
May you never for- | get those sweet | hours, | |
That we spent in the | Red River | Valley, | |
And the love we ex- | changed 'mid the | flowers. | |
[Chorus=Verse]
Come and sit by my | side if you | love me, | |
Do not hasten to | bid me a- | dieu, | |
But remember the | Red River | Valley | |
And the girl that has | loved you so | true. | |
`,

  // John A. Lomax, Cowboy Songs and Other Frontier Ballads (1910), "A Home on the Range"
  // (https://www.gutenberg.org/ebooks/21300), stanzas 1, 2 and 4 with the chorus; its piano part has the chords of
  // the chart (A7 under "antelope").
  'home-on-the-range': `
[Verse]
Oh, give me a | home where the | buffalo | roam, |
Where the deer and the | antelope | play, | |
Where seldom is | heard a dis- | couraging | word |
And the skies are not | cloudy all | day. | |
[Chorus]
Home, | home on the | range, | |
Where the deer and the | antelope | play; | |
Where seldom is | heard a dis- | couraging | word |
And the skies are not | cloudy all | day. | |
[Verse]
Where the air is so | pure, the | zephyrs so | free, |
The breezes so | balmy and | light, | |
That I would not ex- | change my | home on the | range |
For all of the | cities so | bright. | |
[Chorus]
Home, | home on the | range, | |
Where the deer and the | antelope | play; | |
Where seldom is | heard a dis- | couraging | word |
And the skies are not | cloudy all | day. | |
[Verse]
How often at | night when the | heavens are | bright |
With the light from the | glittering | stars, | |
Have I stood here a- | mazed and | asked as I | gazed |
If their glory ex- | ceeds that of | ours. | |
[Chorus]
Home, | home on the | range, | |
Where the deer and the | antelope | play; | |
Where seldom is | heard a dis- | couraging | word |
And the skies are not | cloudy all | day. | |
`,

  // Carl Sandburg, The American Songbag (1927), p. 148, words and tune from Frances Ries of Batavia, Ohio
  // (https://archive.org/details/americansongbag029895mbp/page/n175): two of its four-line stanzas make one pass
  // of the chart; the last pairs "Roses love sunshine" with the first stanza again.
  'down-in-the-valley': `
[Verse]
Down in the | val- | ley, | The valley so | low, | |
Hang your head | o- | ver, | Hear the wind | blow. | |
Hear the wind | blow, | dear, | Hear the wind | blow, | |
Hang your head | o- | ver, | Hear the wind | blow. | |
[Verse]
If you don't | love | me, | Love whom you | please; | |
Throw your arms | 'round | me, | Give my heart | ease. | |
Throw your arms | 'round | me, | Before it's too | late; | |
Throw your arms | 'round | me, | Feel my heart | break. | |
[Verse]
Writing this | let- | ter, | Containing three | lines, | |
Answer my | ques- | tion: | Will you be | mine? | |
Will you be | mine, | dear, | Will you be | mine? | |
Answer my | ques- | tion: | Will you be | mine? | |
[Verse]
Go build me a | cas- | tle | Forty feet | high; | |
So I can | see | him, | As he goes | by. | |
As he goes | by, | dear; | As he goes | by; | |
So I can | see | him, | As he goes | by. | |
[Verse]
Roses love | sun- | shine, | Violets love | dew, | |
Angels in | heav- | en | Knows I love | you. | |
Down in the | val- | ley, | The valley so | low, | |
Hang your head | o- | ver, | Hear the wind | blow. | |
`,

  // John A. Stone, Put's Golden Songster (San Francisco, 1858), pp. 50-52, "Sweet Betsey from Pike"
  // (https://archive.org/details/putsgoldensongst00ston): verses 1, 2, 4, 6, 8 and 11, and its refrain "Tooral lal
  // looral lal looral lal la"; syllables placed after the score in Sandburg's American Songbag (1927), p. 108.
  'sweet-betsy': `
[Verse]
Oh, don't you re- | member sweet | Betsy from | Pike, |
Who crossed the big | mountains with | her lover | Ike, |
With two yoke of | cattle, a | large yellow | dog, |
A tall Shanghai | rooster and | one spotted | hog. |
[Chorus]
Tooral lal | looral lal | looral lal | la. |
[Verse]
One evening quite | early they | camped on the | Platte, |
'Twas near by the | road on a | green shady | flat, |
Where Betsy, sore- | footed, lay | down to re- | pose, |
With wonder Ike | gazed on that | Pike County | rose. |
[Chorus]
Tooral lal | looral lal | looral lal | la. |
[Verse]
The Shanghai ran | off, and their | cattle all | died; |
That morning the | last piece of | bacon was | fried; |
Poor Ike was dis- | couraged, and | Betsy got | mad, |
The dog drooped his | tail and looked | wondrously | sad. |
[Chorus]
Tooral lal | looral lal | looral lal | la. |
[Verse]
They soon reached the | desert, where | Betsy gave | out, |
And down in the | sand she lay | rolling a- | bout; |
While Ike, half dis- | tracted, looked | on with sur- | prise, |
Saying, Betsy, get | up, you'll get | sand in your | eyes. |
[Chorus]
Tooral lal | looral lal | looral lal | la. |
[Verse]
They suddenly | stopped on a | very high | hill, |
With wonder looked | down upon | old Placer- | ville; |
Ike sighed when he | said, and he | cast his eyes | down, |
Sweet Betsy, my | darling, we've | got to Hang- | town. |
[Chorus]
Tooral lal | looral lal | looral lal | la. |
[Verse]
This Pike County | couple got | married of | course, |
And Ike became | jealous, ob- | tained a di- | vorce; |
Sweet Betsy, well | satisfied, | said with a | shout, |
Goodbye, you big | lummox, I'm | glad you've backed | out! |
[Chorus]
Tooral lal | looral lal | looral lal | la. |
`,

  // John Newton, Olney Hymns (1779), Book I, Hymn 41, stanzas 1 to 4 (https://hymnary.org/text/amazing_grace_how_sweet_the_sound,
  // https://en.wikisource.org/wiki/Olney_Hymns_(1840)/Book_1/Hymn_41), and "When we've been there ten thousand
  // years" as E. O. Excell's Coronation Hymns (1910), No. 282 adds it (https://archive.org/details/coronationhymns0000eoex_f0r6).
  // Verse 1 has the words of the voice book (lyrics.ts).
  'amazing-grace-chords': `
[Verse]
Amazing | grace, how | sweet the | sound |
That saved a | wretch like | me! | |
I once was | lost, but | now am | found, |
Was blind, but | now I | see. | |
[Verse]
'Twas grace that | taught my | heart to | fear, |
And grace my | fears re- | lieved; | |
How precious | did that | grace ap- | pear, |
The hour I | first be- | lieved! | |
[Verse]
Through many | dangers, | toils and | snares, |
I have al- | ready | come; | |
'Tis grace has | brought me | safe thus | far, |
And grace will | lead me | home. | |
[Verse]
The Lord has | promised | good to | me, |
His word my | hope se- | cures; | |
He will my | shield and | portion | be, |
As long as | life en- | dures. | |
[Verse]
When we've been | there ten | thousand | years, |
Bright shining | as the | sun, | |
We've no less | days to | sing God's | praise |
Than when we | first be- | gun. | |
`,

  // Marshall W. Taylor, A Collection of Revival Hymns and Plantation Melodies (Cincinnati, 1882), No. 55, "I'm Just
  // a-Going Over Home" (https://archive.org/details/07697169.4831.emory.edu; https://hymnary.org/hymn/CRHP1883/55):
  // stanzas 1 and 2, each with its own chorus. The three notes that open each line after a rest are sung in the
  // bar they stand in.
  'wayfaring-stranger': `
[Verse]
I am a | poor | wayfaring | stranger, |
While journeying | through | this world of | woe; |
Yet there's no | sick- | ness, toil, or | danger, |
In that bright | world | to which I | go. |
[Chorus]
I'm going | there | to see my | father, |
I'm going | there | no more to | roam; |
I'm just a- | go- | ing over | Jordan, |
I'm just a- | go- | ing over | home. |
[Verse]
I know dark | clouds | will gather | round me, |
I know my | way | is rough and | steep; |
Yet brighter | fields | lie just be- | fore me, |
Where God's re- | deemed | their vigils | keep. |
[Chorus]
I'm going | there | to see my | mother, |
She said she'd | meet | me when I | come; |
I'm just a- | go- | ing over | Jordan, |
I'm just a- | go- | ing over | home. |
`,

  // The six stanzas of the first printing, Edward Boatner, Spirituals Triumphant, Old and New (1927), No. 68, as
  // C. Michael Hawn quotes them (https://www.umcdiscipleship.org/articles/history-of-hymns-hes-got-the-whole-world-in-his-hands),
  // the first sung again at the end; "hand", as that print and Frank Nordberg's ABC with words have it. The stanzas
  // sung today about the wind and the rain or the little bitty baby are known only from later prints.
  'whole-world': `
[Verse]
He's got the whole world | in His hand, |
He's got the whole world | in His hand, |
He's got the whole world | in His hand, |
He's got the whole world in His hand. | |
[Verse]
He's got all the power | in His hand, |
He's got all the power | in His hand, |
He's got all the power | in His hand, |
He's got the whole world in His hand. | |
[Verse]
He's got my mother | in His hand, |
He's got my mother | in His hand, |
He's got my mother | in His hand, |
He's got the whole world in His hand. | |
[Verse]
He's got my father | in His hand, |
He's got my father | in His hand, |
He's got my father | in His hand, |
He's got the whole world in His hand. | |
[Verse]
He's got the fishes of the sea | in His hand, |
He's got the fishes of the sea | in His hand, |
He's got the fishes of the sea | in His hand, |
He's got the whole world in His hand. | |
[Verse]
He's got the whole church | in His hand, |
He's got the whole church | in His hand, |
He's got the whole church | in His hand, |
He's got the whole world in His hand. | |
[Verse]
He's got the whole world | in His hand, |
He's got the whole world | in His hand, |
He's got the whole world | in His hand, |
He's got the whole world in His hand. | |
`,

  // Rodeheaver's Plantation Melodies (Chicago, 1918), p. 6, "Down By the River-Side"
  // (https://archive.org/details/rodeheavers-plantation-melodies-1918): stanzas 1 to 3, each with the chorus
  // "Ain't goin' to study war no more"; placed after Frank Nordberg's ABC with words, which the tune follows.
  'down-by-the-riverside': `
[Verse]
Goin' to lay down my | burden, |
Down by the | riverside, |
Down by the | riverside, |
Down by the | riverside, |
Goin' to lay down my | burden, |
Down by the | riverside, |
Goin' to study | war no | more. | |
[Chorus]
Ain't goin' to study war no | more, |
Ain't goin' to study war no | more, |
Ain't goin' to study | war no | more, | |
Ain't goin' to study war no | more, |
Ain't goin' to study war no | more, |
Ain't goin' to study | war no | more. | |
[Verse]
Goin' to lay down my | sword and shield, |
Down by the | riverside, |
Down by the | riverside, |
Down by the | riverside, |
Goin' to lay down my | sword and shield, |
Down by the | riverside, |
Goin' to study | war no | more. | |
[Chorus]
Ain't goin' to study war no | more, |
Ain't goin' to study war no | more, |
Ain't goin' to study | war no | more, | |
Ain't goin' to study war no | more, |
Ain't goin' to study war no | more, |
Ain't goin' to study | war no | more. | |
[Verse]
Goin' to try on my | long white robe, |
Down by the | riverside, |
Down by the | riverside, |
Down by the | riverside, |
Goin' to try on my | long white robe, |
Down by the | riverside, |
Goin' to study | war no | more. | |
[Chorus]
Ain't goin' to study war no | more, |
Ain't goin' to study war no | more, |
Ain't goin' to study | war no | more, | |
Ain't goin' to study war no | more, |
Ain't goin' to study war no | more, |
Ain't goin' to study | war no | more. | |
`,

  // Julia Ward Howe, The Atlantic Monthly, February 1862 (https://en.wikisource.org/wiki/The_Atlantic_Monthly/Battle_Hymn_of_the_Republic),
  // stanzas 1, 2 and 4; after each the chorus "Glory, glory, hallelujah" closing with that stanza's last line, as
  // the lyric sheet of 1863 has it (https://en.wikisource.org/wiki/Battle_Hymn_of_the_Republic_(1863_lyric_sheet)).
  'battle-hymn': `
[Verse]
Mine eyes have seen the | glory of the | coming of the | Lord: |
He is trampling out the | vintage where the | grapes of wrath are | stored; |
He hath loosed the fateful | lightning of His | terrible swift | sword: |
His truth is | marching | on. | |
[Chorus]
Glory, | glory, halle- | lu- | jah! |
Glory, | glory, halle- | lu- | jah! |
Glory, | glory, halle- | lu- | jah! |
His truth is | marching | on. | |
[Verse]
I have seen Him in the | watch-fires of a | hundred circling | camps, |
They have builded Him an | altar in the | evening dews and | damps; |
I can read His righteous | sentence by the | dim and flaring | lamps: |
His day is | marching | on. | |
[Chorus]
Glory, | glory, halle- | lu- | jah! |
Glory, | glory, halle- | lu- | jah! |
Glory, | glory, halle- | lu- | jah! |
His day is | marching | on. | |
[Verse]
He has sounded forth the | trumpet that shall | never call re- | treat; |
He is sifting out the | hearts of men be- | fore His judgment- | seat: |
Oh, be swift, my soul, to | answer Him! be | jubilant, my | feet! |
Our God is | marching | on. | |
[Chorus]
Glory, | glory, halle- | lu- | jah! |
Glory, | glory, halle- | lu- | jah! |
Glory, | glory, halle- | lu- | jah! |
Our God is | marching | on. | |
`,

  // Stephen Foster, 1848 (https://en.wikisource.org/wiki/Oh!_Susanna_(1848); Heart Songs, 1909, p. 172,
  // https://archive.org/details/heartsongsdeart00chapgoog): verses 1 and 3, each of four lines, so the eight bars of
  // the verse twice, and the chorus twice after each, as the print repeats it. Verse 2 has a slur and verse 4 a
  // demeaning line, so both are left out. Syllables placed as the 1848 print has them under the notes.
  'oh-susanna-chords': `
[Verse]
I come from Ala- | bama with my | banjo on my | knee; |
I'm going to Louisi- | ana, my | true love for to | see. |
[Verse]
It rained all night the | day I left, the | weather it was | dry; |
The sun so hot I | froze to death; Su- | sanna, don't you | cry. |
[Chorus]
Oh! Su- | sanna, oh | don't you cry for | me, |
for I come from Ala- | bama with my | banjo on my | knee. |
[Chorus]
Oh! Su- | sanna, oh | don't you cry for | me, |
for I come from Ala- | bama with my | banjo on my | knee. |
[Verse]
I had a dream the | other night, when | everything was | still; |
I thought I saw Su- | sanna a- | coming down the | hill. |
[Verse]
The buckwheat cake was | in her mouth, the | tear was in her | eye; |
Says I, I'm coming | from the South, Su- | sanna, don't you | cry. |
[Chorus]
Oh! Su- | sanna, oh | don't you cry for | me, |
for I come from Ala- | bama with my | banjo on my | knee. |
[Chorus]
Oh! Su- | sanna, oh | don't you cry for | me, |
for I come from Ala- | bama with my | banjo on my | knee. |
`,

  // Stephen Foster, "Gwine to Run All Night, or De Camptown Races" (1850; https://en.wikisource.org/wiki/Camptown_Races;
  // Heart Songs, 1909, p. 352, https://archive.org/details/heartsongsdeart00chapgoog): all four verses, each of four
  // lines (the eight bars of the verse twice), in plain spelling.
  'camptown-races': `
[Verse]
The Camptown ladies | sing this song, | doo-dah! | doo-dah! |
The Camptown racetrack's | five miles long, | oh! doo-dah | day! |
[Verse]
I come down there with my | hat caved in, | doo-dah! | doo-dah! |
I go back home with a | pocket full of tin, | oh! doo-dah | day! |
[Chorus]
Going to run all | night! | Going to run all | day! |
I'll bet my money on the | bob-tail nag, | somebody bet on the | bay. |
[Verse]
The long-tail filly and the | big black horse, | doo-dah! | doo-dah! |
They fly the track and they | both cut across, | oh! doo-dah | day! |
[Verse]
The blind horse sticking in a | big mud hole, | doo-dah! | doo-dah! |
Can't touch bottom with a | ten-foot pole, | oh! doo-dah | day! |
[Chorus]
Going to run all | night! | Going to run all | day! |
I'll bet my money on the | bob-tail nag, | somebody bet on the | bay. |
[Verse]
Old muley cow come | on to the track, | doo-dah! | doo-dah! |
The bob-tail fling her | over his back, | oh! doo-dah | day! |
[Verse]
Then fly along like a | railroad car, | doo-dah! | doo-dah! |
Running a race with a | shooting star, | oh! doo-dah | day! |
[Chorus]
Going to run all | night! | Going to run all | day! |
I'll bet my money on the | bob-tail nag, | somebody bet on the | bay. |
[Verse]
See them flying on a | ten-mile heat, | doo-dah! | doo-dah! |
Round the racetrack, | then repeat, | oh! doo-dah | day! |
[Verse]
I win my money on the | bob-tail nag, | doo-dah! | doo-dah! |
I keep my money in an | old tow-bag, | oh! doo-dah | day! |
[Chorus]
Going to run all | night! | Going to run all | day! |
I'll bet my money on the | bob-tail nag, | somebody bet on the | bay. |
`,

  // The verses from Leah Jackson Wolford, The Play-Party in Indiana (1916), pp. 89-90
  // (https://archive.org/details/cu31924014465227), and E. F. Piper, Journal of American Folk-Lore 28 (1915), "Skip
  // to my Lou" (https://archive.org/details/sim_journal-of-american-folklore_july-september-1915_28_109). The refrain
  // is the one of the voice book (lyrics.ts), the song's own name sung three times; the verses go to its bars.
  'skip-to-my-lou': `
[Chorus]
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Skip to my Lou, my | darling. |
[Verse=Chorus]
I lost my partner, | what'll I do? |
I lost my partner, | what'll I do? |
I lost my partner, | what'll I do? |
Skip to my Lou, my | darling. |
[Chorus]
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Skip to my Lou, my | darling. |
[Verse=Chorus]
I'll get another one | sweeter than you, |
I'll get another one | sweeter than you, |
I'll get another one | sweeter than you, |
Skip to my Lou, my | darling. |
[Chorus]
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Skip to my Lou, my | darling. |
[Verse=Chorus]
Little red wagon, | painted blue, |
Little red wagon, | painted blue, |
Little red wagon, | painted blue, |
Skip to my Lou, my | darling. |
[Chorus]
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Skip to my Lou, my | darling. |
[Verse=Chorus]
Flies in the cream jar, | shoo, shoo, shoo, |
Flies in the cream jar, | shoo, shoo, shoo, |
Flies in the cream jar, | shoo, shoo, shoo, |
Skip to my Lou, my | darling. |
[Chorus]
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Lou, Lou, | skip to my Lou, |
Skip to my Lou, my | darling. |
`,

  // James Lord Pierpont, 1857, in the wording of Heart Songs (1909), pp. 148-149
  // (https://archive.org/details/heartsongsdeart00chapgoog), which prints his verses 1, 2 and 4 under the notes;
  // the chorus as the voice book (lyrics.ts) sings it.
  'jingle-bells-chords': `
[Verse]
Dashing through the | snow, | in a one-horse open | sleigh; |
O'er the fields we | go, | laughing all the | way; |
Bells on bob-tail | ring, | making spirits | bright; |
What fun it is to | ride and sing | a sleighing song to- | night! |
[Chorus]
Jingle bells, | jingle bells, | jingle all the | way! |
Oh what fun it | is to ride | in a one-horse open | sleigh, hey! |
Jingle bells, | jingle bells, | jingle all the | way! |
Oh what fun it | is to ride | in a one-horse open | sleigh! |
[Verse]
A day or two a- | go, | I thought I'd take a | ride, |
And soon Miss Fannie | Bright | was seated by my | side; |
The horse was lean and | lank, | misfortune seemed his | lot; |
He got into a | drifted bank, | and we, we got up- | sot. |
[Chorus]
Jingle bells, | jingle bells, | jingle all the | way! |
Oh what fun it | is to ride | in a one-horse open | sleigh, hey! |
Jingle bells, | jingle bells, | jingle all the | way! |
Oh what fun it | is to ride | in a one-horse open | sleigh! |
[Verse]
Now the ground is | white, | go it while you're | young; |
Take the girls to- | night, | and sing this sleighing | song. |
Just get a bob-tailed | bay, | two-forty for his | speed; |
Then hitch him to an | open sleigh, | and crack! you'll take the | lead. |
[Chorus]
Jingle bells, | jingle bells, | jingle all the | way! |
Oh what fun it | is to ride | in a one-horse open | sleigh, hey! |
Jingle bells, | jingle bells, | jingle all the | way! |
Oh what fun it | is to ride | in a one-horse open | sleigh! |
`,
};
