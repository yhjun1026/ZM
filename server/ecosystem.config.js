module.exports = {
  apps: [
    {
      name: 'zhuomeng-office',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      // SQLite 单写者，暂用 fork 单实例；迁移 MySQL 后可改 cluster 多实例
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
