/* ============================================================
   Loader Admin — встраиваемый раздел админ-панели.
   Монтируется в <div id="loaderAdminMount"> по вызову
   window.__mountLoaderAdmin() (триггерится из вкладки "Loader").
   Использует тот же authToken из localStorage, что и сайт.
   ============================================================ */
(function () {
  'use strict';

  var API = '/api';
  var VERSIONS = ['1.21.4', '1.21.8', '1.21.11'];
  var selVer = VERSIONS[0];
  var cfg = {};

  function token() { return localStorage.getItem('authToken') || ''; }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() };
    Object.assign(headers, opts.headers || {});
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error('forbidden');
      return r.json();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg, ok) {
    if (ok === undefined) ok = true;
    var el = document.getElementById('laToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'laToast';
      el.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;' +
        'font-size:13px;font-weight:600;z-index:99999;opacity:0;transform:translateY(8px);' +
        'transition:all .3s;pointer-events:none;font-family:inherit;max-width:340px;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = ok ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)';
    el.style.border = '1px solid ' + (ok ? 'rgba(16,185,129,.35)' : 'rgba(239,68,68,.35)');
    el.style.color = ok ? '#10b981' : '#ef4444';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 3000);
  }

  function injectStyles() {
    if (document.getElementById('laStyles')) return;
    var s = document.createElement('style');
    s.id = 'laStyles';
    s.textContent = [
      '.la-wrap{font-family:inherit;color:#f0f0f8;}',
      '.la-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;}',
      '.la-full{grid-column:1/-1;}',
      '.la-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px 22px;}',
      '.la-ch{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px;}',
      '.la-ct{font-size:14px;font-weight:700;color:#fff;}',
      '.la-cs{font-size:12px;color:#8a8a9a;margin-top:2px;}',
      '.la-ico{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(124,58,237,.15);color:#a855f7;font-size:18px;}',
      '.la-trow{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.07);}',
      '.la-trow:last-of-type{border-bottom:none;padding-bottom:0;}',
      '.la-tl{font-size:13px;font-weight:600;color:#f0f0f8;}',
      '.la-td{font-size:12px;color:#8a8a9a;margin-top:2px;}',
      '.la-tg{position:relative;width:42px;height:23px;flex-shrink:0;margin-left:14px;cursor:pointer;}',
      '.la-tg input{display:none;}',
      '.la-sl{position:absolute;inset:0;background:rgba(255,255,255,.12);border-radius:12px;transition:background .2s;}',
      '.la-sl::before{content:"";position:absolute;width:17px;height:17px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.3);}',
      '.la-tg input:checked+.la-sl{background:#7c3aed;}',
      '.la-tg input:checked+.la-sl::before{transform:translateX(19px);}',
      '.la-lbl{display:block;font-size:11px;font-weight:600;color:#8a8a9a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px;}',
      '.la-inp{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:11px 14px;color:#f0f0f8;font-size:13px;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s;}',
      '.la-inp:focus{border-color:rgba(124,58,237,.5);box-shadow:0 0 0 3px rgba(124,58,237,.12);}',
      '.la-inp::placeholder{color:#3a3a4a;}',
      'textarea.la-inp{resize:vertical;min-height:70px;}',
      '.la-br{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}',
      '.la-btn{padding:10px 18px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:all .2s;display:inline-flex;align-items:center;gap:7px;}',
      '.la-bp{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 3px 14px rgba(124,58,237,.3);}',
      '.la-bp:hover{opacity:.9;transform:translateY(-1px);}',
      '.la-bw{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.22);}',
      '.la-bw:hover{background:rgba(245,158,11,.2);}',
      '.la-bd{background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.22);}',
      '.la-bd:hover{background:rgba(239,68,68,.2);}',
      '.la-pills{display:flex;gap:8px;flex-wrap:wrap;}',
      '.la-pill{padding:7px 18px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid rgba(255,255,255,.08);background:transparent;color:#8a8a9a;transition:all .2s;font-family:inherit;}',
      '.la-pill:hover{border-color:rgba(124,58,237,.4);color:#a855f7;}',
      '.la-pill.sel{background:rgba(124,58,237,.18);border-color:rgba(124,58,237,.5);color:#a855f7;}',
      '.la-info{display:flex;gap:8px;align-items:center;font-size:12px;color:#8a8a9a;padding:10px 14px;background:rgba(124,58,237,.05);border:1px solid rgba(124,58,237,.12);border-radius:8px;margin-top:14px;}',
      '.la-tbl{width:100%;border-collapse:collapse;margin-top:4px;}',
      '.la-tbl th{font-size:11px;font-weight:600;color:#8a8a9a;text-transform:uppercase;letter-spacing:.06em;padding:8px 12px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);}',
      '.la-tbl td{font-size:13px;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.04);}',
      '.la-tbl tr:last-child td{border-bottom:none;}',
      '.la-mono{font-family:monospace;font-size:11px;background:rgba(255,255,255,.06);padding:2px 8px;border-radius:4px;color:#8a8a9a;}',
      '.la-vtag{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(124,58,237,.15);color:#a855f7;margin:2px;}',
      '.la-af{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:18px;}',
      '@media(max-width:760px){.la-grid{grid-template-columns:1fr;}.la-af{grid-template-columns:1fr;}}'
    ].join('');
    document.head.appendChild(s);
  }

  function template() {
    return '' +
    '<div class="la-wrap">' +
      '<div class="la-grid">' +
        // Modes
        '<div class="la-card">' +
          '<div class="la-ch"><div><div class="la-ct">Режим работы</div><div class="la-cs">Технические работы и авторизация</div></div><div class="la-ico">&#128295;</div></div>' +
          '<div class="la-trow"><div><div class="la-tl">Технические работы</div><div class="la-td">Лоадер покажет экран ожидания</div></div>' +
            '<label class="la-tg"><input type="checkbox" id="laMaint"><span class="la-sl"></span></label></div>' +
          '<div class="la-trow"><div><div class="la-tl">Отключить авторизацию</div><div class="la-td">Вход без логина и пароля</div></div>' +
            '<label class="la-tg"><input type="checkbox" id="laAuth"><span class="la-sl"></span></label></div>' +
          '<div class="la-br"><button class="la-btn la-bp" id="laSaveModes">Сохранить режимы</button></div>' +
        '</div>' +
        // Message
        '<div class="la-card">' +
          '<div class="la-ch"><div><div class="la-ct">Сообщение техработ</div><div class="la-cs">Показывается в лоадере</div></div><div class="la-ico">&#128172;</div></div>' +
          '<div><label class="la-lbl">Текст сообщения</label><textarea class="la-inp" id="laMsg" placeholder="Уже работаем над этим. Скоро вернёмся!"></textarea></div>' +
          '<div class="la-br"><button class="la-btn la-bp" id="laSaveMsg">Сохранить сообщение</button></div>' +
        '</div>' +
      '</div>' +
      // Versions
      '<div class="la-card la-full" style="margin-bottom:18px;">' +
        '<div class="la-ch"><div><div class="la-ct">Управление версиями</div><div class="la-cs">Активная версия и уведомление об обновлении</div></div><div class="la-ico">&#9881;</div></div>' +
        '<label class="la-lbl">Выберите версию</label>' +
        '<div class="la-pills" id="laPills"></div>' +
        '<div class="la-br">' +
          '<button class="la-btn la-bp" id="laSetVer">Установить как активную</button>' +
          '<button class="la-btn la-bw" id="laNotify">Уведомить всех об обновлении</button>' +
        '</div>' +
        '<div class="la-info">&#8505; Лоадеры получат версию при следующем запросе /loader/status — ручная рассылка не нужна.</div>' +
      '</div>' +
      // Access
      '<div class="la-card la-full">' +
        '<div class="la-ch"><div><div class="la-ct">Доступ пользователей к версиям</div><div class="la-cs">Выдать/забрать доступ по UID или Username</div></div><div class="la-ico">&#128100;</div></div>' +
        '<div class="la-af">' +
          '<div><label class="la-lbl">UID или Username</label><input class="la-inp" id="laUid" placeholder="123 или nickname..."></div>' +
          '<div><label class="la-lbl">Версии (через запятую)</label><input class="la-inp" id="laVers" placeholder="1.21.4, 1.21.8..."></div>' +
          '<div style="display:flex;gap:8px;"><button class="la-btn la-bp" id="laGrant">Дать</button><button class="la-btn la-bd" id="laRevoke">Убрать</button></div>' +
        '</div>' +
        '<table class="la-tbl"><thead><tr><th>UID</th><th>Username</th><th>Версии</th><th></th></tr></thead>' +
        '<tbody id="laAccBody"><tr><td colspan="4" style="color:#8a8a9a;text-align:center;padding:22px;">Загрузка...</td></tr></tbody></table>' +
      '</div>' +
    '</div>';
  }

  function renderPills() {
    var c = document.getElementById('laPills');
    if (!c) return;
    c.innerHTML = '';
    VERSIONS.forEach(function (v) {
      var b = document.createElement('button');
      b.className = 'la-pill' + (v === selVer ? ' sel' : '');
      b.textContent = v;
      b.onclick = function () { selVer = v; renderPills(); };
      c.appendChild(b);
    });
  }

  function applyConfig() {
    var m = document.getElementById('laMaint'), a = document.getElementById('laAuth'), msg = document.getElementById('laMsg');
    if (m) m.checked = !!cfg.maintenance;
    if (a) a.checked = !!cfg.auth_disabled;
    if (msg) msg.value = cfg.maintenance_message || '';
    selVer = cfg.current_version || VERSIONS[0];
    renderPills();
  }

  function loadConfig() {
    api('/admin/loader').then(function (d) { cfg = d.config || {}; applyConfig(); })
      .catch(function (e) { if (e.message !== 'forbidden') toast('Ошибка загрузки конфига', false); });
  }

  function loadAccess() {
    api('/admin/loader/access').then(function (d) { renderAccess(d.user_access || []); }).catch(function () {});
  }

  function renderAccess(list) {
    var tb = document.getElementById('laAccBody');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="4" style="color:#8a8a9a;text-align:center;padding:22px;">Нет записей — доступ не выдавался</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (u) {
      var tags = (u.versions || []).map(function (v) { return '<span class="la-vtag">' + esc(v) + '</span>'; }).join('') || '<span style="color:#3a3a4a">нет</span>';
      return '<tr><td><span class="la-mono">' + esc(u.uid) + '</span></td><td>' + esc(u.username || '-') + '</td><td>' + tags +
        '</td><td><button class="la-btn la-bd" data-revoke="' + esc(u.uid) + '">Удалить</button></td></tr>';
    }).join('');
    Array.prototype.forEach.call(tb.querySelectorAll('[data-revoke]'), function (btn) {
      btn.onclick = function () { revoke(btn.getAttribute('data-revoke')); };
    });
  }

  function revoke(uid) {
    api('/admin/loader/access', { method: 'POST', body: JSON.stringify({ uid: uid, action: 'revoke' }) })
      .then(function () { toast('Доступ отозван'); loadAccess(); })
      .catch(function (e) { if (e.message !== 'forbidden') toast('Ошибка', false); });
  }

  function bind() {
    document.getElementById('laSaveModes').onclick = function () {
      Promise.all([
        api('/admin/loader/maintenance', { method: 'POST', body: JSON.stringify({ enabled: document.getElementById('laMaint').checked, message: document.getElementById('laMsg').value }) }),
        api('/admin/loader/auth', { method: 'POST', body: JSON.stringify({ disabled: document.getElementById('laAuth').checked }) })
      ]).then(function () { toast('Режимы сохранены'); loadConfig(); })
        .catch(function (e) { if (e.message !== 'forbidden') toast('Ошибка', false); });
    };

    document.getElementById('laSaveMsg').onclick = function () {
      api('/admin/loader/maintenance', { method: 'POST', body: JSON.stringify({ enabled: document.getElementById('laMaint').checked, message: document.getElementById('laMsg').value }) })
        .then(function () { toast('Сообщение сохранено'); })
        .catch(function (e) { if (e.message !== 'forbidden') toast('Ошибка', false); });
    };

    document.getElementById('laSetVer').onclick = function () {
      api('/admin/loader/version', { method: 'POST', body: JSON.stringify({ version: selVer }) })
        .then(function (d) { if (d.error) { toast('Ошибка: ' + d.error, false); return; } toast('Активная версия: ' + selVer); loadConfig(); })
        .catch(function (e) { if (e.message !== 'forbidden') toast('Ошибка', false); });
    };

    document.getElementById('laNotify').onclick = function () {
      api('/admin/loader/notify', { method: 'POST', body: JSON.stringify({ version: selVer }) })
        .then(function (d) { if (d.error) { toast('Ошибка: ' + d.error, false); return; } toast('Все получат v' + selVer + ' при следующем запросе'); loadConfig(); })
        .catch(function (e) { if (e.message !== 'forbidden') toast('Ошибка', false); });
    };

    document.getElementById('laGrant').onclick = function () {
      var uid = document.getElementById('laUid').value.trim();
      var vers = document.getElementById('laVers').value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      if (!uid) { toast('Введите UID или Username', false); return; }
      // Резолвим имя -> uid через список пользователей
      api('/admin/users').then(function (users) {
        var u = (users.users || []).find(function (x) { return String(x.uid) === uid || x.username === uid; });
        var ruid = u ? u.uid : uid, rname = u ? u.username : uid;
        return api('/admin/loader/access', { method: 'POST', body: JSON.stringify({ uid: ruid, username: rname, versions: vers, action: 'grant' }) })
          .then(function () { toast('Доступ выдан: ' + rname); });
      }).then(function () {
        document.getElementById('laUid').value = '';
        document.getElementById('laVers').value = '';
        loadAccess();
      }).catch(function (e) { if (e.message !== 'forbidden') toast('Ошибка', false); });
    };

    document.getElementById('laRevoke').onclick = function () {
      var uid = document.getElementById('laUid').value.trim();
      if (!uid) { toast('Введите UID или Username', false); return; }
      revoke(uid);
      document.getElementById('laUid').value = '';
    };
  }

  window.__mountLoaderAdmin = function () {
    var root = document.getElementById('loaderAdminMount');
    if (!root) { setTimeout(window.__mountLoaderAdmin, 100); return; }
    if (root.getAttribute('data-mounted') === '1' && root.children.length) { loadConfig(); loadAccess(); return; }
    injectStyles();
    root.style.padding = '0';
    root.style.background = 'transparent';
    root.style.border = 'none';
    root.innerHTML = template();
    root.setAttribute('data-mounted', '1');
    bind();
    renderPills();
    loadConfig();
    loadAccess();
  };
})();
