# 服务守护：端口不通才拉起（幂等，可安全地被计划任务每 5 分钟执行一次）
$repo = 'E:\Desktop\try-again\vue-htglxt'
$started = @()

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Port 3001)) {
  Start-Process -FilePath (Join-Path $repo 'deploy\windows\run-api.cmd') -WorkingDirectory $repo -WindowStyle Hidden
  $started += 'api(3001)'
}

if (-not (Test-Port 8080)) {
  $nginxRoot = Join-Path $repo '.tmp-nginx\nginx-1.28.0'
  Start-Process -FilePath (Join-Path $nginxRoot 'nginx.exe') -ArgumentList @('-p', $nginxRoot, '-c', 'conf/htglxt.conf') -WorkingDirectory $nginxRoot -WindowStyle Hidden
  $started += 'nginx(8080)'
}

if ($started.Count -gt 0) {
  Write-Output ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' 看门狗已拉起: ' + ($started -join ', '))
}
