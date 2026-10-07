// Sample famous people for discovery surfaces (People to follow, Top
// annotators) until live activity fills them in. Photos live in
// webapp/public/pfps (Wikimedia Commons portraits). Follower counts are
// illustrative demo figures.
const person = (name, handle, file, followers, following) => ({
  name,
  handle,
  pfp: `/pfps/${file}`,
  followers,
  following,
});

export const SAMPLE_PEOPLE = [
  person('Jason Calacanis', 'Jason', 'jason.jpg', 2400000, 812),
  person('Elon Musk', 'elonmusk', 'elonmusk.jpg', 215000000, 1043),
  person('Vitalik Buterin', 'VitalikButerin', 'vitalik.jpg', 6500000, 427),
  person('Sam Altman', 'sama', 'sama.jpg', 4200000, 388),
  person('Lex Fridman', 'lexfridman', 'lexfridman.png', 5100000, 1204),
  person('Andrew Huberman', 'hubermanlab', 'hubermanlab.jpg', 7300000, 356),
  person('Naval Ravikant', 'naval', 'naval.jpg', 3400000, 91),
  person('Paul Graham', 'paulg', 'paulg.jpg', 1800000, 12),
  person('Balaji Srinivasan', 'balajis', 'balajis.png', 4900000, 1560),
  person('MrBeast', 'MrBeast', 'mrbeast.png', 32000000, 640),
];

export function findSamplePerson(handle) {
  const h = String(handle || '').toLowerCase();
  if (!h) return null;
  return SAMPLE_PEOPLE.find((p) => p.handle.toLowerCase() === h) || null;
}

export function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${parseFloat((v / 1000000).toFixed(1))}M`;
  if (v >= 1000) return `${parseFloat((v / 1000).toFixed(1))}K`;
  return `${v}`;
}
