/**
 * Readable generated passwords like "tiger-4821". Built with
 * crypto.getRandomValues; they exist only in memory and in the result file
 * the admin downloads, never in extension storage.
 */

const WORDS = [
  'apple', 'bamboo', 'banana', 'beach', 'bird', 'boat', 'bread', 'brick', 'cake', 'camel', 'candle', 'cloud', 'coconut',
  'comet', 'coral', 'crab', 'dragon', 'drum', 'eagle', 'earth', 'elephant', 'falcon', 'fern', 'flute', 'forest', 'garden',
  'gecko', 'ginger', 'guitar', 'harbor', 'hill', 'island', 'jade', 'jasmine', 'jungle', 'kite', 'lake', 'lemon', 'lion',
  'lotus', 'mango', 'maple', 'melon', 'moon', 'mountain', 'noodle', 'ocean', 'orange', 'orchid', 'otter', 'owl', 'panda',
  'papaya', 'pearl', 'pepper', 'piano', 'planet', 'pond', 'rabbit', 'rain', 'river', 'rocket', 'sand', 'shell', 'silver',
  'snow', 'star', 'stone', 'sun', 'tiger', 'tulip', 'turtle', 'violin', 'water', 'whale', 'wind', 'zebra',
] as const;

export type RandomInt = (maxExclusive: number) => number;

export const cryptoRandomInt: RandomInt = (max) => {
  // Rejection sampling to avoid modulo bias.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % max;
};

export function generatePassword(digits = 4, random: RandomInt = cryptoRandomInt): string {
  const word = WORDS[random(WORDS.length)]!;
  let number = '';
  for (let i = 0; i < digits; i++) number += String(random(10));
  return `${word}-${number}`;
}
