# 停止 htglxt（保留数据库与文件，仅停服务）
$repo = 'E:\Desktop\try-again\vue-htglxt'
$nginxRoot = Join-Path $repo '.tmp-nginx\nginx-1.28.0'

if (Get-Process nginx -ErrorAction SilentlyContinue) {
  & (Join-Path $nginxRoot 'nginx.exe') -p $nginxRoot -c conf/htglxt.conf -s quit 2>$null
  Write-Host 'nginx 已停止'
} else { Write-Host 'nginx 未在运行' }

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*apps\server\dist\index.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('已停止后端 PID ' + $_.ProcessId) }

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*watchdog.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host '已停止守护进程' }
