/* Модуль 2, занятие 1: REST API.
   Теория: how-rest-principles — шесть ограничений REST (клиент-сервер, без состояния, кеширование, единый интерфейс,
   слои, код по требованию) на схеме, модель зрелости Ричардсона; how-rest-resources — ресурсы и адреса: правила
   именования, коллекции и элементы, вложенность, действия, фильтры, матрица «ресурс × метод»; how-rest-explorer —
   дерево ресурсов API «Искры» с живой консолью.
   Практика: что не так с адресом; спроектируйте эндпоинты доп. работ (метод + путь, проверка по шаблонам);
   консоль: фильтр, курсор, перенос PATCH, запрет смены статуса, отмена, чужая запись; ошибки в черновике эндпоинтов;
   ответ Игорю «почему не один POST /api с полем action». */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc, api = TR.api, K = TR.m5;
  const ID = 'a2-rest';
  const N = (id, kind, t, sub, x, y, w, h) => ({ id, kind, t, sub, x, y, w: w || 160, h: h || 56 });

  /* ---------- принципы ---------- */
  const ARCH = {
    W: 860, H: 300,
    nodes: [N('app', 'cont', 'Приложение «Искры»', 'клиент', 20, 40), N('shk', 'ext', 'Диспетчерская «Шашки»', 'клиент', 20, 180),
      N('cdn', 'box', 'Кеш / CDN', 'хранит ответы GET', 240, 40), N('gw', 'box', 'API-шлюз', 'ключи, лимиты, TLS', 240, 180),
      N('srv1', 'sys', 'Сервер API · 1', '', 460, 40), N('srv2', 'sys', 'Сервер API · 2', '', 460, 180), N('db', 'db', 'База данных', '', 680, 110, 150, 64)],
    edges: [{ a: 'app', b: 'cdn', t: 'GET /stations' }, { a: 'shk', b: 'gw', t: 'POST /bookings' }, { a: 'cdn', b: 'srv1', t: 'промах кеша' }, { a: 'gw', b: 'srv2' }, { a: 'gw', b: 'srv1', t: 'любой сервер', ly: -10 }, { a: 'srv1', b: 'db' }, { a: 'srv2', b: 'db' }]
  };
  const P = (...k) => new Set(k);
  const HLA = { cs: P('n:app', 'n:shk', 'n:srv1', 'n:srv2'), sl: P('e:3', 'e:4', 'n:srv1', 'n:srv2'), cache: P('n:cdn', 'e:0', 'e:2'), ui: P('e:0', 'e:1'), layer: P('n:cdn', 'n:gw'), code: P('n:app') };
  const howPrin = K.chipsTheory({
    id: 'how-rest-principles', covers: ['naming', 'justify'], title: 'Как это работает: что делает API «REST-ным»',
    simple: { icon: '🏛', title: 'Простыми словами', plain: 'REST — это не протокол и не формат, а набор правил архитектуры. Главная идея: всё, с чем работает API, — ресурсы с адресами (станции, записи), а действия над ними — стандартные методы HTTP. Сервер не помнит клиента между запросами, ответы можно кешировать.', analogy: 'Библиотека с каталогом: у каждой книги свой шифр (адрес ресурса), а действия одинаковы для всех книг — взять, вернуть, продлить (методы). Библиотекарю не нужно помнить вас: всё нужное — в читательском билете, который вы показываете каждый раз (токен).', tech: 'Рой Филдинг, диссертация 2000 г., глава 5. Шесть ограничений: client–server, stateless, cacheable, uniform interface, layered system, code on demand (необязательное).' },
    intro: 'Нажмите на ограничение — на схеме подсветится, что оно даёт «Искре».',
    chips: [
      { k: 'cs', t: 'Клиент — сервер', html: '<b>Интерфейс и данные разделены.</b> Приложение, диспетчерская «Шашки» и АРМ развиваются независимо от сервера: Даша выпускает новую версию приложения, не трогая бэкенд, пока контракт тот же.' },
      { k: 'sl', t: 'Без состояния', html: '<b>Каждый запрос самодостаточен</b>: токен, параметры, всё нужное — внутри. Сервер не хранит «сессию разговора», поэтому любой запрос может обработать любой из серверов — «Искра» просто добавляет серверы в пик переобувки.' },
      { k: 'cache', t: 'Кеширование', html: '<b>Ответ сообщает, можно ли его кешировать</b> (Cache-Control, ETag). Список станций меняется раз в месяц — CDN отдаёт его тысячам клиентов, не нагружая сервер. Записи «Шашки» кешировать нельзя — они личные и меняются.' },
      { k: 'ui', t: 'Единый интерфейс', html: '<b>Главное ограничение REST:</b> (1) ресурсы определяются адресами; (2) с ними работают через представления — JSON записи, а не таблицу базы; (3) сообщения самоописательны — метод, коды, Content-Type понятны без чтения кода сервера; (4) гипермедиа (HATEOAS) — ответ может содержать ссылки на следующие действия. Четвёртый пункт в реальных API встречается редко.' },
      { k: 'layer', t: 'Слои', html: '<b>Клиент не знает, с кем говорит напрямую</b>: с сервером, кешем или шлюзом. Поэтому между ними можно поставить CDN, API-шлюз с лимитами и проверкой ключей, балансировщик — клиент ничего не меняет.' },
      { k: 'code', t: 'Код по требованию', html: '<b>Необязательное ограничение</b>: сервер может прислать исполняемый код (например, JavaScript для браузера). В API почти не используется — упоминается для полноты на собеседованиях.' }
    ],
    svg: k => K.graph(ARCH, { path: HLA[k] || new Set(), label: 'REST-архитектура «Искры»' }), wide: true,
    notes: [['', 'Модель зрелости Ричардсона', '<b>Уровень 0</b> — один адрес, всё через POST (по сути RPC). <b>Уровень 1</b> — ресурсы со своими адресами. <b>Уровень 2</b> — правильные методы и коды HTTP: здесь живёт большинство «REST API» в индустрии, включая «Искру». <b>Уровень 3</b> — гипермедиа (HATEOAS): ссылки на допустимые действия в ответе.'], ['', 'Как спросят на собеседовании', '«Что такое REST?» — Архитектурный стиль, где API — это ресурсы с адресами, над которыми выполняются стандартные методы HTTP; сервер не хранит состояние клиента, ответы можно кешировать, интерфейс единообразен. «REST — это JSON?» — Нет, формат может быть любым, JSON просто самый частый.']]
  });

  /* ---------- ресурсы и адреса ---------- */
  const howRes = K.textTheory({
    id: 'how-rest-resources', covers: ['design', 'bugs'], title: 'Как это работает: ресурсы, адреса и действия',
    simple: { icon: '🗂', title: 'Простыми словами', plain: 'Адрес отвечает на вопрос «что» — существительное во множественном числе: /bookings. Метод отвечает «что сделать». Коллекция — /bookings, конкретный элемент — /bookings/bk-0998. Фильтры и сортировка — параметры после «?».', analogy: 'Как картотека: ящик «Записи» (коллекция), карточка №0998 в нём (элемент), вкладыш «Доп. работы» в карточке (вложенный ресурс). Что делать с карточкой — написано не на ящике, а в действии: достать, заменить, поправить.', tech: 'Правила именования распространены в Google API Design Guide, Microsoft REST API Guidelines, Zalando RESTful API Guidelines. Действия, которые не сводятся к CRUD, оформляют как «custom methods»: POST /bookings/{id}/cancel или POST /bookings/{id}:cancel (стиль Google).' },
    table: { head: ['Правило', 'Хорошо', 'Плохо'], rows: [
      ['Существительные, не глаголы', 'POST /v1/bookings', 'POST /v1/createBooking'],
      ['Множественное число для коллекций', 'GET /v1/bookings/bk-0998', 'GET /v1/booking/bk-0998'],
      ['Нижний регистр, слова через дефис', '/v1/work-orders', '/v1/workOrders, /v1/Work_Orders'],
      ['Вложенность — 1–2 уровня, по владению', '/v1/stations/st-1/slots', '/v1/stations/st-1/posts/3/bookings/bk-1/services'],
      ['Фильтры, сортировка, страницы — параметры', '/v1/bookings?status=confirmed&sort=start_at', '/v1/bookings/confirmed/sorted'],
      ['Действие вне CRUD — подресурс-действие через POST', 'POST /v1/bookings/bk-0998/cancel', 'GET /v1/bookings/bk-0998/cancel'],
      ['Идентификаторы выдаёт сервер, они непрозрачны', 'bk-0998, uuid', 'номер телефона клиента в адресе'],
      ['Версия — один раз в начале', '/v1/…', '/bookings/v1/…, ?version=1 вперемешку']
    ] },
    code: {
      'Матрица': 'Ресурс                    GET        POST        PATCH       DELETE\n/v1/bookings              список     создать     —           —\n/v1/bookings/{id}         одна       —           перенести   — (405)\n/v1/bookings/{id}/cancel  —          отменить    —           —\n/v1/stations              список     —           —           —\n/v1/stations/{id}/slots   окна       —           —           —',
      'Вложенный или плоский': '# вложенный: слоты принадлежат станции\nGET /v1/stations/st-1/slots?date=2027-03-16\n\n# плоский с фильтром: предложение доп. работ живёт само по себе,\n# у него свой id, к нему обращаются напрямую\nGET /v1/offers?booking_id=bk-0998\nGET /v1/offers/of-31',
      'Действия': '# действие — подресурс и POST\nPOST /v1/bookings/bk-0998/cancel\nPOST /v1/offers/of-31/approve\n\n# стиль Google API Design Guide\nPOST /v1/bookings/bk-0998:cancel'
    },
    notes: [['warn', 'Частая ошибка', 'Копировать структуру базы в адреса: /v1/booking_service_link. Ресурс API — это понятие предметной области, которое нужно клиенту, а не таблица. Одной таблице может соответствовать несколько ресурсов, и наоборот.']]
  });

  /* ---------- дерево ресурсов ---------- */
  const T = 'Authorization: Bearer ' + api.TOKEN;
  const TREE = [
    { p: '/v1/stations', d: 0, m: 'GET', t: 'Коллекция станций. Открыта без токена, хорошо кешируется.', req: { method: 'GET', url: '/v1/stations', headers: '', body: '' } },
    { p: '/v1/stations/{station_id}', d: 1, m: 'GET', t: 'Одна станция — элемент коллекции.', req: { method: 'GET', url: '/v1/stations/st-2', headers: '', body: '' } },
    { p: '/v1/stations/{station_id}/slots', d: 2, m: 'GET', t: 'Вложенный ресурс: окна именно этой станции. Обязательный параметр date, необязательный service_id.', req: { method: 'GET', url: '/v1/stations/st-2/slots?date=2027-03-17&service_id=srv-diag', headers: '', body: '' } },
    { p: '/v1/services', d: 0, m: 'GET', t: 'Каталог услуг.', req: { method: 'GET', url: '/v1/services', headers: '', body: '' } },
    { p: '/v1/vehicles', d: 0, m: 'GET', t: 'Машины партнёра. Нужен токен: каждый партнёр видит только свои.', req: { method: 'GET', url: '/v1/vehicles', headers: T, body: '' } },
    { p: '/v1/bookings', d: 0, m: 'GET, POST', t: 'Коллекция записей партнёра: список с фильтрами и курсором, создание.', req: { method: 'GET', url: '/v1/bookings?status=confirmed&limit=2', headers: T, body: '' } },
    { p: '/v1/bookings/{booking_id}', d: 1, m: 'GET, PATCH', t: 'Одна запись. PATCH — перенос (start_at) и комментарий. DELETE нет: записи не удаляют.', req: { method: 'PATCH', url: '/v1/bookings/bk-0999', headers: T + '\nContent-Type: application/merge-patch+json', body: '{ "start_at": "2027-03-17T10:00:00+03:00" }' } },
    { p: '/v1/bookings/{booking_id}/cancel', d: 2, m: 'POST', t: 'Действие «отменить»: меняет статус, запись остаётся в истории.', req: { method: 'POST', url: '/v1/bookings/bk-0998/cancel', headers: T, body: '' } }
  ];
  const howExplorer = {
    id: 'how-rest-explorer', covers: ['con'], title: 'Как это работает: дерево ресурсов API «Искры»', free: true, noReset: true,
    simple: { icon: '🌳', title: 'Простыми словами', plain: 'Хороший REST API читается как дерево: корневые коллекции, в них элементы, у элементов — вложенные ресурсы и действия. Посмотрев на дерево, разработчик догадывается об адресах, даже не читая документацию.', analogy: 'Как папки на компьютере: Документы → Договоры → «Шашка». Путь сам рассказывает, где что лежит.', tech: 'Принцип наименьшего удивления: одинаковые вещи называются и ведут себя одинаково. Методы, которые поддерживает ресурс, сервер сообщает в заголовке Allow (на 405) и в ответе на OPTIONS.' },
    render(el) {
      el.classList.add('api-root');
      let cur = 5;
      const draw = () => {
        const n = TREE[cur];
        el.innerHTML = `<div class="api-root"><p>Нажмите на ресурс — увидите, что он умеет, и пример запроса в консоли.</p>
          <div class="api-two"><div class="api-pick">${TREE.map((x, i) => `<button type="button" class="m5k-item" data-t="${i}" aria-pressed="${i === cur}" style="padding-left:${10 + x.d * 22}px"><span class="n">${esc(x.m)}</span><span class="api-mono">${esc(x.p)}</span></button>`).join('')}</div>
          <div class="api-info" aria-live="polite"><b class="api-mono">${esc(n.p)}</b><div>${esc(n.t)}</div><div class="small dim">Методы: ${esc(n.m)}</div></div></div>
          <div data-con></div></div>`;
        api.console(TR.$('[data-con]', el), { start: n.req, presets: TREE.map(x => ({ t: x.m.split(',')[0] + ' ' + x.p, req: x.req })) });
      };
      el.onclick = e => { const b = e.target.closest('[data-t]'); if (b) { cur = +b.dataset.t; draw(); } };
      draw();
    }
  };

  /* =====================================================================
     ПРАКТИКА
     ===================================================================== */
  const taskNaming = K.matchTask({
    id: 'naming', title: 'Что не так с адресом',
    simple: howPrin.simple,
    situation: 'Стажёр собрал адреса из старого API «Искры» для мобильного приложения. Глеб хочет понять, что из этого переносить в партнёрский API как есть, а что переделать.',
    look: 'Правила — в теории «Ресурсы, адреса и действия». Для каждого адреса найдите главное нарушение или отметьте, что всё по правилам.',
    choices: [
      { v: 'ok', t: 'Всё по правилам' }, { v: 'verb', t: 'Глагол в адресе' }, { v: 'single', t: 'Единственное число коллекции' }, { v: 'case', t: 'Регистр и разделители' },
      { v: 'deep', t: 'Слишком глубокая вложенность' }, { v: 'query', t: 'Фильтр должен быть параметром' }, { v: 'method', t: 'Метод меняет состояние, а не должен' }
    ],
    rows: [
      { id: 'n1', t: 'GET /v1/getBookings', a: 'verb', why: 'Метод GET уже значит «получить»: GET /v1/bookings.' },
      { id: 'n2', t: 'POST /v1/bookings', a: 'ok', why: 'Создание в коллекции.' },
      { id: 'n3', t: 'GET /v1/booking/bk-0998', a: 'single', why: 'Коллекция одна — /v1/bookings, и элемент в ней: /v1/bookings/bk-0998.' },
      { id: 'n4', t: 'GET /v1/stations/st-1/slots?date=2027-03-16', a: 'ok', why: 'Вложенный ресурс с параметром даты.' },
      { id: 'n5', t: 'GET /v1/bookings/status/confirmed', a: 'query', why: 'Фильтр — параметр: /v1/bookings?status=confirmed.' },
      { id: 'n6', t: 'GET /v1/workOrders', a: 'case', why: 'Пути — в нижнем регистре через дефис: /v1/work-orders.' },
      { id: 'n7', t: 'GET /v1/stations/st-1/posts/p-3/bookings/bk-0998/services', a: 'deep', why: 'Запись имеет свой id — к ней обращаются напрямую: /v1/bookings/bk-0998.' },
      { id: 'n8', t: 'GET /v1/bookings/bk-0998/cancel', a: 'method', why: 'GET не должен ничего менять: предзагрузка ссылки отменит запись. Нужен POST.' },
      { id: 'n9', t: 'POST /v1/bookings/bk-0998/cancel', a: 'ok', why: 'Действие вне CRUD — подресурс-действие через POST.' }
    ],
    need: 7,
    mentor: 'Читайте адрес по кусочкам: есть ли глагол, во множественном ли числе коллекция, нет ли заглавных букв, не превращён ли фильтр в путь, не слишком ли длинная цепочка, не меняет ли GET состояние.',
    explain: `<p>Единообразные адреса — половина удобства API: разработчик «Шашки», увидев /v1/bookings и /v1/stations, сам догадается про /v1/vehicles. Глаголы, единственное число, camelCase, фильтры в пути и глубокая вложенность ломают эту предсказуемость, а GET, меняющий состояние, — ещё и опасен.</p>
      <p>Источники: Google Cloud API Design Guide — «Resource names», «Custom methods»; Zalando RESTful API Guidelines, правила 129, 134, 143; Microsoft REST API Guidelines.</p>`
  });

  /* ---------- проектирование эндпоинтов доп. работ ---------- */
  const normPath = s => String(s || '').trim().toLowerCase().replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').replace(/\{[^}]*\}/g, '{id}').replace(/\/(bk|of|ph|v|st)-[\w-]+/g, '/{id}').replace(/\/:\w+/g, '/{id}');
  const OPS = [
    { id: 'o1', t: 'Список предложений доп. работ по записи bk-0998', m: 'GET', re: [/^\/v1\/bookings\/\{id\}\/offers$/, /^\/v1\/offers\?(.*&)?booking_id=/], ex: 'GET /v1/bookings/{booking_id}/offers или GET /v1/offers?booking_id=…' },
    { id: 'o2', t: 'Одно предложение по его id', m: 'GET', re: [/^\/v1\/offers\/\{id\}$/, /^\/v1\/bookings\/\{id\}\/offers\/\{id\}$/], ex: 'GET /v1/offers/{offer_id}' },
    { id: 'o3', t: 'Завгар согласует предложение', m: 'POST', re: [/^\/v1\/offers\/\{id\}(\/|:)(approve|accept)$/, /^\/v1\/bookings\/\{id\}\/offers\/\{id\}\/(approve|accept)$/], ex: 'POST /v1/offers/{offer_id}/approve' },
    { id: 'o4', t: 'Завгар отклоняет предложение', m: 'POST', re: [/^\/v1\/offers\/\{id\}(\/|:)(decline|reject)$/, /^\/v1\/bookings\/\{id\}\/offers\/\{id\}\/(decline|reject)$/], ex: 'POST /v1/offers/{offer_id}/decline' },
    { id: 'o5', t: 'Фотографии поломки к предложению', m: 'GET', re: [/^\/v1\/offers\/\{id\}\/photos$/], ex: 'GET /v1/offers/{offer_id}/photos' },
    { id: 'o6', t: 'Все предложения, которые ждут решения завгара, по всем машинам «Шашки»', m: 'GET', re: [/^\/v1\/offers\?(.*&)?status=(pending|awaiting[_-]?approval|waiting|sent)/], ex: 'GET /v1/offers?status=pending' }
  ];
  const opOk = (o, v) => { v = v || {}; const p = normPath(v.p); return { m: v.m === o.m, p: o.re.some(r => r.test(p)) }; };
  const designEval = v => { v = v || {}; let good = 0; OPS.forEach(o => { const r = opOk(o, v[o.id]); if (r.m && r.p) good++; }); return { good, score: good / OPS.length }; };
  const taskDesign = {
    id: 'design', title: 'Спроектируйте эндпоинты доп. работ',
    simple: howRes.simple,
    lead: ui.brief({
      situation: 'Рустам хочет согласовывать доп. работы дороже 3 000 ₽ прямо из системы «Шашки». Глеб: «Набросай эндпоинты — метод и путь. Ресурс назовём offers, предложение доп. работ, у него свой id вида of-31, у фото — ph-…».',
      todo: ['Для каждой операции выберите метод и впишите путь. Идентификаторы пишите в фигурных скобках: {offer_id}.', 'Под каждой строкой — живая подсказка, распознан ли путь.', 'Нажмите «Проверить». Засчитывается от 5 верных из 6 (метод и путь вместе).'],
      lookTitle: 'Подсказка', look: 'Коллекция — offers во множественном числе. Согласовать и отклонить — действия, не CRUD. «Ждут решения» — фильтр по статусу параметром.'
    }),
    blank: () => ({ v: {} }),
    reference: () => ({ v: { o1: { m: 'GET', p: '/v1/bookings/{booking_id}/offers' }, o2: { m: 'GET', p: '/v1/offers/{offer_id}' }, o3: { m: 'POST', p: '/v1/offers/{offer_id}/approve' }, o4: { m: 'POST', p: '/v1/offers/{offer_id}/decline' }, o5: { m: 'GET', p: '/v1/offers/{offer_id}/photos' }, o6: { m: 'GET', p: '/v1/offers?status=pending' } } }),
    render(el, ctx) {
      el.classList.add('api-root');
      const a = ctx.ans; a.v = a.v || {};
      const shown = !!ctx.result || ctx.readonly;
      const hint = o => { const v = a.v[o.id] || {}; if (!v.p) return ''; const r = opOk(o, v); return r.p ? '<span style="color:var(--ok)">✓ путь распознан</span>' : '<span class="dim">путь пока не похож на ожидаемый</span>'; };
      el.innerHTML = `<div class="api-root">${OPS.map((o, i) => { const v = a.v[o.id] || {}, r = opOk(o, v); return `<div class="api-row" style="grid-template-columns:minmax(0,1fr) 110px minmax(180px,300px)"><div><div class="meta">операция ${i + 1}</div>${esc(o.t)}</div>
        <select data-m="${o.id}" aria-label="Метод операции ${i + 1}" ${ctx.readonly ? 'disabled' : ''}><option value="">метод</option>${['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => `<option ${v.m === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <input class="mono" data-p="${o.id}" value="${esc(v.p || '')}" placeholder="/v1/…" spellcheck="false" aria-label="Путь операции ${i + 1}" ${ctx.readonly ? 'disabled' : ''}>
        <div class="small" data-h="${o.id}" style="grid-column:1/-1">${shown ? '' : hint(o)}</div>
        ${shown ? `<div class="res ${r.m && r.p ? 'ok' : 'bad'}">${r.m && r.p ? 'Верно.' : (!r.m ? `Метод — ${o.m}. ` : '') + (!r.p ? 'Путь не по правилам. ' : '')} Пример: <code>${esc(o.ex)}</code></div>` : ''}</div>`; }).join('')}</div>`;
      el.onchange = ctx.readonly ? null : e => { const s = e.target.closest('[data-m]'); if (!s) return; const id = s.dataset.m; a.v[id] = Object.assign({}, a.v[id], { m: s.value }); ctx.save(); };
      el.oninput = ctx.readonly ? null : e => { const s = e.target.closest('[data-p]'); if (!s) return; const id = s.dataset.p; a.v[id] = Object.assign({}, a.v[id], { p: s.value }); ctx.save(); const h = TR.$(`[data-h="${id}"]`, el); if (h) h.innerHTML = hint(OPS.find(o => o.id === id)); };
    },
    check(ans) {
      const v = (ans && ans.v) || {}, r = designEval(v), notes = OPS.map((o, i) => { const x = opOk(o, v[o.id]); return x.m && x.p ? { ok: true, html: `${i + 1}. ${esc(o.t)} — верно.` } : { ok: false, html: `${i + 1}. ${esc(o.t)}: ${!x.m ? `метод ${o.m}; ` : ''}${!x.p ? 'путь не по правилам; ' : ''}пример — <code>${esc(o.ex)}</code>.` }; });
      return { ok: r.good >= 5, score: r.score, notes, summary: `Верно ${r.good} из ${OPS.length}.`, mentor: r.good >= 5 ? null : 'Коллекция — /v1/offers, элемент — /v1/offers/{offer_id}. Согласование и отказ — действия: POST на подресурс. «Ждут решения» — параметр status.' };
    },
    explain: `<p>Эталон: <code>GET /v1/bookings/{booking_id}/offers</code> (или <code>GET /v1/offers?booking_id=…</code>), <code>GET /v1/offers/{offer_id}</code>, <code>POST /v1/offers/{offer_id}/approve</code>, <code>POST /v1/offers/{offer_id}/decline</code>, <code>GET /v1/offers/{offer_id}/photos</code>, <code>GET /v1/offers?status=pending</code>.</p>
      <p>Почему действия, а не <code>PATCH { "status": "approved" }</code>: согласование — это бизнес-событие с правилами (лимит 3 000 ₽, права завгара, уведомление мастеру), а не просто смена поля. Отдельное действие проще защищать правами (scope offers:approve), логировать и описывать ошибки. Источники: Google API Design Guide — «Custom methods»; Arnaud Lauret, «The Design of Web APIs», глава 3.</p>`,
    refNote: 'Засчитывается от 5 верных операций из 6. Пути проверяются по шаблонам: допустимы разные имена параметров и равноценные варианты (вложенный ресурс или фильтр).',
    report: ans => { const v = (ans && ans.v) || {}; return OPS.map((o, i) => { const x = v[o.id] || {}, r = opOk(o, x); return `- ${i + 1}. ${x.m || '—'} ${x.p || '—'}${r.m && r.p ? ' ✓' : ''}`; }).join('\n'); }
  };

  /* ---------- консоль ---------- */
  const M = api.m;
  const MIS = [
    { t: 'Получите только подтверждённые записи — <code>?status=confirmed</code>', f: R => R.some(x => x.res.status === 200 && /status=confirmed/.test(x.req.url) && /\/v1\/bookings\?/.test(x.req.url)) },
    { t: 'Получите записи по одной (<code>limit=1</code>) и перейдите на следующую страницу по <code>next_cursor</code>', f: R => R.some(x => x.res.status === 200 && /\/v1\/bookings\?.*cursor=/.test(x.req.url)) },
    { t: 'Перенесите запись <code>bk-0999</code> на 17 марта, 10:00 методом <code>PATCH</code>', f: R => R.some(x => String(x.req.method).toUpperCase() === 'PATCH' && x.res.status === 200 && x.res.body && x.res.body.id === 'bk-0999' && x.res.body.start_at === '2027-03-17T10:00:00+03:00') },
    { t: 'Попробуйте отменить запись через <code>PATCH { "status": "cancelled" }</code> и прочитайте ошибку — <code>422</code>', f: R => R.some(x => String(x.req.method).toUpperCase() === 'PATCH' && x.res.status === 422 && (x.res.body.errors || []).some(e => e.field === 'status')) },
    { t: 'Отмените запись <code>bk-0998</code> правильным действием — <code>200</code>', f: R => R.some(x => /\/v1\/bookings\/bk-0998\/cancel/.test(x.req.url) && x.res.status === 200) },
    { t: 'Запросите чужую запись <code>bk-0777</code> — что ответит сервер?', f: R => R.some(x => /\/v1\/bookings\/bk-0777$/.test(String(x.req.url).split('?')[0]) && x.res.status === 404) }
  ];
  const TJ = T + '\nContent-Type: application/json';
  const CON_REF = [
    { method: 'GET', url: '/v1/bookings?status=confirmed', headers: T, body: '' },
    { method: 'GET', url: '/v1/bookings?limit=1', headers: T, body: '' },
    { method: 'GET', url: '/v1/bookings?limit=1&cursor=' + btoa('bk-0990'), headers: T, body: '' },
    { method: 'PATCH', url: '/v1/bookings/bk-0999', headers: TJ, body: '{ "start_at": "2027-03-17T10:00:00+03:00" }' },
    { method: 'PATCH', url: '/v1/bookings/bk-0998', headers: TJ, body: '{ "status": "cancelled" }' },
    { method: 'POST', url: '/v1/bookings/bk-0998/cancel', headers: T, body: '' },
    { method: 'GET', url: '/v1/bookings/bk-0777', headers: T, body: '' }
  ];
  const conEval = a => { const R = api.replay((a && a.log) || []); const on = MIS.map(m => !!m.f(R)); return { on, n: on.filter(Boolean).length }; };
  const taskCon = {
    id: 'con', title: 'Списки, перенос и отмена в живом API',
    simple: howExplorer.simple,
    lead: ui.brief({
      situation: 'Игорь дописывает экран диспетчера: список подтверждённых записей с подгрузкой, перенос и отмену. Прежде чем он начнёт, пройдите эти сценарии сами — найдите, где документация недостаточно понятна.',
      todo: ['Выполните задачи под консолью. Ресурсы и примеры — в дереве из теории и в справочнике «API Искры».', 'Нажмите «Проверить». Засчитывается от 5 задач из 6.'],
      lookTitle: 'Подсказка', look: 'next_cursor из ответа подставляется без изменений: ?limit=1&cursor=…  Перенос — PATCH с телом { "start_at": "…" } и Content-Type: application/json. Время — с часовым поясом +03:00.'
    }),
    blank: () => ({ log: [] }),
    reference: () => ({ log: CON_REF }),
    render(el, ctx) {
      el.classList.add('api-root');
      const a = ctx.ans; a.log = a.log || [];
      el.innerHTML = '<div class="api-root"><div data-con></div></div>';
      api.console(TR.$('[data-con]', el), { log: a.log, readonly: ctx.readonly, presets: TREE.map(x => ({ t: x.m.split(',')[0] + ' ' + x.p, req: x.req })), missions: MIS, start: { method: 'GET', url: '/v1/bookings?status=confirmed', headers: T, body: '' }, onChange: log => { a.log = log; ctx.save(); } });
    },
    check(ans) {
      const r = conEval(ans), notes = MIS.map((m, i) => ({ ok: r.on[i], html: m.t + (r.on[i] ? '' : ' — не выполнено.') }));
      return { ok: r.n >= 5, score: r.n / MIS.length, notes, summary: `Выполнено ${r.n} из ${MIS.length}.`, mentor: r.n >= 5 ? null : 'Курсор берите из поля next_cursor ответа. Для PATCH нужен Content-Type: application/json, тело — только изменяемые поля.' };
    },
    explain: `<p>Здесь собраны решения, которые отличают продуманный REST API: фильтры — параметрами, страницы — курсором (сервер сам говорит, откуда продолжать), перенос — PATCH только изменяемого поля, статус нельзя «записать» напрямую — он меняется действием с правилами (отмена не позже чем за 3 часа), чужая запись — 404, а не 403, чтобы не подтверждать её существование.</p>
      <p>Источники: RFC 5789 (PATCH), RFC 7396 (JSON Merge Patch); OWASP API Security Top 10 (2023), API1 «Broken Object Level Authorization».</p>`,
    refNote: 'Засчитывается от 5 задач из 6. Проверка заново прогоняет журнал запросов на чистом сервере.',
    report: ans => { const r = conEval(ans); return `- Задач: ${r.n}/${MIS.length}\n` + ((ans && ans.log) || []).map(q => `  - ${q.method} ${q.url}`).join('\n'); }
  };

  /* ---------- ошибки в черновике ---------- */
  const DRAFT = [
    { s: '# Партнёрский API v1 — черновик стажёра', k: null },
    { s: 'GET    /v1/bookings              список записей', k: 'a' },
    { s: 'POST   /v1/bookings/new          создать запись', k: 'b' },
    { s: 'GET    /v1/bookings/{id}         одна запись', k: 'c' },
    { s: 'POST   /v1/bookings/{id}         перенести запись (start_at)', k: 'd' },
    { s: 'GET    /v1/bookings/{id}/delete  отменить запись', k: 'e' },
    { s: 'GET    /v1/Stations              список станций', k: 'f' },
    { s: 'GET    /v1/stations/{id}/slots   окна на дату (?date=)', k: 'g' },
    { s: 'POST   /v1/getSlots              окна (тело: station, date)', k: 'h' },
    { s: 'GET    /v1/vehicles              машины партнёра', k: 'i' }
  ];
  const taskBugs = K.bugsTask({
    id: 'bugs', title: 'Найдите ошибки в черновике эндпоинтов',
    simple: howRes.simple,
    situation: 'Стажёр подготовил список эндпоинтов партнёрского API. Через час его увидит Игорь — найдите, что нужно исправить.',
    look: 'Сверяйте каждую строку с правилами: существительные, единый регистр, правильный метод, нет дублей и действий через GET.',
    items: [
      { k: 'a', t: 'GET /v1/bookings — список' },
      { k: 'b', t: 'POST /v1/bookings/new', err: 'Лишний «глагол» в пути: создание — POST /v1/bookings.' },
      { k: 'c', t: 'GET /v1/bookings/{id}' },
      { k: 'd', t: 'POST /v1/bookings/{id} — перенос', err: 'Частичное изменение — PATCH /v1/bookings/{id}. POST на элемент неоднозначен и не говорит, что меняется.' },
      { k: 'e', t: 'GET /v1/bookings/{id}/delete — отмена', err: 'GET меняет состояние, а «delete» путает отмену с удалением. Отмена — POST /v1/bookings/{id}/cancel.' },
      { k: 'f', t: 'GET /v1/Stations', err: 'Заглавная буква: пути чувствительны к регистру и должны быть единообразны — /v1/stations.' },
      { k: 'g', t: 'GET /v1/stations/{id}/slots?date=' },
      { k: 'h', t: 'POST /v1/getSlots', err: 'Дубль в стиле RPC: окна уже есть как GET /v1/stations/{id}/slots. Чтение — GET с параметрами, его можно кешировать.' },
      { k: 'i', t: 'GET /v1/vehicles' }
    ],
    svg: (nums, marks) => api.lines(DRAFT, 'text', nums, marks),
    mentor: 'Ищите глаголы в путях, неверные методы для изменения и отмены, разнобой в регистре и дубли одного и того же чтения.',
    explain: `<p>Пять ошибок: глагол в пути, POST вместо PATCH для частичного изменения, GET с побочным эффектом и путаница отмены с удалением, разнобой регистра, RPC-дубль чтения через POST. Каждая из них по отдельности «работает», но вместе они делают API непредсказуемым — разработчик партнёра перестаёт угадывать адреса и вынужден сверяться с документацией на каждом шаге.</p>
      <p>Источники: Zalando RESTful API Guidelines; Microsoft REST API Guidelines; RFC 9110, раздел 9.2.1 — безопасные методы.</p>`
  });

  const taskJustify = K.justifyTask({
    id: 'justify', title: 'Ответьте Игорю: почему не один POST /api',
    who: 'igor', say: 'Слушай, а зачем столько адресов? Сделайте один POST /api, а в теле { "action": "createBooking", … }. Мне так проще — одна функция на всё.',
    situation: 'Игорь предлагает упростить API до одного адреса с полем action в теле (уровень 0 модели Ричардсона).',
    look: 'Подумайте, что теряется, если все запросы — POST на один адрес: кеш, безопасный повтор, коды, мониторинг, права, документация.',
    q: 'Что ответить Игорю?',
    qPlain: 'Объясните разработчику партнёра, чем REST с ресурсами и методами лучше одного адреса POST с полем action в теле, и признайте, где RPC-подход уместен.',
    rubric: [
      'Объясняет, что метод сообщает свойства запроса всем посредникам: GET кешируется и безопасно повторяется, POST — нет; при одном POST повтор после таймаута опасен для всех операций',
      'Говорит, что отдельные адреса дают понятные коды, лимиты, мониторинг и права по ресурсам и методам (например, scope только на чтение)',
      'Упоминает документацию и инструменты: OpenAPI, генерация клиента, отладка в браузере и curl работают с ресурсами',
      'Признаёт, что RPC-стиль уместен для действий вне CRUD — и что в API «Искры» это уже есть: POST …/cancel',
      'Подсказывает Игорю, как сохранить удобство: одна обёртка-клиент в его коде или сгенерированный по OpenAPI клиент'
    ],
    ref: 'Игорь, одна функция на всё у тебя всё равно будет — обёртка над HTTP или клиент, сгенерированный из нашей OpenAPI. А вот один POST /api отнимет то, что HTTP даёт бесплатно. Метод сообщает свойства запроса всем по дороге: GET безопасен и кешируется — список станций отдаётся из CDN, а при таймауте твоя система спокойно повторит его. Если всё POST, повтор любой операции становится опасным, и кеш перестаёт работать. Отдельные ресурсы дают внятные коды и права: токен только на чтение просто не пустит на POST /v1/bookings, лимиты и мониторинг мы считаем по эндпоинтам, и при сбое видно, что сломалось — слоты или запись. Плюс документация и генераторы клиентов работают с ресурсами. При этом ты прав, что не всё укладывается в CRUD: для действий у нас RPC-стиль уже есть — POST /v1/bookings/{id}/cancel.',
    hint: 'Назовите, что конкретно теряется: кеш, безопасный повтор, права по методам, мониторинг.',
    mentor: 'Не спорьте о «красоте». Покажите практические потери: повтор после таймаута, кеш, права, мониторинг.',
    explain: `<p>Подход «один адрес + action» — уровень 0 модели Ричардсона, по сути RPC поверх HTTP. Он не запрещён (так устроены JSON-RPC и многие внутренние API), но для партнёрского API теряются кеширование, семантика повторов, гранулярные права и инструменты. Компромисс в REST — custom methods для действий.</p>
      <p>Источники: Leonard Richardson, «Richardson Maturity Model» (в изложении Мартина Фаулера, martinfowler.com); RFC 9110, раздел 9; Google API Design Guide — «Custom methods».</p>`
  });

  TR.stage({
    id: ID,
    when: 'понедельник, 22 марта 2027, 10:00 · комитет одобрил REST для партнёров',
    facts: ['F-shk-need'],
    intro: [
      { who: 'vera', html: 'Комитет согласился: партнёрам — REST. Теперь надо, чтобы это был настоящий REST, а не «JSON по HTTP как получится». Игорь уже пишет экран диспетчера, а Рустам просит согласование доп. работ через API.' },
      { who: 'igor', html: 'Честно, мне всё равно, как называются адреса, — лишь бы работало. Может, вообще один POST /api с полем action?' },
      { who: 'gleb', html: 'У нас в старом API для приложения так и было наполовину: getBookings, booking/15, cancel через GET. Давайте в партнёрском сделаем по-человечески.' }
    ],
    glossary: [
      { term: 'Ресурс', simple: 'То, с чем работает API: станция, запись, предложение доп. работ.', tech: 'Resource — понятие предметной области с адресом (URI).' },
      { term: 'Коллекция', simple: 'Набор однотипных ресурсов: /bookings.', tech: 'Collection resource.' },
      { term: 'Представление', simple: 'Как ресурс выглядит в ответе — например, JSON записи.', tech: 'Representation, медиатип в Content-Type.' },
      { term: 'Stateless', simple: 'Сервер не хранит состояние разговора с клиентом.', tech: 'Ограничение REST.' },
      { term: 'HATEOAS', simple: 'Ответ содержит ссылки на возможные следующие действия.', tech: 'Hypermedia as the Engine of Application State.' },
      { term: 'Модель Ричардсона', simple: 'Шкала зрелости REST от «один адрес» до «гипермедиа».', tech: 'Уровни 0–3.' },
      { term: 'Custom method', simple: 'Действие вне CRUD: отменить, согласовать.', tech: 'POST /resource/{id}/action или :action.' },
      { term: 'Курсор', simple: 'Метка «откуда продолжать» в постраничном списке.', tech: 'Cursor / keyset pagination, подробно — в 2·2.' }
    ],
    outro: 'Эндпоинты доп. работ готовы, черновик стажёра исправлен, Игорь согласился на ресурсы. Дальше — REST продвинутый: формат ошибок, пагинация, версии, идемпотентность, кеш и лимиты.',
    tasks: [howPrin, howRes, howExplorer, taskNaming, taskDesign, taskCon, taskBugs, taskJustify]
  });
})();
