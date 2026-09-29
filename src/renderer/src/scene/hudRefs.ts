// Phần tử DOM của lớp HUD mà cảnh 3D đặt vị trí trực tiếp mỗi khung (không qua state React)
export const hud = {
  zzz: null as HTMLElement | null,
  /** Có phần tử cần bám theo đầu robot (bong bóng thoại) */
  anchor: false,
  /** Điểm trên đầu robot (CSS px) */
  anchorX: 0,
  anchorY: 0,
  lampButton: null as HTMLElement | null,
  robotButton: null as HTMLElement | null
}
