export interface WebglFacts {
  webgl2: boolean
  /** Tên bộ vẽ (GPU) — SwiftShader / llvmpipe nghĩa là đang vẽ bằng CPU */
  renderer: string
  software: boolean
}

/** Thử tạo WebGL2 trên một canvas tạm để biết máy có vẽ 3D được không (rồi trả context ngay) */
export function probeWebgl(): WebglFacts {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2')
  if (!gl) return { webgl2: false, renderer: '', software: false }
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return { webgl2: true, renderer, software: /swiftshader|llvmpipe|softpipe|basic render|microsoft basic/i.test(renderer) }
}
