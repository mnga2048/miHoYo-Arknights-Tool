!macro customInstall
  CreateShortCut "$DESKTOP\绝区零抽卡分析工具.lnk" "wscript.exe" '"$INSTDIR\start.vbs"' "$INSTDIR\绝区零抽卡分析工具.exe" 0
  CreateShortCut "$SMPROGRAMS\绝区零抽卡分析工具.lnk" "wscript.exe" '"$INSTDIR\start.vbs"' "$INSTDIR\绝区零抽卡分析工具.exe" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\绝区零抽卡分析工具.lnk"
  Delete "$SMPROGRAMS\绝区零抽卡分析工具.lnk"
!macroend
