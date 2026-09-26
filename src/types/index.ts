export interface LeaderboardEntry {
  id: string;
  displayName: string;
  initials: string;
  totalCents: number;
  createdAt: number;
  updatedAt: number;
  rank: number;
}

export interface ClaimResponse {
  entrant: LeaderboardEntry;
  paymentCents: number;
  leaderboard: LeaderboardEntry[];
}
