import { recordClaim } from "@/lib/entrants";

const seedEntrants: Array<{ name: string; amount: number }> = [
  { name: "Sarah Bennett", amount: 428.0 },
  { name: "Marcus Chen", amount: 361.5 },
  { name: "Priya Sharma", amount: 305.0 },
  { name: "Daniel Kim", amount: 244.25 },
  { name: "Amara Johnson", amount: 198.0 },
  { name: "Wisnu Pratama", amount: 156.75 },
  { name: "Elena Rossi", amount: 122.0 },
  { name: "James Whitfield", amount: 89.5 },
  { name: "Nadia Santoso", amount: 64.0 },
  { name: "Leo Fischer", amount: 42.25 },
  { name: "Yuki Tanaka", amount: 27.0 },
  { name: "Grace Adeyemi", amount: 15.0 },
];

for (const entrant of seedEntrants) {
  recordClaim({
    displayName: entrant.name,
    amountCents: Math.round(entrant.amount * 100),
  });
}

console.log(`Seeded ${seedEntrants.length} entrants.`);
