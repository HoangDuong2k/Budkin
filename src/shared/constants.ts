/** Định danh app — trùng `appId` trong electron-builder.yml (có test kiểm tra). Windows dùng làm AppUserModelId */
export const APP_ID = 'com.budkin.app'
export const APP_NAME = 'Budkin'

/** Cửa sổ nhỏ nhất: màn hình máy tính 3D ở giữa còn khoảng 594×396 px cho giao diện */
export const MIN_WINDOW = { width: 1024, height: 680 } as const
export const DEFAULT_WINDOW = { width: 1280, height: 820 } as const
