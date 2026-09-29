// Thứ tự thủ công (Kanban, checklist, dự án): số thực, chèn vào giữa hai phần tử kề nhau.
// Khi khoảng cách quá nhỏ thì đánh số lại cả cột theo bước ORDER_STEP.

export const ORDER_STEP = 1024
const MIN_GAP = 1e-6

/**
 * Vị trí mới nằm giữa `before` (phần tử ngay trên) và `after` (ngay dưới); null nếu không còn chỗ
 * (cần đánh số lại). Không có before/after nghĩa là đặt ở đầu/cuối.
 */
export function orderBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return ORDER_STEP
  if (before === null) return after! - ORDER_STEP
  if (after === null) return before + ORDER_STEP
  if (after - before < MIN_GAP * 2) return null
  return (before + after) / 2
}

/** Thứ tự đánh lại: ORDER_STEP, 2·ORDER_STEP, … theo đúng thứ tự hiện có */
export function renumber(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP)
}
