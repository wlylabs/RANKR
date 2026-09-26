// Soft duotone gradients — vivid enough to tell entrants apart at a
// glance, kept out of the brand's own accent hue so a colored avatar is
// never mistaken for a rank-1 highlight.
const PALETTE: Array<[string, string]> = [
  ["#FF9472", "#E85D75"], // coral → rose
  ["#6C63FF", "#4C46B6"], // indigo
  ["#4FACFE", "#2D6CDF"], // sky → blue
  ["#FFB86B", "#F2823C"], // amber → orange
  ["#B892FF", "#7C5CD6"], // violet
  ["#FF7EB3", "#D6336C"], // pink → magenta
  ["#64748B", "#42536E"], // slate
  ["#2DD4BF", "#0E9DA6"], // teal
];

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function gradientFor(seed: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
