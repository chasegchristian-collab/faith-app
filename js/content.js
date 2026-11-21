/* Built-in content: scripture REFERENCES only (no verse text — NLT is copyrighted).
   Every reference is opened on Bible Gateway in the NLT. */
(function () {
  'use strict';

  // ~70 references, rotated deterministically by date so both phones show the same one.
  const VERSES = [
    'Philippians 4:6-7', 'Proverbs 3:5-6', 'Jeremiah 29:11', 'Isaiah 40:31', 'Romans 8:28',
    'Psalm 23:1-3', 'Joshua 1:9', 'Matthew 6:33', 'John 3:16', '1 Corinthians 13:4-7',
    'Ecclesiastes 4:9-12', 'Colossians 3:12-14', 'Ephesians 4:2-3', 'Ephesians 4:32', 'Romans 12:10-12',
    '1 Peter 4:8', 'Song of Songs 8:6-7', 'Ruth 1:16-17', 'Genesis 2:24', 'Proverbs 18:22',
    'Mark 10:6-9', '1 John 4:7-8', '1 John 4:18-19', '1 Thessalonians 5:16-18', 'James 1:5',
    'James 5:16', 'Psalm 46:1-3', 'Psalm 46:10', 'Psalm 37:4-5', 'Psalm 34:8',
    'Psalm 91:1-2', 'Psalm 118:24', 'Psalm 121:1-2', 'Psalm 139:13-14', 'Psalm 143:8',
    'Isaiah 41:10', 'Isaiah 26:3', 'Lamentations 3:22-23', 'Zephaniah 3:17', 'Micah 6:8',
    'Matthew 11:28-30', 'Matthew 18:19-20', 'Matthew 5:14-16', 'John 13:34-35', 'John 14:27',
    'John 15:5', 'John 15:12-13', 'Romans 5:8', 'Romans 12:2', 'Romans 15:13',
    '2 Corinthians 5:17', '2 Corinthians 12:9', 'Galatians 5:22-23', 'Galatians 6:2', 'Ephesians 3:20-21',
    'Ephesians 5:25', 'Philippians 1:6', 'Philippians 2:3-4', 'Philippians 4:13', 'Colossians 3:23',
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
    'What is a quality in your partner you thanked God for today?',
    'What is something hard that God is using for good?',
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

  // Shared reading plan: Gospel of John in 21 days, then 14 Psalms.
  const PLAN = [];
  for (let c = 1; c <= 21; c++) {
    PLAN.push({ id: 'john-' + c, section: 'Gospel of John', title: 'John ' + c, ref: 'John ' + c });
  }
  [1, 8, 19, 23, 27, 34, 46, 51, 63, 91, 100, 103, 121, 139].forEach(function (p) {
    PLAN.push({ id: 'psalm-' + p, section: 'Psalms', title: 'Psalm ' + p, ref: 'Psalm ' + p });
  });

  function bibleGatewayUrl(ref) {
    return 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(ref) + '&version=NLT';
  }

  window.Content = { VERSES: VERSES, GRATITUDE_PROMPTS: GRATITUDE_PROMPTS, PLAN: PLAN, bibleGatewayUrl: bibleGatewayUrl };
})();
