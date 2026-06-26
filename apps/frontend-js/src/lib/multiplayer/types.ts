export type UserStatus = 'home' | 'explore' | 'practice' | 'playing' | 'results'

export interface Visitor {
  id: string
  alias: string | null
  color: string
  lat: number | null
  lng: number | null
  status: UserStatus
}

export interface CursorData {
  id: string
  alias: string | null
  color: string
  lat: number
  lng: number
  status: UserStatus
}
