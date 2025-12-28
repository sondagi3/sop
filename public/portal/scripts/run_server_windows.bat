\
@echo off
setlocal
cd /d %~dp0..
py tools\serve_portal.py
endlocal
