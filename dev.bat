@echo off
setlocal
pushd %~dp0
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "Set-Location -LiteralPath '%~dp0'; & npm.cmd run dev"
popd
