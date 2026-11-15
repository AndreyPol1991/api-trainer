/* Справочник «API Ложки» (кнопка в шапке): каталог методов, коды ответов, сущности, права и токены, правила доставки
   и живая консоль учебного сервера. Открывается из любой тренировки — как документация, которую партнёр читает рядом. */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc, api = TR.api;
  const BOOKING = { id: 'dl-0998', status: 'confirmed', zone_id: 'z-1', point_id: 'p-17', option_ids: ['tf-std'], start_at: '2027-03-16T09:00:00+05:00', end_at: '2027-03-16T09:30:00+05:00', price_from: 190, comment: 'Домофон не работает — позвонить', created_at: '2027-03-14T18:02:00+05:00' };
  const FIELDS = [
    ['id', 'string', 'Идентификатор доставки, выдаёт сервер', 'только чтение'],
    ['status', 'enum', 'confirmed — подтверждена, cancelled — отменена, delivered — доставлена, failed — не доставлена', 'только чтение; меняется действиями'],
    ['zone_id', 'string', 'Зона доставки, из GET /zones', 'обязательно при создании'],
    ['point_id', 'string', 'Точка партнёра, откуда забрать заказ, из GET /points', 'обязательно при создании'],
    ['option_ids', 'string[]', 'Опции доставки из GET /options; окно курьера = сумма длительностей, вверх до 30 минут', 'обязательно, непустой'],
    ['start_at', 'date-time', 'Начало окна, ISO 8601 со смещением: 2027-03-16T09:00:00+05:00', 'обязательно; меняется переносом'],
    ['end_at', 'date-time', 'Конец окна, считает сервер', 'только чтение'],
    ['price_from', 'integer', 'Цена доставки «от» в рублях по тарифу; итог — по факту (ожидание, перевес)', 'только чтение'],
    ['comment', 'string', 'Комментарий для курьера, до 500 символов', 'необязательно'],
    ['created_at', 'date-time', 'Когда создана', 'только чтение']
  ];
  const RULES = [
    ['Окна доставки', 'Получасовые окна, курьеры работают 09:00–23:00 без выходных. В учебном стенде в зоне на окно — один курьер для партнёра.'],
    ['Когда можно заказать', 'Не позже чем за 2 часа до окна и не дальше чем на 14 дней вперёд.'],
    ['Перенос и отмена', 'Бесплатно — не позже чем за 1 час до окна. Позже — через поддержку «Ложки».'],
    ['Не доставлено', 'Получатель не вышел за 10 минут — статус failed, заказ возвращается в точку.'],
    ['Доплаты для «Теста»', 'Ожидание на кухне и перевес: до 300 ₽ — автоматически, дороже — управляющий в кабинете или через API (scope surcharges:approve).'],
    ['Лимит учебного ключа', '120 запросов; дальше — 429 с Retry-After. Заголовки RateLimit-Limit и RateLimit-Remaining в каждом ответе.'],
    ['Идемпотентность', 'POST /deliveries принимает Idempotency-Key: повтор с тем же ключом и телом вернёт тот же ответ, а не создаст вторую доставку.'],
    ['Версии', 'Версия — в адресе: /v1. Совместимые изменения (новые необязательные поля, новые методы) — без смены версии; ломающие — только в /v2 с полугодовым переходом.']
  ];
  const PRESETS = api.PRESETS;

  const tabs = [
    { id: 'cat', t: 'Методы', render(b) {
      b.innerHTML = `<div class="api-root"><p>Базовый адрес: <code>${api.BASE}</code>. Все тела — JSON в UTF-8. Ошибки — в формате RFC 9457 (<code>application/problem+json</code>).</p>
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Метод и адрес</th><th>Что делает</th><th>Доступ</th><th>Успех</th><th>Ошибки</th></tr></thead><tbody>
        ${api.CATALOG.map(c => `<tr><td class="api-mono">${ui.mth(c.m)} ${esc(c.p)}</td><td>${esc(c.t)}</td><td class="api-mono">${c.auth ? esc(c.auth) : 'открыт'}</td><td>${esc(c.ok)}</td><td>${esc(c.err)}</td></tr>`).join('')}</tbody></table></div>
        ${ui.note('info', 'Пример', 'Заказ доставки — запрос и ответ целиком:')}
        ${ui.code(api.reqText(PRESETS[4].req), 'http')}
        ${ui.code(api.resText(api.replay([PRESETS[4].req])[0].res), 'http')}</div>`;
    } },
    { id: 'codes', t: 'Коды ответов', render(b) {
      b.innerHTML = `<div class="api-root"><div class="api-scroll"><table class="api-tbl"><thead><tr><th>Код</th><th>Когда</th></tr></thead><tbody>${api.CODES.map(c => `<tr><td class="api-mono">${esc(c[0])}</td><td>${esc(c[1])}</td></tr>`).join('')}</tbody></table></div>
        ${ui.note('', 'Формат ошибки (RFC 9457)', 'Каждая ошибка — объект с полями type, title, status, detail; для проверок полей — массив errors.')}
        ${ui.code(JSON.stringify({ type: 'https://api.lozhka.ru/problems/validation-error', title: 'Данные не прошли проверку', status: 422, detail: 'Исправьте поля из списка errors.', errors: [{ field: 'start_at', code: 'too_soon', message: 'Курьера заказывают не позже чем за 2 часа до окна.' }] }, null, 2), 'json')}</div>`;
    } },
    { id: 'ent', t: 'Сущности', render(b) {
      b.innerHTML = `<div class="api-root"><p><b>Доставка (delivery)</b> — главный ресурс партнёрского API.</p>${ui.code(JSON.stringify(BOOKING, null, 2), 'json')}
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Поле</th><th>Тип</th><th>Смысл</th><th>Правило</th></tr></thead><tbody>${FIELDS.map(f => `<tr><td class="api-mono">${esc(f[0])}</td><td class="api-mono">${esc(f[1])}</td><td>${esc(f[2])}</td><td>${esc(f[3])}</td></tr>`).join('')}</tbody></table></div>
        <p><b>Зоны</b>: ${api.ZONES.map(s => `<code>${s.id}</code> ${esc(s.name)}`).join(', ')}.</p>
        <p><b>Опции доставки</b>: ${api.OPTIONS.map(s => `<code>${s.id}</code> ${esc(s.name)} (${s.duration_min} мин, от ${s.price_from} ₽)`).join(', ')}.</p>
        <p><b>Точки «Теста»</b>: ${api.POINTS.map(s => `<code>${s.id}</code> ${esc(s.name)}, ${esc(s.address)}`).join('; ')}.</p></div>`;
    } },
    { id: 'auth', t: 'Права и токены', render(b) {
      b.innerHTML = `<div class="api-root"><p>Партнёр передаёт токен в заголовке <code>Authorization: Bearer &lt;токен&gt;</code>. Права токена — набор scope.</p>
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Scope</th><th>Что разрешает</th></tr></thead><tbody>${api.SCOPES.map(s => `<tr><td class="api-mono">${esc(s.s)}</td><td>${esc(s.t)}</td></tr>`).join('')}</tbody></table></div>
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Учебный токен</th><th>Scope</th></tr></thead><tbody>
          <tr><td class="api-mono">${api.TOKEN}</td><td class="api-mono">points:read deliveries:read deliveries:write</td></tr>
          <tr><td class="api-mono">${api.TOKEN_RO}</td><td class="api-mono">points:read deliveries:read</td></tr></tbody></table></div>
        ${ui.note('warn', 'Чужие данные', 'Запрос чужой доставки возвращает 404, а не 403: так API не подтверждает, что такая доставка вообще существует.')}</div>`;
    } },
    { id: 'rules', t: 'Правила', render(b) {
      b.innerHTML = `<div class="api-root"><p>Учебный сервер считает, что сейчас <b>понедельник, 15 марта 2027, 10:00</b> по Екатеринбургу.</p><div class="api-scroll"><table class="api-tbl"><tbody>${RULES.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div></div>`;
    } },
    { id: 'con', t: 'Консоль', render(b) {
      b.innerHTML = '<div class="api-root"><p>Песочница: каждый запрос уходит на учебный сервер. Журнал здесь не сохраняется.</p><div data-c></div></div>';
      api.console(TR.$('[data-c]', b), { presets: PRESETS });
    } }
  ];
  TR.system = {
    open(tab) {
      const m = ui.modal({ title: 'API «Ложки» для партнёров' });
      const box = document.createElement('div'); m.body.appendChild(box);
      ui.tabs(box, tabs, tabs.some(t => t.id === tab) ? tab : 'cat');
    }
  };
})();
