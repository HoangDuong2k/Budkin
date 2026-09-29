import type { DeskApi } from '../shared/api'

declare global {
  interface Window {
    api: DeskApi
  }
}

export {}
