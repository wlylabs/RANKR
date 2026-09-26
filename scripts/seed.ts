import { recordClaim } from "@/lib/entrants";

const seedEntrants: Array<{ name: string; amount: number }> = [
  { name: "Seraphine Cole", amount: 428.0 },
  { name: "Atlas Vane", amount: 361.5 },
  { name: "Odessa Hart", amount: 305.0 },
  { name: "Marlowe Finch", amount: 244.25 },
  { name: "Kestrel Osei", amount: 198.0 },
  { name: "Juniper Reyes", amount: 156.75 },
  { name: "Bram Delacroix", amount: 122.0 },
  { name: "Sable Ashworth", amount: 89.5 },
  { name: "Indigo Marchetti", amount: 64.0 },
  { name: "Callum Rook", amount: 42.25 },
  { name: "Wren Halston", amount: 27.0 },
  { name: "Nova Iridescu", amount: 15.0 },
];

for (const entrant of seedEntrants) {
  recordClaim({
    displayName: entrant.name,
    amountCents: Math.round(entrant.amount * 100),
  });
}

console.log(`Seeded ${seedEntrants.length} entrants.`);
