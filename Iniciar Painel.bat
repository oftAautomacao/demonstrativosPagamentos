@echo off
title Demonstrativos de Pagamento
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado neste computador.
  echo Instale o Node.js 18 ou superior e tente novamente.
  pause
  exit /b 1
)

echo Iniciando o painel de demonstrativos...
where python >nul 2>nul
if errorlevel 1 (
  echo Aviso: Python nao foi encontrado. A aba de Ajuste TUSS nao estara disponivel.
) else (
  python -c "import openpyxl, fitz" >nul 2>nul
  if errorlevel 1 (
    echo Aviso: para usar o Ajuste TUSS, execute: python -m pip install -r requirements.txt
  )
)
node server.js --open

echo.
echo O painel foi encerrado.
pause
