/* Модуль 2, занятие 3: OpenAPI — описываем контракт.
   Теория: how-oa-struct — устройство спецификации на живом файле API «Искры» (openapi, info, servers, paths, операция,
   parameters, requestBody, responses, components/schemas, $ref, security); how-oa-schema — JSON Schema: типы, форматы,
   required, enum, ограничения, readOnly, nullable, oneOf; how-oa-flow — contract-first: ревью, линтер, мок, генерация,
   документация, контрактные тесты.
   Практика: где в спецификации ответ на вопрос; напишите спецификацию слотов в YAML (свой разборщик YAML, живые
   признаки и превью операции); ошибки в спецификации; соответствует ли ответ контракту; ответ Глебу
   «сгенерирую из кода». TR.api.yaml — разборщик подмножества YAML (объекты, списки, строки, числа, [..], {..}, |). */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc, api = TR.api, K = TR.m5;
  const ID = 'a2-openapi';

  /* ---------- разборщик подмножества YAML ---------- */
  function yaml(src) {
    const L = [], errs = [];
    String(src || '').split('\n').forEach((raw, i) => {
      if (/^\s*#/.test(raw) || !raw.trim()) return;
      if (/^ *\t/.test(raw)) errs.push({ n: i + 1, t: 'Табуляция в отступе: в YAML отступы — только пробелы.' });
      let s = raw.replace(/\t/g, '  '), q = null, cut = s.length;
      for (let k = 0; k < s.length; k++) { const c = s[k]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#' && (k === 0 || /\s/.test(s[k - 1]))) { cut = k; break; } }
      s = s.slice(0, cut).replace(/\s+$/, '');
      if (!s.trim()) return;
      L.push({ ind: s.length - s.trimStart().length, t: s.trim(), n: i + 1 });
    });
    let i = 0;
    const unq = s => (/^"(.*)"$/.test(s) || /^'(.*)'$/.test(s)) ? s.slice(1, -1) : s;
    const splitTop = s => { const out = []; let d = 0, q = null, cur = ''; for (const c of s) { if (q) { if (c === q) q = null; cur += c; continue; } if (c === '"' || c === "'") { q = c; cur += c; continue; } if (c === '[' || c === '{') d++; if (c === ']' || c === '}') d--; if (c === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; };
    function scalar(s, n) {
      s = s.trim();
      if (s.startsWith('[')) { if (!s.endsWith(']')) { errs.push({ n, t: 'Не закрыта квадратная скобка ].' }); return []; } return splitTop(s.slice(1, -1)).map(x => scalar(x, n)); }
      if (s.startsWith('{')) { if (!s.endsWith('}')) { errs.push({ n, t: 'Не закрыта фигурная скобка }.' }); return {}; } const o = {}; splitTop(s.slice(1, -1)).forEach(kv => { const m = kv.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/); if (m) o[unq(m[1].trim())] = scalar(m[2], n); else errs.push({ n, t: `Не разобрать «${kv}» внутри { }: нужен вид ключ: значение.` }); }); return o; }
      if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
      if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
      if (/^(null|~)$/i.test(s)) return null;
      if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
      return s;
    }
    const isItem = t => t === '-' || t.startsWith('- ');
    const KEY = /^("[^"]*"|'[^']*'|[^\s"'][^:]*?)\s*:(?:\s+(.*))?$/;
    function block(ind) { const ln = L[i]; return isItem(ln.t) ? list(ln.ind) : map(ln.ind); }
    function text(ind, fold) { const parts = []; while (i < L.length && L[i].ind > ind) { parts.push(L[i].t); i++; } return parts.join(fold ? ' ' : '\n'); }
    function map(ind) {
      const o = {};
      while (i < L.length && L[i].ind === ind && !isItem(L[i].t)) {
        const ln = L[i], m = ln.t.match(KEY);
        if (!m) { errs.push({ n: ln.n, t: `Не разобрать строку «${ln.t}»: ожидается ключ: значение.` }); i++; continue; }
        const k = unq(m[1].trim()), rest = m[2]; i++;
        if (k in o) errs.push({ n: ln.n, t: `Ключ «${k}» повторяется на одном уровне.` });
        if (rest == null || rest === '') {
          if (i < L.length && L[i].ind > ind) o[k] = block(L[i].ind);
          else if (i < L.length && L[i].ind === ind && isItem(L[i].t)) o[k] = list(ind);
          else o[k] = null;
        } else if (rest === '|' || rest === '>') o[k] = text(ind, rest === '>');
        else o[k] = scalar(rest, ln.n);
      }
      if (i < L.length && L[i].ind > ind) { errs.push({ n: L[i].n, t: 'Лишний отступ: строка сдвинута сильнее, чем соседние ключи.' }); while (i < L.length && L[i].ind > ind) i++; }
      return o;
    }
    function list(ind) {
      const a = [];
      while (i < L.length && L[i].ind === ind && isItem(L[i].t)) {
        const ln = L[i], rest = ln.t === '-' ? '' : ln.t.slice(2).trim();
        if (!rest) { i++; a.push(i < L.length && L[i].ind > ind ? block(L[i].ind) : null); continue; }
        if (KEY.test(rest) && !/^["'[{]/.test(rest)) { L[i] = { ind: ind + (ln.t.length - rest.length), t: rest, n: ln.n }; a.push(map(L[i].ind)); continue; }
        i++; a.push(scalar(rest, ln.n));
      }
      return a;
    }
    let v = null;
    if (L.length) { try { v = block(L[0].ind); if (i < L.length) errs.push({ n: L[i].n, t: 'Строка с меньшим отступом, чем начало документа.' }); } catch (e) { errs.push({ n: 0, t: 'Не удалось разобрать: ' + e.message }); } }
    return { v, errs };
  }
  api.yaml = yaml;
  const deref = (root, x, d) => { d = d || 0; if (x && typeof x === 'object' && typeof x.$ref === 'string' && x.$ref.startsWith('#/') && d < 8) { let cur = root; x.$ref.slice(2).split('/').forEach(p => { cur = cur && cur[p.replace(/~1/g, '/').replace(/~0/g, '~')]; }); return deref(root, cur, d + 1); } return x; };
  api.deref = deref;

  /* ---------- спецификация «Искры» (фрагмент) ---------- */
  const SPEC = `openapi: 3.1.0
info:
  title: API «Искры Онлайн» для партнёров
  version: 1.4.0
servers:
  - url: https://api.iskra-online.ru/v1
security:
  - bearerAuth: []
paths:
  /stations/{station_id}/slots:
    get:
      operationId: listSlots
      summary: Свободные слоты станции на дату
      security: []
      parameters:
        - name: station_id
          in: path
          required: true
          schema: { type: string, example: st-1 }
        - name: date
          in: query
          required: true
          schema: { type: string, format: date }
      responses:
        '200':
          description: Слоты найдены
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Slots' }
        '404':
          $ref: '#/components/responses/NotFound'
  /bookings:
    post:
      operationId: createBooking
      summary: Создать запись
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema: { type: string, maxLength: 64 }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/BookingCreate' }
      responses:
        '201':
          description: Запись создана
          headers:
            Location: { schema: { type: string } }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Booking' }
        '409':
          $ref: '#/components/responses/Conflict'
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    Booking:
      type: object
      required: [id, status, station_id, start_at]
      properties:
        id: { type: string, readOnly: true }
        status:
          type: string
          enum: [confirmed, cancelled, completed, no_show]
        start_at: { type: string, format: date-time }`;
  const SEC = (() => {
    const out = {}; let top = '', blk = '';
    SPEC.split('\n').forEach((ln, i) => {
      const ind = ln.length - ln.trimStart().length, t = ln.trim(); let k;
      if (ind === 0) { top = t.replace(/:.*$/, ''); blk = ''; k = { openapi: 'ver', info: 'info', servers: 'srv', security: 'sec', paths: 'paths', components: 'schema' }[top]; }
      else if (top === 'info') k = 'info'; else if (top === 'servers') k = 'srv'; else if (top === 'security') k = 'sec';
      else if (top === 'paths') {
        if (ind === 2) { k = 'paths'; blk = ''; } else if (ind === 4) { k = 'op'; blk = ''; }
        else if (ind === 6) { blk = /^(parameters|requestBody|responses|security)/.test(t) ? t.replace(/:.*$/, '') : ''; k = blk === 'parameters' ? 'param' : blk === 'requestBody' ? 'body' : blk === 'responses' ? 'resp' : blk === 'security' ? 'sec' : 'op'; }
        else k = blk === 'parameters' ? 'param' : blk === 'requestBody' ? 'body' : blk === 'responses' ? 'resp' : 'op';
      } else if (top === 'components') { if (ind === 2) blk = t.replace(/:.*$/, ''); k = blk === 'securitySchemes' ? 'sec' : 'schema'; }
      if (/\$ref/.test(t)) k = 'ref';
      out[i + 1] = k;
    });
    return out;
  })();
  const SPEC_L = api.L(SPEC, SEC);
  const PARTS = [
    { k: 'ver', t: 'openapi', html: '<b>Версия стандарта OpenAPI</b>, а не вашего API: 3.0.x или 3.1.x. В 3.1 схемы — полноценный JSON Schema 2020-12. Swagger 2.0 — старое имя и старая версия формата.' },
    { k: 'info', t: 'info', html: '<b>Паспорт API</b>: название, версия <i>вашего</i> API (1.4.0 — семантическое версионирование), описание, контакты, условия. Версия в info растёт с каждым изменением, а /v1 в адресе меняется только при ломающих.' },
    { k: 'srv', t: 'servers', html: '<b>Базовые адреса</b>: боевой, тестовый стенд, песочница. Пути в paths пишутся относительно них — поэтому /v1 здесь, а не в каждом пути.' },
    { k: 'sec', t: 'security', html: '<b>Как аутентифицироваться.</b> В components/securitySchemes описана схема (Bearer-токен), а security наверху делает её обязательной для всех операций. <code>security: []</code> у операции снимает требование — слоты открыты без токена.' },
    { k: 'paths', t: 'paths', html: '<b>Адреса API.</b> Ключ — путь с параметрами в фигурных скобках. Внутри — методы: get, post, patch…' },
    { k: 'op', t: 'Операция', html: '<b>Метод на пути</b>: operationId (имя функции в сгенерированном клиенте — listSlots, createBooking), summary и description для документации, теги для группировки.' },
    { k: 'param', t: 'parameters', html: '<b>Параметры</b> с местом <code>in</code>: path (часть пути — всегда required: true), query (после «?»), header, cookie. У каждого — schema с типом и форматом. Idempotency-Key описан как обязательный заголовок.' },
    { k: 'body', t: 'requestBody', html: '<b>Тело запроса</b>: обязательно ли оно и в каком медиатипе. Схема — обычно ссылка на components: так одна схема служит и документации, и проверке запросов.' },
    { k: 'resp', t: 'responses', html: '<b>Ответы по кодам</b>: описание, заголовки (Location на 201), тело по медиатипам. Коды — строки в кавычках: <code>\'200\'</code>. Опишите все ошибки, на которые клиент должен реагировать, а не только успех.' },
    { k: 'ref', t: '$ref', html: '<b>Ссылка на описание в другом месте</b>: <code>#/components/schemas/Booking</code>. Одна схема — много мест использования. Можно ссылаться и на другой файл: <code>common.yaml#/components/responses/NotFound</code>.' },
    { k: 'schema', t: 'components / schemas', html: '<b>Переиспользуемые части</b>: схемы данных, ответы, параметры, схемы безопасности. Booking — модель записи: обязательные поля, типы, форматы, перечисление статусов, readOnly у id (его задаёт сервер).' }
  ];
  const howStruct = {
    id: 'how-oa-struct', covers: ['where', 'editor'], title: 'Как это работает: из чего состоит спецификация OpenAPI', free: true, noReset: true,
    simple: { icon: '📘', title: 'Простыми словами', plain: 'OpenAPI — стандартный формат, в котором контракт REST API записан так, что его понимают и люди, и программы. Из одного файла получаются документация, мок-сервер, клиентский код для «Шашки» и автотесты.', analogy: 'Чертёж дома по ГОСТу. Прораб, электрик и заказчик читают один и тот же чертёж, и каждый находит своё — потому что условные обозначения у всех одни.', tech: 'OpenAPI Specification 3.1 (OpenAPI Initiative, Linux Foundation), бывший Swagger. Файл в YAML или JSON; схемы данных — JSON Schema 2020-12.' },
    render(el) {
      el.classList.add('api-root');
      let cur = 'paths';
      const draw = () => {
        const c = PARTS.find(x => x.k === cur);
        el.innerHTML = `<div class="api-root"><p>Фрагмент настоящей спецификации партнёрского API. Нажмите на раздел — он подсветится в файле.</p>
          <div class="api-chips" role="group" aria-label="Разделы спецификации">${PARTS.map(x => `<button type="button" class="chip" data-p="${x.k}" aria-pressed="${x.k === cur}">${esc(x.t)}</button>`).join('')}</div>
          <div class="api-two"><div style="max-height:620px;overflow:auto">${api.lines(SPEC_L, 'yaml', null, null, new Set([cur]))}</div><div class="stack"><div class="api-info" aria-live="polite"><b>${esc(c.t)}</b><div>${c.html}</div></div>
          ${ui.note('warn', 'Частые ошибки', 'Путевой параметр без required: true; коды ответов без кавычек; описан только 200; схема в каждом ответе скопирована, а не вынесена в components; отступы табуляцией.')}
          ${ui.note('', 'Как спросят на собеседовании', '«Что такое OpenAPI и зачем аналитику?» — Машиночитаемое описание REST API. Аналитик фиксирует в нём контракт до разработки: из него делают документацию, мок, клиентский код и тесты, и фронтенд с бэкендом работают параллельно.')}</div></div></div>`;
      };
      el.onclick = e => { const b = e.target.closest('[data-p]'); if (b) { cur = b.dataset.p; draw(); } };
      draw();
    }
  };

  const howSchema = K.textTheory({
    id: 'how-oa-schema', covers: ['bugs', 'conform'], title: 'Как это работает: схемы данных (JSON Schema)',
    simple: { icon: '🧩', title: 'Простыми словами', plain: 'Схема описывает, какими могут быть данные: тип поля, формат, обязательность, допустимые значения и границы. По схеме сервер проверяет запросы, а клиент знает, что придёт в ответе.', analogy: 'Бланк с правилами заполнения: «дата — ДД.ММ.ГГГГ», «телефон — 11 цифр», «поле со звёздочкой обязательно», «пол — М или Ж».', tech: 'OpenAPI 3.1 использует JSON Schema 2020-12 целиком. В 3.0 — его диалект: например, nullable: true вместо type: [string, "null"], и example вместо examples.' },
    table: { head: ['Ключевое слово', 'Что задаёт', 'Пример для «Искры»'], rows: [
      ['type', 'Тип: string, integer, number, boolean, object, array', 'price_from: { type: integer }'],
      ['format', 'Уточнение строки: date, date-time, uuid, email, uri', 'start_at: { type: string, format: date-time }'],
      ['required', 'Список обязательных полей объекта (на уровне объекта!)', 'required: [station_id, vehicle_id, service_ids, start_at]'],
      ['enum', 'Допустимые значения', 'status: enum [confirmed, cancelled, completed, no_show]'],
      ['minimum / maximum', 'Границы числа', 'limit: { type: integer, minimum: 1, maximum: 100 }'],
      ['minLength / maxLength / pattern', 'Длина и шаблон строки', 'plate: { pattern: "^[АВЕКМНОРСТУХ]\\\\d{3}[А-Я]{2}\\\\d{2,3}$" }'],
      ['items / minItems', 'Элементы массива и их количество', 'service_ids: { type: array, items: { type: string }, minItems: 1 }'],
      ['readOnly / writeOnly', 'Поле только в ответе / только в запросе', 'id: { readOnly: true }, secret: { writeOnly: true }'],
      ['null', 'Поле может быть пустым', '3.1: type: [string, "null"]; 3.0: nullable: true'],
      ['oneOf / allOf', 'Один из вариантов / объединение схем', 'BookingCreate = allOf [BookingBase, { required: … }]'],
      ['description, examples', 'Смысл поля и примеры — для людей и моков', 'description: Цена «от» в рублях по каталогу']
    ] },
    code: {
      'Схема в YAML': 'BookingCreate:\n  type: object\n  required: [station_id, vehicle_id, service_ids, start_at]\n  additionalProperties: false\n  properties:\n    station_id: { type: string, example: st-1 }\n    vehicle_id: { type: string, example: v-41 }\n    service_ids:\n      type: array\n      items: { type: string }\n      minItems: 1\n    start_at:\n      type: string\n      format: date-time\n      description: Начало записи, ISO 8601 со смещением\n    comment: { type: string, maxLength: 500 }',
      'То же в JSON': '"BookingCreate": {\n  "type": "object",\n  "required": ["station_id", "vehicle_id", "service_ids", "start_at"],\n  "additionalProperties": false,\n  "properties": {\n    "station_id": { "type": "string", "example": "st-1" },\n    "service_ids": { "type": "array", "items": { "type": "string" }, "minItems": 1 },\n    "start_at": { "type": "string", "format": "date-time" },\n    "comment": { "type": "string", "maxLength": 500 }\n  }\n}',
      'Из модели данных': '-- таблица в базе                 → поле в API\nbooking.id           bigint       → id: string (bk-…), readOnly\nbooking.status       varchar(12)  → status: enum, коды на английском\nbooking.start_ts     timestamptz  → start_at: date-time со смещением\nbooking.created_by   bigint       → не отдаём: внутреннее\nclient.phone         varchar(16)  → не отдаём партнёру: ПДн'
    },
    notes: [['warn', 'Частая ошибка', '«type: date» — такого типа нет. Дата — это type: string, format: date. И required пишут списком у объекта, а не «required: true» у каждого свойства (так только у parameters).'], ['info', 'Схема API ≠ таблица', 'Не всё из базы попадает в API: внутренние id, служебные поля и чужие персональные данные остаются внутри. Имена — понятные клиенту, а не колонки базы.']]
  });

  const FLOW = {
    W: 880, H: 230,
    nodes: [
      { id: 'req', kind: 'box', t: 'Требования и сценарии', sub: 'аналитик', x: 10, y: 20, w: 150 },
      { id: 'spec', kind: 'sys', t: 'openapi.yaml', sub: 'в git, ревью как код', x: 200, y: 20, w: 150 },
      { id: 'lint', kind: 'box', t: 'Линтер', sub: 'Spectral, правила стиля', x: 200, y: 140, w: 150 },
      { id: 'mock', kind: 'cont', t: 'Мок-сервер', sub: 'Prism — «Шашка» начинает сразу', x: 400, y: 20, w: 170 },
      { id: 'gen', kind: 'cont', t: 'Генерация кода', sub: 'клиент «Шашки», заготовки сервера', x: 400, y: 140, w: 170 },
      { id: 'doc', kind: 'cont', t: 'Документация', sub: 'Swagger UI, Redoc', x: 620, y: 20, w: 170 },
      { id: 'test', kind: 'cont', t: 'Контрактные тесты', sub: 'Schemathesis, Dredd', x: 620, y: 140, w: 170 }
    ],
    edges: [{ a: 'req', b: 'spec' }, { a: 'spec', b: 'lint', both: true, t: 'проверка' }, { a: 'spec', b: 'mock' }, { a: 'spec', b: 'gen' }, { a: 'spec', b: 'doc', via: [[275, 8], [705, 8]], ax: 275, ay: 20, bx: 705, by: 20 }, { a: 'gen', b: 'test', t: 'проверяют реализацию' }]
  };
  const howFlow = K.textTheory({
    id: 'how-oa-flow', covers: ['justify'], title: 'Как это работает: contract-first — спецификация до кода',
    simple: { icon: '🏗', title: 'Простыми словами', plain: 'Contract-first — сначала договариваемся о контракте и записываем его в OpenAPI, потом пишем код. Code-first — сначала код, а спецификацию генерируем из него. Для партнёрского API выигрывает contract-first: «Шашка» начинает разработку по моку в тот же день, а не ждёт наш бэкенд.', analogy: 'Сначала архитектор рисует проект дома, его согласуют с заказчиком, а потом строят. «Строим, а проект нарисуем по готовому дому» — дешевле в начале и дороже, когда окажется, что окна не там.', tech: 'Spectral — линтер OpenAPI; Prism — мок-сервер по спецификации; openapi-generator — генерация клиентов и серверов на 50+ языках; Swagger UI и Redoc — документация; Schemathesis и Dredd — проверка, что реализация соответствует контракту.' },
    svg: () => K.graph(FLOW, { label: 'Жизненный цикл спецификации' }),
    table: { head: ['', 'Contract-first', 'Code-first'], rows: [
      ['Когда появляется контракт', 'До разработки, его ревьюят', 'После, из аннотаций в коде'],
      ['Партнёр и фронтенд', 'Работают параллельно по моку', 'Ждут готовый бэкенд'],
      ['Кто владеет контрактом', 'Аналитик и команда, по требованиям', 'Фактически — реализация'],
      ['Риск', 'Расхождение кода и спецификации — ловят контрактными тестами', 'Контракт отражает случайные решения кода, ломается незаметно'],
      ['Когда уместен', 'Партнёрские и публичные API, несколько команд', 'Внутренний прототип одной команды']
    ] },
    notes: [['', 'Как спросят на собеседовании', '«Contract-first или code-first?» — Для внешних API — contract-first: контракт согласуется до кода, по нему параллельно работают клиенты и сервер, расхождения ловят контрактными тестами в CI. Code-first допустим для внутренних прототипов.']]
  });

  /* =====================================================================
     ПРАКТИКА
     ===================================================================== */
  const taskWhere = K.matchTask({
    id: 'where', title: 'Где в спецификации ответ на вопрос',
    simple: howStruct.simple,
    situation: 'Игорь открыл спецификацию впервые и пишет вопросы в чат. Ответьте, в каком разделе он найдёт ответ, — так он научится читать файл сам.',
    look: 'Разделы — в теории «Из чего состоит спецификация». Пример: «какой адрес тестового стенда» — servers.',
    choices: [{ v: 'info', t: 'info' }, { v: 'servers', t: 'servers' }, { v: 'paths', t: 'paths (пути и методы)' }, { v: 'parameters', t: 'parameters' }, { v: 'body', t: 'requestBody' }, { v: 'responses', t: 'responses' }, { v: 'schemas', t: 'components/schemas' }, { v: 'security', t: 'securitySchemes / security' }],
    rows: [
      { id: 'w1', t: 'Какой базовый адрес у песочницы?', a: 'servers', why: 'Все базовые адреса — в servers.' },
      { id: 'w2', t: 'Какая сейчас версия API и куда писать по вопросам?', a: 'info', why: 'info.version и info.contact.' },
      { id: 'w3', t: 'Обязателен ли параметр date у слотов и в каком формате?', a: 'parameters', why: 'parameters: required и schema.format.' },
      { id: 'w4', t: 'Какие поля передать при создании записи?', a: 'body', why: 'requestBody → схема BookingCreate.' },
      { id: 'w5', t: 'Что вернётся, если слот уже занят?', a: 'responses', why: 'responses → \'409\'.' },
      { id: 'w6', t: 'Какие значения бывают у status записи?', a: 'schemas', why: 'components/schemas/Booking → status.enum.' },
      { id: 'w7', t: 'Как передавать токен?', a: 'security', why: 'securitySchemes: http bearer, security — где обязателен.' },
      { id: 'w8', t: 'Есть ли вообще метод для переноса записи?', a: 'paths', why: 'paths → /bookings/{booking_id} → patch.' }
    ],
    need: 7,
    mentor: 'Где адреса — servers; кто я и как войти — security; что отправить — parameters или requestBody; что придёт — responses; как устроены данные — schemas; паспорт — info; есть ли метод — paths.',
    explain: `<p>Умение быстро найти ответ в спецификации — базовый навык и аналитика, и разработчика. Обратите внимание на связку requestBody/responses → $ref → components/schemas: в реальных файлах ответ почти всегда «по ссылке».</p><p>Источник: OpenAPI Specification 3.1.0, раздел 4 «Specification» (spec.openapis.org).</p>`
  });

  /* ---------- редактор спецификации ---------- */
  const ESTART = `openapi: 3.1.0
info:
  title: API «Искры Онлайн» для партнёров
  version: 1.0.0
servers:
  - url: https://api.iskra-online.ru/v1
paths:
  /stations/{station_id}/slots:
    get:
      summary: Свободные слоты станции на дату
      parameters:
        - name: station_id
          in: path
      # допишите параметры date и service_id и ответы 200, 400, 404
`;
  const EREF = `openapi: 3.1.0
info:
  title: API «Искры Онлайн» для партнёров
  version: 1.0.0
servers:
  - url: https://api.iskra-online.ru/v1
paths:
  /stations/{station_id}/slots:
    get:
      operationId: listSlots
      summary: Свободные слоты станции на дату
      parameters:
        - name: station_id
          in: path
          required: true
          schema: { type: string }
        - name: date
          in: query
          required: true
          schema: { type: string, format: date }
        - name: service_id
          in: query
          required: false
          schema: { type: string }
      responses:
        '200':
          description: Слоты найдены
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Slots' }
        '400':
          description: Неверная дата
        '404':
          description: Станция не найдена
components:
  schemas:
    Slots:
      type: object
      required: [station_id, date, slots]
      properties:
        station_id: { type: string }
        date: { type: string, format: date }
        slots:
          type: array
          items: { type: string, example: '15:00' }`;
  const opOf = s => { const p = s && s.paths; if (!p || typeof p !== 'object') return null; const k = Object.keys(p).find(x => /^(\/v1)?\/stations\/\{[a-z_]+\}\/slots$/.test(x)); return k && p[k] && p[k].get ? { key: k, op: p[k].get } : null; };
  const prm = (o, name) => o && Array.isArray(o.op.parameters) ? o.op.parameters.find(x => x && x.name === name) : null;
  const resp = (o, c) => o && o.op.responses && (o.op.responses[c] || o.op.responses[+c]);
  const EF = [
    { t: 'YAML разбирается без ошибок', f: (r) => !!r.v && !r.errs.length },
    { t: 'openapi: 3.0.x или 3.1.x', f: (r) => r.v && /^3\.[01]\.\d+$/.test(String(r.v.openapi)) },
    { t: 'Есть путь /stations/{station_id}/slots с операцией get', f: (r, o) => !!o },
    { t: 'station_id: in: path, required: true', f: (r, o) => { const p = prm(o, 'station_id'); return !!p && p.in === 'path' && p.required === true && o.key.includes('{station_id}'); } },
    { t: 'date: in: query, required: true, type: string, format: date', f: (r, o) => { const p = prm(o, 'date'); const s = p && deref(r.v, p.schema); return !!p && p.in === 'query' && p.required === true && s && s.type === 'string' && s.format === 'date'; } },
    { t: 'service_id: необязательный параметр query', f: (r, o) => { const p = prm(o, 'service_id'); return !!p && p.in === 'query' && p.required !== true; } },
    { t: "Ответ '200' с телом application/json и схемой", f: (r, o) => { const x = deref(r.v, resp(o, '200')); return !!(x && x.content && x.content['application/json'] && x.content['application/json'].schema); } },
    { t: 'В схеме ответа 200 есть массив slots', f: (r, o) => { const x = deref(r.v, resp(o, '200')); const s = x && x.content && x.content['application/json'] && deref(r.v, x.content['application/json'].schema); const sl = s && s.properties && deref(r.v, s.properties.slots); return !!(sl && sl.type === 'array'); } },
    { t: "Описаны ошибки '400' и '404'", f: (r, o) => !!(resp(o, '400') && resp(o, '404')) },
    { t: 'У каждого ответа есть description (или $ref)', f: (r, o) => { const rs = o && o.op.responses; return !!rs && Object.keys(rs).length > 0 && Object.values(rs).every(x => x && (x.description || x.$ref)); } }
  ];
  const eEval = t => { const r = yaml(t || ''); const o = r.v && typeof r.v === 'object' ? opOf(r.v) : null; const on = EF.map(f => { try { return !!f.f(r, o); } catch (e) { return false; } }); return { r, o, on, n: on.filter(Boolean).length }; };
  const preview = (r, o) => {
    if (!o) return '<p class="small dim" style="padding:8px">Здесь появится превью операции, когда в файле будет путь слотов с get.</p>';
    const ps = Array.isArray(o.op.parameters) ? o.op.parameters.filter(Boolean) : [];
    const rs = o.op.responses && typeof o.op.responses === 'object' ? o.op.responses : {};
    return `<div class="stack"><div>${ui.mth('GET')} <span class="api-mono">${esc(o.key)}</span></div>${o.op.summary ? `<div class="small">${esc(o.op.summary)}</div>` : ''}
      <table class="api-tbl"><thead><tr><th>Параметр</th><th>Где</th><th>Обяз.</th><th>Тип</th></tr></thead><tbody>${ps.map(p => { const s = deref(r.v, p.schema) || {}; return `<tr><td class="api-mono">${esc(p.name || '?')}</td><td>${esc(p.in || '—')}</td><td class="c">${p.required === true ? '✓' : ''}</td><td class="api-mono">${esc((s.type || '?') + (s.format ? ' / ' + s.format : ''))}</td></tr>`; }).join('') || '<tr><td colspan="4" class="dim">нет параметров</td></tr>'}</tbody></table>
      <div class="small">${Object.keys(rs).map(c => `${ui.st(c)} ${esc((deref(r.v, rs[c]) || {}).description || '')}`).join('<br>') || '<span class="dim">ответов нет</span>'}</div></div>`;
  };
  const taskEditor = {
    id: 'editor', title: 'Опишите слоты станции в OpenAPI',
    simple: howStruct.simple,
    lead: ui.brief({
      situation: 'Глеб: «Начинаем contract-first. Опиши в OpenAPI метод слотов — по нему я подниму мок для Игоря уже сегодня». Как метод работает сейчас — смотрите в справочнике «API Искры» и в консоли.',
      todo: ['Допишите спецификацию в YAML. Справа — превью операции, ниже — признаки.', 'Нажмите «Проверить». Засчитывается от 9 признаков из 10, включая «YAML разбирается без ошибок».'],
      lookTitle: 'Подсказка', look: 'Отступы — два пробела. Путевой параметр всегда required: true. Дата — type: string, format: date. Коды ответов — в кавычках: \'200\'. Схему ответа можно написать прямо в ответе или вынести в components/schemas и сослаться через $ref.'
    }),
    blank: () => ({ text: '' }),
    reference: () => ({ text: EREF }),
    render(el, ctx) {
      el.classList.add('api-root');
      const a = ctx.ans; if (!a.text && !ctx.readonly) a.text = ESTART;
      el.innerHTML = `<div class="api-root"><div class="api-two api-ed"><div class="stack"><textarea spellcheck="false" style="min-height:420px" aria-label="Спецификация OpenAPI в YAML" ${ctx.readonly ? 'readonly' : ''}></textarea><div class="stack" data-pm aria-live="polite"></div></div>
        <div class="stack"><div class="eyebrow">Превью операции</div><div class="m5k-board" data-pv style="padding:10px"></div><div class="eyebrow">Признаки</div><div class="api-feats" data-ft aria-live="polite"></div></div></div>
        <details class="small"><summary>Шпаргалка YAML</summary>${ui.code("ключ: значение\nобъект:\n  вложенный_ключ: значение      # отступ 2 пробела\nсписок:\n  - name: date                 # элемент списка — объект\n    in: query\nкоротко: { type: string, format: date }\nкоды: '200'                    # число-ключ в кавычках", 'yaml')}</details></div>`;
      const ta = TR.$('textarea', el); ta.value = a.text || '';
      ta.onkeydown = e => { if (e.key === 'Tab' && !ctx.readonly) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } };
      const upd = () => { const r = eEval(a.text); TR.$('[data-ft]', el).innerHTML = EF.map((f, i) => `<div class="api-feat ${r.on[i] ? 'on' : ''}"><span class="mk">${r.on[i] ? '✓' : '○'}</span><span>${esc(f.t)}</span></div>`).join(''); TR.$('[data-pm]', el).innerHTML = r.r.errs.slice(0, 4).map(m => `<div class="api-pm">${m.n ? 'Строка ' + m.n + ': ' : ''}${esc(m.t)}</div>`).join(''); TR.$('[data-pv]', el).innerHTML = preview(r.r, r.o); };
      if (!ctx.readonly) ta.oninput = () => { a.text = ta.value; ctx.save(); upd(); };
      upd();
    },
    check(ans) {
      const r = eEval(ans && ans.text), notes = EF.map((f, i) => ({ ok: r.on[i], html: esc(f.t) + (r.on[i] ? '' : ' — нет.') }));
      r.r.errs.slice(0, 3).forEach(m => notes.push({ ok: false, html: `${m.n ? 'Строка ' + m.n + ': ' : ''}${esc(m.t)}` }));
      return { ok: r.n >= 9 && r.on[0], score: r.n / EF.length, notes, summary: `Признаков: ${r.n} из ${EF.length}.`, mentor: r.n >= 9 && r.on[0] ? null : !r.on[0] ? 'Сначала добейтесь разбора без ошибок: отступы пробелами, двоеточие и пробел после ключа.' : 'Проверьте параметры (required, format) и ответы: 200 со схемой, где есть массив slots, плюс 400 и 404 с description.' };
    },
    explain: `<p>В эталоне три параметра (путевой обязателен всегда, дата обязательна и имеет формат date, услуга — необязательна), ответ 200 со схемой Slots в components и две ошибки. operationId <code>listSlots</code> станет именем метода в клиенте «Шашки», сгенерированном openapi-generator.</p>
      <p>Проверьте себя в реальных инструментах: вставьте файл в editor.swagger.io — он покажет документацию и ошибки; линтер Spectral (stoplight.io) проверит стиль. Источник: OpenAPI Specification 3.1.0 — Parameter Object, Responses Object.</p>`,
    refNote: 'Засчитывается любая спецификация с 9 признаками из 10 и разбором без ошибок. Разборщик понимает основное подмножество YAML: объекты, списки, строки, числа, { } и [ ].',
    report: ans => { const r = eEval(ans && ans.text); return `- Признаков: ${r.n}/${EF.length}\n\n\`\`\`yaml\n${(ans && ans.text) || ''}\n\`\`\``; }
  };

  /* ---------- ошибки в спецификации ---------- */
  const BUG = `paths:
  /bookings/{booking_id}:
    get:
      operationId: getBooking
      parameters:
        - name: booking_id
          in: path
          required: false
  /bookings:
    post:
      operationId: createBooking
      responses:
        '200':
          description: Запись создана
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    Booking:
      type: object
      required: [id, status, start_time]
      properties:
        id: { type: string, readOnly: true }
        status: { type: string, enum: [new, in_work, done] }
        start_at: { type: string, format: date-time }
        visit_date: { type: date }
        price_from: { $ref: '#/components/schemas/Money' }`;
  const BUGK = { 4: 'a', 8: 'b', 11: 'c', 13: 'd', 17: 'e', 21: 'f', 23: 'g', 24: 'h', 25: 'i', 26: 'j', 27: 'k' };
  const BUG_L = api.L(BUG, BUGK);
  const taskBugs = K.bugsTask({
    id: 'bugs', title: 'Найдите ошибки в спецификации',
    simple: howSchema.simple,
    situation: 'Стажёр прислал первую версию спецификации на ревью. Глеб уже собирается генерировать по ней код — успейте отметить ошибки.',
    look: 'Проверьте: путевые параметры, код успеха при создании, совпадают ли имена в required и properties, статусы с реальными, существующие ли типы.',
    items: [
      { k: 'a', t: 'operationId: getBooking' },
      { k: 'b', t: 'Путевой параметр booking_id: required: false', err: 'Путевой параметр всегда обязателен — без него адреса нет. По спецификации required: true обязателен для in: path.' },
      { k: 'c', t: 'operationId: createBooking' },
      { k: 'd', t: "Создание записи отвечает '200'", err: "Создание — '201' с заголовком Location. Плюс не описаны ошибки: 409, 422." },
      { k: 'e', t: 'securitySchemes: bearer' },
      { k: 'f', t: 'required: [id, status, start_time]', err: 'В required — start_time, а свойство называется start_at. Сгенерированный код и валидатор потребуют поле, которого нет.' },
      { k: 'g', t: 'id: readOnly: true' },
      { k: 'h', t: 'status: enum [new, in_work, done]', err: 'Статусы не совпадают с реальными: confirmed, cancelled, completed, no_show. Клиенты получат значения вне перечисления.' },
      { k: 'i', t: 'start_at: string, date-time' },
      { k: 'j', t: 'visit_date: { type: date }', err: 'Типа date нет: дата — type: string, format: date. Да и поле дублирует start_at.' },
      { k: 'k', t: "price_from: $ref на Money" }
    ],
    svg: (nums, marks) => api.lines(BUG_L, 'yaml', nums, marks),
    mentor: 'Пять ошибок: путевой параметр, код создания, имя в required, перечисление статусов и несуществующий тип.',
    explain: `<p>Все пять ошибок пропускают глаза, но ловят инструменты: Spectral и editor.swagger.io ругаются на путевой параметр без required и неизвестный тип; несовпадение required/properties и неверный enum ловят контрактные тесты (Schemathesis сгенерирует запросы и сверит ответы со схемой). Поэтому спецификацию проверяют линтером в CI при каждом изменении.</p>
      <p>Источники: OpenAPI Specification 3.1.0 — Parameter Object («If the parameter location is path, this field is REQUIRED and its value MUST be true»); JSON Schema 2020-12 Validation, раздел 6.1.</p>`
  });

  const taskConform = K.labTask({
    id: 'conform', title: 'Соответствует ли ответ контракту',
    simple: howSchema.simple,
    situation: 'Лиза сверяет ответы тестового стенда со спецификацией и для каждого расхождения спрашивает: это баг, это допустимо или всё в порядке?',
    look: 'Схема Booking: required [id, status, station_id, start_at]; status — enum [confirmed, cancelled, completed, no_show]; start_at — date-time; price_from — integer; comment — необязательный; дополнительные поля не запрещены. Создание — 201.',
    choices: [{ v: 'ok', t: 'Соответствует контракту' }, { v: 'ext', t: 'Допустимое расширение' }, { v: 'viol', t: 'Нарушает контракт — баг' }],
    items: [
      { id: 'c1', t: 'В ответе "start_at": "16.03.2027 09:00"', a: 'viol', good: 'Формат date-time — ISO 8601 со смещением. Такой строки клиент не разберёт.', badAny: 'Формат не соответствует date-time.' },
      { id: 'c2', t: 'В ответе есть поле "post_number": 3, которого нет в схеме', a: 'ext', good: 'Дополнительные поля не запрещены (нет additionalProperties: false), клиенты — tolerant reader. Но поле надо добавить в спецификацию.', badAny: 'Лишнее поле в ответе не ломает клиентов.' },
      { id: 'c3', t: 'POST /bookings вернул 200 вместо 201', a: 'viol', good: 'Клиент, который ждёт 201 и Location, сочтёт ответ неожиданным.', badAny: 'Код успеха — часть контракта.' },
      { id: 'c4', t: '"price_from": 4500', a: 'ok', good: 'integer — всё верно.', badAny: '4500 — целое число, как в схеме.' },
      { id: 'c5', t: 'В ответе нет поля comment', a: 'ok', good: 'comment необязательный — может отсутствовать.', badAny: 'Необязательное поле может не прийти.' },
      { id: 'c6', t: '"status": "in_work"', a: 'viol', good: 'Значение вне перечисления: клиент со строгой проверкой упадёт.', badAny: 'in_work нет в enum.' },
      { id: 'c7', t: 'Ответ 422 в формате application/problem+json с массивом errors, как описано', a: 'ok', good: 'Ошибка по контракту — тоже соответствие.', badAny: 'Описанная ошибка — это не нарушение.' },
      { id: 'c8', t: 'В ответе на GET /bookings/{id} нет поля id', a: 'viol', good: 'id в required — его отсутствие нарушает контракт.', badAny: 'Обязательное поле пропало.' }
    ],
    scoreLabel: 'Верных оценок',
    mentor: 'Сверяйте каждое поле со схемой: обязательность, тип и формат, перечисление; код ответа; разрешены ли дополнительные поля.',
    explain: `<p>Контрактные тесты делают ровно эту работу автоматически: отправляют запросы и сверяют каждый ответ со схемой. Расширение (лишнее поле) — не нарушение для клиентов, но сигнал обновить спецификацию: иначе документация отстаёт от реальности.</p>
      <p>Источники: JSON Schema 2020-12 — required, enum, format; Schemathesis (schemathesis.readthedocs.io) — проверка «response_schema_conformance».</p>`
  });

  const taskJustify = K.justifyTask({
    id: 'justify', title: 'Ответьте Глебу: «сгенерирую из кода»',
    who: 'gleb', say: 'Зачем тебе писать OpenAPI руками? Я поставлю библиотеку, она сама сгенерирует спецификацию из кода, когда я всё допишу. Две недели — и будет.',
    situation: 'Глеб на планировании предлагает подход code-first для партнёрского API.',
    look: 'Вспомните, что Игорю нужно для старта (блокнот), и сроки «Шашки». Чем contract-first поможет именно здесь?',
    q: 'Что ответить Глебу?',
    qPlain: 'Объясните тимлиду, почему для партнёрского API лучше contract-first — спецификация до кода, — а не генерация OpenAPI из готового кода.',
    rubric: [
      'Говорит о параллельной работе: по спецификации поднимается мок, и «Шашка» начинает разработку сразу, а не через две недели',
      'Объясняет, что контракт согласуется и ревьюится до кода: дешевле исправить в YAML, чем в коде и у партнёра',
      'Упоминает риск code-first: в контракт попадают случайные решения реализации, и его легко сломать незаметно',
      'Предлагает, как держать код и спецификацию в синхроне: генерация заготовок, контрактные тесты или линтер в CI',
      'Опирается на факты: Игорь не назовёт сроки без стенда и документации, интеграция нужна к переобувке'
    ],
    ref: 'Глеб, генерация из кода хороша для внутренних прототипов, но для «Шашки» она нас тормозит. Игорь прямо сказал: без документации и стенда он сроки не назовёт, а интеграция нужна к переобувке. Если я пишу OpenAPI сейчас, мы сегодня же поднимаем мок на Prism, и Игорь начинает писать клиент параллельно с тобой — а не через две недели. Во-вторых, контракт мы согласуем до кода: поправить имя поля в YAML — минута, а в коде, тестах и у партнёра — неделя. В-третьих, при code-first в контракт попадает всё, что случайно получилось в коде, и любое переименование в DTO молча ломает партнёра. Чтобы код не разъехался со спецификацией, сгенерируй из неё заготовки контроллеров и добавим контрактные тесты в CI — Schemathesis проверит каждый ответ.',
    hint: 'Покажите, как спецификация сокращает срок для «Шашки», и предложите способ держать код в синхроне.',
    mentor: 'Главный аргумент — время партнёра: мок по спецификации против ожидания готового бэкенда.',
    explain: `<p>Contract-first окупается, когда у API несколько потребителей и они не в одной команде: контракт становится точкой синхронизации, мок снимает зависимость от готовности бэкенда, а контрактные тесты гарантируют соответствие. Code-first уместен, когда потребитель один и он же автор.</p>
      <p>Источники: Arnaud Lauret, «The Design of Web APIs», глава 4; документация Stoplight «Design-first vs code-first»; Prism и Schemathesis.</p>`
  });

  TR.stage({
    id: ID,
    when: 'понедельник, 29 марта 2027, 10:00 · переходим на contract-first',
    facts: ['F-shk-sandbox'],
    intro: [
      { who: 'igor', html: 'Документация у вас пока в Confluence, и она уже разъехалась с тестовым стендом: там написано start_time, а приходит start_at. Можно нормальную спецификацию, чтобы я сгенерировал клиент?' },
      { who: 'gleb', html: 'Могу подключить генерацию OpenAPI из кода — через пару недель будет.' },
      { who: 'vera', html: 'Две недели «Шашка» ждать не может. Будем писать контракт в OpenAPI сами, до кода. Разберём, из чего состоит спецификация и как описывать схемы данных, — и вы напишете первый метод.' }
    ],
    glossary: [
      { term: 'OpenAPI', simple: 'Стандартный формат описания REST API в YAML или JSON.', tech: 'OpenAPI Specification 3.0 / 3.1, бывший Swagger.' },
      { term: 'Схема', simple: 'Описание данных: типы, форматы, обязательность, допустимые значения.', tech: 'JSON Schema 2020-12.' },
      { term: '$ref', simple: 'Ссылка на описание в другом месте файла или в другом файле.', tech: 'JSON Reference.' },
      { term: 'operationId', simple: 'Уникальное имя операции — станет именем функции в сгенерированном коде.', tech: 'Operation Object.' },
      { term: 'Contract-first', simple: 'Сначала контракт, потом код.', tech: 'Design-first, API-first.' },
      { term: 'Мок-сервер', simple: 'Ненастоящий сервер, который отвечает по спецификации.', tech: 'Prism, WireMock.' },
      { term: 'Контрактный тест', simple: 'Проверка, что реализация отвечает так, как написано в контракте.', tech: 'Schemathesis, Dredd, Pact.' },
      { term: 'YAML', simple: 'Формат данных с отступами вместо скобок.', tech: 'YAML 1.2; надмножество JSON.' }
    ],
    outro: 'Спецификация лежит в репозитории, Игорь сгенерировал клиент и работает по моку, а в CI добавили линтер. Следующий модуль — другие стили: gRPC для внутренних сервисов, вебхуки и брокеры сообщений.',
    tasks: [howStruct, howSchema, howFlow, taskWhere, taskEditor, taskBugs, taskConform, taskJustify]
  });
})();
