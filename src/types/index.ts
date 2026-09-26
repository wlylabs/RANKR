export interface LeaderboardEntry {
  id: string;
  displayName: string;
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
