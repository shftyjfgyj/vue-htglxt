@echo off
rem htglxt 后端启动器（供计划任务 / 启动文件夹调用，避免引号被 cmd 吞掉）
cd /d E:\Desktop\try-again\vue-htglxt
"C:\Program Files\nodejs\node.exe" apps\server\dist\index.js
