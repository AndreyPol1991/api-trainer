/* Модуль 3, занятие 1: gRPC на базовом уровне.
   Теория: how-grpc-what — как устроен gRPC на схеме сервисов «Искры»: .proto, кодогенерация и заглушки, HTTP/2,
   Protobuf, дедлайны, статусы, шлюз REST↔gRPC; how-grpc-wire — живой кодировщик Protobuf: байты по полям, номера
   полей вместо имён, значения по умолчанию не передаются, сравнение с JSON; how-grpc-calls — четыре типа вызовов,
   коды статусов gRPC и их соответствие HTTP, правила совместимости .proto.
   Практика: тип вызова для сценария; напишите .proto сервиса расписания (свой разборщик, живые признаки); безопасно ли
   изменение .proto; какой код статуса; ответ Артёму «зачем внутри gRPC, если есть REST». */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc, api = TR.api, K = TR.m5;
  const ID = 'a3-grpc';
  const N = (id, kind, t, sub, x, y, w, h) => ({ id, kind, t, sub, x, y, w: w || 160, h: h || 56 });

  /* ---------- как устроен ---------- */
  const G = {
    W: 880, H: 360,
    nodes: [N('shk', 'ext', 'Диспетчерская «Шашки»', 'REST, JSON', 20, 150), N('gw', 'box', 'API-шлюз', 'переводит REST ↔ gRPC', 230, 150, 150),
      N('proto', 'art', 'schedule.proto', 'контракт, лежит в git', 450, 10, 170), N('book', 'cont', 'Сервис записи', 'клиент gRPC · заглушка (stub)', 430, 150, 200, 64),
      N('sch', 'cont', 'Сервис расписания', 'сервер gRPC · реализация', 680, 150, 180, 64), N('tab', 'cont', 'Табло цеха', 'подписка на статусы постов', 680, 280, 180)],
    edges: [{ a: 'shk', b: 'gw', t: 'REST' }, { a: 'gw', b: 'book', t: 'gRPC' }, { a: 'book', b: 'sch', t: 'HTTP/2 · Protobuf', ly: -10 },
      { a: 'proto', b: 'book', t: 'генерация', dash: true, ax: 500, ay: 66, bx: 500, by: 150 }, { a: 'proto', b: 'sch', t: 'генерация', dash: true, ax: 600, ay: 66, bx: 750, by: 150 },
      { a: 'sch', b: 'tab', t: 'поток статусов', ax: 770, ay: 214, bx: 770, by: 280 }]
  };
  const P = (...k) => new Set(k);
  const HG = { proto: P('n:proto'), stub: P('e:3', 'e:4', 'n:book', 'n:sch'), h2: P('e:2'), pb: P('e:2', 'n:proto'), dl: P('e:1', 'e:2', 'n:book'), st: P('e:2', 'n:sch'), gw: P('n:gw', 'e:0', 'e:1'), stream: P('e:5', 'n:tab') };
  const howWhat = K.chipsTheory({
    id: 'how-grpc-what', covers: ['calltype'], title: 'Как это работает: gRPC — вызов функции на другом сервере',
    simple: { icon: '⚡', title: 'Простыми словами', plain: 'gRPC позволяет одному сервису вызвать функцию другого так, будто она в его же коде: bookingClient.GetSlots(…). Контракт пишут в файле .proto, а код клиента и сервера генерируется из него автоматически. Данные летят в компактном двоичном виде по HTTP/2.', analogy: 'Пульт от телевизора: вы нажимаете «громче» и не думаете, какой ИК-сигнал улетает. Кнопки на пульте (заглушка) и приёмник в телевизоре (сервер) сделаны по одной схеме (.proto) — поэтому понимают друг друга.', tech: 'gRPC — фреймворк удалённого вызова процедур (RPC) от Google, проект CNCF. Транспорт — HTTP/2, формат — Protocol Buffers (proto3), контракт — .proto, кодогенерация — protoc и плагины для 10+ языков.' },
    intro: 'Внутренние сервисы «Искры» после разделения монолита. Нажмите на понятие — подсветится, где оно на схеме.',
    chips: [
      { k: 'proto', t: '.proto', html: '<b>Контракт</b>: сервисы с методами (rpc) и сообщения (message) с полями, у каждого поля — тип и <b>номер</b>. Файл лежит в общем репозитории и ревьюится, как OpenAPI для REST.' },
      { k: 'stub', t: 'Кодогенерация и заглушка', html: 'Из .proto компилятор <code>protoc</code> генерирует <b>клиентскую заглушку</b> (stub) — объект с методами GetSlots, WatchPosts — и <b>серверный интерфейс</b>, который остаётся реализовать. Опечатка в имени поля ловится компилятором, а не в бою.' },
      { k: 'h2', t: 'HTTP/2', html: '<b>Одно соединение — много параллельных вызовов</b> (мультиплексирование), сжатые заголовки, потоки в обе стороны. Поэтому gRPC умеет стриминг. Минус: браузер не даёт JavaScript управлять HTTP/2 так, как нужно gRPC, — для веба нужен gRPC-Web или шлюз.' },
      { k: 'pb', t: 'Protobuf', html: '<b>Двоичный формат</b>: вместо имён полей передаются их номера, числа кодируются переменной длиной. Сообщение в 3–10 раз меньше JSON и быстрее разбирается. Но глазами в логе его не прочитать — нужны инструменты (grpcurl, Postman).' },
      { k: 'dl', t: 'Дедлайн', html: '<b>Клиент всегда задаёт, сколько готов ждать</b>: «ответь за 300 мс». Дедлайн передаётся по цепочке: если шлюз дал 1 с, а сервис записи потратил 800 мс, на вызов расписания останется 200 мс. Истёк — DEADLINE_EXCEEDED, и сервер прекращает работу, которая уже никому не нужна.' },
      { k: 'st', t: 'Статусы', html: 'Вместо HTTP-кодов у gRPC свои <b>статусы</b>: OK, INVALID_ARGUMENT, NOT_FOUND, ALREADY_EXISTS, FAILED_PRECONDITION, PERMISSION_DENIED, UNAUTHENTICATED, RESOURCE_EXHAUSTED, DEADLINE_EXCEEDED, UNAVAILABLE, INTERNAL… Шлюз переводит их в HTTP для партнёров.' },
      { k: 'gw', t: 'Шлюз REST ↔ gRPC', html: '«Шашка» продолжает работать по REST и JSON, а шлюз (grpc-gateway, Envoy) <b>транскодирует</b> запрос в gRPC-вызов и обратно. Снаружи — удобный REST, внутри — быстрый gRPC.' },
      { k: 'stream', t: 'Стриминг', html: '<b>Сервер может отвечать потоком</b>: табло цеха вызывает WatchPosts один раз и получает статусы постов по мере изменений, пока соединение открыто. Бывают и потоки от клиента, и в обе стороны.' }
    ],
    svg: k => K.graph(G, { path: HG[k] || new Set(), label: 'gRPC внутри «Искры»' }), wide: true,
    notes: [['', 'Как спросят на собеседовании', '«Чем gRPC отличается от REST?» — REST — ресурсы и методы HTTP, обычно JSON, удобно для внешних клиентов и браузера. gRPC — вызов процедур по контракту .proto, двоичный Protobuf поверх HTTP/2, кодогенерация, стриминг, дедлайны; хорош между внутренними сервисами.']]
  });

  /* ---------- живой кодировщик ---------- */
  const varint = n => { const out = []; n = Math.max(0, Math.floor(n)); do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); return out; };
  const utf8 = s => Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0));
  const hex = a => a.map(b => b.toString(16).padStart(2, '0')).join(' ');
  const howWire = {
    id: 'how-grpc-wire', covers: ['proto', 'compat'], title: 'Как это работает: что на самом деле летит по сети', free: true, noReset: true,
    simple: { icon: '🔢', title: 'Простыми словами', plain: 'В Protobuf по сети не передаются имена полей — только номера. Поэтому имя поля можно переименовать без последствий, а номер менять нельзя никогда: старый клиент прочитает байты не в то поле. Пустые значения (0, "", false) вообще не передаются.', analogy: 'Анкета с номерами вопросов: «1 — Иванов, 3 — да». Если в новой версии анкеты вопрос 1 назвать «Фамилия» вместо «ФИО» — ответы читаются так же. А если поменять номера местами — фамилия окажется в графе «согласие».', tech: 'Каждое поле: тег = (номер_поля << 3) | тип_передачи, затем значение. Тип 0 — varint (int32, bool, enum), тип 2 — длина + байты (string, bytes, вложенные сообщения). В proto3 значения по умолчанию не кодируются.' },
    render(el) {
      el.classList.add('api-root');
      const st = { station: 'st-1', dur: 60, free: true, times: '15:00, 15:30', num1: 1, rename: false };
      const encode = () => {
        const seg = [];
        const fld = (no, wt, name, valBytes, shown) => { const tag = varint((no << 3) | wt); seg.push({ name, tag, val: valBytes, shown }); };
        if (st.station) { const b = utf8(st.station); fld(st.num1, 2, st.rename ? 'station' : 'station_id', varint(b.length).concat(b), `"${st.station}"`); }
        if (st.dur) fld(2, 0, 'duration_min', varint(st.dur), String(st.dur));
        if (st.free) fld(3, 0, 'free', [1], 'true');
        st.times.split(',').map(s => s.trim()).filter(Boolean).forEach(t => { const b = utf8(t); fld(4, 2, 'times', varint(b.length).concat(b), `"${t}"`); });
        return seg;
      };
      const draw = () => {
        const seg = encode(), total = seg.reduce((s, x) => s + x.tag.length + x.val.length, 0);
        const obj = {}; obj[st.rename ? 'station' : 'station_id'] = st.station; obj.duration_min = st.dur; obj.free = st.free; obj.times = st.times.split(',').map(s => s.trim()).filter(Boolean);
        const json = JSON.stringify(obj), jl = utf8(json).length;
        el.innerHTML = `<div class="api-root"><div class="api-two"><div class="stack">${ui.code(`message Slot {\n  string ${st.rename ? 'station' : 'station_id'} = ${st.num1};\n  int32 duration_min = 2;\n  bool free = 3;\n  repeated string times = 4;\n}`, 'proto')}
            <div class="api-row"><div>station_id</div><input class="mono" data-f="station" value="${esc(st.station)}"></div>
            <div class="api-row"><div>duration_min</div><input class="mono" data-f="dur" type="number" min="0" max="100000" value="${st.dur}"></div>
            <div class="api-row"><div>free</div><select data-f="free"><option ${st.free ? 'selected' : ''}>true</option><option ${!st.free ? 'selected' : ''}>false</option></select></div>
            <div class="api-row"><div>times (через запятую)</div><input class="mono" data-f="times" value="${esc(st.times)}"></div>
            <div class="row"><label><input type="checkbox" data-f="rename" ${st.rename ? 'checked' : ''}> переименовать station_id → station</label><label><input type="checkbox" data-f="num" ${st.num1 === 5 ? 'checked' : ''}> сменить номер поля 1 → 5</label></div></div>
          <div class="stack"><div class="eyebrow">Байты Protobuf · ${total} Б</div>
            <div class="api-scroll"><table class="api-tbl"><thead><tr><th>Поле</th><th>Тег</th><th>Значение (байты)</th></tr></thead><tbody>${seg.map(x => `<tr><td><b>${esc(x.name)}</b> = ${esc(x.shown)}</td><td class="api-mono" style="color:var(--bad)">${hex(x.tag)}</td><td class="api-mono" style="color:var(--info)">${hex(x.val)}</td></tr>`).join('') || '<tr><td colspan="3" class="dim">все поля пустые — сообщение весит 0 байт</td></tr>'}</tbody></table></div>
            <div class="api-jwt">${seg.map(x => `<span class="h">${hex(x.tag)}</span> <span class="s">${hex(x.val)}</span>`).join(' ')}</div>
            <div class="eyebrow">То же в JSON · ${jl} Б</div><div class="api-jwt">${esc(json)}</div>
            <div class="api-msg info">Protobuf: <b>${total} Б</b>, JSON: <b>${jl} Б</b> — в ${total ? (jl / total).toFixed(1).replace('.', ',') : '∞'} раза меньше.</div></div></div>
          ${ui.note('info', 'Попробуйте', 'Поставьте duration_min = 0 или free = false — поле исчезнет из байтов: в proto3 значения по умолчанию не передаются. Переименуйте поле — байты не изменятся ни на один бит. Смените номер 1 → 5 — тег станет 2a вместо 0a, и старый клиент не найдёт station_id.')}
          ${ui.note('', 'Как читать тег', 'Тег <code>0a</code> = 00001 010: номер поля 1, тип 2 (длина+байты). <code>10</code> = 00010 000: поле 2, тип 0 (varint). <code>18</code> = поле 3, varint. <code>22</code> = поле 4, длина+байты. Числа до 127 занимают 1 байт, 60 → <code>3c</code>, 300 → <code>ac 02</code>.')}</div>`;
      };
      el.oninput = e => { const f = e.target.closest('[data-f]'); if (!f || f.type === 'checkbox' || f.tagName === 'SELECT') return; if (f.dataset.f === 'station') st.station = f.value; if (f.dataset.f === 'dur') st.dur = Math.max(0, +f.value || 0); if (f.dataset.f === 'times') st.times = f.value; const pos = f.selectionStart, k = f.dataset.f; draw(); const nf = TR.$(`[data-f="${k}"]`, el); if (nf) { nf.focus(); try { nf.setSelectionRange(pos, pos); } catch (x) { } } };
      el.onchange = e => { const f = e.target.closest('[data-f]'); if (!f) return; if (f.dataset.f === 'free') st.free = f.value === 'true'; else if (f.dataset.f === 'rename') st.rename = f.checked; else if (f.dataset.f === 'num') st.num1 = f.checked ? 5 : 1; else return; draw(); };
      draw();
    }
  };

  /* ---------- типы вызовов, статусы, совместимость ---------- */
  const howCalls = K.textTheory({
    id: 'how-grpc-calls', covers: ['codes', 'justify'], title: 'Как это работает: типы вызовов, статусы и совместимость',
    simple: { icon: '📡', title: 'Простыми словами', plain: 'Вызов бывает четырёх видов: один запрос — один ответ; один запрос — поток ответов; поток запросов — один ответ; потоки в обе стороны. Ошибки — не HTTP-коды, а статусы gRPC с понятными именами.', analogy: 'Унарный — вопрос и ответ. Серверный поток — подписка на новости. Клиентский поток — диктовка длинного письма, ответ в конце. Двусторонний — телефонный разговор.', tech: 'Unary, server streaming, client streaming, bidirectional streaming. Статусы: grpc.io/docs/guides/status-codes. Соответствие HTTP — в спецификации gRPC-gateway и Google API (google.rpc.Code).' },
    table: { head: ['Статус gRPC', 'Когда', 'HTTP через шлюз', 'Повторять?'], rows: [
      ['OK', 'Успех', '200', '—'],
      ['INVALID_ARGUMENT', 'Неверные данные независимо от состояния: дата в неверном формате', '400', 'нет'],
      ['NOT_FOUND', 'Нет станции, записи', '404', 'нет'],
      ['ALREADY_EXISTS', 'Создаём то, что уже есть: запись с тем же ключом', '409', 'нет'],
      ['FAILED_PRECONDITION', 'Состояние не позволяет: отменить уже завершённую запись', '400 (часто 409/422)', 'после изменения'],
      ['ABORTED', 'Конфликт параллельных изменений', '409', 'да, целиком'],
      ['PERMISSION_DENIED', 'Кто вы, известно, прав нет', '403', 'нет'],
      ['UNAUTHENTICATED', 'Нет или неверны учётные данные', '401', 'после входа'],
      ['RESOURCE_EXHAUSTED', 'Лимит, квота, переполнение', '429', 'позже'],
      ['DEADLINE_EXCEEDED', 'Не успели к дедлайну', '504', 'осторожно'],
      ['UNAVAILABLE', 'Сервис временно недоступен', '503', 'да, с паузой'],
      ['INTERNAL', 'Сбой на сервере', '500', 'нет / осторожно']
    ] },
    code: {
      'Четыре типа': 'service ScheduleService {\n  // унарный: запрос → ответ\n  rpc GetSlots (GetSlotsRequest) returns (GetSlotsResponse);\n  // серверный поток: запрос → поток ответов\n  rpc WatchPosts (WatchPostsRequest) returns (stream PostStatus);\n  // клиентский поток: поток запросов → один ответ\n  rpc UploadTelemetry (stream TelemetryPoint) returns (UploadSummary);\n  // двусторонний поток\n  rpc Chat (stream ChatMessage) returns (stream ChatMessage);\n}',
      'Совместимость': '// можно: добавить поле с новым номером\nmessage Booking {\n  string id = 1;\n  string station_id = 2;\n  // string old_comment = 3;   ← удалили\n  reserved 3;                  // номер навсегда занят\n  reserved "old_comment";\n  int32 post_number = 4;       // новое поле — старые клиенты его пропустят\n}\n\n// нельзя: менять номер или тип существующего поля,\n// переиспользовать удалённый номер',
      'Enum': 'enum PostState {\n  POST_STATE_UNSPECIFIED = 0;  // обязателен нулевой — значение «не задано»\n  POST_STATE_FREE = 1;\n  POST_STATE_BUSY = 2;\n  POST_STATE_BROKEN = 3;\n}'
    },
    notes: [['warn', 'Частая ошибка', 'Путать INVALID_ARGUMENT и FAILED_PRECONDITION. Первое — запрос плох сам по себе, повтор не поможет никогда. Второе — запрос нормальный, но не подходит к текущему состоянию системы: может пройти позже.'], ['info', 'Правила совместимости .proto', 'Номер поля — его настоящее имя на проводе. Не меняйте номера и типы существующих полей. Удалённые номера и имена помечайте reserved. Новые поля — с новыми номерами. Нулевое значение enum — «не задано». Эти правила проверяют линтеры buf lint и buf breaking.']]
  });

  /* =====================================================================
     ПРАКТИКА
     ===================================================================== */
  const taskCall = K.matchTask({
    id: 'calltype', title: 'Какой тип вызова нужен',
    simple: howWhat.simple,
    situation: 'Глеб раскладывает новые методы внутренних сервисов «Искры» и спрашивает, какой тип вызова gRPC выбрать для каждого.',
    look: 'Считайте, сколько сообщений идёт в каждую сторону: одно или поток. Поток — когда данных много или они появляются со временем.',
    choices: [{ v: 'u', t: 'Унарный: запрос → ответ' }, { v: 'ss', t: 'Серверный поток' }, { v: 'cs', t: 'Клиентский поток' }, { v: 'bi', t: 'Двусторонний поток' }],
    rows: [
      { id: 't1', t: 'Сервис записи спрашивает свободные слоты станции на дату', a: 'u', why: 'Один вопрос — один ответ со списком.' },
      { id: 't2', t: 'Табло цеха подписывается на изменения статусов постов', a: 'ss', why: 'Один запрос на подписку, дальше сервер присылает изменения по мере появления.' },
      { id: 't3', t: 'Диагностический сканер отправляет 5 000 замеров с машины, в конце — итог', a: 'cs', why: 'Много сообщений от клиента, один итоговый ответ.' },
      { id: 't4', t: 'Чат механика с мастером-приёмщиком в планшете', a: 'bi', why: 'Сообщения идут в обе стороны независимо.' },
      { id: 't5', t: 'Получить запись по id', a: 'u', why: 'Классический унарный вызов.' },
      { id: 't6', t: 'Выгрузка всех 4 500 заказ-нарядов за месяц сервису отчётов', a: 'ss', why: 'Большой ответ удобнее отдавать потоком частями, а не одним сообщением на сотни мегабайт.' },
      { id: 't7', t: 'Голосовой помощник механика: поток звука вверх, распознанные команды — вниз, одновременно', a: 'bi', why: 'Оба потока работают одновременно.' }
    ],
    need: 6,
    mentor: 'Для каждой строки ответьте: клиент отправляет одно сообщение или много? Сервер отвечает одним или присылает со временем?',
    explain: `<p>Унарный вызов — по умолчанию: он проще в обработке ошибок, повторах и балансировке. Потоки выбирают, когда данные появляются со временем (подписка), их много (выгрузка, телеметрия) или нужна живая двусторонняя связь (чат, голос). Помните: долгий поток держит соединение — балансировщики и дедлайны для него настраивают отдельно.</p>
      <p>Источник: grpc.io — «Core concepts, architecture and lifecycle», раздел RPC life cycle.</p>`
  });

  /* ---------- редактор .proto ---------- */
  function parseProto(src) {
    const res = { syntax: null, pkg: null, msgs: {}, enums: {}, services: {}, errs: [] };
    const lines = String(src || '').split('\n');
    const stack = [];
    lines.forEach((raw, i) => {
      const n = i + 1; let s = raw.replace(/\/\/.*$/, '').trim();
      if (!s) return;
      let m;
      if ((m = s.match(/^syntax\s*=\s*"(proto[23])"\s*;$/))) { res.syntax = m[1]; return; }
      if (/^syntax/.test(s)) { res.errs.push({ n, t: 'Строка syntax пишется так: syntax = "proto3";' }); return; }
      if ((m = s.match(/^package\s+([\w.]+)\s*;$/))) { res.pkg = m[1]; return; }
      if (/^(import|option)\b/.test(s)) return;
      if ((m = s.match(/^message\s+(\w+)\s*\{$/))) { const o = { name: m[1], fields: [], n, reserved: [] }; res.msgs[m[1]] = o; stack.push({ k: 'msg', o }); return; }
      if ((m = s.match(/^enum\s+(\w+)\s*\{$/))) { const o = { name: m[1], vals: [], n }; res.enums[m[1]] = o; stack.push({ k: 'enum', o }); return; }
      if ((m = s.match(/^service\s+(\w+)\s*\{$/))) { const o = { name: m[1], rpcs: [], n }; res.services[m[1]] = o; stack.push({ k: 'svc', o }); return; }
      if (s === '}' || s === '};') { if (!stack.length) res.errs.push({ n, t: 'Лишняя закрывающая скобка }.' }); else stack.pop(); return; }
      const top = stack[stack.length - 1];
      if (!top) { res.errs.push({ n, t: `Не разобрать «${s}» вне message, enum или service.` }); return; }
      if (top.k === 'msg') {
        if ((m = s.match(/^reserved\s+(.+);$/))) { top.o.reserved.push(m[1]); return; }
        if ((m = s.match(/^(repeated\s+|optional\s+)?([\w.]+)\s+(\w+)\s*=\s*(\d+)\s*;$/))) { top.o.fields.push({ rep: !!(m[1] && /repeated/.test(m[1])), type: m[2], name: m[3], no: +m[4], n }); return; }
        if (/=\s*\d+\s*$/.test(s)) { res.errs.push({ n, t: 'В конце объявления поля нужна точка с запятой ;' }); return; }
        res.errs.push({ n, t: 'Поле пишется так: string station_id = 1;' }); return;
      }
      if (top.k === 'enum') {
        if ((m = s.match(/^(\w+)\s*=\s*(-?\d+)\s*;$/))) { top.o.vals.push({ name: m[1], no: +m[2], n }); return; }
        res.errs.push({ n, t: 'Значение enum пишется так: POST_STATE_FREE = 1;' }); return;
      }
      if (top.k === 'svc') {
        if ((m = s.match(/^rpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*(;|\{\s*\}\s*;?)$/))) { top.o.rpcs.push({ name: m[1], cs: !!m[2], req: m[3], ss: !!m[4], res: m[5], n }); return; }
        res.errs.push({ n, t: 'Метод пишется так: rpc GetSlots (GetSlotsRequest) returns (GetSlotsResponse);' }); return;
      }
    });
    if (stack.length) res.errs.push({ n: lines.length, t: 'Не закрыта фигурная скобка } у ' + stack.map(x => x.o.name).join(', ') + '.' });
    return res;
  }
  const svc0 = r => Object.values(r.services)[0];
  const rpc = (r, name) => { const s = svc0(r); return s && s.rpcs.find(x => x.name === name); };
  const fieldOf = (m, re, type) => m && m.fields.find(f => re.test(f.name) && (!type || f.type === type));
  const PF = [
    { t: 'syntax = "proto3";', f: r => r.syntax === 'proto3' },
    { t: 'Объявлен package', f: r => !!r.pkg },
    { t: 'GetSlotsRequest: string station_id и string date', f: r => { const m = r.msgs.GetSlotsRequest; return !!(fieldOf(m, /^station_id$/, 'string') && fieldOf(m, /^date$/, 'string')); } },
    { t: 'GetSlotsResponse: repeated-поле со слотами', f: r => { const m = r.msgs.GetSlotsResponse; return !!(m && m.fields.some(f => f.rep)); } },
    { t: 'enum PostState с нулевым значением …UNSPECIFIED = 0', f: r => { const e = r.enums.PostState; return !!(e && e.vals.some(v => v.no === 0 && /UNSPECIFIED/.test(v.name))); } },
    { t: 'PostStatus содержит поле типа PostState', f: r => { const m = r.msgs.PostStatus; return !!(m && m.fields.some(f => f.type === 'PostState')); } },
    { t: 'service с унарным rpc GetSlots (GetSlotsRequest) returns (GetSlotsResponse)', f: r => { const x = rpc(r, 'GetSlots'); return !!(x && !x.cs && !x.ss && x.req === 'GetSlotsRequest' && x.res === 'GetSlotsResponse'); } },
    { t: 'rpc WatchPosts возвращает stream PostStatus', f: r => { const x = rpc(r, 'WatchPosts'); return !!(x && x.ss && x.res === 'PostStatus' && !x.cs); } },
    { t: 'Номера полей уникальны и больше нуля в каждом сообщении', f: r => { const ms = Object.values(r.msgs); return ms.length > 0 && ms.every(m => m.fields.length && m.fields.every(f => f.no > 0) && new Set(m.fields.map(f => f.no)).size === m.fields.length); } },
    { t: 'Файл разбирается без ошибок, все типы в rpc объявлены', f: r => !r.errs.length && !!svc0(r) && svc0(r).rpcs.every(x => r.msgs[x.req] && r.msgs[x.res]) }
  ];
  const pEval = t => { const r = parseProto(t); const on = PF.map(f => { try { return !!f.f(r); } catch (e) { return false; } }); return { r, on, n: on.filter(Boolean).length }; };
  const PSTART = `syntax = "proto3";

package iskra.schedule.v1;

message GetSlotsRequest {
  string station_id = 1;
  // добавьте дату и, если нужно, услугу
}

// допишите GetSlotsResponse, enum PostState, PostStatus,
// WatchPostsRequest и service ScheduleService
`;
  const PREF = `syntax = "proto3";

package iskra.schedule.v1;

message GetSlotsRequest {
  string station_id = 1;
  string date = 2;        // 2027-03-16
  string service_id = 3;
}

message GetSlotsResponse {
  repeated string slots = 1;   // "15:00", "15:30"
  int32 duration_min = 2;
}

enum PostState {
  POST_STATE_UNSPECIFIED = 0;
  POST_STATE_FREE = 1;
  POST_STATE_BUSY = 2;
  POST_STATE_BROKEN = 3;
}

message WatchPostsRequest {
  string station_id = 1;
}

message PostStatus {
  string post_id = 1;
  PostState state = 2;
  string booking_id = 3;
}

service ScheduleService {
  rpc GetSlots (GetSlotsRequest) returns (GetSlotsResponse);
  rpc WatchPosts (WatchPostsRequest) returns (stream PostStatus);
}`;
  const taskProto = {
    id: 'proto', title: 'Напишите .proto сервиса расписания',
    simple: howWire.simple,
    lead: ui.brief({
      situation: 'Глеб выделяет сервис расписания из монолита: «Нужен контракт ScheduleService. Два метода: GetSlots — слоты станции на дату, и WatchPosts — поток статусов постов для табло. Статус поста — свободен, занят, сломан».',
      todo: ['Допишите .proto. Справа — что распознал разборщик, ниже — признаки.', 'Нажмите «Проверить». Засчитывается от 9 признаков из 10, включая разбор без ошибок.'],
      lookTitle: 'Подсказка', look: 'Поле: тип имя = номер; Список — repeated. Поток — stream перед типом в returns. У enum первое значение — …_UNSPECIFIED = 0. Шпаргалка — во вкладках теории «Типы вызовов, статусы и совместимость».'
    }),
    blank: () => ({ text: '' }),
    reference: () => ({ text: PREF }),
    render(el, ctx) {
      el.classList.add('api-root');
      const a = ctx.ans; if (!a.text && !ctx.readonly) a.text = PSTART;
      el.innerHTML = `<div class="api-root"><div class="api-two api-ed"><div class="stack"><textarea spellcheck="false" style="min-height:440px" aria-label="Файл .proto" ${ctx.readonly ? 'readonly' : ''}></textarea><div class="stack" data-pm aria-live="polite"></div></div>
        <div class="stack"><div class="eyebrow">Что распознано</div><div class="m5k-board" data-pv style="padding:10px"></div><div class="eyebrow">Признаки</div><div class="api-feats" data-ft aria-live="polite"></div></div></div></div>`;
      const ta = TR.$('textarea', el); ta.value = a.text || '';
      ta.onkeydown = e => { if (e.key === 'Tab' && !ctx.readonly) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } };
      const upd = () => {
        const r = pEval(a.text);
        TR.$('[data-ft]', el).innerHTML = PF.map((f, i) => `<div class="api-feat ${r.on[i] ? 'on' : ''}"><span class="mk">${r.on[i] ? '✓' : '○'}</span><span>${esc(f.t)}</span></div>`).join('');
        TR.$('[data-pm]', el).innerHTML = r.r.errs.slice(0, 4).map(m => `<div class="api-pm">Строка ${m.n}: ${esc(m.t)}</div>`).join('');
        const s = svc0(r.r);
        TR.$('[data-pv]', el).innerHTML = `<div class="stack small">${s ? `<div><b>service ${esc(s.name)}</b>${s.rpcs.map(x => `<div class="api-mono">${esc(x.name)}(${x.cs ? 'stream ' : ''}${esc(x.req)}) → ${x.ss ? 'stream ' : ''}${esc(x.res)} <span class="dim">${x.cs && x.ss ? 'двусторонний' : x.ss ? 'серверный поток' : x.cs ? 'клиентский поток' : 'унарный'}</span></div>`).join('')}</div>` : '<div class="dim">service пока нет</div>'}
          ${Object.values(r.r.msgs).map(m => `<div><b>message ${esc(m.name)}</b> <span class="api-mono">${m.fields.map(f => `${f.rep ? 'repeated ' : ''}${esc(f.type)} ${esc(f.name)}=${f.no}`).join(', ') || '—'}</span></div>`).join('')}
          ${Object.values(r.r.enums).map(e => `<div><b>enum ${esc(e.name)}</b> <span class="api-mono">${e.vals.map(v => `${esc(v.name)}=${v.no}`).join(', ')}</span></div>`).join('')}</div>`;
      };
      if (!ctx.readonly) ta.oninput = () => { a.text = ta.value; ctx.save(); upd(); };
      upd();
    },
    check(ans) {
      const r = pEval(ans && ans.text), notes = PF.map((f, i) => ({ ok: r.on[i], html: esc(f.t) + (r.on[i] ? '' : ' — нет.') }));
      r.r.errs.slice(0, 3).forEach(m => notes.push({ ok: false, html: `Строка ${m.n}: ${esc(m.t)}` }));
      const clean = r.on[PF.length - 1];
      return { ok: r.n >= 9 && clean, score: r.n / PF.length, notes, summary: `Признаков: ${r.n} из ${PF.length}.`, mentor: r.n >= 9 && clean ? null : !clean ? 'Сначала уберите ошибки разбора: точки с запятой после полей и rpc, закрытые скобки, все типы из rpc объявлены как message.' : 'Проверьте поток: returns (stream PostStatus). И нулевое значение enum.' };
    },
    explain: `<p>Эталон: два запроса и ответа, enum с <code>POST_STATE_UNSPECIFIED = 0</code> (нулевое значение — это и «не задано», и то, что получит старый клиент на незнакомом значении), PostStatus с полем-перечислением и сервис с унарным GetSlots и серверным потоком WatchPosts. Пакет с версией <code>iskra.schedule.v1</code> — как /v1 в REST: ломающие изменения пойдут в v2.</p>
      <p>Проверьте стиль инструментом buf lint: он требует префикс имени enum в значениях и суффикс UNSPECIFIED. Источники: protobuf.dev — «Language Guide (proto 3)» и «Style Guide»; buf.build — правила lint.</p>`,
    refNote: 'Засчитывается любой .proto с 9 признаками из 10 и разбором без ошибок.',
    report: ans => { const r = pEval(ans && ans.text); return `- Признаков: ${r.n}/${PF.length}\n\n\`\`\`proto\n${(ans && ans.text) || ''}\n\`\`\``; }
  };

  const taskCompat = K.labTask({
    id: 'compat', title: 'Безопасно ли изменение .proto',
    simple: howWire.simple,
    situation: 'Сервис расписания уже в бою, его вызывают сервис записи и табло. Глеб присылает изменения в .proto — какие можно выкатить, не обновляя клиентов одновременно?',
    look: 'На проводе только номера и типы. Имена важны лишь для кода и JSON-представления. Удалённые номера переиспользовать нельзя.',
    choices: [{ v: 'safe', t: 'Безопасно' }, { v: 'break', t: 'Ломает клиентов' }, { v: 'risk', t: 'По проводу безопасно, но ломает код или JSON' }],
    items: [
      { id: 'p1', t: 'Добавить в PostStatus поле string mechanic_name = 4', a: 'safe', good: 'Новый номер: старые клиенты пропустят незнакомое поле.', badAny: 'Добавление поля с новым номером совместимо.' },
      { id: 'p2', t: 'Поменять номер поля date с 2 на 5', a: 'break', good: 'Старый клиент кладёт дату в поле 2 — новый сервер её не найдёт.', badAny: 'Номер — это и есть идентификатор на проводе.' },
      { id: 'p3', t: 'Переименовать station_id в station (номер 1 остаётся)', a: 'risk', good: 'Байты те же, но сгенерированный код клиентов перестанет компилироваться, а в JSON-представлении (через шлюз) поле поменяет имя.', badAny: 'На проводе безопасно, в коде и JSON — нет.' },
      { id: 'p4', t: 'Удалить поле booking_id = 3, а позже добавить int32 queue = 3', a: 'break', good: 'Старый клиент пришлёт строку в поле 3, новый сервер прочитает её как число. Нужно reserved 3.', badAny: 'Переиспользовать номер нельзя.' },
      { id: 'p5', t: 'Поменять тип duration_min с int32 на string', a: 'break', good: 'Меняется тип передачи (varint → длина+байты) — разбор сломается.', badAny: 'Тип поля менять нельзя.' },
      { id: 'p6', t: 'Добавить в enum PostState значение POST_STATE_CLEANING = 4', a: 'safe', good: 'Старые клиенты увидят незнакомое значение как число — нужно обрабатывать «неизвестное» без падения.', badAny: 'Новое значение enum по проводу совместимо.' },
      { id: 'p7', t: 'Удалить поле booking_id = 3 и записать reserved 3; reserved "booking_id";', a: 'safe', good: 'Правильное удаление: номер и имя заняты навсегда. Клиенты, которые читали поле, получат пустое значение — договоритесь о сроках.', badAny: 'Так и удаляют поля.' },
      { id: 'p8', t: 'Добавить новый rpc GetPost в ScheduleService', a: 'safe', good: 'Новый метод не влияет на старые вызовы.', badAny: 'Новый метод совместим.' }
    ],
    scoreLabel: 'Верных оценок',
    mentor: 'Спросите про каждое изменение: меняется ли номер или тип? переиспользуется ли удалённый номер? меняется ли имя, которое видно в коде и JSON?',
    explain: `<p>Главное: номера и типы полей — неприкосновенны, удалённые номера резервируются. Переименование безопасно для байтов, но не для сгенерированного кода и JSON-транскодирования через шлюз — поэтому его тоже согласуют. Автоматическая проверка — <code>buf breaking</code> в CI: сравнивает новый .proto с последним выпущенным и падает на ломающих изменениях.</p>
      <p>Источники: protobuf.dev — «Updating A Message Type», «Proto Best Practices»; buf.build — «Breaking change detection».</p>`
  });

  const taskCodes = K.matchTask({
    id: 'codes', title: 'Какой статус gRPC вернуть',
    simple: howCalls.simple,
    situation: 'Лиза пишет тесты на сервис расписания и для каждой ситуации спрашивает: какой статус gRPC должен прийти? От ответа зависит, что шлюз вернёт «Шашке» и будет ли клиент повторять вызов.',
    look: 'Различайте: запрос плох сам по себе (INVALID_ARGUMENT) или не подходит к состоянию (FAILED_PRECONDITION); нет учётных данных (UNAUTHENTICATED) или прав (PERMISSION_DENIED); сервис лёг (UNAVAILABLE) или не успел (DEADLINE_EXCEEDED).',
    choices: ['INVALID_ARGUMENT', 'NOT_FOUND', 'ALREADY_EXISTS', 'FAILED_PRECONDITION', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'UNAVAILABLE'].map(v => ({ v, t: v })),
    rows: [
      { id: 'g1', t: 'В GetSlotsRequest дата «16 марта» вместо 2027-03-16', a: 'INVALID_ARGUMENT', why: 'Запрос неверен независимо от состояния — повтор не поможет.' },
      { id: 'g2', t: 'Станции st-99 нет', a: 'NOT_FOUND', why: 'Ресурса нет.' },
      { id: 'g3', t: 'Резерв слота с тем же request_id уже создан', a: 'ALREADY_EXISTS', why: 'Создаём то, что уже существует.' },
      { id: 'g4', t: 'Попытка поставить запись на пост в статусе «сломан»', a: 'FAILED_PRECONDITION', why: 'Запрос нормальный, но состояние поста не позволяет; починят — пройдёт.' },
      { id: 'g5', t: 'Сервис табло пытается вызвать метод резервирования слотов', a: 'PERMISSION_DENIED', why: 'Сервис известен, но прав на этот метод у него нет.' },
      { id: 'g6', t: 'Вызов без сервисного токена (mTLS-сертификата)', a: 'UNAUTHENTICATED', why: 'Не удалось установить, кто вызывает.' },
      { id: 'g7', t: 'Сервис записи превысил квоту 500 вызовов в секунду', a: 'RESOURCE_EXHAUSTED', why: 'Квота исчерпана — повторить позже.' },
      { id: 'g8', t: 'Расчёт слотов не уложился в 300 мс, отведённые клиентом', a: 'DEADLINE_EXCEEDED', why: 'Истёк дедлайн клиента.' },
      { id: 'g9', t: 'Сервис расписания перезапускается при выкладке', a: 'UNAVAILABLE', why: 'Временная недоступность — безопасно повторить с паузой.' }
    ],
    need: 7,
    mentor: 'Сначала решите, виноват запрос, состояние, права или инфраструктура. Потом выберите точный статус по таблице из теории.',
    explain: `<p>Статус определяет поведение клиента и шлюза: UNAVAILABLE клиентские библиотеки повторяют автоматически, INVALID_ARGUMENT — никогда; шлюз превратит NOT_FOUND в 404, а PERMISSION_DENIED в 403. Неверный статус — это либо бесконечные повторы, либо пропущенные восстановимые сбои.</p>
      <p>Источники: grpc.io — «Status codes and their use in gRPC»; Google API Design Guide — «Errors» (google.rpc.Code).</p>`
  });

  const taskJustify = K.justifyTask({
    id: 'justify', title: 'Ответьте Артёму: зачем внутри gRPC',
    who: 'artem', say: 'Партнёрам REST, приложению REST — а внутри вы хотите ещё и gRPC. Это же второй стек, новые инструменты, обучение. Зачем, если REST все знают?',
    situation: 'Артём на планировании сомневается, стоит ли вводить gRPC для внутренних сервисов «Искры».',
    look: 'Вспомните нагрузку: сколько раз в секунду сервис записи спрашивает расписание в пик, и что нужно табло цеха. И честно назовите цену.',
    q: 'Что ответить Артёму?',
    qPlain: 'Объясните руководителю проекта, какую пользу gRPC даёт для внутренних сервисов по сравнению с REST, и честно назовите затраты и риски.',
    rubric: [
      'Называет выгоду контракта и кодогенерации: .proto — единый источник, ошибки ловит компилятор, клиенты не пишут вручную',
      'Говорит о производительности на внутренних вызовах: Protobuf компактнее JSON, HTTP/2 держит много вызовов в одном соединении, сотни вызовов в секунду в пик',
      'Упоминает стриминг и дедлайны: табло получает статусы потоком, дедлайн обрывает ненужную работу по цепочке',
      'Честно называет цену: инструменты отладки (grpcurl, Postman), обучение, шлюз для REST снаружи, правила совместимости .proto',
      'Предлагает ограничить область: только внутренние вызовы, снаружи остаётся REST через шлюз'
    ],
    ref: 'Артём, вопрос справедливый, и gRPC мы предлагаем только внутри. Что он даёт. Первое — контракт: .proto лежит в git, клиент и сервер генерируются из него, и если Глеб переименует поле, сервис записи не соберётся — ошибка всплывёт до выкладки, а не на пилоте. Второе — нагрузка: в переобувку сервис записи спрашивает расписание сотни раз в секунду, Protobuf в несколько раз меньше JSON, а HTTP/2 гоняет все вызовы по одному соединению. Третье — табло цеха получает статусы постов потоком вместо опроса, а дедлайны обрывают работу, которую клиент уже не ждёт. Цена тоже есть: двоичный трафик не прочитать глазами — нужны grpcurl и Postman, команде — пара дней на обучение, а партнёрам по-прежнему REST через шлюз-транскодер. И правила совместимости .proto проверяем buf breaking в CI. Поэтому предлагаю ограничить: gRPC только между нашими сервисами, всё внешнее — REST.',
    hint: 'Добавьте цифры нагрузки и честно назовите затраты.',
    mentor: 'Руководителю нужен баланс: что получаем, сколько стоит, где граница применения.',
    explain: `<p>Сильный ответ — это обоснование архитектурного решения: выгоды (контракт, производительность, стриминг, дедлайны), затраты (инструменты, обучение, шлюз) и граница применения. Такой текст почти без правок становится ADR.</p>
      <p>Источники: grpc.io — «Introduction to gRPC», «Performance best practices»; Sam Newman, «Building Microservices», 2-е изд., глава 5.</p>`
  });

  TR.stage({
    id: ID,
    when: 'понедельник, 5 апреля 2027, 10:00 · монолит делят на сервисы',
    intro: [
      { who: 'gleb', html: 'В переобувку монолит не вытянет: расписание считается на каждую запись, и всё тормозит. Выделяю сервис расписания. Между сервисами хочу gRPC — сотни вызовов в секунду, JSON тут лишний.' },
      { who: 'artem', html: 'А не слишком ли много технологий? REST же все знают.' },
      { who: 'vera', html: 'Разберёмся, как устроен gRPC, что реально летит по сети и почему номер поля важнее имени. Вы напишете контракт сервиса расписания и научитесь отличать безопасные изменения от ломающих.' }
    ],
    glossary: [
      { term: 'gRPC', simple: 'Удалённый вызов функций по контракту .proto, быстрый и двоичный.', tech: 'Фреймворк RPC (CNCF): HTTP/2 + Protobuf.' },
      { term: 'Protocol Buffers', simple: 'Компактный двоичный формат данных с номерами полей.', tech: 'Protobuf, proto3.' },
      { term: '.proto', simple: 'Файл-контракт: сервисы, методы, сообщения.', tech: 'Interface Definition Language (IDL).' },
      { term: 'Заглушка (stub)', simple: 'Сгенерированный объект-клиент с методами удалённого сервиса.', tech: 'Client stub, генерирует protoc.' },
      { term: 'Стриминг', simple: 'Поток сообщений вместо одного ответа.', tech: 'Server / client / bidirectional streaming.' },
      { term: 'Дедлайн', simple: 'Сколько клиент готов ждать ответа.', tech: 'Deadline; при истечении — DEADLINE_EXCEEDED.' },
      { term: 'reserved', simple: 'Пометка, что номер или имя удалённого поля нельзя переиспользовать.', tech: 'reserved 3; reserved "old_name";' },
      { term: 'Транскодирование', simple: 'Шлюз переводит REST-запросы в gRPC-вызовы и обратно.', tech: 'grpc-gateway, Envoy gRPC-JSON transcoder.' }
    ],
    outro: 'Контракт ScheduleService в репозитории, buf breaking в CI, табло подписано на поток статусов. Следующее занятие — асинхронность: вебхуки для «Шашки» и брокер сообщений внутри.',
    tasks: [howWhat, howWire, howCalls, taskCall, taskProto, taskCompat, taskCodes, taskJustify]
  });
})();
