@echo off
rem Liga o MySQL (se preciso) e o sistema na porta 3001. Deixe esta janela aberta.
cd /d "%~dp0.."
call "%~dp0iniciar-mysql.bat"
if not exist client\dist\index.html (echo Gerando a interface... & call npm run build)
npm start
