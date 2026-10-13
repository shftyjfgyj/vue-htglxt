@echo off
rem htglxt 后端启动器（供计划任务 / 启动文件夹调用，避免引号被 cmd 吞掉）
rem 仓库根由本脚本位置推导（deploy\windows\ 的上两级），不写死绝对路径
cd /d "%~dp0..\.."
"C:\Program Files\nodejs\node.exe" apps\server\dist\index.js
