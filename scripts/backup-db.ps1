# 数据库备份脚本（Windows / PowerShell）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-db.ps1
#       -Database htglxt_v2 -OutDir backups -Keep 14 -Mysqldump 'C:\path\to\mysqldump.exe'
param(
  [string]$Database = '',
  [string]$OutDir = 'backups',
  [int]$Keep = 14,
  [string]$Mysqldump = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'apps\server\.env'
if (-not (Test-Path $envFile)) { throw "找不到 $envFile，请先配置后端环境变量" }

# 读取 .env
$config = @{}
Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $index = $_.IndexOf('=')
  $config[$_.Substring(0, $index).Trim()] = $_.Substring($index + 1).Trim()
}
if (-not $Database) { $Database = $config['DB_DATABASE'] }
$dbHost = if ($config['DB_HOST']) { $config['DB_HOST'] } else { '127.0.0.1' }
$dbPort = if ($config['DB_PORT']) { $config['DB_PORT'] } else { '3306' }
$dbUser = if ($config['DB_USER']) { $config['DB_USER'] } else { 'root' }
$dbPassword = $config['DB_PASSWORD']

# 定位 mysqldump
if (-not $Mysqldump) {
  $cmd = Get-Command mysqldump -ErrorAction SilentlyContinue
  if ($cmd) { $Mysqldump = $cmd.Source }
}
if (-not $Mysqldump -or -not (Test-Path $Mysqldump)) { throw '未找到 mysqldump，请用 -Mysqldump 指定完整路径' }

$targetDir = Join-Path $root $OutDir
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $targetDir ('{0}-{1}.sql' -f $Database, $stamp)

Write-Host ('开始备份 {0}@{1}:{2}/{3} -> {4}' -f $dbUser, $dbHost, $dbPort, $Database, $file)
# 用 defaults 文件传密码，避免密码出现在命令行
$cnf = Join-Path ([System.IO.Path]::GetTempPath()) ('htglxt-backup-{0}.cnf' -f $stamp)
[System.IO.File]::WriteAllText($cnf, ("[client]`nuser=$dbUser`npassword=$dbPassword`nhost=$dbHost`nport=$dbPort`n"))

try {
  & $Mysqldump ("--defaults-extra-file=$cnf") '--single-transaction' '--routines' '--triggers' '--events' '--set-gtid-purged=OFF' '--default-character-set=utf8mb4' $Database > $file
  if ($LASTEXITCODE -ne 0) { throw "mysqldump 退出码 $LASTEXITCODE" }
} finally {
  Remove-Item -Force $cnf -ErrorAction SilentlyContinue
}

$size = (Get-Item $file).Length
if ($size -lt 1024) { throw '备份文件过小，可能失败' }
Write-Host ('备份完成: {0} ({1:N1} KB)' -f $file, ($size / 1KB)) -ForegroundColor Green

# 保留最近 N 份
Get-ChildItem $targetDir -Filter ('{0}-*.sql' -f $Database) | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | ForEach-Object {
  Remove-Item $_.FullName -Force
  Write-Host ('已清理过期备份: {0}' -f $_.Name)
}
