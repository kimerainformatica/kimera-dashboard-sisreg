@echo off
rem Registra o MySQL como servico do Windows (liga sozinho com o computador).
rem Execute com o botao direito > "Executar como administrador". Antes, feche o MySQL aberto por iniciar-mysql.bat.
set MYSQL_DIR=%USERPROFILE%\MySQL
"%MYSQL_DIR%\mysql-8.4.9-winx64\bin\mysqld.exe" --install MySQL84 --defaults-file="%MYSQL_DIR%\my.ini"
sc config MySQL84 start= auto
net start MySQL84
pause
