// Texture vẽ bằng canvas lúc chạy (không tải file, CSP không phải nới). Nét cọ, vân giấy tạo cảm giác
// tranh vẽ tay: giấy dán tường art deco, gỗ gụ, bản vẽ kỹ thuật, graffiti neon, vệt nắng, bóng mờ, quầng sáng.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const cache = new Map<string, CanvasTexture>()

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, repeat = false): CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  let seed = 987654321 + key.length * 7919
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  draw(g, rnd)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping
  cache.set(key, tex)
  return tex
}

/** Nét cọ mờ ngẫu nhiên phủ lên nền — "vẽ tay" */
function brush(g: CanvasRenderingContext2D, rnd: () => number, w: number, h: number, colors: string[], count: number, alpha: number, width: [number, number]): void {
  g.save()
  g.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    g.globalAlpha = alpha * (0.4 + rnd() * 0.6)
    g.strokeStyle = colors[Math.floor(rnd() * colors.length)]
    g.lineWidth = width[0] + rnd() * (width[1] - width[0])
    const x = rnd() * w
    const y = rnd() * h
    const len = 20 + rnd() * 80
    const ang = (rnd() - 0.5) * 0.9
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 8, x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    g.stroke()
  }
  g.restore()
}

/** Giấy dán tường xanh ngọc, hoa văn quạt art deco màu đồng thau */
export function wallpaperTexture(): CanvasTexture {
  return make(
    'wallpaper',
    512,
    512,
    (g, rnd) => {
      g.fillStyle = '#2a4c47'
      g.fillRect(0, 0, 512, 512)
      brush(g, rnd, 512, 512, ['#33605a', '#223f3c', '#386559'], 280, 0.4, [8, 24])
      const cell = 128
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 5; col++) {
          const cx = col * cell + (row % 2 ? cell / 2 : 0)
          const cy = row * cell
          g.save()
          g.translate(cx, cy)
          g.strokeStyle = '#c9a45a'
          g.globalAlpha = 0.32
          g.lineWidth = 2
          // Quạt: nửa vòng tròn đồng tâm + tia
          for (const r of [52, 40, 28]) {
            g.beginPath()
            g.arc(0, 0, r, 0, Math.PI)
            g.stroke()
          }
          for (let k = 0; k <= 8; k++) {
            const a = (Math.PI * k) / 8
            g.beginPath()
            g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12)
            g.lineTo(Math.cos(a) * 52, Math.sin(a) * 52)
            g.stroke()
          }
          g.globalAlpha = 0.45
          g.fillStyle = '#d8b56a'
          g.beginPath()
          g.moveTo(0, 60)
          g.lineTo(5, 66)
          g.lineTo(0, 72)
          g.lineTo(-5, 66)
          g.closePath()
          g.fill()
          g.restore()
        }
      brush(g, rnd, 512, 512, ['#1e3634', '#4a7a70'], 120, 0.12, [2, 6])
    },
    true
  )
}

/** Gỗ gụ: vân dài, vài mắt gỗ, nét cọ */
export function woodTexture(): CanvasTexture {
  return make(
    'wood',
    512,
    256,
    (g, rnd) => {
      const grad = g.createLinearGradient(0, 0, 0, 256)
      grad.addColorStop(0, '#6e3c25')
      grad.addColorStop(0.5, '#62331f')
      grad.addColorStop(1, '#703f27')
      g.fillStyle = grad
      g.fillRect(0, 0, 512, 256)
      g.lineCap = 'round'
      for (let i = 0; i < 140; i++) {
        const y = rnd() * 256
        g.globalAlpha = 0.12 + rnd() * 0.22
        g.strokeStyle = rnd() < 0.55 ? '#40200f' : '#8f5434'
        g.lineWidth = 0.6 + rnd() * 2.2
        g.beginPath()
        g.moveTo(0, y)
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / (40 + rnd() * 30) + i) * (2 + rnd() * 3))
        g.stroke()
      }
      for (let k = 0; k < 3; k++) {
        g.globalAlpha = 0.35
        g.strokeStyle = '#3a1c0d'
        g.lineWidth = 1.5
        const x = 60 + rnd() * 400
        const y = 30 + rnd() * 200
        for (const r of [6, 11, 17]) {
          g.beginPath()
          g.ellipse(x, y, r * 2.2, r * 0.7, 0, 0, Math.PI * 2)
          g.stroke()
        }
      }
      brush(g, rnd, 512, 256, ['#8a4f30', '#4b2716'], 90, 0.18, [4, 12])
    },
    true
  )
}

/** Nhiễu nét cọ xám sáng (nhân với màu vật liệu) — bề mặt kim loại, men sứ trông như được tô tay */
export function paintTexture(): CanvasTexture {
  return make(
    'paint',
    256,
    256,
    (g, rnd) => {
      g.fillStyle = '#f2f2f2'
      g.fillRect(0, 0, 256, 256)
      brush(g, rnd, 256, 256, ['#ffffff', '#d8d8d8', '#c9c9c9'], 220, 0.45, [4, 14])
      brush(g, rnd, 256, 256, ['#b0b0b0'], 40, 0.25, [1, 3])
    },
    true
  )
}

/** Bản vẽ kỹ thuật (giấy xanh, nét trắng): lưới, bánh răng, phác thảo robot, mũi tên kích thước */
export function blueprintTexture(): CanvasTexture {
  return make('blueprint', 512, 360, (g, rnd) => {
    g.fillStyle = '#1f4f7c'
    g.fillRect(0, 0, 512, 360)
    brush(g, rnd, 512, 360, ['#26598a', '#1a4369'], 120, 0.3, [8, 20])
    g.strokeStyle = '#dcecff'
    g.globalAlpha = 0.14
    g.lineWidth = 1
    for (let x = 16; x < 512; x += 24) {
      g.beginPath()
      g.moveTo(x, 12)
      g.lineTo(x, 348)
      g.stroke()
    }
    for (let y = 12; y < 360; y += 24) {
      g.beginPath()
      g.moveTo(12, y)
      g.lineTo(500, y)
      g.stroke()
    }
    g.globalAlpha = 0.85
    g.lineWidth = 2
    g.strokeRect(12, 12, 488, 336)
    // Bánh răng
    g.beginPath()
    for (let i = 0; i <= 24; i++) {
      const a = (Math.PI * 2 * i) / 24
      const r = i % 2 ? 58 : 70
      const px = 140 + Math.cos(a) * r
      const py = 170 + Math.sin(a) * r
      if (i === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.stroke()
    g.beginPath()
    g.arc(140, 170, 20, 0, Math.PI * 2)
    g.stroke()
    // Phác thảo đầu robot + ăng-ten
    g.strokeRect(300, 120, 120, 90)
    g.strokeRect(318, 140, 84, 50)
    g.beginPath()
    g.arc(340, 165, 7, 0, Math.PI * 2)
    g.arc(380, 165, 7, 0, Math.PI * 2)
    g.moveTo(360, 120)
    g.lineTo(360, 92)
    g.stroke()
    g.beginPath()
    g.moveTo(360, 80)
    g.lineTo(368, 92)
    g.lineTo(360, 104)
    g.lineTo(352, 92)
    g.closePath()
    g.stroke()
    // Mũi tên kích thước + "chữ viết tay"
    g.lineWidth = 1.2
    g.beginPath()
    g.moveTo(300, 236)
    g.lineTo(420, 236)
    g.moveTo(300, 230)
    g.lineTo(300, 242)
    g.moveTo(420, 230)
    g.lineTo(420, 242)
    g.stroke()
    for (let l = 0; l < 5; l++) {
      g.beginPath()
      let x = 40
      const y = 285 + l * 12
      g.moveTo(x, y)
      while (x < 230 - rnd() * 60) {
        x += 6 + rnd() * 8
        g.lineTo(x, y + (rnd() - 0.5) * 3)
      }
      g.stroke()
    }
  })
}

/** Graffiti neon trên tường — chỉ phát sáng khi tắt đèn (sơn phát quang) */
export function graffitiTexture(): CanvasTexture {
  return make('graffiti', 512, 256, (g, rnd) => {
    g.clearRect(0, 0, 512, 256)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const neon = (color: string, width: number, path: () => void): void => {
      g.save()
      g.strokeStyle = color
      g.shadowColor = color
      g.shadowBlur = 14
      g.lineWidth = width
      g.beginPath()
      path()
      g.stroke()
      g.restore()
    }
    // Tia chớp
    neon('#ff4fa3', 7, () => {
      g.moveTo(40, 40)
      g.lineTo(90, 110)
      g.lineTo(70, 115)
      g.lineTo(120, 200)
    })
    // Ngôi sao
    neon('#46e3ff', 5, () => {
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 5
        const r = i % 2 ? 18 : 42
        const px = 230 + Math.cos(a) * r
        const py = 90 + Math.sin(a) * r
        if (i === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
    })
    // Mặt quái vật dễ thương: đầu tròn, mắt chữ X, răng
    neon('#7dffb0', 5, () => {
      g.arc(380, 120, 55, 0, Math.PI * 2)
    })
    neon('#7dffb0', 4, () => {
      g.moveTo(352, 100)
      g.lineTo(368, 116)
      g.moveTo(368, 100)
      g.lineTo(352, 116)
      g.moveTo(392, 100)
      g.lineTo(408, 116)
      g.moveTo(408, 100)
      g.lineTo(392, 116)
      g.moveTo(355, 142)
      for (let i = 0; i < 6; i++) g.lineTo(360 + i * 9, i % 2 ? 142 : 152)
    })
    // Mũi tên + chữ ký nguệch ngoạc
    neon('#ff4fa3', 4, () => {
      g.moveTo(150, 215)
      g.quadraticCurveTo(220, 170, 290, 210)
      g.moveTo(290, 210)
      g.lineTo(272, 200)
      g.moveTo(290, 210)
      g.lineTo(278, 226)
    })
    // Vết sơn bắn + chảy
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = 0.8
      g.fillStyle = ['#ff4fa3', '#46e3ff', '#7dffb0'][i % 3]
      g.beginPath()
      g.arc(20 + rnd() * 470, 20 + rnd() * 220, 1 + rnd() * 4, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 0.7
    g.fillStyle = '#ff4fa3'
    for (const x of [96, 112, 128]) g.fillRect(x, 200, 3, 30 + rnd() * 20)
  })
}

/** Vệt nắng xuyên qua cửa sổ (dải sáng mờ dần) */
export function beamTexture(): CanvasTexture {
  return make('beam', 64, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, 'rgba(255,214,150,0.55)')
    grad.addColorStop(0.6, 'rgba(255,200,130,0.18)')
    grad.addColorStop(1, 'rgba(255,190,120,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 256)
    // Mép dải mềm
    const side = g.createLinearGradient(0, 0, 64, 0)
    side.addColorStop(0, 'rgba(0,0,0,1)')
    side.addColorStop(0.3, 'rgba(0,0,0,0)')
    side.addColorStop(0.7, 'rgba(0,0,0,0)')
    side.addColorStop(1, 'rgba(0,0,0,1)')
    g.globalCompositeOperation = 'destination-out'
    g.fillStyle = side
    g.fillRect(0, 0, 64, 256)
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
    [0, 'rgba(0,0,0,0.6)'],
    [0.45, 'rgba(0,0,0,0.3)'],
    [1, 'rgba(0,0,0,0)']
  ])
}

/** Quầng sáng cộng màu (pha lê, mắt robot, bóng đèn) */
export function haloTexture(): CanvasTexture {
  return radial('halo', 64, [
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,255,255,0.45)'],
    [1, 'rgba(255,255,255,0)']
  ])
}

/** Vignette: giữa trong suốt, tối dần ra mép khung hình (chiều sâu như tranh vẽ) */
export function vignetteTexture(): CanvasTexture {
  return radial('vignette', 256, [
    [0, 'rgba(8,5,4,0)'],
    [0.6, 'rgba(8,5,4,0)'],
    [0.85, 'rgba(8,5,4,0.32)'],
    [1, 'rgba(8,5,4,0.62)']
  ])
}
