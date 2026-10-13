# Smoke test for M2 auth + RBAC (API server must be running on :3001)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-test.ps1
$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3001'
$script:pass = 0
$script:fail = 0

function Check($name, [scriptblock]$action) {
  try {
    $result = & $action
    if ($result) { Write-Host ('[PASS] ' + $name) -ForegroundColor Green; $script:pass++ }
    else { Write-Host ('[FAIL] ' + $name) -ForegroundColor Red; $script:fail++ }
  } catch {
    Write-Host ('[FAIL] ' + $name + ' -> ' + $_.Exception.Message) -ForegroundColor Red
    $script:fail++
  }
}

function Invoke-Json($method, $path, $body, $token) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = 'Bearer ' + $token }
  $params = @{ Method = $method; Uri = ($base + $path); Headers = $headers; ContentType = 'application/json' }
  if ($body) { $params['Body'] = ($body | ConvertTo-Json -Depth 6) }
  return Invoke-RestMethod @params
}

function Status-Of($method, $path, $body, $token) {
  try {
    $null = Invoke-Json $method $path $body $token
    return 200
  } catch {
    return [int]$_.Exception.Response.StatusCode
  }
}

Write-Host '=== 1. health ==='
Check 'GET /health reports up' {
  $r = Invoke-Json 'GET' '/health' $null $null
  $r.data.status -eq 'up' -and $r.data.db -eq 'up'
}

Write-Host '=== 2. login and tokens ==='
$admin = Invoke-Json 'POST' '/api/v1/auth/login' @{ username = 'admin'; password = 'Admin@123456' } $null
Check 'admin login returns access + refresh token' { $admin.code -eq 0 -and $admin.data.accessToken -and $admin.data.refreshToken }
Check 'admin holds wildcard permission' { $admin.data.user.permissions -contains '*' }
Check 'wrong password -> 400' { (Status-Of 'POST' '/api/v1/auth/login' @{ username = 'admin'; password = 'wrong-password' } $null) -eq 400 }

$adminToken = $admin.data.accessToken
Check 'GET /auth/profile returns roles' {
  $p = Invoke-Json 'GET' '/api/v1/auth/profile' $null $adminToken
  $p.data.username -eq 'admin' -and ($p.data.roles -contains 'admin')
}
Check 'protected endpoint without token -> 401' { (Status-Of 'GET' '/api/v1/users' $null $null) -eq 401 }

Write-Host '=== 3. RBAC enforcement ==='
Check 'admin can list users' {
  $u = Invoke-Json 'GET' '/api/v1/users?page=1&pageSize=10' $null $adminToken
  $u.data.total -ge 3
}
$editor = Invoke-Json 'POST' '/api/v1/auth/login' @{ username = 'editor'; password = 'Editor@123456' } $null
$editorToken = $editor.data.accessToken
$viewer = Invoke-Json 'POST' '/api/v1/auth/login' @{ username = 'viewer'; password = 'Viewer@123456' } $null
$viewerToken = $viewer.data.accessToken

Check 'editor listing users -> 403' { (Status-Of 'GET' '/api/v1/users' $null $editorToken) -eq 403 }
Check 'editor listing roles -> 403' { (Status-Of 'GET' '/api/v1/roles' $null $editorToken) -eq 403 }
Check 'viewer listing roles -> 403' { (Status-Of 'GET' '/api/v1/roles' $null $viewerToken) -eq 403 }
Check 'editor creating user -> 403' { (Status-Of 'POST' '/api/v1/users' @{ username = 'hacker'; password = 'Hacker@123' } $editorToken) -eq 403 }
Check 'editor granting admin role -> 403' { (Status-Of 'PUT' '/api/v1/users/2/roles' @{ roleIds = @(1) } $editorToken) -eq 403 }
Check 'admin can update user roles' {
  $r = Invoke-Json 'PUT' '/api/v1/users/3/roles' @{ roleIds = @(3) } $adminToken
  $r.code -eq 0
}

Write-Host '=== 4. permission-filtered menus ==='
Check 'admin menu contains /system/users' {
  $m = Invoke-Json 'GET' '/api/v1/menus' $null $adminToken
  ($m.data | ConvertTo-Json -Depth 8 -Compress) -match '/system/users'
}
Check 'editor menu hides /system/users and /system/roles' {
  $m = Invoke-Json 'GET' '/api/v1/menus' $null $editorToken
  $json = $m.data | ConvertTo-Json -Depth 8 -Compress
  ($json -notmatch '/system/users') -and ($json -notmatch '/system/roles')
}

Write-Host '=== 5. audit and login logs ==='
Check 'operation log captured admin action' {
  $l = Invoke-Json 'GET' '/api/v1/logs/operation?page=1&pageSize=20' $null $adminToken
  $l.data.total -ge 1
}
Check 'login log captured failed attempt' {
  $l = Invoke-Json 'GET' '/api/v1/logs/login?success=0' $null $adminToken
  $l.data.total -ge 1
}
Check 'editor reading operation logs -> 403' { (Status-Of 'GET' '/api/v1/logs/operation' $null $editorToken) -eq 403 }

Write-Host '=== 6. refresh token rotation ==='
Check 'refresh works and old token is revoked' {
  $r = Invoke-Json 'POST' '/api/v1/auth/refresh' @{ refreshToken = $editor.data.refreshToken } $null
  $reused = Status-Of 'POST' '/api/v1/auth/refresh' @{ refreshToken = $editor.data.refreshToken } $null
  $r.code -eq 0 -and $reused -eq 401
}

Write-Host '=== 7. validation and account status ==='
Check 'invalid pageSize -> 422' { (Status-Of 'GET' '/api/v1/users?pageSize=9999' $null $adminToken) -eq 422 }
Check 'weak password -> 422' { (Status-Of 'POST' '/api/v1/users' @{ username = 'weakuser'; password = '123' } $adminToken) -eq 422 }
Check 'disabled account cannot login (403)' {
  $null = Invoke-Json 'PUT' '/api/v1/users/3/status' @{ status = 0 } $adminToken
  $code = Status-Of 'POST' '/api/v1/auth/login' @{ username = 'viewer'; password = 'Viewer@123456' } $null
  $null = Invoke-Json 'PUT' '/api/v1/users/3/status' @{ status = 1 } $adminToken
  $code -eq 403
}

Write-Host '=== 8. api docs ==='
Check 'GET /docs/ reachable' {
  try { $r = Invoke-WebRequest -Uri ($base + '/docs/') -UseBasicParsing; $r.StatusCode -eq 200 } catch { $false }
}
Check 'GET /docs.json returns OpenAPI 3.0.3' {
  $d = Invoke-Json 'GET' '/docs.json' $null $null
  $d.openapi -eq '3.0.3' -and $d.paths.'/api/v1/auth/login'
}

Write-Host ''
Write-Host ('===== result: passed ' + $script:pass + ' / failed ' + $script:fail + ' =====') -ForegroundColor Cyan
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
