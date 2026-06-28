// Фасад БД. Раньше хранил данные в JSON-файле, теперь — в MySQL.
// Экспорт намеренно тот же (data, save, nextId), чтобы роуты не менялись.
// Реальная инициализация (init) вызывается из server.js до старта сервера.

const backend = require('./db-mysql');

module.exports = {
  data: backend.data,
  save: backend.save,
  nextId: backend.nextId,
  init: backend.init,
  reload: backend.reload,
};
