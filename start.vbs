Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
exeDir = FSO.GetParentFolderName(WScript.ScriptFullName)
exePath = exeDir & "\绝区零抽卡分析工具.exe"

' Remove ELECTRON_RUN_AS_NODE from current process environment
On Error Resume Next
WshShell.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0

' Launch via cmd.exe to ensure clean environment
WshShell.Run "cmd.exe /C set ELECTRON_RUN_AS_NODE= && start "" """ & exePath & """", 0, False
