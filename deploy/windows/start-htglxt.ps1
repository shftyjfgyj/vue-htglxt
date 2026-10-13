# 启动 htglxt（后端 Node 3001 + nginx 8080 + 守护进程）
$ErrorActionPreference = 'Continue'
$repo = 'E:\Desktop\try-again\vue-htglxt'
$nginxRoot = Join-Path $repo '.tmp-nginx\nginx-1.28.0'
$node = (Get-Command node).Source

function Test-Port([int]$port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

if (-not (Test-Port 3001)) {
  Start-Process -FilePath $node -ArgumentList 'apps\server\dist\index.js' -WorkingDirectory $repo -WindowStyle Hidden
  Write-Host '已启动后端 -> 3001' -ForegroundColor Green
} else { Write-Host '后端已在运行 (3001)' }

if (-not (Test-Port 8080)) {
  Start-Process -FilePath (Join-Path $nginxRoot 'nginx.exe') -ArgumentList @('-p', $nginxRoot, '-c', 'conf/htglxt.conf') -WorkingDirectory $nginxRoot -WindowStyle Hidden
  Write-Host '已启动 nginx -> 8080' -ForegroundColor Green
} else { Write-Host 'nginx 已在运行 (8080)' }

# 守护进程（崩溃自愈）
$wd = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*watchdog.ps1*' }
if (-not $wd) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $repo + '\deploy\windows\watchdog.ps1"') -WindowStyle Hidden
  Write-Host '已启动守护进程' -ForegroundColor Green
} else { Write-Host '守护进程已在运行' }

Start-Sleep -Seconds 3
& (Join-Path $PSScriptRoot 'status-htglxt.ps1')
