' htglxt 守护进程自启（隐藏窗口）
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' 仓库根由本脚本位置推导（deploy\windows\*.vbs 的上两级），不写死绝对路径
repo = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & repo & "\deploy\windows\watchdog.ps1""", 0, False
