# 查看 htglxt 运行状态与访问地址
$repo = 'E:\Desktop\try-again\vue-htglxt'

Write-Host '=== 进程 ===' -ForegroundColor Cyan
$api = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*apps\server\dist\index.js*' }
$nginxProc = Get-Process nginx -ErrorAction SilentlyContinue
$wd = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*watchdog.ps1*' }
Write-Host ('  后端   : ' + $(if ($api) { '运行中 PID ' + ($api.ProcessId -join ',') } else { '未运行' }))
Write-Host ('  nginx  : ' + $(if ($nginxProc) { '运行中 PID ' + (($nginxProc | Select-Object -First 3).Id -join ',') } else { '未运行' }))
Write-Host ('  守护   : ' + $(if ($wd) { '运行中' } else { '未运行' }))

Write-Host '=== 端口 ===' -ForegroundColor Cyan
foreach ($p in 8080, 3001) {
  $ok = [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
  Write-Host ('  ' + $p + ' : ' + $(if ($ok) { '监听中' } else { '未监听' }))
}

Write-Host '=== 健康检查 ===' -ForegroundColor Cyan
try { $h = Invoke-RestMethod 'http://127.0.0.1:3001/health' -TimeoutSec 5; Write-Host ('  后端 : ' + $h.data.status + ' / db=' + $h.data.db) } catch { Write-Host ('  后端不可用: ' + $_.Exception.Message) -ForegroundColor Red }
try { $f = Invoke-WebRequest 'http://127.0.0.1:8080/' -UseBasicParsing -TimeoutSec 5; Write-Host ('  前端 : HTTP ' + $f.StatusCode) } catch { Write-Host ('  前端不可用: ' + $_.Exception.Message) -ForegroundColor Red }

Write-Host ''
Write-Host '=== 访问地址 ===' -ForegroundColor Green
Write-Host '  本机   : http://127.0.0.1:8080'
Write-Host '  局域网 : http://192.168.0.82:8080'
Write-Host '  账号   : admin / Admin@123456（请登录后立即修改）'
