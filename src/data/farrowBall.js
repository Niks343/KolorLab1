// HEX samples follow the archived Colorizah palette; LRV is estimated from sRGB luminance.
import { getTintingBase } from './colorBase.js';

const shades = `
CC1|Tar|535353
CC2|Sand|E2D7C1
CC3|Citrona|DBCC7C
CC4|Palm|C3CFBB
CC5|Salt|E6E4E1
CC6|Hazy|AFC2C9
CC7|Stoke|93908A
CC8|Faded Terracotta|DFB797
W1|Snow White|FFFDE1
W5|Orange Coloured White|F7E6BC
W7|Skimmed Milk White|E4DCBB
W9|Ash Grey|CAC6A5
W108|Broccoli Brown|907D64
W29|Ultra Marine Blue|5D82A1
W40|Imperial Purple|55566B
W24|Scotch Blue|41404C
W53|Emerald Green|7CAE72
W50|Verdigris Green|3E8B68
W56|Sap Green|7E8651
W55|Duck Green|465741
W76|Dutch Orange|F2B145
W92|Lake Red|C8526A
W93|Crimson Red|B67E78
W101|Deep Reddish Brown|70483E
2005|All White|FBF8F4
273|Wevet|EEE9E7
239|Wimborne White|F7F3E8
2003|Pointing|F7F1E3
2010|James White|EDE9D8
211|Stony Ground|CEC1AD
2002|White Tie|F5ECD9
59|New White|F5E8D0
2013|Matchstick|E4D5BC
8|String|DDCDAE
213|Savage Ground|D8C4A8
16|Cord|D6C39E
2004|Slipper Satin|E8E0D1
1|Lime White|E8DEC9
3|Off-White|E0D5BE
4|Old White|CFC3AD
17|Light Gray|B4A693
40|Mouse's Back|998976
291|School House White|E6DFD1
282|Shadow White|DED8C6
201|Shaded White|D9D2C1
283|Drop Cloth|C9BEAB
15|Bone|CEC3AD
5|Hardwick White|B5AFA0
2008|Dimity|EEE3D3
226|Joa's White|DECFB9
264|Oxford Stone|D6C2AC
6|London Stone|B6A38F
28|Dead Salmon|B49D8D
290|Salon Drab|726454
2001|Strong White|E5E0DB
274|Ammonite|DDD8CF
228|Cornforth White|D1CBC3
275|Purbeck Stone|C4BEB4
284|Worsted|A59F97
276|Mole's Breath|8B857F
285|Cromarty|CFCEC0
266|Mizzle|C0C2B3
91|Blue Gray|B4B4A3
25|Pigeon|A1A093
18|French Gray|B5B19A
292|Treron|8B8A77
2011|Blackened|DDDBD9
277|Dimpse|D9D8D3
242|Pavilion Gray|C8C3BC
88|Lamp Room Gray|B2B1A9
265|Manor House Gray|A2A29D
272|Plummett|8D8D8B
241|Skimming Stone|DFD6CB
229|Elephant's Breath|CCBFB3
267|Dove Tale|BBB1AB
243|Charleston Gray|9F9389
244|London Clay|786963
222|Brinjal|5D3B42
293|Jitney|C4B2A2
286|Peignoir|D6C8C3
270|Calluna|CCC8CE
271|Brassica|8D8089
254|Pelt|50414C
294|Paean Black|494248
245|Middleton Pink|FDE7E5
230|Calamine|E6D1CB
278|Nancy's Blushes|ECB7B8
64|Red Earth|C57B67
42|Picture Gallery Red|A15A4D
248|Incarnadine|A04344
2006|Great White|E7DEDB
295|Sulking Room Pink|A0837F
246|Cinder Rose|C7A4A6
296|Rangwali|BF7A8F
202|Pink Ground|EFD6C7
231|Setting Plaster|DFC2AF
217|Rectory Red|A53C49
43|Eating Room Red|8F4E4D
96|Radicchio|994A50
297|Preference Red|6D4247
268|Charlotte's Locks|D65F3D
212|Blazer|B64F48
2012|House White|F1E6C8
71|Pale Hound|EADFB7
233|Dayroom Yellow|F7E29D
74|Citron|F5D27B
218|Yellow Ground|F2CF86
223|Babouche|ECC363
203|Tallow|FDEDD7
67|Farrow's Cream|EFDBB3
68|Dorset Cream|EFD5A1
37|Hay|DFC795
51|Sudbury Yellow|DCB771
66|India Yellow|CB9E59
206|Green Ground|DBDAB6
32|Cooking Apple Green|C4C6A5
75|Ball Green|BCB596
79|Card Room Green|899081
47|Green Smoke|737C70
93|Studio Green|464C49
251|Churlish Green|C8BD83
287|Yeabridge Green|919F70
81|Breakfast Room Green|94A68A
34|Calke Green|768769
298|Bancha|686A47
214|Arsenic|84B59C
234|Vert De Terre|BABBA5
19|Lichen|A1A189
85|Oval Room Blue|8B9D9B
86|Stone Blue|7997A1
299|De Nimes|6A7C80
289|Inchyra Blue|586768
252|Pavilion Blue|E5E7DC
204|Pale Powder|D9DCD2
236|Teresa's Green|C0CDC2
84|Green Blue|ADBDB2
82|Dix Blue|99B0AB
288|Vardo|427E83
235|Borrowed Light|D5DBDB
205|Skylight|CCD0CD
22|Light Blue|B8BCB5
27|Parma Gray|B2BFC5
89|Lulworth Blue|A1B8CA
237|Cook's Blue|6A90B4
269|Cabbage White|E8EEEA
210|Blue Ground|A1C5C8
280|St Giles Blue|599EC4
220|Pitch Blue|636E8F
281|Stiffkey Blue|4D5B6A
30|Hague Blue|3D4E57
36|Mahogany|534644
255|Tanner's Brown|4D4746
26|Down Pipe|626664
31|Railings|45484B
57|Off-Black|444546
256|Pitch Black|3B3938
`.trim();

const russianOverrides = {
  "Elephant's Breath": 'Дыхание слона',
  'Hague Blue': 'Гаагский синий',
  'Down Pipe': 'Водосточная труба',
  Matchstick: 'Спичка',
  'Snow White': 'Белоснежный',
  'All White': 'Чистый белый',
  'Wimborne White': 'Уимборнский белый',
  'Green Smoke': 'Дымчатый зелёный',
  'French Gray': 'Французский серый',
  'Pigeon': 'Голубь',
  'Stiffkey Blue': 'Стиффки-синий',
  'De Nimes': 'Де-Ним',
  'Railings': 'Перила',
  'Off-Black': 'Мягкий чёрный',
  'Pitch Black': 'Глубокий чёрный',
  Tar: 'Дёготь',
  Sand: 'Песок',
  'New White': 'Новый белый',
  'Pale Powder': 'Бледная пудра',
  'Red Earth': 'Красная земля',
  'Studio Green': 'Студийный зелёный',
};

const requestedHexOverrides = {
  229: 'C6BEB5',
  30: '2E3B43',
  26: '484E4F',
  2013: 'E7DFCB',
};

const transliteration = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х',
  i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'у', x: 'кс',
  y: 'й', z: 'з',
};

function toRussian(name) {
  if (russianOverrides[name]) return russianOverrides[name];
  const translated = name.toLowerCase().replace(/[a-z]/g, (letter) => transliteration[letter]).replace(/['’]/g, '');
  return translated.charAt(0).toLocaleUpperCase('ru-RU') + translated.slice(1);
}

function parseShade(line) {
  const [code, name, sourceHex] = line.split('|');
  const hex = requestedHexOverrides[code] ?? sourceHex;
  const rgb = hex.match(/../g).map((channel) => Number.parseInt(channel, 16));
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const lrv = Math.round((0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]) * 100);
  const base = getTintingBase(`#${hex}`, lrv);
  const numericCode = /^\d+$/.test(code);

  return {
    id: `fb-${code.toLowerCase()}`,
    code: numericCode ? `No. ${code}` : code,
    name_ru: toRussian(name),
    name_en: name,
    catalog: 'Farrow & Ball',
    hex: `#${hex}`,
    rgb,
    lrv,
    lrvEstimated: true,
    base,
    applications: ['интерьер'],
  };
}

export default shades.split('\n').map(parseShade);
