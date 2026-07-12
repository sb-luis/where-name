export type GamePhase = 'welcome' | 'playing' | 'results'

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export type RoundOutcome = 'correct' | 'wrong' | 'skipped'

export interface RoundResult {
  country: string
  outcome: RoundOutcome
  timeMs: number
}
