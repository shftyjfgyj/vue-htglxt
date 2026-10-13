// PM2 进程配置（非容器部署：配合宿主机 nginx + MySQL）
module.exports = {
  apps: [
    {
      name: 'htglxt-api',
      cwd: './apps/server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      // 注意：PM2 的相对日志路径按 cwd（apps/server）解析，故用 ../../ 回到仓库根 logs/
      error_file: '../../logs/api-error.log',
      out_file: '../../logs/api-out.log',
      merge_logs: true,
      time: true,
      kill_timeout: 10000,
      listen_timeout: 15000,
      autorestart: true,
      max_restarts: 10
    }
  ]
};
