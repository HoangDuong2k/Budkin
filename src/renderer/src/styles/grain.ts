// Vân giấy / vân sơn cho giao diện (cảm giác vẽ tay): ảnh nhiễu nhỏ tạo bằng canvas lúc chạy, đặt vào biến CSS --grain.
// Chấm vừa sáng vừa tối, độ mờ rất thấp — dùng chung cho nền giấy da (ngày) lẫn nền tối (đêm).

export function installGrain(): void {
  const size = 160
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (!g) return
  const img = g.createImageData(size, size)
  let seed = 1234567
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < size * size; i++) {
    const light = rnd() < 0.5
    const v = light ? 255 : 30
    img.data[i * 4] = v
    img.data[i * 4 + 1] = light ? 245 : 20
    img.data[i * 4 + 2] = light ? 225 : 10
    img.data[i * 4 + 3] = Math.floor(rnd() * rnd() * 34)
  }
  g.putImageData(img, 0, 0)
  // Vài vệt cọ dài, rất mờ
  g.globalAlpha = 0.014
  g.lineCap = 'round'
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = rnd() < 0.5 ? '#fff4dc' : '#1e140c'
    g.lineWidth = 2 + rnd() * 5
    g.beginPath()
    const x = rnd() * size
    const y = rnd() * size
    g.moveTo(x, y)
    g.quadraticCurveTo(x + 30 * rnd(), y + 10 * (rnd() - 0.5), x + 40 + 40 * rnd(), y + 12 * (rnd() - 0.5))
    g.stroke()
  }
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`)
}
