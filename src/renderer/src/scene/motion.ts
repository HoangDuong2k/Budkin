// Giảm chuyển động: theo hệ điều hành (auto) hoặc thiết lập của app
import { useData } from '../state/dataStore'

const media = window.matchMedia('(prefers-reduced-motion: reduce)')

export function reducedMotion(): boolean {
  const pref = useData.getState().settings?.reducedMotion ?? 'auto'
  return pref === 'on' || (pref === 'auto' && media.matches)
}
