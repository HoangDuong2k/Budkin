// Preload chạy sandbox: chỉ dùng contextBridge + ipcRenderer, mở window.api cho renderer
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DeskApi, EventMap } from '../shared/api'
import { DEFAULT_BOOT, parseBootArg } from '../shared/boot'

const api: DeskApi = {
  boot: parseBootArg(process.argv) ?? { ...DEFAULT_BOOT, platform: process.platform, lang: 'vi', test: false, clockOffset: 0 },
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: <K extends keyof EventMap>(channel: K, cb: (data: EventMap[K]) => void) => {
    const listener = (_e: IpcRendererEvent, data: EventMap[K]): void => cb(data)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
