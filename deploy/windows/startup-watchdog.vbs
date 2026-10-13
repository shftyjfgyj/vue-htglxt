' htglxt 守护进程自启（隐藏窗口）
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """E:\Desktop\try-again\vue-htglxt\deploy\windows\watchdog.ps1"""", 0, False
