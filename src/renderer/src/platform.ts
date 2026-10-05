// Khác biệt nhỏ trên giao diện theo hệ điều hành

export const IS_MAC = window.api.boot.platform === 'darwin'

/** Phím tắt có phím điều khiển: macOS ⌘, — Windows / Linux Ctrl+, */
export function modKey(key: string): string {
  return IS_MAC ? `⌘${key}` : `Ctrl+${key}`
}
