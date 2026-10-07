// Sample famous people for discovery surfaces (People to follow, Top
// annotators) until live activity fills them in. Photos live in
// webapp/public/pfps (Wikimedia Commons portraits).
const person = (name, handle, file) => ({ name, handle, pfp: `/pfps/${file}` });

export const SAMPLE_PEOPLE = [
  person('Jason Calacanis', 'Jason', 'jason.jpg'),
  person('Elon Musk', 'elonmusk', 'elonmusk.jpg'),
  person('Vitalik Buterin', 'VitalikButerin', 'vitalik.jpg'),
  person('Sam Altman', 'sama', 'sama.jpg'),
  person('Lex Fridman', 'lexfridman', 'lexfridman.png'),
  person('Andrew Huberman', 'hubermanlab', 'hubermanlab.jpg'),
  person('Naval Ravikant', 'naval', 'naval.jpg'),
  person('Paul Graham', 'paulg', 'paulg.jpg'),
  person('Balaji Srinivasan', 'balajis', 'balajis.png'),
  person('MrBeast', 'MrBeast', 'mrbeast.png'),
];
