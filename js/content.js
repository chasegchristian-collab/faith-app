/* Built-in content: scripture REFERENCES only (no verse text — NLT is copyrighted).
   Every reference is opened on Bible Gateway in the NLT. */
(function () {
  'use strict';

  // ~70 references, rotated deterministically by date so both phones show the same one.
  const VERSES = [
    'Philippians 4:6-7', 'Proverbs 3:5-6', 'Jeremiah 29:4-14', 'Isaiah 40:31', 'Romans 8:28',
    'Psalm 23:1-3', 'Joshua 1:9', 'Matthew 6:33', 'John 3:16', '1 Corinthians 13:4-7',
    'Ecclesiastes 4:9-12', 'Colossians 3:12-14', 'Ephesians 4:2-3', 'Ephesians 4:32', 'Romans 12:10-12',
    '1 Peter 4:8', 'Song of Songs 8:6-7', 'Ruth 1:15-18', 'Proverbs 3:3-4', '1 Corinthians 16:14',
    'Philippians 1:9-10', '1 John 4:7-8', '1 John 4:18-19', '1 Thessalonians 5:16-18', 'James 1:5',
    'James 5:16', 'Psalm 46:1-3', 'Psalm 46:10', 'Psalm 37:3-7', 'Psalm 34:8',
    'Psalm 91:1-2', 'Psalm 118:24', 'Psalm 121:1-2', 'Psalm 139:13-14', 'Psalm 143:8',
    'Isaiah 41:10', 'Isaiah 26:3', 'Lamentations 3:22-23', 'Zephaniah 3:17', 'Micah 6:8',
    'Matthew 11:28-30', '1 Peter 3:8-9', 'Matthew 5:14-16', 'John 13:34-35', 'John 14:27',
    'John 15:5', 'John 15:12-13', 'Romans 5:8', 'Romans 12:2', 'Romans 15:13',
    '2 Corinthians 5:17', '2 Corinthians 12:9', 'Galatians 5:22-23', 'Galatians 6:2', 'Ephesians 3:20-21',
    'Ephesians 5:21-33', 'Philippians 1:6', 'Philippians 2:3-4', 'Philippians 4:11-13', 'Colossians 3:23',
    '2 Timothy 1:7', 'Hebrews 10:24-25', 'Hebrews 11:1', '1 Peter 5:7', 'Numbers 6:24-26',
    'Deuteronomy 31:8', 'Proverbs 16:3', 'Proverbs 17:17', 'Psalm 133:1', 'Nehemiah 8:10'
  ];

  const GRATITUDE_PROMPTS = [
    'What is one way you saw God at work today?',
    'What is something your partner did today that you are thankful for?',
    'Which answered prayer (big or small) are you grateful for this week?',
    'What made you smile today?',
    'Who is someone God placed in your life that you are thankful for?',
    'What is a simple, everyday gift you enjoyed today?',
    'What is something about your future together that you are thankful for?',
    'Where did you experience peace today?',
    'What quality in your partner are you thankful to God for?',
    "Is there something hard where you've seen even a glimpse of God's care?",
    'What verse or truth encouraged you today?',
    'What is a memory together you are grateful for?',
    'How did someone show you kindness today?',
    'What is one thing about today you would not want to forget?',
    'What provision (time, money, health, help) are you thankful for?',
    'What is something in creation you noticed and enjoyed today?',
    'What is a prayer you are thankful God is still working on?',
    'What made you feel loved today?',
    'What is something you learned today?',
    'How did you see your partner grow recently?',
    'What is a blessing you might normally overlook?',
    'Who in your family or church are you grateful for tonight?',
    'What is something you are looking forward to, and why are you thankful for it?',
    'What is a way God has been faithful to you this year?',
    'What part of your home or daily routine are you thankful for?',
    'What conversation today are you grateful for?',
    'What strength did God give you today?',
    'What is one reason you are thankful for your relationship today?',
    'What rest or refreshment did you get today?',
    'What is one thing you want to thank your partner for out loud tonight?'
  ];

  // Shared reading plan: Gospel of John in 21 days, then 16 Psalms (incl. 13, a lament, and 133, on unity at home).
  const PLAN = [];
  for (let c = 1; c <= 21; c++) {
    PLAN.push({ id: 'john-' + c, section: 'Gospel of John', title: 'John ' + c, ref: 'John ' + c });
  }
  [1, 8, 13, 19, 23, 27, 34, 46, 51, 63, 91, 100, 103, 121, 133, 139].forEach(function (p) {
    PLAN.push({ id: 'psalm-' + p, section: 'Psalms', title: 'Psalm ' + p, ref: 'Psalm ' + p });
  });

  function bibleGatewayUrl(ref) {
    return 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(ref) + '&version=NLT';
  }

  /* ---------- Compare with the original language (links only, no text stored) ---------- */
  // Book name (as written in our refs) -> [OSIS code used by STEP Bible, testament].
  const BOOKS = {};
  [['Genesis', 'Gen'], ['Exodus', 'Exod'], ['Leviticus', 'Lev'], ['Numbers', 'Num'], ['Deuteronomy', 'Deut'],
   ['Joshua', 'Josh'], ['Judges', 'Judg'], ['Ruth', 'Ruth'], ['1 Samuel', '1Sam'], ['2 Samuel', '2Sam'],
   ['1 Kings', '1Kgs'], ['2 Kings', '2Kgs'], ['1 Chronicles', '1Chr'], ['2 Chronicles', '2Chr'], ['Ezra', 'Ezra'],
   ['Nehemiah', 'Neh'], ['Esther', 'Esth'], ['Job', 'Job'], ['Psalm', 'Psa'], ['Psalms', 'Psa'], ['Proverbs', 'Prov'],
   ['Ecclesiastes', 'Eccl'], ['Song of Songs', 'Song'], ['Song of Solomon', 'Song'], ['Isaiah', 'Isa'], ['Jeremiah', 'Jer'],
   ['Lamentations', 'Lam'], ['Ezekiel', 'Ezek'], ['Daniel', 'Dan'], ['Hosea', 'Hos'], ['Joel', 'Joel'], ['Amos', 'Amos'],
   ['Obadiah', 'Obad'], ['Jonah', 'Jonah'], ['Micah', 'Mic'], ['Nahum', 'Nah'], ['Habakkuk', 'Hab'], ['Zephaniah', 'Zeph'],
   ['Haggai', 'Hag'], ['Zechariah', 'Zech'], ['Malachi', 'Mal']
  ].forEach(function (b) { BOOKS[b[0]] = [b[1], 'OT']; });
  [['Matthew', 'Matt'], ['Mark', 'Mark'], ['Luke', 'Luke'], ['John', 'John'], ['Acts', 'Acts'], ['Romans', 'Rom'],
   ['1 Corinthians', '1Cor'], ['2 Corinthians', '2Cor'], ['Galatians', 'Gal'], ['Ephesians', 'Eph'], ['Philippians', 'Phil'],
   ['Colossians', 'Col'], ['1 Thessalonians', '1Thess'], ['2 Thessalonians', '2Thess'], ['1 Timothy', '1Tim'],
   ['2 Timothy', '2Tim'], ['Titus', 'Titus'], ['Philemon', 'Phlm'], ['Hebrews', 'Heb'], ['James', 'Jas'], ['1 Peter', '1Pet'],
   ['2 Peter', '2Pet'], ['1 John', '1John'], ['2 John', '2John'], ['3 John', '3John'], ['Jude', 'Jude'], ['Revelation', 'Rev']
  ].forEach(function (b) { BOOKS[b[0]] = [b[1], 'NT']; });

  // English (NLT) ref -> Hebrew (WLC) ref, where the Hebrew numbers verses differently
  // (psalm titles counted as verse 1; different chapter breaks in Joel and Malachi). Verified by the Fact-Checker.
  // General rule for anything not listed: same numbering. Whole psalm chapters always match (only the verse numbers
  // inside shift), so the reading-plan psalms (8, 19, 34, 46, 51, 63 have separate title verses) need no entry.
  // Audit of every OT ref in VERSES: only Psalm 34:8, 46:1-3 and 46:10 differ. Psalms 23, 37, 121, 133, 139 and 143
  // also have titles, but in Hebrew those short titles sit inside verse 1, so numbering matches (Fact-Checker: "every
  // other OT ref lines up"). TODO: if you add a new psalm verse, check its Hebrew numbering before relying on the rule.
  // TODO: whole chapters Joel 2 (WLC 2:1-27 + 3:1-5), Joel 3 and Malachi 4 also shift; add them here if ever used.
  const WLC_OVERRIDES = {
    'Psalm 34:8': 'Psalm 34:9',
    'Psalm 46:1-3': 'Psalm 46:2-4',
    'Psalm 46:10': 'Psalm 46:11',
    'Joel 2:28': 'Joel 3:1',
    'Joel 2:28-32': 'Joel 3:1-5',
    'Malachi 4:2': 'Malachi 3:20',
    'Malachi 4:1-6': 'Malachi 3:19-24'
  };

  // "Song of Songs 8:6-7" -> { book, osis, testament, ch, v1, v2 }; null if it can't be parsed.
  function parseRef(ref) {
    const m = /^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(String(ref).trim());
    if (!m || !BOOKS[m[1]]) return null;
    return { book: m[1], osis: BOOKS[m[1]][0], testament: BOOKS[m[1]][1], ch: m[2], v1: m[3] || null, v2: m[4] || null };
  }
  function testament(ref) { const p = parseRef(ref); return p ? p.testament : null; }
  function originalLanguage(ref) { const t = testament(ref); return t === 'OT' ? 'Hebrew' : t === 'NT' ? 'Greek' : null; }
  function wlcRef(ref) { return WLC_OVERRIDES[ref] || ref; }
  function osisRef(ref) {
    const p = parseRef(ref);
    if (!p) return null;
    return p.osis + '.' + p.ch + (p.v1 ? '.' + p.v1 + (p.v2 ? '-' + p.v2 : '') : '');
  }
  function bgParallelUrl(ref, versions) {
    return 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(ref) + '&version=' + versions;
  }
  // Links for the "Hebrew"/"Greek" chip. Returns null for refs we can't parse.
  // side: one Bible Gateway parallel link (NLT + WLC/SBLGNT) when numbering matches. When the Hebrew numbering differs,
  //   one search can't line both up, so `side` is null and `split` gives two links: NLT at the English ref and
  //   WLC at the Hebrew ref.
  // step: STEP Bible interlinear (English side is the BSB). Uses the English ref; STEP maps Hebrew numbering itself.
  function compareLinks(ref) {
    const p = parseRef(ref);
    if (!p) return null;
    const ot = p.testament === 'OT';
    const heb = ot ? wlcRef(ref) : ref;
    const differs = heb !== ref;
    return {
      ref: ref,
      testament: p.testament,
      language: ot ? 'Hebrew' : 'Greek',
      hebrewRef: ot ? heb : null,
      side: differs ? null : bgParallelUrl(ref, ot ? 'NLT;WLC' : 'NLT;SBLGNT'),
      split: differs ? { nlt: bgParallelUrl(ref, 'NLT'), wlc: bgParallelUrl(heb, 'WLC') } : null,
      step: 'https://www.stepbible.org/?q=version=BSB|version=' + (ot ? 'OSHB' : 'SBLG') + '|reference=' + osisRef(ref) +
        '&options=HVLUN&display=INTERLINEAR'
    };
  }

  window.Content = {
    VERSES: VERSES, GRATITUDE_PROMPTS: GRATITUDE_PROMPTS, PLAN: PLAN, bibleGatewayUrl: bibleGatewayUrl,
    BOOKS: BOOKS, WLC_OVERRIDES: WLC_OVERRIDES, parseRef: parseRef, testament: testament, originalLanguage: originalLanguage,
    wlcRef: wlcRef, osisRef: osisRef, compareLinks: compareLinks
  };
})();
