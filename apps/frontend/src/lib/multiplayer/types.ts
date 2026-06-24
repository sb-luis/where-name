export interface Visitor {
  id: string
  alias: string | null
  color: string
  lat: number | null
  lng: number | null
}

export interface CursorData {
  id: string
  alias: string | null
  color: string
  lat: number
  lng: number
}
