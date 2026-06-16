// Раньше этот скрипт создавал локальный JSON-файл базы.
// Теперь данные в MySQL — схема и сиды лежат в schema.sql.
//
// Импорт схемы в MySQL:
//   mysql -h HOST -u USER -p DBNAME < schema.sql
//   либо через phpMyAdmin -> Импорт (см. RENDER.md).
//
// Скрипт оставлен как no-op, чтобы старый start.bat не падал.

console.log('Схема БД управляется через schema.sql (MySQL). См. RENDER.md.');
console.log('Импорт: mysql -h HOST -u USER -p DBNAME < schema.sql');
