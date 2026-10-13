@echo off
rem htglxt 前端 nginx 启动器
rem nginx 目录由本脚本位置推导（deploy\windows\ 的上两级 + .tmp-nginx），不写死绝对路径
cd /d "%~dp0..\..\.tmp-nginx\nginx-1.28.0"
nginx.exe -p . -c conf/htglxt.conf
