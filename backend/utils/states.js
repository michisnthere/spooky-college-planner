// US states, DC, and the territories the College Scorecard returns, by two-letter code.
// Colleges store and show the full name. A code is only accepted as input and converted.
const STATE_NAMES = Object.freeze({
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
  PR: 'Puerto Rico',
  GU: 'Guam',
  VI: 'U.S. Virgin Islands',
  AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
  FM: 'Federated States of Micronesia',
  MH: 'Marshall Islands',
  PW: 'Palau',
});

const BY_NAME = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), name]));

/**
 * Converts a state code ("MA", "ma") or a full name ("massachusetts") to the canonical full name.
 * Returns null for anything else, including blank values.
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeState(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (text === '') return null;
  if (text.length === 2) return STATE_NAMES[text.toUpperCase()] ?? null;
  return BY_NAME.get(text.toLowerCase()) ?? null;
}

module.exports = { STATE_NAMES, normalizeState };

