Set WshShell = CreateObject("WScript.Shell")
exePath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run """" & exePath & "\绝区零抽卡分析工具.exe""", 1, False
