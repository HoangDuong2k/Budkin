// Chế độ vẽ đang dùng (kiểm thử đọc; đổi khi cảnh 3D lỗi và chuyển sang 2D)
import type { RenderDecision } from '../../../shared/renderMode'

export const renderInfo: RenderDecision & { renderer: string } = { mode: '3d', software: false, reason: 'ok', renderer: '' }
