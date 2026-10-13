@echo off
rem htglxt 前端 nginx 启动器
cd /d E:\Desktop\try-again\vue-htglxt\.tmp-nginx\nginx-1.28.0
nginx.exe -p . -c conf/htglxt.conf
