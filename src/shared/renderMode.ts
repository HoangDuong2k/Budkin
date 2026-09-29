// Chọn vẽ 3D hay giao diện phẳng 2D — hàm thuần
import type { RenderPref } from './boot'

export interface RenderFacts {
  webgl2: boolean
  /** WebGL vẽ bằng CPU (SwiftShader, llvmpipe…) */
  software: boolean
  gpuCrashes: number
}

export type RenderReason = 'ok' | 'software' | 'pref' | 'no-webgl' | 'gpu-crashes' | 'context-lost' | 'error'

export interface RenderDecision {
  mode: '3d' | '2d'
  /** 3D nhưng tiết kiệm tối đa (vẽ bằng CPU) */
  software: boolean
  reason: RenderReason
}

/** GPU chết bấy nhiêu lần liên tiếp thì thôi vẽ 3D */
export const MAX_GPU_CRASHES = 2

export function decideRenderMode(pref: RenderPref, facts: RenderFacts): RenderDecision {
  if (pref === '2d') return { mode: '2d', software: false, reason: 'pref' }
  if (!facts.webgl2) return { mode: '2d', software: false, reason: 'no-webgl' }
  if (facts.gpuCrashes >= MAX_GPU_CRASHES) return { mode: '2d', software: false, reason: 'gpu-crashes' }
  if (facts.software || pref === 'software') return { mode: '3d', software: true, reason: 'software' }
  return { mode: '3d', software: false, reason: 'ok' }
}
