// Phần tử DOM của lớp HUD mà cảnh 3D đặt vị trí trực tiếp mỗi khung (không qua state React)
export const hud = {
  zzz: null as HTMLElement | null,
  /** Bong bóng thoại bám theo đầu robot, và kích thước đo được của nó */
  bubble: null as HTMLElement | null,
  bubbleW: 0,
  bubbleH: 0,
  lampButton: null as HTMLElement | null,
  robotButton: null as HTMLElement | null,
  pedestalButton: null as HTMLElement | null
}
