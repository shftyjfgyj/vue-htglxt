# htglxt 守护进程：每 5 分钟检查一次，端口不通就拉起服务（幂等）
# 由启动文件夹中的 htglxt-watchdog.vbs 以隐藏窗口方式常驻
$repo = 'E:\Desktop\try-again\vue-htglxt'
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'watchdog.log'

function Write-Log([string]$message) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $message
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

Write-Log '守护进程启动'

while ($true) {
  try {
    if (-not (Test-Port 3001)) {
      Start-Process -FilePath (Join-Path $repo 'deploy\windows\run-api.cmd') -WorkingDirectory $repo -WindowStyle Hidden
      Write-Log '后端未监听 3001，已拉起'
    }
    if (-not (Test-Port 8080)) {
      $nginxRoot = Join-Path $repo '.tmp-nginx\nginx-1.28.0'
      Start-Process -FilePath (Join-Path $nginxRoot 'nginx.exe') -ArgumentList @('-p', $nginxRoot, '-c', 'conf/htglxt.conf') -WorkingDirectory $nginxRoot -WindowStyle Hidden
      Write-Log 'nginx 未监听 8080，已拉起'
    }
  } catch {
    Write-Log ('守护检查异常: ' + $_.Exception.Message)
  }
  Start-Sleep -Seconds 300
}
