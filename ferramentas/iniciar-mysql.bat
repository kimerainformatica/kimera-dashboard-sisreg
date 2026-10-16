@echo off
rem Liga o MySQL local (versao ZIP, sem servico do Windows) em segundo plano.
set MYSQL_DIR=%USERPROFILE%\MySQL
"%MYSQL_DIR%\mysql-8.4.9-winx64\bin\mysqladmin.exe" --protocol=tcp -h 127.0.0.1 -u dashboard --connect-timeout=2 ping >nul 2>&1 && (echo MySQL ja esta rodando. & goto :eof)
echo Iniciando MySQL...
start "MySQL" /min "%MYSQL_DIR%\mysql-8.4.9-winx64\bin\mysqld.exe" --defaults-file="%MYSQL_DIR%\my.ini"
timeout /t 5 /nobreak >nul
echo Pronto. Log de erros: %MYSQL_DIR%\mysql-erro.log
