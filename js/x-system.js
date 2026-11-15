/* Справочник «API Искры» (кнопка в шапке): каталог методов, коды ответов, сущности, права и токены, правила записи
   и живая консоль учебного сервера. Открывается из любой тренировки — как документация, которую партнёр читает рядом. */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc, api = TR.api;
  const BOOKING = { id: 'bk-0998', status: 'confirmed', station_id: 'st-1', vehicle_id: 'v-17', service_ids: ['srv-tire'], start_at: '2027-03-16T09:00:00+03:00', end_at: '2027-03-16T09:30:00+03:00', price_from: 2000, comment: 'Смена резины на летнюю', created_at: '2027-03-14T18:02:00+03:00' };
  const FIELDS = [
    ['id', 'string', 'Идентификатор записи, выдаёт сервер', 'только чтение'],
    ['status', 'enum', 'confirmed — подтверждена, cancelled — отменена, completed — завершена, no_show — неявка', 'только чтение; меняется действиями'],
    ['station_id', 'string', 'Станция, из GET /stations', 'обязательно при создании'],
    ['vehicle_id', 'string', 'Машина партнёра, из GET /vehicles', 'обязательно при создании'],
    ['service_ids', 'string[]', 'Услуги, из GET /services; длительность = сумма, вверх до 30 минут', 'обязательно, непустой'],
    ['start_at', 'date-time', 'Начало, ISO 8601 со смещением: 2027-03-16T09:00:00+03:00', 'обязательно; меняется переносом'],
    ['end_at', 'date-time', 'Окончание, считает сервер', 'только чтение'],
    ['price_from', 'integer', 'Цена «от» в рублях по каталогу; итог — после диагностики', 'только чтение'],
    ['comment', 'string', 'Комментарий для мастера, до 500 символов', 'необязательно'],
    ['created_at', 'date-time', 'Когда создана', 'только чтение']
  ];
  const RULES = [
    ['Сетка записи', 'Получасовые слоты, станции работают 08:00–21:00 без выходных.'],
    ['Когда можно записаться', 'Не позже чем за 2 часа до начала и не дальше чем на 30 дней вперёд.'],
    ['Перенос и отмена', 'Бесплатно — не позже чем за 3 часа до начала. Позже — звонок на станцию.'],
    ['Неявка', 'Не приехали в течение 15 минут — статус no_show, слот освобождается.'],
    ['Доп. работы для «Шашки»', 'До 3 000 ₽ согласуются автоматически, дороже — завгар в кабинете или через API (scope offers:approve).'],
    ['Лимит учебного ключа', '120 запросов; дальше — 429 с Retry-After. Заголовки RateLimit-Limit и RateLimit-Remaining в каждом ответе.'],
    ['Идемпотентность', 'POST /bookings принимает Idempotency-Key: повтор с тем же ключом и телом вернёт тот же ответ, а не создаст вторую запись.'],
    ['Версии', 'Версия — в адресе: /v1. Совместимые изменения (новые необязательные поля, новые методы) — без смены версии; ломающие — только в /v2 с полугодовым переходом.']
  ];
  const PRESETS = api.PRESETS;

  const tabs = [
    { id: 'cat', t: 'Методы', render(b) {
      b.innerHTML = `<div class="api-root"><p>Базовый адрес: <code>${api.BASE}</code>. Все тела — JSON в UTF-8. Ошибки — в формате RFC 9457 (<code>application/problem+json</code>).</p>
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Метод и адрес</th><th>Что делает</th><th>Доступ</th><th>Успех</th><th>Ошибки</th></tr></thead><tbody>
        ${api.CATALOG.map(c => `<tr><td class="api-mono">${ui.mth(c.m)} ${esc(c.p)}</td><td>${esc(c.t)}</td><td class="api-mono">${c.auth ? esc(c.auth) : 'открыт'}</td><td>${esc(c.ok)}</td><td>${esc(c.err)}</td></tr>`).join('')}</tbody></table></div>
        ${ui.note('info', 'Пример', 'Создание записи — запрос и ответ целиком:')}
        ${ui.code(api.reqText(PRESETS[4].req), 'http')}
        ${ui.code(api.resText(api.replay([PRESETS[4].req])[0].res), 'http')}</div>`;
    } },
    { id: 'codes', t: 'Коды ответов', render(b) {
      b.innerHTML = `<div class="api-root"><div class="api-scroll"><table class="api-tbl"><thead><tr><th>Код</th><th>Когда</th></tr></thead><tbody>${api.CODES.map(c => `<tr><td class="api-mono">${esc(c[0])}</td><td>${esc(c[1])}</td></tr>`).join('')}</tbody></table></div>
        ${ui.note('', 'Формат ошибки (RFC 9457)', 'Каждая ошибка — объект с полями type, title, status, detail; для проверок полей — массив errors.')}
        ${ui.code(JSON.stringify({ type: 'https://api.iskra-online.ru/problems/validation-error', title: 'Данные не прошли проверку', status: 422, detail: 'Исправьте поля из списка errors.', errors: [{ field: 'start_at', code: 'too_soon', message: 'Онлайн-запись — не позже чем за 2 часа до начала.' }] }, null, 2), 'json')}</div>`;
    } },
    { id: 'ent', t: 'Сущности', render(b) {
      b.innerHTML = `<div class="api-root"><p><b>Запись (booking)</b> — главный ресурс партнёрского API.</p>${ui.code(JSON.stringify(BOOKING, null, 2), 'json')}
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Поле</th><th>Тип</th><th>Смысл</th><th>Правило</th></tr></thead><tbody>${FIELDS.map(f => `<tr><td class="api-mono">${esc(f[0])}</td><td class="api-mono">${esc(f[1])}</td><td>${esc(f[2])}</td><td>${esc(f[3])}</td></tr>`).join('')}</tbody></table></div>
        <p><b>Станции</b>: ${api.STATIONS.map(s => `<code>${s.id}</code> ${esc(s.name)}`).join(', ')}.</p>
        <p><b>Услуги</b>: ${api.SERVICES.map(s => `<code>${s.id}</code> ${esc(s.name)} (${s.duration_min} мин, от ${s.price_from} ₽)`).join(', ')}.</p>
        <p><b>Машины «Шашки»</b>: ${api.VEHICLES.map(s => `<code>${s.id}</code> ${esc(s.plate)} ${esc(s.model)}`).join(', ')}.</p></div>`;
    } },
    { id: 'auth', t: 'Права и токены', render(b) {
      b.innerHTML = `<div class="api-root"><p>Партнёр передаёт токен в заголовке <code>Authorization: Bearer &lt;токен&gt;</code>. Права токена — набор scope.</p>
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Scope</th><th>Что разрешает</th></tr></thead><tbody>${api.SCOPES.map(s => `<tr><td class="api-mono">${esc(s.s)}</td><td>${esc(s.t)}</td></tr>`).join('')}</tbody></table></div>
        <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Учебный токен</th><th>Scope</th></tr></thead><tbody>
          <tr><td class="api-mono">${api.TOKEN}</td><td class="api-mono">vehicles:read bookings:read bookings:write</td></tr>
          <tr><td class="api-mono">${api.TOKEN_RO}</td><td class="api-mono">vehicles:read bookings:read</td></tr></tbody></table></div>
        ${ui.note('warn', 'Чужие данные', 'Запрос чужой записи возвращает 404, а не 403: так API не подтверждает, что такая запись вообще существует.')}</div>`;
    } },
    { id: 'rules', t: 'Правила', render(b) {
      b.innerHTML = `<div class="api-root"><p>Учебный сервер считает, что сейчас <b>понедельник, 15 марта 2027, 10:00</b> по Москве.</p><div class="api-scroll"><table class="api-tbl"><tbody>${RULES.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div></div>`;
    } },
    { id: 'con', t: 'Консоль', render(b) {
      b.innerHTML = '<div class="api-root"><p>Песочница: каждый запрос уходит на учебный сервер. Журнал здесь не сохраняется.</p><div data-c></div></div>';
      api.console(TR.$('[data-c]', b), { presets: PRESETS });
    } }
  ];
  TR.system = {
    open(tab) {
      const m = ui.modal({ title: 'API «Искры Онлайн» для партнёров' });
      const box = document.createElement('div'); m.body.appendChild(box);
      ui.tabs(box, tabs, tabs.some(t => t.id === tab) ? tab : 'cat');
    }
  };
})();
