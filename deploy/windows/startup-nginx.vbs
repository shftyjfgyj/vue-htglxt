' htglxt 前端 nginx 自启（隐藏窗口）
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' 仓库根由本脚本位置推导（deploy\windows\*.vbs 的上两级），不写死绝对路径
repo = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.Run """" & repo & "\deploy\windows\run-nginx.cmd""", 0, False
