// Nhiễu mịn cho nền giao diện: ảnh nhỏ tạo bằng canvas lúc chạy, đặt vào biến CSS --grain. Độ mờ rất thấp — xoá dải màu
// trên nền tối, thêm chút bụi cho màn hình giữa thế giới đổ nát mà không làm giao diện bẩn.

export function installGrain(): void {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (!g) return
  const img = g.createImageData(size, size)
  let seed = 1234567
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < size * size; i++) {
    const light = rnd() < 0.5
    img.data[i * 4] = light ? 226 : 0
    img.data[i * 4 + 1] = light ? 225 : 0
    img.data[i * 4 + 2] = light ? 221 : 0
    // Thỉnh thoảng một hạt bụi rõ hơn
    img.data[i * 4 + 3] = rnd() < 0.004 ? 40 : Math.floor(rnd() * 14)
  }
  g.putImageData(img, 0, 0)
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`)
}
