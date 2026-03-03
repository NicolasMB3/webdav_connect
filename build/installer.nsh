!macro customInit
  ; Check if WinFsp is already installed
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\WinFsp" "InstallDir"
  StrCmp $0 "" 0 winfsp_ok
    ; WinFsp not found, install it silently
    File /oname=$TEMP\winfsp.msi "${BUILD_RESOURCES_DIR}\winfsp.msi"
    ExecWait 'msiexec /i "$TEMP\winfsp.msi" /qn /norestart INSTALLLEVEL=1000' $1
    Delete "$TEMP\winfsp.msi"
    IntCmp $1 0 winfsp_ok
    IntCmp $1 3010 winfsp_ok
    MessageBox MB_OK|MB_ICONEXCLAMATION "L'installation de WinFsp a echoue (code: $1). CMC Drive necessite WinFsp pour fonctionner."
    Abort
  winfsp_ok:
!macroend
