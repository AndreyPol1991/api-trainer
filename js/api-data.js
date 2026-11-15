/* Общие данные тренажёра «Шлюз»: партнёрское API сервиса доставки «Ложка».
   TR.api.CATALOG — каталог методов (для справочника и заданий), TR.api.server() — учебный сервер в памяти:
   отвечает настоящими HTTP-кодами, заголовками и ошибками в формате RFC 9457, проверяет токен, права, правила доставки
   (BR: курьера заказывают не позже чем за 2 часа и не дальше 14 дней, окна по 30 минут, 09:00–23:00, отмена и перенос —
   не позже чем за 1 час), ключ идемпотентности, ETag/If-Match. Сервер детерминированный: TR.api.replay(log) прогоняет журнал запросов
   на свежем сервере — так проверки заданий остаются чистыми функциями от ответа.
   TR.api.console(el, cfg) — живая консоль запросов с журналом и «миссиями». Плюс помощники: lines() — код с номерами
   и отметками для заданий «найдите ошибки», sha256/hmac/base64url — для JWT. */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc;
  const api = TR.api = {};
  api.BASE = 'https://api.lozhka.ru/v1';
  api.NOW = '2027-03-15T10:00:00+05:00';
  api.TOKEN = 'tst_test_7Hq2';
  api.TOKEN_RO = 'tst_ro_51Xa';

  if (!document.getElementById('api-css')) document.head.insertAdjacentHTML('beforeend', `<style id="api-css">
    .api-root { display: grid; gap: 14px; min-width: 0; }
    .api-root p { margin: 0; }
    .api-root pre.code, .api-root code, .api-root textarea, .api-root input.mono { font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0; }
    .api-con { display: grid; gap: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); padding: 12px; min-width: 0; }
    .api-con .reqline { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    .api-con select, .api-con input, .api-con textarea { font: 13px/1.45 var(--f-mono); background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; min-width: 0; box-sizing: border-box; width: 100%; }
    .api-con textarea { resize: vertical; min-height: 64px; }
    .api-con .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
    .api-con .lbl { font: 600 11px var(--f-mono); color: var(--text-muted); letter-spacing: .05em; text-transform: uppercase; margin-bottom: 3px; }
    .api-con .res { min-width: 0; }
    .api-con .res .http { margin: 0; }
    .api-con .res pre.code { max-height: 320px; overflow: auto; }
    .api-hist { display: flex; flex-wrap: wrap; gap: 5px; }
    .api-hist button { font: 12px var(--f-mono); border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 7px; padding: 3px 7px; cursor: pointer; }
    .api-hist button.cur { border-color: var(--accent); }
    .api-hist .s2 { color: var(--ok); } .api-hist .s4 { color: var(--warn); } .api-hist .s5 { color: var(--bad); }
    .api-mis { display: grid; gap: 4px; font-size: 13.5px; }
    .api-mis div { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px; }
    .api-mis .mk { font-weight: 700; color: var(--text-muted); } .api-mis .on .mk { color: var(--ok); }
    .api-lines { font: 12.5px/1.6 var(--f-mono); background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 8px 0; overflow-x: auto; margin: 0; }
    .api-lines .ln { display: grid; grid-template-columns: 34px minmax(0, 1fr) 26px; align-items: center; padding: 0 8px 0 0; white-space: pre; min-height: 20px; }
    .api-lines .ln .no { color: var(--text-muted); text-align: right; padding-right: 10px; font-size: 11px; user-select: none; }
    .api-lines .ln.ok { background: var(--ok-soft); } .api-lines .ln.bad { background: var(--bad-soft); } .api-lines .ln.miss { background: var(--warn-soft); } .api-lines .ln.hl { background: var(--accent-soft); }
    .api-lines .bdg { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); color: var(--accent-text); font: 700 10px var(--f-sans, sans-serif); }
    .api-ed textarea { width: 100%; min-height: 260px; box-sizing: border-box; font: 12.5px/1.55 var(--f-mono); background: var(--code-bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 10px; resize: vertical; font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0; tab-size: 2; }
    .api-two { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .api-feats { display: grid; gap: 4px; font-size: 13.5px; }
    .api-feat { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px; }
    .api-feat .mk { font-weight: 700; color: var(--text-muted); } .api-feat.on .mk { color: var(--ok); }
    .api-pm { font-size: 12.5px; padding: 4px 8px; border-radius: 8px; background: var(--bad-soft); color: var(--bad); }
    .api-pm.warn { background: var(--warn-soft); color: var(--warn); }
    .api-msg { border-radius: 9px; padding: 8px 12px; font-size: 14px; }
    .api-msg.ok { background: var(--ok-soft); border-left: 3px solid var(--ok); }
    .api-msg.bad { background: var(--bad-soft); border-left: 3px solid var(--bad); }
    .api-msg.info { background: var(--info-soft); border-left: 3px solid var(--info); }
    .api-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .api-tbl th, .api-tbl td { border: 1px solid var(--border); padding: 6px 8px; text-align: left; vertical-align: top; }
    .api-tbl th { background: var(--surface-2); color: var(--text-2); font-weight: 600; }
    .api-tbl td.c { text-align: center; }
    .api-scroll { overflow-x: auto; }
    .api-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .api-chips .chip[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
    .api-info { border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 10px; background: var(--surface); padding: 10px 14px; display: grid; gap: 6px; font-size: 14px; }
    .api-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(170px, 260px); gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); padding: 10px 12px; }
    .api-row select, .api-row input { width: 100%; box-sizing: border-box; }
    .api-row .meta { font: 600 11px var(--f-mono); color: var(--text-muted); letter-spacing: .04em; }
    .api-row .res { grid-column: 1 / -1; font-size: 13.5px; border-radius: 8px; padding: 6px 10px; }
    .api-row .res.ok { background: var(--ok-soft); border-left: 3px solid var(--ok); }
    .api-row .res.bad { background: var(--bad-soft); border-left: 3px solid var(--bad); }
    .api-pick { display: grid; gap: 6px; }
    .api-pick label { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: start; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); padding: 8px 10px; font-size: 14px; cursor: pointer; }
    .api-pick label.ok { border-color: var(--ok); background: var(--ok-soft); } .api-pick label.bad { border-color: var(--bad); background: var(--bad-soft); } .api-pick label.miss { border-color: var(--warn); background: var(--warn-soft); }
    .api-pick .why { grid-column: 2; font-size: 13px; color: var(--text-2); }
    .api-mono { font-family: var(--f-mono); font-size: 12.5px; word-break: break-all; }
    .api-jwt { font: 13px/1.6 var(--f-mono); word-break: break-all; background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
    .api-jwt .h { color: var(--bad); } .api-jwt .p { color: var(--accent); } .api-jwt .s { color: var(--info); }
    @media (max-width: 820px) { .api-two, .api-con .two { grid-template-columns: minmax(0, 1fr); } .api-row { grid-template-columns: minmax(0, 1fr); } .api-con .reqline { grid-template-columns: 90px minmax(0, 1fr); } .api-con .reqline .btn { grid-column: 1 / -1; } }
  </style>`);

  /* ---------- справочные данные ---------- */
  api.ZONES = [
    { id: 'z-1', name: 'Центр', districts: 'Ленинский и Кировский районы', open: '09:00', close: '23:00' },
    { id: 'z-2', name: 'Уралмаш', districts: 'Орджоникидзевский район', open: '09:00', close: '23:00' },
    { id: 'z-3', name: 'Академический', districts: 'Академический и Верх-Исетский районы', open: '09:00', close: '23:00' }
  ];
  api.OPTIONS = [
    { id: 'tf-big', name: 'Большой заказ: до 20 кг, курьер на авто', price_from: 450, duration_min: 60 },
    { id: 'tf-std', name: 'Стандарт', price_from: 190, duration_min: 30 },
    { id: 'tf-thermo', name: 'Термобокс для горячего', price_from: 250, duration_min: 30 },
    { id: 'tf-express', name: 'Экспресс: без попутных заказов', price_from: 390, duration_min: 30 }
  ];
  api.POINTS = [
    { id: 'p-17', name: 'Тесто на Малышева', address: 'ул. Малышева, 51' },
    { id: 'p-23', name: 'Тесто на Ленина', address: 'пр. Ленина, 24' },
    { id: 'p-41', name: 'Тесто в Академическом', address: 'ул. Вильгельма де Геннина, 31' }
  ];
  api.STATUS_RU = { confirmed: 'Подтверждена', cancelled: 'Отменена', delivered: 'Доставлена', failed: 'Не доставлена' };
  api.SCOPES = [
    { s: 'zones:read', t: 'Справочник зон и опций доставки (открыт без токена)' },
    { s: 'points:read', t: 'Свои точки партнёра — откуда курьер забирает заказы' },
    { s: 'deliveries:read', t: 'Читать свои доставки' },
    { s: 'deliveries:write', t: 'Заказывать, переносить и отменять доставки' },
    { s: 'surcharges:approve', t: 'Согласовывать доплаты дороже 300 ₽ (управляющий)' },
    { s: 'invoices:read', t: 'Счета и акты за месяц' }
  ];
  api.CATALOG = [
    { m: 'GET', p: '/zones', t: 'Список зон доставки', auth: false, ok: '200', err: '—' },
    { m: 'GET', p: '/zones/{zone_id}', t: 'Одна зона', auth: false, ok: '200', err: '404' },
    { m: 'GET', p: '/options', t: 'Опции доставки: тариф, цена «от», длительность окна', auth: false, ok: '200', err: '—' },
    { m: 'GET', p: '/zones/{zone_id}/slots?date=&option_id=', t: 'Свободные окна курьеров в зоне на дату', auth: false, ok: '200', err: '400, 404' },
    { m: 'GET', p: '/points', t: 'Точки партнёра', auth: 'points:read', ok: '200', err: '401, 403' },
    { m: 'GET', p: '/deliveries?status=&zone_id=&limit=&cursor=', t: 'Свои доставки: фильтр, курсорная пагинация', auth: 'deliveries:read', ok: '200', err: '400, 401, 403' },
    { m: 'POST', p: '/deliveries', t: 'Заказать доставку (Idempotency-Key — по желанию, но лучше всегда)', auth: 'deliveries:write', ok: '201 + Location', err: '400, 401, 403, 409, 415, 422' },
    { m: 'GET', p: '/deliveries/{delivery_id}', t: 'Одна доставка (ETag в ответе)', auth: 'deliveries:read', ok: '200', err: '401, 404' },
    { m: 'PATCH', p: '/deliveries/{delivery_id}', t: 'Перенести доставку на другое окно: start_at (If-Match — по желанию)', auth: 'deliveries:write', ok: '200', err: '404, 409, 412, 415, 422' },
    { m: 'POST', p: '/deliveries/{delivery_id}/cancel', t: 'Отменить доставку (не позже чем за 1 час до окна)', auth: 'deliveries:write', ok: '200', err: '404, 409, 422' }
  ];
  api.CODES = [
    ['200 OK', 'Запрос выполнен, в теле — результат'], ['201 Created', 'Создан новый ресурс; адрес — в заголовке Location'], ['202 Accepted', 'Принято в работу, результат будет позже'], ['204 No Content', 'Выполнено, тела нет'],
    ['304 Not Modified', 'Ресурс не изменился (ответ на If-None-Match) — берите из кеша'],
    ['400 Bad Request', 'Запрос не разобрать: битый JSON, неверный параметр'], ['401 Unauthorized', 'Не аутентифицирован: нет токена или он недействителен'], ['403 Forbidden', 'Аутентифицирован, но прав нет (не хватает scope)'], ['404 Not Found', 'Ресурса нет — или он чужой и мы не раскрываем, что он есть'],
    ['405 Method Not Allowed', 'Метод для этого адреса не поддерживается; список — в Allow'], ['406 Not Acceptable', 'Сервер не умеет отдать формат из Accept'], ['409 Conflict', 'Конфликт с текущим состоянием: окно занято, доставка уже отменена'], ['412 Precondition Failed', 'Не совпал If-Match: ресурс успели изменить'],
    ['415 Unsupported Media Type', 'Тело не в том формате (Content-Type)'], ['422 Unprocessable Content', 'JSON разобран, но данные не проходят проверки и правила'], ['429 Too Many Requests', 'Превышен лимит; когда повторить — в Retry-After'],
    ['500 Internal Server Error', 'Ошибка на сервере'], ['502 Bad Gateway', 'Шлюз получил плохой ответ от сервиса за ним'], ['503 Service Unavailable', 'Сервис временно недоступен (часто с Retry-After)'], ['504 Gateway Timeout', 'Сервис за шлюзом не ответил вовремя']
  ];
  api.STATUS_TEXT = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 409: 'Conflict', 412: 'Precondition Failed', 415: 'Unsupported Media Type', 422: 'Unprocessable Content', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable' };

  const PRESETS = [
    { t: 'GET /zones — зоны доставки', req: { method: 'GET', url: '/v1/zones', headers: '', body: '' } },
    { t: 'GET /options — опции доставки', req: { method: 'GET', url: '/v1/options', headers: '', body: '' } },
    { t: 'GET окна в зоне «Центр» на 16 марта под большой заказ', req: { method: 'GET', url: '/v1/zones/z-1/slots?date=2027-03-16&option_id=tf-big', headers: '', body: '' } },
    { t: 'GET /deliveries — мои доставки', req: { method: 'GET', url: '/v1/deliveries', headers: 'Authorization: Bearer ' + api.TOKEN, body: '' } },
    { t: 'POST /deliveries — заказать доставку', req: { method: 'POST', url: '/v1/deliveries', headers: 'Authorization: Bearer ' + api.TOKEN + '\nContent-Type: application/json\nIdempotency-Key: 2f6c1d0e-demo', body: '{\n  "zone_id": "z-1",\n  "point_id": "p-41",\n  "option_ids": ["tf-big"],\n  "start_at": "2027-03-16T15:00:00+05:00",\n  "comment": "Стук спереди справа"\n}' } },
    { t: 'POST /deliveries/dl-0998/cancel — отменить', req: { method: 'POST', url: '/v1/deliveries/dl-0998/cancel', headers: 'Authorization: Bearer ' + api.TOKEN, body: '' } }
  ];
  api.PRESETS = PRESETS;

  /* ---------- время ---------- */
  const pad = n => String(n).padStart(2, '0');
  const MSK = 5 * 60;
  const parseT = s => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null; const t = Date.parse(s); return isNaN(t) ? null : t / 60000; };
  const fmtT = min => { const d = new Date((min + MSK) * 60000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+05:00`; };
  const mskHM = min => { const d = new Date((min + MSK) * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const mskDate = min => fmtT(min).slice(0, 10);
  api.fmtT = fmtT; api.parseT = parseT;
  const NOW = parseT(api.NOW);

  /* ---------- учебный сервер ---------- */
  const PROB = 'https://api.lozhka.ru/problems/';
  function server() {
    const st = {
      seq: 1000, req: 0,
      deliveries: [
        { id: 'dl-0990', owner: 'testo', status: 'delivered', zone_id: 'z-2', point_id: 'p-41', option_ids: ['tf-thermo'], start: parseT('2027-03-12T10:00:00+05:00'), comment: '', created: parseT('2027-03-10T12:15:00+05:00'), v: 3 },
        { id: 'dl-0998', owner: 'testo', status: 'confirmed', zone_id: 'z-1', point_id: 'p-17', option_ids: ['tf-std'], start: parseT('2027-03-16T09:00:00+05:00'), comment: 'Домофон не работает — позвонить', created: parseT('2027-03-14T18:02:00+05:00'), v: 1 },
        { id: 'dl-0999', owner: 'testo', status: 'confirmed', zone_id: 'z-1', point_id: 'p-23', option_ids: ['tf-big'], start: parseT('2027-03-16T11:00:00+05:00'), comment: '', created: parseT('2027-03-14T18:05:00+05:00'), v: 1 },
        { id: 'dl-0777', owner: 'burger', status: 'confirmed', zone_id: 'z-1', point_id: 'p-900', option_ids: ['tf-express'], start: parseT('2027-03-16T14:00:00+05:00'), comment: '', created: parseT('2027-03-13T09:00:00+05:00'), v: 1 }
      ],
      idem: {}
    };
    const dur = ids => Math.ceil(ids.reduce((s, id) => s + ((api.OPTIONS.find(x => x.id === id) || {}).duration_min || 30), 0) / 30) * 30;
    const view = b => ({ id: b.id, status: b.status, zone_id: b.zone_id, point_id: b.point_id, option_ids: b.option_ids.slice(), start_at: fmtT(b.start), end_at: fmtT(b.start + dur(b.option_ids)), price_from: b.option_ids.reduce((s, id) => s + ((api.OPTIONS.find(x => x.id === id) || {}).price_from || 0), 0), comment: b.comment, created_at: fmtT(b.created) });
    const busy = (zone, start, d, skip) => st.deliveries.some(b => b.zone_id === zone && b.status === 'confirmed' && b.id !== skip && start < b.start + dur(b.option_ids) && b.start < start + d);

    function res(status, body, headers) {
      const h = Object.assign({}, headers || {});
      if (body != null && !h['Content-Type']) h['Content-Type'] = status >= 400 ? 'application/problem+json' : 'application/json; charset=utf-8';
      h['X-Request-Id'] = 'req-' + String(st.req).padStart(4, '0');
      return { status, statusText: api.STATUS_TEXT[status] || '', headers: h, body: body == null ? null : body };
    }
    const prob = (status, slug, title, detail, extra, headers) => res(status, Object.assign({ type: PROB + slug, title, status, detail }, extra || {}), headers);

    function call(rq) {
      st.req++;
      const method = String(rq.method || 'GET').toUpperCase();
      const H = {}; const htxt = rq.headers || '';
      (typeof htxt === 'string' ? htxt.split('\n') : Object.entries(htxt).map(([k, v]) => k + ': ' + v)).forEach(l => { const m = String(l).match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/); if (m) H[m[1].toLowerCase()] = m[2]; });
      let url = String(rq.url || '').trim();
      if (!url) return prob(400, 'bad-request', 'Пустой адрес', 'Укажите адрес запроса, например /v1/zones.');
      url = url.replace(/^https?:\/\/api\.iskra-online\.ru/i, '');
      if (/^https?:\/\//i.test(url)) return prob(400, 'bad-request', 'Чужой адрес', 'Учебная консоль ходит только в https://api.lozhka.ru.');
      const [pathRaw, qs] = url.split('?');
      const Q = {}; (qs || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); try { Q[decodeURIComponent(k)] = decodeURIComponent(v || ''); } catch (e) { Q[k] = v || ''; } });
      if (!/^\/v1(\/|$)/.test(pathRaw)) return prob(404, 'not-found', 'Нет такого адреса', `Все методы начинаются с /v1, а пришло ${pathRaw}. Версия API — часть адреса.`);
      const path = pathRaw.replace(/^\/v1/, '').replace(/\/+$/, '') || '/';
      const seg = path.split('/').filter(Boolean);
      if (H.accept && !/json|\*\/\*/.test(H.accept)) return prob(406, 'not-acceptable', 'Формат не поддерживается', `Сервер отдаёт только application/json, а в Accept указано «${H.accept}».`);
      if (st.req > 120) return prob(429, 'rate-limit', 'Слишком много запросов', 'Лимит учебного ключа — 120 запросов. Повторите через минуту.', null, { 'Retry-After': '60' });
      const rl = { 'RateLimit-Limit': '120', 'RateLimit-Remaining': String(Math.max(0, 120 - st.req)) };
      const allow = a => prob(405, 'method-not-allowed', 'Метод не поддерживается', `${method} для ${pathRaw} не поддерживается.`, null, { Allow: a });

      // аутентификация
      let who = null; const auth = H.authorization;
      const needAuth = () => {
        if (!auth) return prob(401, 'unauthorized', 'Нужна аутентификация', 'Передайте токен в заголовке Authorization: Bearer <токен>.', null, { 'WWW-Authenticate': 'Bearer realm="lozhka"' });
        const m = auth.match(/^Bearer\s+(\S+)$/i);
        if (!m) return prob(401, 'unauthorized', 'Неверная схема', 'Ожидается схема Bearer: Authorization: Bearer <токен>.', null, { 'WWW-Authenticate': 'Bearer realm="lozhka"' });
        if (m[1] === api.TOKEN) who = { p: 'testo', scopes: ['points:read', 'deliveries:read', 'deliveries:write'] };
        else if (m[1] === api.TOKEN_RO) who = { p: 'testo', scopes: ['points:read', 'deliveries:read'] };
        else return prob(401, 'unauthorized', 'Токен недействителен', 'Токен не найден или отозван.', null, { 'WWW-Authenticate': 'Bearer realm="lozhka", error="invalid_token"' });
        return null;
      };
      const scope = s => who.scopes.includes(s) ? null : prob(403, 'forbidden', 'Недостаточно прав', `Для этого метода нужен scope ${s}, у токена его нет.`, null, { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${s}"` });
      let body;
      const readBody = (types) => {
        const raw = rq.body == null ? '' : String(rq.body);
        if (!raw.trim()) { body = {}; return null; }
        const ct = H['content-type'] || '';
        if (!types.some(t => ct.toLowerCase().includes(t))) return prob(415, 'unsupported-media-type', 'Неверный формат тела', `Тело нужно передать как ${types.join(' или ')} и указать это в Content-Type; пришло «${ct || 'без Content-Type'}».`);
        try { body = JSON.parse(raw); } catch (e) { return prob(400, 'bad-request', 'Тело не разобрать', 'Тело — невалидный JSON: ' + e.message); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return prob(400, 'bad-request', 'Тело не разобрать', 'Ожидается JSON-объект { … }.');
        return null;
      };
      const slotRules = (start, d, errs, field) => {
        if (start == null) { errs.push({ field, code: 'format', message: 'Дата и время в формате ISO 8601 со смещением: 2027-03-16T15:00:00+05:00' }); return; }
        const hm = mskHM(start);
        if (hm % 30) errs.push({ field, code: 'grid', message: 'Окно — только с начала получаса: 15:00, 15:30…' });
        if (hm < 9 * 60 || hm + d > 23 * 60) errs.push({ field, code: 'hours', message: 'Курьеры работают 09:00–23:00; окно должно закончиться до 23:00.' });
        if (start < NOW + 120) errs.push({ field, code: 'too_soon', message: 'Курьера заказывают не позже чем за 2 часа до окна.' });
        if (start > NOW + 14 * 24 * 60) errs.push({ field, code: 'too_far', message: 'Заказать курьера можно не дальше чем на 14 дней вперёд.' });
      };
      const find = id => st.deliveries.find(b => b.id === id && b.owner === who.p);

      // маршруты
      if (seg[0] === 'zones') {
        if (method !== 'GET') return allow('GET');
        if (seg.length === 1) return res(200, { items: api.ZONES.map(x => Object.assign({}, x)) }, rl);
        const s = api.ZONES.find(x => x.id === seg[1]);
        if (!s) return prob(404, 'not-found', 'Зона не найдена', `Зоны ${seg[1]} нет. Список — GET /v1/zones.`);
        if (seg.length === 2) return res(200, Object.assign({}, s), rl);
        if (seg[2] === 'slots' && seg.length === 3) {
          if (!Q.date) return prob(400, 'bad-request', 'Не хватает параметра', 'Укажите дату: ?date=2027-03-16', { errors: [{ field: 'date', code: 'required', message: 'Обязательный параметр' }] });
          if (!/^\d{4}-\d{2}-\d{2}$/.test(Q.date)) return prob(400, 'bad-request', 'Неверный параметр', 'Дата — в формате ГГГГ-ММ-ДД.', { errors: [{ field: 'date', code: 'format', message: 'Формат ГГГГ-ММ-ДД' }] });
          const srv = Q.option_id ? api.OPTIONS.find(x => x.id === Q.option_id) : null;
          if (Q.option_id && !srv) return prob(400, 'bad-request', 'Неверный параметр', `Опции ${Q.option_id} нет. Каталог — GET /v1/options.`, { errors: [{ field: 'option_id', code: 'unknown', message: 'Нет такой опции' }] });
          const d = srv ? Math.ceil(srv.duration_min / 30) * 30 : 30, out = [], day = parseT(Q.date + 'T00:00:00+05:00');
          for (let m = 9 * 60; m + d <= 23 * 60; m += 30) { const t = day + m; if (t >= NOW + 120 && !busy(s.id, t, d)) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`); }
          return res(200, { zone_id: s.id, date: Q.date, option_id: srv ? srv.id : null, duration_min: d, slots: out }, rl);
        }
        return prob(404, 'not-found', 'Нет такого адреса', `Метода ${pathRaw} нет.`);
      }
      if (seg[0] === 'options' && seg.length === 1) { if (method !== 'GET') return allow('GET'); return res(200, { items: api.OPTIONS.map(x => Object.assign({}, x)) }, rl); }
      if (seg[0] === 'points' && seg.length === 1) {
        if (method !== 'GET') return allow('GET');
        const e = needAuth() || scope('points:read'); if (e) return e;
        return res(200, { items: api.POINTS.map(x => Object.assign({}, x)) }, rl);
      }
      if (seg[0] === 'deliveries') {
        if (seg.length === 1) {
          if (method === 'GET') {
            const e = needAuth() || scope('deliveries:read'); if (e) return e;
            let list = st.deliveries.filter(b => b.owner === who.p).sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
            if (Q.status) { if (!api.STATUS_RU[Q.status]) return prob(400, 'bad-request', 'Неверный параметр', `status — одно из: ${Object.keys(api.STATUS_RU).join(', ')}.`, { errors: [{ field: 'status', code: 'enum', message: 'Недопустимое значение' }] }); list = list.filter(b => b.status === Q.status); }
            if (Q.zone_id) list = list.filter(b => b.zone_id === Q.zone_id);
            const limit = Q.limit == null ? 20 : +Q.limit;
            if (!Number.isInteger(limit) || limit < 1 || limit > 100) return prob(400, 'bad-request', 'Неверный параметр', 'limit — целое от 1 до 100.', { errors: [{ field: 'limit', code: 'range', message: 'От 1 до 100' }] });
            let from = 0;
            if (Q.cursor) { let id = null; try { id = atob(Q.cursor); } catch (x) { } const i = list.findIndex(b => b.id === id); if (i < 0) return prob(400, 'bad-request', 'Неверный курсор', 'Курсор не распознан: берите next_cursor из прошлого ответа без изменений.'); from = i + 1; }
            const page = list.slice(from, from + limit), more = from + limit < list.length;
            return res(200, { items: page.map(view), next_cursor: more ? btoa(page[page.length - 1].id) : null }, rl);
          }
          if (method === 'POST') {
            const e = needAuth() || scope('deliveries:write') || readBody(['application/json']); if (e) return e;
            const key = H['idempotency-key'], hash = JSON.stringify(body);
            if (key && st.idem[key]) {
              if (st.idem[key].hash !== hash) return prob(422, 'idempotency-key-reuse', 'Ключ уже использован', 'Этот Idempotency-Key уже был у запроса с другим телом. Для новой доставки — новый ключ.');
              const r0 = st.idem[key].res; return Object.assign({}, r0, { headers: Object.assign({}, r0.headers, { 'Idempotent-Replayed': 'true' }) });
            }
            const errs = [];
            const allowed = ['zone_id', 'point_id', 'option_ids', 'start_at', 'comment'];
            Object.keys(body).forEach(k => { if (!allowed.includes(k)) errs.push({ field: k, code: 'unknown_field', message: 'Поле не поддерживается: его нельзя задать при создании' }); });
            if (!body.zone_id) errs.push({ field: 'zone_id', code: 'required', message: 'Обязательное поле' }); else if (!api.ZONES.some(x => x.id === body.zone_id)) errs.push({ field: 'zone_id', code: 'unknown', message: 'Нет такой зоны' });
            if (!body.point_id) errs.push({ field: 'point_id', code: 'required', message: 'Обязательное поле' }); else if (!api.POINTS.some(x => x.id === body.point_id)) errs.push({ field: 'point_id', code: 'unknown', message: 'Это не ваша точка: список — GET /v1/points' });
            const ids = body.option_ids;
            if (!Array.isArray(ids) || !ids.length) errs.push({ field: 'option_ids', code: 'required', message: 'Непустой массив id опций доставки' }); else ids.forEach((id, i) => { if (!api.OPTIONS.some(x => x.id === id)) errs.push({ field: `option_ids[${i}]`, code: 'unknown', message: 'Нет такой опции' }); });
            if (body.comment != null && (typeof body.comment !== 'string' || body.comment.length > 500)) errs.push({ field: 'comment', code: 'format', message: 'Строка до 500 символов' });
            const start = body.start_at == null ? undefined : parseT(body.start_at), d = Array.isArray(ids) && ids.length ? dur(ids.filter(x => typeof x === 'string')) : 30;
            if (start === undefined) errs.push({ field: 'start_at', code: 'required', message: 'Обязательное поле' }); else slotRules(start, d, errs, 'start_at');
            if (errs.length) return prob(422, 'validation-error', 'Данные не прошли проверку', 'Исправьте поля из списка errors.', { errors: errs });
            if (busy(body.zone_id, start, d)) return prob(409, 'slot-taken', 'Слот занят', `На ${fmtT(start).slice(11, 16)} ${mskDate(start)} окно в зоне уже занято. Свободные окна — GET /v1/zones/${body.zone_id}/slots?date=${mskDate(start)}.`);
            const b = { id: 'dl-' + (++st.seq), owner: who.p, status: 'confirmed', zone_id: body.zone_id, point_id: body.point_id, option_ids: ids.slice(), start, comment: body.comment || '', created: NOW, v: 1 };
            st.deliveries.push(b);
            const r = res(201, view(b), Object.assign({ Location: '/v1/deliveries/' + b.id, ETag: `"v${b.v}"` }, rl));
            if (key) st.idem[key] = { hash, res: r };
            return r;
          }
          return allow('GET, POST');
        }
        const e0 = needAuth(); if (e0) return e0;
        const b = find(seg[1]);
        if (seg.length === 2) {
          if (method === 'GET') { const e = scope('deliveries:read'); if (e) return e; if (!b) return prob(404, 'not-found', 'Доставка не найдена', `Доставки ${seg[1]} нет среди ваших.`); if (H['if-none-match'] === `"v${b.v}"`) return res(304, null, { ETag: `"v${b.v}"` }); return res(200, view(b), Object.assign({ ETag: `"v${b.v}"` }, rl)); }
          if (method === 'PATCH') {
            const e = scope('deliveries:write') || readBody(['application/json', 'application/merge-patch+json']); if (e) return e;
            if (!b) return prob(404, 'not-found', 'Доставка не найдена', `Доставки ${seg[1]} нет среди ваших.`);
            if (H['if-match'] && H['if-match'] !== `"v${b.v}"`) return prob(412, 'precondition-failed', 'Доставку уже изменили', `If-Match ${H['if-match']}, а текущая версия "v${b.v}". Перечитайте доставку и повторите.`);
            const errs = [];
            Object.keys(body).forEach(k => { if (k !== 'start_at' && k !== 'comment') errs.push({ field: k, code: 'read_only', message: k === 'status' ? 'Статус меняется действиями: отмена — POST /v1/deliveries/{id}/cancel' : 'Поле нельзя изменить переносом' }); });
            if (!Object.keys(body).length) errs.push({ field: 'start_at', code: 'required', message: 'Передайте новое время start_at' });
            if (errs.length) return prob(422, 'validation-error', 'Данные не прошли проверку', 'Исправьте поля из списка errors.', { errors: errs });
            if (b.status !== 'confirmed') return prob(409, 'conflict', 'Доставку нельзя перенести', `Доставка в статусе «${api.STATUS_RU[b.status]}».`);
            if (body.start_at !== undefined) {
              if (b.start - NOW < 60) return prob(422, 'change-window-closed', 'Поздно переносить', 'Перенос — не позже чем за 1 час до окна.');
              const start = parseT(body.start_at), d = dur(b.option_ids), er2 = [];
              slotRules(start, d, er2, 'start_at');
              if (er2.length) return prob(422, 'validation-error', 'Данные не прошли проверку', 'Исправьте поля из списка errors.', { errors: er2 });
              if (busy(b.zone_id, start, d, b.id)) return prob(409, 'slot-taken', 'Слот занят', `На ${fmtT(start).slice(11, 16)} окно в зоне уже занято.`);
              b.start = start;
            }
            if (body.comment !== undefined) b.comment = String(body.comment);
            b.v++;
            return res(200, view(b), Object.assign({ ETag: `"v${b.v}"` }, rl));
          }
          return allow('GET, PATCH');
        }
        if (seg.length === 3 && seg[2] === 'cancel') {
          if (method !== 'POST') return allow('POST');
          const e = scope('deliveries:write') || readBody(['application/json']); if (e) return e;
          if (!b) return prob(404, 'not-found', 'Доставка не найдена', `Доставки ${seg[1]} нет среди ваших.`);
          if (b.status === 'cancelled') return prob(409, 'conflict', 'Уже отменена', 'Доставка уже в статусе «Отменена».');
          if (b.status !== 'confirmed') return prob(409, 'conflict', 'Доставку нельзя отменить', `Доставка в статусе «${api.STATUS_RU[b.status]}».`);
          if (b.start - NOW < 60) return prob(422, 'cancel-window-closed', 'Поздно отменять', 'Бесплатная отмена — не позже чем за 1 час до окна. Дальше — через поддержку «Ложки».');
          b.status = 'cancelled'; b.v++;
          return res(200, view(b), Object.assign({ ETag: `"v${b.v}"` }, rl));
        }
        return prob(404, 'not-found', 'Нет такого адреса', `Метода ${pathRaw} нет.`);
      }
      return prob(404, 'not-found', 'Нет такого адреса', `Метода ${pathRaw} нет. Каталог — в справочнике «API Ложки».`);
    }
    return { call, state: st };
  }
  api.server = server;
  api.replay = log => { const s = server(); return (log || []).map(rq => ({ req: rq, res: s.call(rq) })); };

  /* ---------- HTTP-сообщение текстом ---------- */
  api.reqText = rq => {
    const u = String(rq.url || '').replace(/^https?:\/\/api\.iskra-online\.ru/i, '');
    const hs = String(rq.headers || '').split('\n').map(s => s.trim()).filter(Boolean);
    return `${String(rq.method || 'GET').toUpperCase()} ${u} HTTP/1.1\nHost: api.lozhka.ru${hs.length ? '\n' + hs.join('\n') : ''}${rq.body && String(rq.body).trim() ? '\n\n' + String(rq.body).trim() : ''}`;
  };
  api.resText = r => `HTTP/1.1 ${r.status} ${r.statusText}\n${Object.entries(r.headers).map(([k, v]) => k + ': ' + v).join('\n')}${r.body != null ? '\n\n' + JSON.stringify(r.body, null, 2) : ''}`;

  /* ---------- живая консоль ----------
     cfg: { log:[{method,url,headers,body}], onChange(log), readonly, presets:[{t, req}], missions:[{t, f(results)}], start:{…} } */
  api.console = (el, cfg) => {
    const log = (cfg.log || []).slice();
    let cur = log.length - 1;
    const blank = cfg.start || { method: 'GET', url: '/v1/zones', headers: '', body: '' };
    let draft = Object.assign({}, cur >= 0 ? log[cur] : blank);
    function draw() {
      const R = api.replay(log), last = cur >= 0 ? R[cur] : null;
      const mis = cfg.missions ? cfg.missions.map(m => { try { return !!m.f(R); } catch (e) { return false; } }) : null;
      el.innerHTML = `<div class="api-con">
        ${cfg.readonly ? '' : `${cfg.presets ? `<div><div class="lbl">Готовые запросы</div><select data-pre><option value="">— выберите, чтобы подставить —</option>${cfg.presets.map((p, i) => `<option value="${i}">${esc(p.t)}</option>`).join('')}</select></div>` : ''}
        <div class="reqline"><select data-f="method" aria-label="Метод">${['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => `<option ${draft.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <input class="mono" data-f="url" aria-label="Адрес" value="${esc(draft.url || '')}" spellcheck="false" placeholder="/v1/zones">
          <button type="button" class="btn primary sm" data-send>Отправить</button></div>
        <div class="two"><div><div class="lbl">Заголовки (по одному на строку)</div><textarea data-f="headers" spellcheck="false" placeholder="Authorization: Bearer ${api.TOKEN}">${esc(draft.headers || '')}</textarea></div>
          <div><div class="lbl">Тело (JSON)</div><textarea data-f="body" spellcheck="false" placeholder="{ }">${esc(draft.body || '')}</textarea></div></div>`}
        ${log.length ? `<div><div class="lbl">Журнал · ${log.length} ${TR.plural(log.length, 'запрос', 'запроса', 'запросов')}</div><div class="api-hist">${R.map((x, i) => `<button type="button" data-h="${i}" class="${i === cur ? 'cur' : ''}"><span>${esc(String(x.req.method).toUpperCase())} ${esc(String(x.req.url).replace(/^https?:\/\/api\.iskra-online\.ru/i, '').slice(0, 34))}</span> <b class="s${String(x.res.status)[0]}">${x.res.status}</b></button>`).join('')}${cfg.readonly ? '' : '<button type="button" data-clr title="Начать с чистого сервера">⟲ сбросить</button>'}</div></div>` : ''}
        ${last ? `<div class="two res"><div>${ui.code(api.reqText(last.req), 'http', 'Запрос')}</div><div>${ui.code(api.resText(last.res), 'http', 'Ответ')}</div></div>` : '<p class="small dim">Отправьте запрос — здесь появятся запрос и ответ целиком, как их видит сеть.</p>'}
        ${mis ? `<div><div class="lbl">Задачи · ${mis.filter(Boolean).length} из ${mis.length}</div><div class="api-mis">${cfg.missions.map((m, i) => `<div class="${mis[i] ? 'on' : ''}"><span class="mk">${mis[i] ? '✓' : '○'}</span><span>${m.t}</span></div>`).join('')}</div></div>` : ''}
      </div>`;
    }
    const grab = () => { TR.$$('[data-f]', el).forEach(f => { draft[f.dataset.f] = f.value; }); };
    el.onclick = e => {
      if (e.target.closest('[data-send]')) { grab(); log.push({ method: draft.method, url: draft.url, headers: draft.headers, body: draft.body }); cur = log.length - 1; cfg.onChange && cfg.onChange(log.slice()); draw(); return; }
      const h = e.target.closest('[data-h]'); if (h) { cur = +h.dataset.h; draft = Object.assign({}, log[cur]); draw(); return; }
      if (e.target.closest('[data-clr]')) { log.length = 0; cur = -1; cfg.onChange && cfg.onChange([]); draw(); }
    };
    el.onchange = e => { const p = e.target.closest('[data-pre]'); if (p && p.value !== '') { draft = Object.assign({ headers: '', body: '' }, cfg.presets[+p.value].req); draw(); } };
    el.oninput = e => { const f = e.target.closest('[data-f]'); if (f) draft[f.dataset.f] = f.value; };
    draw();
  };
  // помощники для миссий
  api.m = {
    path: (x, re) => re.test(String(x.req.url).replace(/^https?:\/\/api\.iskra-online\.ru/i, '').split('?')[0]),
    any: (R, f) => R.some(f),
    hit: (R, method, re, status) => R.some(x => String(x.req.method).toUpperCase() === method && api.m.path(x, re) && (status == null || (Array.isArray(status) ? status.includes(x.res.status) : x.res.status === status)))
  };

  /* ---------- код построчно с номерами и отметками (для «найдите ошибки») ----------
     rows: [{s, k}] — k ключ строки; nums: {k:n}; marks: {k:'ok'|'bad'|'miss'}; hl: Set(k) */
  api.lines = (rows, lang, nums, marks, hl) => `<div class="api-lines">${rows.map((r, i) => { const k = r.k, mk = k && marks ? marks[k] : null; return `<div class="ln ${mk || (hl && k && hl.has(k) ? 'hl' : '')}"><span class="no">${i + 1}</span><span>${r.s === '' ? ' ' : ui.hl(r.s, lang)}</span><span>${k && nums && nums[k] ? `<span class="bdg">${nums[k]}</span>` : ''}</span></div>`; }).join('')}</div>`;
  api.L = (src, keys) => String(src).split('\n').map((s, i) => ({ s, k: keys && keys[i + 1] ? keys[i + 1] : null }));

  /* ---------- SHA-256, HMAC, base64url (синхронно, для JWT) ---------- */
  const utf8 = s => Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0));
  function sha256(bytes) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = bytes.length, m = bytes.slice(); m.push(0x80); while (m.length % 64 !== 56) m.push(0);
    const bl = l * 8; for (let i = 7; i >= 0; i--) m.push(i >= 4 ? 0 : (bl >>> (i * 8)) & 255);
    const W = new Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) { const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + W[i]) | 0, S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = []; H.forEach(x => { for (let i = 3; i >= 0; i--) out.push((x >>> (i * 8)) & 255); }); return out;
  }
  function hmac(keyStr, msgStr) {
    let k = utf8(keyStr); if (k.length > 64) k = sha256(k); while (k.length < 64) k.push(0);
    const ip = k.map(b => b ^ 0x36), op = k.map(b => b ^ 0x5c);
    return sha256(op.concat(sha256(ip.concat(utf8(msgStr)))));
  }
  const b64u = bytes => btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64uStr = s => b64u(utf8(s));
  const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); try { return decodeURIComponent(Array.from(bin, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')); } catch (e) { return bin; } };
  api.sha256 = sha256; api.hmac = hmac; api.b64u = b64u; api.b64uStr = b64uStr; api.unb64u = unb64u;
  api.JWT_SECRET = 'lozhka-demo-secret-2027';
  api.jwtSign = (header, payload, secret) => { const h = b64uStr(JSON.stringify(header)), p = b64uStr(JSON.stringify(payload)); return `${h}.${p}.${b64u(hmac(secret || api.JWT_SECRET, h + '.' + p))}`; };
  api.jwtDecode = tok => {
    const parts = String(tok || '').trim().split('.');
    if (parts.length !== 3) return { err: 'В JWT три части через точку: header.payload.signature.' };
    let header, payload;
    try { header = JSON.parse(unb64u(parts[0])); } catch (e) { return { err: 'Первая часть (header) — не base64url от JSON.' }; }
    try { payload = JSON.parse(unb64u(parts[1])); } catch (e) { return { err: 'Вторая часть (payload) — не base64url от JSON.' }; }
    const sigOk = header.alg === 'HS256' && b64u(hmac(api.JWT_SECRET, parts[0] + '.' + parts[1])) === parts[2];
    return { parts, header, payload, sigOk };
  };
  api.NOW_S = Math.floor(Date.parse(api.NOW) / 1000);
})();
