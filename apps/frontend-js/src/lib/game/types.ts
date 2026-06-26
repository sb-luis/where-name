export type GamePhase = 'welcome' | 'playing' | 'results'

export type RoundOutcome = 'correct' | 'wrong' | 'skipped'

export interface RoundResult {
  country: string
  outcome: RoundOutcome
  timeMs?: number  // set for 'correct' outcomes only
}
