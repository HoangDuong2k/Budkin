; Tuỳ biến bộ cài NSIS (electron-builder nạp qua nsis.include)

!macro customUnInstall
  ; Gỡ hẳn app (không phải cập nhật lên bản mới): xoá mục "khởi động cùng Windows" do app đã ghi
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.deskbuddy.app"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.deskbuddy.app"
  ${endIf}
!macroend
