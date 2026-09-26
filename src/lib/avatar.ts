// A restrained, premium palette — no primary colors, everything sits
// comfortably next to the gold accent without competing for attention.
const PALETTE = [
  "#6B6F76", // slate
  "#8A7B6C", // taupe
  "#5E7A73", // deep sage
  "#7A6A8A", // muted plum
  "#6E7B8A", // steel blue
  "#8A6E6E", // dusty rose
  "#77806B", // olive
  "#6C7A8A", // slate blue
];

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
