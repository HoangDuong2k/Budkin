// Tìm kiếm không dấu: "bao cao" tìm ra "Báo cáo". Chuẩn hoá bằng JS vì lower() của SQLite chỉ xử lý ASCII.

/** Chữ thường, bỏ dấu tiếng Việt (kể cả đ/Đ), gộp khoảng trắng */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Chuỗi lưu trong cột search_text của task */
export function taskSearchText(title: string, notes: string): string {
  return normalizeText(`${title} ${notes}`)
}

/** Các từ khoá (đã chuẩn hoá) — task phải chứa đủ mọi từ */
export function searchTerms(query: string): string[] {
  return [...new Set(normalizeText(query).split(' ').filter(Boolean))].slice(0, 8)
}
