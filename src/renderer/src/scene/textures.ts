// Texture vẽ bằng canvas lúc chạy (không tải file, CSP không phải nới) — thế giới hiện đại hậu tận thế, tông lạnh:
// tường bê tông đúc sẵn nứt, loang vệt nước; mặt bàn thép xước mờ; nhôm xước tóc; bụi phủ trên thiết bị; kính nứt;
// bản đồ địa hình trên máy tính bảng; dấu sơn xịt và hình vẽ sơn dạ quang.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

type Rnd = () => number
type Ctx = CanvasRenderingContext2D

const cache = new Map<string, CanvasTexture>()

function make(key: string, w: number, h: number, draw: (g: Ctx, rnd: Rnd) => void, repeat = false): CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  let seed = 987654321 + key.length * 7919 + key.charCodeAt(0) * 131
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  draw(g, rnd)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping
  cache.set(key, tex)
  return tex
}

/** Vẽ lặp ở 9 vị trí lệch một ô: chi tiết chạm mép ô ảnh nối liền sang ô bên cạnh (texture lặp không lộ đường nối) */
function tiled(w: number, h: number, draw: (dx: number, dy: number) => void): void {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) draw(dx, dy)
}

/** Nhiễu từng điểm ảnh ±amp (hạt bê tông, thớ giấy) */
function speckle(g: Ctx, w: number, h: number, rnd: Rnd, amp: number): void {
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * amp
    d[i] += v
    d[i + 1] += v
    d[i + 2] += v
  }
  g.putImageData(img, 0, 0)
}

/** Vệt loang tròn mờ (ố, bẩn, loang màu) */
function blotches(g: Ctx, rnd: Rnd, w: number, h: number, colors: string[], count: number, r: [number, number], alpha: number, wrap = true): void {
  g.save()
  for (let i = 0; i < count; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const rad = r[0] + rnd() * (r[1] - r[0])
    const color = colors[Math.floor(rnd() * colors.length)]
    const a = alpha * (0.4 + rnd() * 0.6)
    const sx = 0.6 + rnd() * 0.8
    const paint = (dx: number, dy: number): void => {
      g.save()
      g.translate(x + dx, y + dy)
      g.scale(sx, 1)
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, rad)
      grad.addColorStop(0, color)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.globalAlpha = a
      g.fillStyle = grad
      g.fillRect(-rad, -rad, rad * 2, rad * 2)
      g.restore()
    }
    if (wrap) tiled(w, h, paint)
    else paint(0, 0)
  }
  g.restore()
}

/** Vết xước mảnh gần như thẳng */
function scratches(g: Ctx, rnd: Rnd, w: number, h: number, color: string, count: number, alpha: number, len: [number, number], width = 1): void {
  g.save()
  g.strokeStyle = color
  g.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const l = len[0] + rnd() * (len[1] - len[0])
    const a = rnd() * Math.PI
    const bend = (rnd() - 0.5) * 0.2
    g.globalAlpha = alpha * (0.3 + rnd() * 0.7)
    g.lineWidth = width * (0.5 + rnd())
    tiled(w, h, (dx, dy) => {
      g.beginPath()
      g.moveTo(x + dx, y + dy)
      g.quadraticCurveTo(x + dx + Math.cos(a + bend) * l * 0.5, y + dy + Math.sin(a + bend) * l * 0.5, x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l)
      g.stroke()
    })
  }
  g.restore()
}

/** Vết nứt: đường gấp khúc ngẫu nhiên, rẽ nhánh */
function crack(g: Ctx, rnd: Rnd, x: number, y: number, len: number, angle: number, width: number, depth = 0): void {
  let px = x
  let py = y
  let a = angle
  const steps = Math.max(3, Math.floor(len / 7))
  g.lineWidth = width
  g.beginPath()
  g.moveTo(px, py)
  for (let i = 0; i < steps; i++) {
    a += (rnd() - 0.5) * 0.9
    px += Math.cos(a) * 7
    py += Math.sin(a) * 7
    g.lineTo(px, py)
    if (depth < 2 && rnd() < 0.12) {
      g.stroke()
      crack(g, rnd, px, py, len * 0.45, a + (rnd() < 0.5 ? 0.8 : -0.8), width * 0.6, depth + 1)
      g.lineWidth = width
      g.beginPath()
      g.moveTo(px, py)
    }
  }
  g.stroke()
}

/** Vệt chảy dọc (nước mưa) từ (x, y) xuống dưới */
function streak(g: Ctx, x: number, y: number, len: number, width: number, color: string, alpha: number): void {
  const grad = g.createLinearGradient(0, y, 0, y + len)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.save()
  g.globalAlpha = alpha
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(x - width / 2, y)
  g.lineTo(x + width / 2, y)
  g.lineTo(x + width * 0.2, y + len)
  g.lineTo(x - width * 0.3, y + len)
  g.closePath()
  g.fill()
  g.restore()
}

/** Tường bê tông đúc sẵn xám lạnh: tấm 1 m × 0,5 m, lỗ ty cốp pha, vết nứt, vệt nước chảy, vết cháy — 1 ô = 1 m */
export function concreteTexture(): CanvasTexture {
  return make(
    'concrete',
    512,
    512,
    (g, rnd) => {
      g.fillStyle = '#62676c'
      g.fillRect(0, 0, 512, 512)
      blotches(g, rnd, 512, 512, ['#6d7277', '#575c61', '#747a80', '#505559'], 70, [20, 90], 0.35)
      // Vân ván khuôn đổ bê tông: dải ngang ~12 cm
      for (let y = 0; y < 512; y += 64) {
        g.globalAlpha = 0.05
        g.fillStyle = (y / 64) % 2 ? '#ffffff' : '#000000'
        g.fillRect(0, y, 512, 64)
        g.globalAlpha = 0.1
        g.fillStyle = '#2f3337'
        g.fillRect(0, y, 512, 1)
      }
      g.globalAlpha = 1
      // Vệt nước chảy từ mép trên mỗi tấm
      for (const top of [0, 256])
        for (let i = 0; i < 14; i++) streak(g, rnd() * 512, top + 3, 50 + rnd() * 170, 4 + rnd() * 14, '#2c3136', 0.14 + rnd() * 0.14)
      // Khe nối giữa các tấm (ở mép ô ảnh: lặp thành lưới)
      g.fillStyle = '#2d3135'
      for (const y of [0, 256, 512]) g.fillRect(0, y - 2, 512, 4)
      for (const x of [0, 512]) g.fillRect(x - 2, 0, 4, 512)
      g.fillStyle = 'rgba(150,158,166,0.5)'
      for (const y of [0, 256]) g.fillRect(0, y + 2, 512, 1)
      // Lỗ ty: lỗ tối, viền sáng, vệt nước chảy xuống
      for (const top of [0, 256])
        for (const hx of [128, 384])
          for (const hy of [64, 192]) {
            const x = hx + (rnd() - 0.5) * 4
            const y = top + hy + (rnd() - 0.5) * 4
            streak(g, x, y + 4, 40 + rnd() * 110, 7, '#2a2f34', 0.35)
            g.fillStyle = 'rgba(160,168,176,0.6)'
            g.beginPath()
            g.arc(x, y + 1, 8, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = '#25292d'
            g.beginPath()
            g.arc(x, y, 6.5, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = '#121416'
            g.beginPath()
            g.arc(x, y - 0.5, 3.5, 0, Math.PI * 2)
            g.fill()
          }
      // Vết nứt
      g.strokeStyle = '#26292d'
      g.globalAlpha = 0.85
      g.lineCap = 'round'
      for (let i = 0; i < 5; i++) crack(g, rnd, 40 + rnd() * 430, 40 + rnd() * 430, 90 + rnd() * 150, rnd() * Math.PI * 2, 1.6)
      g.globalAlpha = 1
      // Vết cháy xém, rỗ bề mặt
      blotches(g, rnd, 512, 512, ['#1a1c1f'], 2, [60, 110], 0.35)
      g.fillStyle = '#303438'
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = 0.4 + rnd() * 0.5
        g.beginPath()
        g.arc(rnd() * 512, rnd() * 512, 0.5 + rnd() * 1.4, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
      speckle(g, 512, 512, rnd, 18)
    },
    true
  )
}

/** Mặt bàn thép xám xanh: vân chải ngang, bụi, vết xước sáng, vài vệt bẩn */
export function deskTexture(): CanvasTexture {
  return make(
    'desk',
    512,
    512,
    (g, rnd) => {
      g.fillStyle = '#3a4047'
      g.fillRect(0, 0, 512, 512)
      // Vân chải: vạch ngang mảnh chạy hết bề ngang (nối liền khi lặp)
      for (let i = 0; i < 420; i++) {
        g.globalAlpha = 0.04 + rnd() * 0.08
        g.fillStyle = rnd() < 0.5 ? '#6a737c' : '#23282d'
        g.fillRect(0, rnd() * 512, 512, 0.5 + rnd())
      }
      blotches(g, rnd, 512, 512, ['#4a525a', '#30363c'], 26, [30, 90], 0.25)
      blotches(g, rnd, 512, 512, ['#1c2024'], 8, [10, 34], 0.35)
      scratches(g, rnd, 512, 512, '#9aa6b2', 60, 0.28, [20, 110], 0.7)
      scratches(g, rnd, 512, 512, '#15181b', 30, 0.3, [8, 30], 0.8)
      g.globalAlpha = 1
      speckle(g, 512, 512, rnd, 10)
    },
    true
  )
}

/** Bụi phủ trên thiết bị (nhân với màu vật liệu): gần trắng, vệt bụi mờ, xước tóc rất nhẹ */
export function dustTexture(): CanvasTexture {
  return make(
    'dust',
    256,
    256,
    (g, rnd) => {
      g.fillStyle = '#eef0f2'
      g.fillRect(0, 0, 256, 256)
      blotches(g, rnd, 256, 256, ['#d3d8dc', '#dfe2e5'], 24, [10, 50], 0.18)
      scratches(g, rnd, 256, 256, '#ffffff', 26, 0.35, [10, 60], 0.6)
      scratches(g, rnd, 256, 256, '#a9b0b7', 14, 0.2, [6, 26], 0.6)
      g.globalAlpha = 1
      speckle(g, 256, 256, rnd, 8)
    },
    true
  )
}

/** Nhôm xước tóc: vạch ngang mảnh sáng tối xen kẽ (nhân với màu vật liệu) */
export function brushedTexture(): CanvasTexture {
  return make(
    'brushed',
    256,
    256,
    (g, rnd) => {
      g.fillStyle = '#e6e9ec'
      g.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 360; i++) {
        g.globalAlpha = 0.05 + rnd() * 0.12
        g.fillStyle = rnd() < 0.5 ? '#ffffff' : '#9da5ad'
        g.fillRect(0, rnd() * 256, 256, 0.5 + rnd())
      }
      g.globalAlpha = 1
      speckle(g, 256, 256, rnd, 6)
    },
    true
  )
}

/** Ô kính nứt còn trên khung (nền trong suốt): lớp kính mờ bụi, vết rạn hình mạng nhện */
export function crackedPaneTexture(): CanvasTexture {
  return make('pane', 256, 256, (g, rnd) => {
    g.fillStyle = 'rgba(150,172,190,0.16)'
    g.fillRect(0, 0, 256, 256)
    blotches(g, rnd, 256, 256, ['rgba(40,48,56,1)'], 10, [20, 60], 0.25, false)
    g.strokeStyle = 'rgba(225,238,248,0.85)'
    g.lineCap = 'round'
    const cx = 90 + rnd() * 80
    const cy = 90 + rnd() * 80
    for (let i = 0; i < 9; i++) crack(g, rnd, cx, cy, 90 + rnd() * 110, (Math.PI * 2 * i) / 9 + rnd() * 0.3, 1.2, 1)
    g.globalAlpha = 0.6
    for (const r of [16, 34]) {
      g.beginPath()
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.5) {
        const rr = r * (0.8 + rnd() * 0.4)
        const px = cx + Math.cos(a) * rr
        const py = cy + Math.sin(a) * rr
        if (a === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.stroke()
    }
  })
}

/** Bản đồ địa hình trên máy tính bảng (vừa là màu vừa là ánh sáng tự phát): đường đồng mức cyan, sông, đường,
 *  vùng nguy hiểm khoanh đỏ, lộ trình đứt nét, vị trí hiện tại, thanh trạng thái */
export function tabletMapTexture(): CanvasTexture {
  return make('tablet-map', 512, 336, (g, rnd) => {
    g.fillStyle = '#061018'
    g.fillRect(0, 0, 512, 336)
    // Lưới toạ độ
    g.strokeStyle = 'rgba(80,150,180,0.12)'
    g.lineWidth = 1
    for (let x = 0; x < 512; x += 32) {
      g.beginPath()
      g.moveTo(x, 24)
      g.lineTo(x, 336)
      g.stroke()
    }
    for (let y = 24; y < 336; y += 32) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(512, y)
      g.stroke()
    }
    // Đường đồng mức quanh vài quả đồi
    for (let h = 0; h < 4; h++) {
      const cx = 60 + rnd() * 400
      const cy = 70 + rnd() * 230
      const f1 = rnd() * 6
      const f2 = rnd() * 6
      for (let k = 1; k <= 7; k++) {
        g.strokeStyle = `rgba(63,214,234,${0.18 + 0.05 * (k % 3)})`
        g.lineWidth = k % 4 === 0 ? 1.6 : 0.9
        g.beginPath()
        for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.1) {
          const r = k * 11 * (1 + 0.22 * Math.sin(3 * a + f1) + 0.12 * Math.sin(5 * a + f2))
          const px = cx + Math.cos(a) * r * 1.3
          const py = cy + Math.sin(a) * r
          if (a === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        }
        g.stroke()
      }
    }
    // Sông, đường
    g.strokeStyle = 'rgba(90,140,255,0.7)'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(-10, 260)
    g.bezierCurveTo(120, 210, 210, 320, 330, 270)
    g.bezierCurveTo(420, 235, 470, 290, 530, 262)
    g.stroke()
    g.strokeStyle = 'rgba(220,235,245,0.55)'
    g.lineWidth = 1.5
    for (let i = 0; i < 4; i++) {
      g.beginPath()
      g.moveTo(rnd() * 512, 24)
      g.bezierCurveTo(rnd() * 512, 120, rnd() * 512, 220, rnd() * 512, 336)
      g.stroke()
    }
    // Vùng nguy hiểm, lộ trình, vị trí hiện tại
    g.strokeStyle = 'rgba(255,90,95,0.85)'
    g.fillStyle = 'rgba(255,90,95,0.12)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(370, 120, 44, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.strokeStyle = 'rgba(79,224,255,0.95)'
    g.lineWidth = 2.5
    g.setLineDash([9, 7])
    g.beginPath()
    g.moveTo(90, 300)
    g.bezierCurveTo(150, 230, 190, 190, 260, 180)
    g.lineTo(300, 140)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#4fe0ff'
    g.beginPath()
    g.arc(90, 300, 6, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(79,224,255,0.5)'
    g.beginPath()
    g.arc(90, 300, 14, 0, Math.PI * 2)
    g.stroke()
    // Thanh trạng thái trên cùng: khối chữ giả, pin, sóng
    g.fillStyle = '#0d1d28'
    g.fillRect(0, 0, 512, 24)
    g.fillStyle = 'rgba(207,231,245,0.8)'
    for (const [x, w] of [
      [12, 60],
      [80, 34],
      [124, 46]
    ])
      g.fillRect(x, 9, w, 6)
    g.fillStyle = '#4fe0ff'
    for (let i = 0; i < 4; i++) g.fillRect(452 + i * 11, 16 - i * 3, 7, 4 + i * 3)
  })
}

/** Màn hình nhỏ của trạm sạc: biểu tượng pin 4 vạch, đồ thị công suất */
export function powerDisplayTexture(): CanvasTexture {
  return make('power-display', 128, 64, (g) => {
    g.fillStyle = '#04090d'
    g.fillRect(0, 0, 128, 64)
    g.strokeStyle = '#4fe0ff'
    g.lineWidth = 3
    g.strokeRect(10, 16, 46, 30)
    g.fillStyle = '#4fe0ff'
    g.fillRect(56, 25, 5, 12)
    for (let i = 0; i < 3; i++) g.fillRect(15 + i * 13, 21, 9, 20)
    g.globalAlpha = 0.35
    g.fillRect(15 + 3 * 13, 21, 2, 20)
    g.globalAlpha = 1
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(72, 44)
    for (let x = 72; x <= 118; x += 6) g.lineTo(x, 44 - 16 * Math.abs(Math.sin(x / 7)))
    g.stroke()
  })
}

/** Nét sơn xịt: nét mềm có bụi sơn loang quanh */
function spray(g: Ctx, color: string, width: number, path: () => void, blur = 6): void {
  g.save()
  g.strokeStyle = color
  g.shadowColor = color
  g.shadowBlur = blur
  g.lineWidth = width
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  path()
  g.stroke()
  g.restore()
}

/** Hình vẽ bằng sơn dạ quang (vừa có trong ảnh màu, vừa trong ảnh phát sáng): mặt robot nguệch ngoạc, vạch đếm ngày */
function glowDoodle(g: Ctx, color: string, blur: number): void {
  const line = (w: number, path: () => void): void => spray(g, color, w, path, blur)
  line(5, () => {
    g.roundRect(262, 92, 62, 48, 14)
  })
  line(5, () => {
    g.moveTo(293, 92)
    g.lineTo(293, 70)
  })
  g.save()
  g.fillStyle = color
  g.shadowColor = color
  g.shadowBlur = blur
  for (const [x, y, r] of [
    [280, 112, 6],
    [306, 112, 6],
    [293, 64, 6]
  ]) {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  line(3.5, () => {
    g.arc(293, 122, 9, 0.3, Math.PI - 0.3)
  })
  // Vạch đếm ngày
  line(4, () => {
    for (let i = 0; i < 4; i++) {
      g.moveTo(262 + i * 11, 160)
      g.lineTo(264 + i * 11, 190)
    }
    g.moveTo(256, 186)
    g.lineTo(304, 164)
  })
}

/** Dấu sơn xịt trắng trên tường (nền trong suốt): mã X của đội cứu hộ, mũi tên, hình vẽ sơn dạ quang */
export function markingsTexture(): CanvasTexture {
  return make('markings', 512, 256, (g, rnd) => {
    g.clearRect(0, 0, 512, 256)
    // Sơn đã phai
    g.globalAlpha = 0.6
    const white = '#d5dde4'
    // Mã X: ngày / đội / nguy hiểm / số người
    spray(g, white, 7, () => {
      g.moveTo(60, 60)
      g.lineTo(190, 190)
      g.moveTo(190, 60)
      g.lineTo(60, 190)
    })
    g.save()
    g.fillStyle = white
    g.shadowColor = white
    g.shadowBlur = 3
    g.font = 'bold 19px sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('12-09', 125, 70)
    g.fillText('07', 80, 125)
    g.fillText('0', 125, 184)
    g.fillText('OK', 170, 125)
    g.restore()
    // Sơn chảy
    g.fillStyle = white
    for (const [x, y] of [
      [72, 72],
      [178, 72],
      [125, 132],
      [84, 180]
    ])
      g.fillRect(x, y, 2, 12 + rnd() * 22)
    // Mũi tên chỉ đường
    spray(g, white, 7, () => {
      g.moveTo(470, 60)
      g.lineTo(370, 60)
      g.moveTo(392, 40)
      g.lineTo(368, 60)
      g.lineTo(392, 80)
    })
    for (const x of [400, 430, 455]) g.fillRect(x, 64, 2, 16 + rnd() * 22)
    // Hình vẽ sơn dạ quang: ban ngày là lớp sơn xanh xám nhạt
    g.globalAlpha = 0.85
    glowDoodle(g, '#7f98a6', 3)
    g.globalAlpha = 1
  })
}

/** Phần phát sáng của dấu sơn (emissiveMap): chỉ sơn dạ quang, nền đen */
export function markingsGlowTexture(): CanvasTexture {
  return make('markings-glow', 512, 256, (g) => {
    g.fillStyle = '#000000'
    g.fillRect(0, 0, 512, 256)
    glowDoodle(g, '#2fe4ff', 14)
  })
}

/** Những vệt sáng lạnh lọt qua ô kính vỡ: 3 dải mềm, mờ dần xuống dưới, lấm tấm bụi */
export function beamTexture(): CanvasTexture {
  return make('beam', 128, 256, (g, rnd) => {
    for (const [cx, w, a] of [
      [24, 12, 0.45],
      [64, 20, 0.55],
      [102, 9, 0.35]
    ]) {
      const grad = g.createLinearGradient(cx - w, 0, cx + w, 0)
      grad.addColorStop(0, 'rgba(170,205,240,0)')
      grad.addColorStop(0.5, `rgba(170,205,240,${a})`)
      grad.addColorStop(1, 'rgba(170,205,240,0)')
      g.fillStyle = grad
      g.fillRect(cx - w, 0, w * 2, 256)
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(220,235,255,${0.3 + rnd() * 0.5})`
        g.fillRect(cx + (rnd() - 0.5) * w * 1.2, rnd() * 256, 1, 1)
      }
    }
    // Mờ dần về phía dưới
    g.globalCompositeOperation = 'destination-out'
    const fade = g.createLinearGradient(0, 0, 0, 256)
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(0.5, 'rgba(0,0,0,0.6)')
    fade.addColorStop(1, 'rgba(0,0,0,1)')
    g.fillStyle = fade
    g.fillRect(0, 0, 128, 256)
  })
}

function radial(key: string, size: number, stops: Array<[number, string]>): CanvasTexture {
  return make(key, size, size, (g) => {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (const [at, color] of stops) grad.addColorStop(at, color)
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  })
}

/** Bóng mềm dưới đồ vật (rẻ hơn nhiều so với shadow map) */
export function blobTexture(): CanvasTexture {
  return radial('blob', 64, [
    [0, 'rgba(0,0,0,0.65)'],
    [0.45, 'rgba(0,0,0,0.32)'],
    [1, 'rgba(0,0,0,0)']
  ])
}

/** Quầng sáng cộng màu (mắt robot, đèn báo, đèn LED) */
export function haloTexture(): CanvasTexture {
  return radial('halo', 64, [
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,255,255,0.45)'],
    [1, 'rgba(255,255,255,0)']
  ])
}

/** Vignette: giữa trong suốt, tối nhanh ra mép khung hình — không khí ngột ngạt, u tối */
export function vignetteTexture(): CanvasTexture {
  return radial('vignette', 256, [
    [0, 'rgba(2,3,6,0)'],
    [0.5, 'rgba(2,3,6,0)'],
    [0.78, 'rgba(2,3,6,0.42)'],
    [1, 'rgba(2,3,6,0.82)']
  ])
}
