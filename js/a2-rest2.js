/* Модуль 2, занятие 2: REST продвинутый — ошибки, версии, списки, кеш, лимиты, идемпотентность, параллельные правки.
   Теория: how-r2-errors — формат ошибок RFC 9457, 400/422, каталог типов «Искры», версии и совместимость;
   how-r2-lists — живой симулятор offset против cursor (дубли и пропуски), кеш (Cache-Control, ETag, 304) и лимиты
   (RateLimit, 429, Retry-After); how-r2-idem — живой симулятор на учебном сервере: обрыв связи и Idempotency-Key,
   два диспетчера и If-Match / 412.
   Практика: совместимо ли изменение; соберите ответ об ошибке (JSON с живыми признаками); ошибки в ответах API;
   что будет при повторе; ответ Игорю про задвоенные записи. */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc, api = TR.api, K = TR.m5;
  const ID = 'a2-rest2';
  const T = 'Authorization: Bearer ' + api.TOKEN, TJ = T + '\nContent-Type: application/json';

  /* ---------- ошибки и версии ---------- */
  const howErrors = K.textTheory({
    id: 'how-r2-errors', covers: ['compat', 'problem'], title: 'Как это работает: формат ошибок и версии API',
    simple: { icon: '🧯', title: 'Простыми словами', plain: 'Ошибка API — это тоже ответ по контракту. Код говорит программе, что делать; тело объясняет, что именно не так, — человеку и программе. Версии нужны, чтобы менять API, не ломая тех, кто уже на него опирается.', analogy: 'Хороший отказ в банке: не «отказано», а «не хватает справки о доходах, вот форма, принесите до пятницы». По такому ответу можно действовать.', tech: 'RFC 9457 «Problem Details for HTTP APIs» (заменил RFC 7807): медиатип application/problem+json, поля type, title, status, detail, instance и любые свои расширения — например, errors с ошибками по полям.' },
    intro: 'Все ошибки API «Искры» — в одном формате, и у каждого типа есть стабильный адрес-идентификатор. По нему код «Шашки» решает, что делать, а title и detail можно показать диспетчеру.',
    table: { head: ['Поле', 'Зачем', 'Пример'], rows: [
      ['type', 'Стабильный идентификатор типа ошибки (URI). По нему ветвится код клиента; по адресу можно положить описание', 'https://api.iskra-online.ru/problems/slot-taken'],
      ['title', 'Короткое название типа для человека; одинаковое для всех ошибок этого типа', 'Слот занят'],
      ['status', 'Код HTTP — дублируется в теле, чтобы не потерялся при пересылке', '409'],
      ['detail', 'Объяснение именно этого случая: что случилось и что делать', 'На 15:00 16 марта станция уже занята. Свободные слоты — GET …/slots'],
      ['instance', 'Идентификатор этого случая — для поиска в логах и обращения в поддержку', '/v1/bookings или req-0042'],
      ['errors (расширение)', 'Ошибки по полям: какое поле, машинный код, сообщение', '[{ "field": "start_at", "code": "too_soon", … }]']
    ] },
    code: {
      '422 по полям': api.resText(api.replay([{ method: 'POST', url: '/v1/bookings', headers: TJ, body: '{ "station_id": "st-1", "vehicle_id": "v-41", "service_ids": [], "start_at": "2027-03-15T11:00:00+03:00" }' }])[0].res),
      '409 слот занят': api.resText(api.replay([{ method: 'POST', url: '/v1/bookings', headers: TJ, body: '{ "station_id": "st-1", "vehicle_id": "v-41", "service_ids": ["srv-to"], "start_at": "2027-03-16T11:00:00+03:00" }' }])[0].res),
      'Версии': '# версия в адресе — так в API «Искры»\nGET /v1/bookings\n\n# версия в заголовке\nGET /bookings\nAccept: application/vnd.iskra.v1+json\n\n# объявление о выводе старой версии (RFC 8594, RFC 9745)\nDeprecation: @1788210000\nSunset: Tue, 01 Sep 2027 00:00:00 GMT\nLink: <https://api.iskra-online.ru/docs/v2-migration>; rel="deprecation"'
    },
    codeNote: { '422 по полям': 'Сервер нашёл обе ошибки сразу — клиент исправит всё за один раз, а не по одной.', '409 слот занят': 'В detail — что делать дальше: где взять свободные слоты.', 'Версии': 'Версия в адресе проще для партнёров и отладки; в заголовке — «чище», но сложнее. Главное — один способ на весь API.' },
    notes: [
      ['', '400 или 422', '<b>400</b> — запрос не прочитать: битый JSON, неверный тип параметра. <b>422</b> — прочитали, но данные нарушают правила: время в прошлом, пустой список услуг. Многие API используют 400 для обоих случаев — это допустимо, если так написано в контракте и тип ошибки различает случаи.'],
      ['info', 'Что совместимо, а что ломает', '<b>Совместимо</b> (без новой версии): новый эндпоинт; новое <i>необязательное</i> поле в запросе; новое поле в ответе; новый необязательный параметр. <b>Ломает</b>: удалить или переименовать поле; поменять тип или формат; сделать необязательное обязательным; поменять смысл или поведение по умолчанию (сортировку, лимиты); удалить эндпоинт. <b>Зависит от клиента</b>: новое значение в перечислении (enum) — клиенты со строгой проверкой упадут, поэтому в контракте заранее пишут «список значений может расширяться». Правило для клиентов — tolerant reader: игнорировать незнакомые поля.'],
      ['warn', 'Частая ошибка', 'Отдавать в detail текст исключения или стек вызовов: «NullPointerException at BookingService.java:142». Это бесполезно партнёру и полезно атакующему — раскрывает устройство сервера. Подробности — в логи по instance.']
    ]
  });

  /* ---------- списки, кеш, лимиты ---------- */
  const howLists = {
    id: 'how-r2-lists', covers: ['bugs'], title: 'Как это работает: пагинация, кеш и лимиты — проверим на симуляторе', free: true, noReset: true,
    simple: { icon: '📚', title: 'Простыми словами', plain: 'Длинный список отдают страницами. Offset — «пропусти 40, дай 20»: просто, но если пока вы листаете, в начало добавилась запись, вы увидите одну запись дважды. Cursor — «дай 20 после вот этой»: сервер продолжает с того места, где вы остановились.', analogy: 'Offset — «прочитай с 41-й строки» в документе, который кто-то правит: вставили строку сверху — и вы перечитываете уже прочитанное. Cursor — закладка между страницами: что бы ни вставили выше, вы продолжаете с закладки.', tech: 'Offset/limit: ?limit=20&offset=40 — можно прыгнуть на любую страницу, но медленно на больших таблицах и нестабильно при изменениях. Cursor (keyset): ?limit=20&cursor=… — стабильно и быстро, но только «вперёд/назад». В API «Искры» — cursor и next_cursor в ответе.' },
    render(el) {
      el.classList.add('api-root');
      let items, seq, off, offSeen, cur, curSeen, startMax, curEnd, offEnd;
      const reset = () => { items = []; for (let i = 12; i >= 1; i--) items.push(i); seq = 12; startMax = 12; off = 0; offSeen = []; cur = null; curSeen = []; curEnd = false; offEnd = false; };
      reset();
      const PAGE = 4;
      const nextOff = () => { const pg = items.slice(off, off + PAGE); off += PAGE; offSeen.push(pg); if (off >= items.length) offEnd = true; };
      const nextCur = () => { const i = cur == null ? -1 : items.indexOf(cur); let start = i + 1; if (i < 0 && cur != null) { start = items.findIndex(x => x < cur); if (start < 0) start = items.length; } const pg = items.slice(start, start + PAGE); if (pg.length) cur = pg[pg.length - 1]; curSeen.push(pg); if (start + PAGE >= items.length) curEnd = true; };
      const stats = pages => { const all = pages.flat(), dup = all.filter((x, i) => all.indexOf(x) !== i), expected = items.filter(x => x <= startMax); const lastSeen = all.length ? Math.min(...all) : startMax + 1; const skipped = expected.filter(x => x >= lastSeen && !all.includes(x)); return { dup, skipped }; };
      const col = (title, url, pages, end, key) => { const st = stats(pages); const all = []; return `<div class="stack"><div class="eyebrow">${esc(title)}</div><div class="api-mono small">${esc(url)}</div>
        ${pages.map((pg, i) => `<div class="small"><b>Стр. ${i + 1}:</b> ${pg.length ? pg.map(x => { const d = all.includes(x); all.push(x); return `<span class="chip" style="${d ? 'background:var(--bad-soft);border-color:var(--bad)' : ''}">№${x}${d ? ' дубль' : ''}</span>`; }).join(' ') : '<span class="dim">пусто</span>'}</div>`).join('')}
        <button type="button" class="btn sm" data-n="${key}" ${end ? 'disabled' : ''}>${end ? 'Список закончился' : 'Следующая страница'}</button>
        <div class="small">Дублей: <b>${st.dup.length}</b> · пропущено: <b>${st.skipped.length}</b>${st.skipped.length ? ' (' + st.skipped.map(x => '№' + x).join(', ') + ')' : ''}</div></div>`; };
      const draw = () => {
        el.innerHTML = `<div class="api-root"><p>Диспетчер «Шашки» листает записи от новых к старым, по 4 на страницу. Загрузите страницу-другую в обеих колонках, потом добавьте новую запись или отмените одну — и листайте дальше.</p>
          <div class="api-scroll"><div class="small"><b>Сейчас в базе (новые сверху):</b> ${items.map(x => `<span class="chip">№${x}</span>`).join(' ')}</div></div>
          <div class="row"><button type="button" class="btn sm" data-add>+ Появилась новая запись</button><button type="button" class="btn sm" data-del>− Запись из начала списка отменили</button><button type="button" class="btn sm ghost" data-reset>⟲ Сначала</button></div>
          <div class="api-two">${col('Offset', `?limit=4&offset=${off}`, offSeen, offEnd, 'off')}${col('Cursor', `?limit=4${cur != null ? '&cursor=№' + cur : ''}`, curSeen, curEnd, 'cur')}</div>
          ${ui.note('info', 'Что увидеть', 'Новая запись в начале сдвигает всё вниз — offset на следующей странице повторит запись, которую вы уже видели. Отмена записи из начала сдвигает всё вверх — offset перепрыгнет через запись, и вы её не увидите. Cursor продолжает «после последней увиденной» — ни дублей, ни пропусков.')}
          ${ui.note('', 'Кеш: кто и сколько может хранить ответ', '<b>Cache-Control: public, max-age=86400</b> — станции и услуги: может хранить кто угодно, сутки. <b>Cache-Control: private, no-store</b> — записи партнёра: никаких общих кешей, иначе CDN отдаст записи «Шашки» чужому клиенту. <b>ETag</b> + <b>If-None-Match</b>: клиент спрашивает «изменилось ли?» — если нет, сервер отвечает <code>304 Not Modified</code> без тела.')}
          ${ui.note('', 'Лимиты', 'Каждый ответ сообщает остаток: <code>RateLimit-Limit: 120</code>, <code>RateLimit-Remaining: 37</code>. При превышении — <code>429 Too Many Requests</code> и <code>Retry-After: 60</code>: через сколько секунд можно повторить. Без Retry-After клиенты начинают долбить сервер в цикле.')}</div>`;
      };
      el.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.n === 'off') nextOff(); else if (b.dataset.n === 'cur') nextCur();
        else if (b.hasAttribute('data-add')) { items.unshift(++seq); offEnd = off >= items.length; curEnd = false; }
        else if (b.hasAttribute('data-del')) { items.shift(); offEnd = off >= items.length; }
        else if (b.hasAttribute('data-reset')) reset();
        else return;
        draw();
      };
      draw();
    }
  };

  /* ---------- идемпотентность и параллельные правки ---------- */
  const howIdem = {
    id: 'how-r2-idem', covers: ['idem', 'justify'], title: 'Как это работает: повтор после обрыва и два диспетчера сразу', free: true, noReset: true,
    simple: { icon: '🔁', title: 'Простыми словами', plain: 'Сеть может оборваться уже после того, как сервер создал запись. Клиент видит таймаут и повторяет запрос — получается вторая запись. Ключ идемпотентности решает это: клиент даёт каждой операции уникальный ключ и при повторе шлёт тот же — сервер узнаёт повтор и возвращает прошлый ответ.', analogy: 'Номер заказа в интернет-магазине: если вы дважды нажали «Оплатить» с одним номером заказа, магазин спишет деньги один раз.', tech: 'Заголовок Idempotency-Key (черновик IETF httpapi, так делают Stripe, ЮKassa и др.). Сервер хранит ключ и ответ сутки; повтор с тем же телом — тот же ответ, с другим телом — 422. Защита от одновременных правок — оптимистичная блокировка: ETag + If-Match, при несовпадении — 412 Precondition Failed (RFC 9110, 13.1.1).' },
    render(el) {
      el.classList.add('api-root');
      let key = false, drop = true, ifm = true, out1 = null, out2 = null;
      const runCreate = () => {
        const s = api.server(), steps = [];
        const rq = { method: 'POST', url: '/v1/bookings', headers: TJ + (key ? '\nIdempotency-Key: 7c1e-veh41-0316' : ''), body: '{ "station_id": "st-2", "vehicle_id": "v-41", "service_ids": ["srv-diag"], "start_at": "2027-03-16T15:00:00+03:00" }' };
        const r1 = s.call(rq);
        steps.push({ t: `POST /v1/bookings${key ? ' + Idempotency-Key' : ''}`, r: r1, lost: drop });
        if (drop) { const r2 = s.call(rq); steps.push({ t: 'Повтор того же запроса после таймаута', r: r2 }); }
        const list = s.call({ method: 'GET', url: '/v1/bookings?status=confirmed', headers: T });
        const n = list.body.items.filter(b => b.vehicle_id === 'v-41').length;
        return { steps, n };
      };
      const runEdit = () => {
        const s = api.server(), st = [];
        const g = s.call({ method: 'GET', url: '/v1/bookings/bk-0999', headers: T }); const et = g.headers.ETag;
        st.push({ who: 'Ира и Олег', t: `Оба открыли запись bk-0999: ${g.body.start_at.slice(0, 16).replace('T', ' ')}, ETag ${et}`, r: g });
        const h = TJ + (ifm ? '\nIf-Match: ' + et : '');
        const a = s.call({ method: 'PATCH', url: '/v1/bookings/bk-0999', headers: h, body: '{ "start_at": "2027-03-17T10:00:00+03:00" }' });
        st.push({ who: 'Ира', t: 'переносит на 17 марта, 10:00', r: a });
        const b = s.call({ method: 'PATCH', url: '/v1/bookings/bk-0999', headers: h, body: '{ "start_at": "2027-03-18T12:00:00+03:00" }' });
        st.push({ who: 'Олег', t: 'через минуту переносит на 18 марта, 12:00 — он не видел правку Иры', r: b });
        const f = s.call({ method: 'GET', url: '/v1/bookings/bk-0999', headers: T });
        return { st, fin: f.body.start_at };
      };
      const rline = r => `<code>${r.status} ${esc(r.statusText)}</code>${r.body && r.body.id ? ` · ${esc(r.body.id)}` : ''}${r.headers['Idempotent-Replayed'] ? ' · <b>Idempotent-Replayed: true</b>' : ''}${r.body && r.body.title && r.status >= 400 ? ` · ${esc(r.body.title)}` : ''}`;
      const draw = () => {
        el.innerHTML = `<div class="api-root"><p><b>1. Обрыв связи.</b> Диспетчерская «Шашки» записывает машину v-41. Включите и выключите обрыв и ключ — сценарий прогоняется на настоящем учебном сервере.</p>
          <div class="row"><label><input type="checkbox" data-o="drop" ${drop ? 'checked' : ''}> ответ потерялся по дороге (таймаут у клиента)</label><label><input type="checkbox" data-o="key" ${key ? 'checked' : ''}> клиент отправляет Idempotency-Key</label><button type="button" class="btn sm primary" data-run1>Прогнать</button></div>
          ${out1 ? `<div class="api-pick">${out1.steps.map((s, i) => `<div class="api-info"><b>Шаг ${i + 1}. ${esc(s.t)}</b><div>Сервер: ${rline(s.r)}${s.lost ? ' — <span style="color:var(--bad)">но клиент ответа не получил</span>' : ''}</div></div>`).join('')}</div>
            <div class="api-msg ${out1.n > 1 ? 'bad' : 'ok'}">Записей машины v-41 на сервере: <b>${out1.n}</b>. ${out1.n > 1 ? 'Дубль: станция будет ждать машину дважды, а слот второй записи пропадёт.' : drop ? 'Повтор безопасен: сервер узнал ключ и вернул прошлый ответ.' : 'Обрыва не было — повтор не понадобился.'}</div>` : ''}
          <p><b>2. Два диспетчера сразу.</b> Ира и Олег одновременно открыли одну запись и оба её переносят.</p>
          <div class="row"><label><input type="checkbox" data-o="ifm" ${ifm ? 'checked' : ''}> клиент отправляет If-Match с ETag</label><button type="button" class="btn sm primary" data-run2>Прогнать</button></div>
          ${out2 ? `<div class="api-pick">${out2.st.map(s => `<div class="api-info"><b>${esc(s.who)}</b><div>${esc(s.t)} → ${rline(s.r)}</div></div>`).join('')}</div>
            <div class="api-msg ${ifm ? 'ok' : 'bad'}">Итог: запись на <b>${esc(out2.fin.slice(0, 16).replace('T', ' '))}</b>. ${ifm ? 'Олег получил 412: запись уже изменили — его система перечитает запись и покажет правку Иры.' : 'Потерянное обновление: правка Иры молча затёрта, и никто об этом не знает.'}</div>` : ''}
          ${ui.note('warn', 'Что должен хранить сервер', 'Ключ идемпотентности, хеш тела и сохранённый ответ — не меньше 24 часов. Повтор с тем же ключом и тем же телом — тот же ответ; с тем же ключом и другим телом — 422 (ключ уже использован). Ключ генерирует клиент — обычно UUID на каждую бизнес-операцию, и переиспользует его только при повторе.')}</div>`;
      };
      el.onclick = e => { if (e.target.closest('[data-run1]')) { out1 = runCreate(); draw(); } else if (e.target.closest('[data-run2]')) { out2 = runEdit(); draw(); } };
      el.onchange = e => { const c = e.target.closest('[data-o]'); if (!c) return; if (c.dataset.o === 'drop') drop = c.checked; if (c.dataset.o === 'key') key = c.checked; if (c.dataset.o === 'ifm') ifm = c.checked; out1 = out1 && runCreate(); out2 = out2 && runEdit(); draw(); };
      draw();
    }
  };

  /* =====================================================================
     ПРАКТИКА
     ===================================================================== */
  const taskCompat = K.matchTask({
    id: 'compat', title: 'Совместимо или ломает партнёров',
    simple: howErrors.simple,
    situation: 'Через месяц после запуска к Глебу пришли доработки партнёрского API. Для каждой нужно решить: можно выкатить в /v1 или это ломающее изменение, которое требует /v2 и переходного периода.',
    look: 'Представьте код «Шашки», написанный по сегодняшнему контракту. Он продолжит работать после изменения? Помните правило tolerant reader и оговорку про enum.',
    choices: [{ v: 'safe', t: 'Совместимо — можно в /v1' }, { v: 'break', t: 'Ломает — только в /v2' }, { v: 'dep', t: 'Зависит от клиентов — договориться заранее' }],
    rows: [
      { id: 'v1', t: 'Добавить в ответ записи новое поле post_number (номер поста)', a: 'safe', why: 'Новое поле в ответе: клиенты, которые его не знают, просто игнорируют.' },
      { id: 'v2', t: 'Переименовать start_at в starts_at', a: 'break', why: 'Код «Шашки» читает start_at — получит пустоту.' },
      { id: 'v3', t: 'Сделать необязательное поле comment обязательным при создании', a: 'break', why: 'Старые запросы без comment начнут получать 422.' },
      { id: 'v4', t: 'Добавить эндпоинт GET /v1/offers', a: 'safe', why: 'Новый эндпоинт никого не трогает.' },
      { id: 'v5', t: 'Добавить статус записи in_progress («машина в работе»)', a: 'dep', why: 'Клиент со строгим списком статусов упадёт на незнакомом значении. Поэтому в контракте заранее пишут: «перечень может расширяться, неизвестные значения игнорируйте».' },
      { id: 'v6', t: 'Поменять price_from с числа 4500 на строку "4500.00"', a: 'break', why: 'Смена типа ломает разбор ответа.' },
      { id: 'v7', t: 'Добавить необязательный фильтр ?vehicle_id= в список записей', a: 'safe', why: 'Необязательный параметр: кто не передаёт, получает то же, что раньше.' },
      { id: 'v8', t: 'Поменять сортировку списка по умолчанию с «по времени записи» на «по дате создания»', a: 'break', why: 'Формат тот же, но поведение другое: экран диспетчера покажет записи не в том порядке.' },
      { id: 'v9', t: 'Снизить лимит со 120 до 60 запросов в минуту', a: 'break', why: 'Нагрузка «Шашки», которая вчера проходила, сегодня получит 429 — это изменение контракта.' },
      { id: 'v10', t: 'Удалить из ответа поле comment, «им никто не пользуется»', a: 'break', why: 'Проверить, что никто не пользуется, нельзя — удаление поля ломает.' }
    ],
    need: 8,
    mentor: 'Проверяйте по шагам: старый запрос пройдёт? старый код разберёт ответ? поведение осталось прежним? Если на любой вопрос «нет» — изменение ломающее.',
    explain: `<p>Безопасно только расширять: новые эндпоинты, необязательные параметры и поля, новые поля в ответе. Всё, что меняет имя, тип, обязательность, смысл или поведение (включая лимиты и сортировку), — ломающее и идёт в новую версию с объявлением о выводе старой (заголовки Deprecation и Sunset) и переходным периодом. Новое значение enum — частая ловушка: решают её заранее, обещанием в контракте.</p>
      <p>Источники: Zalando RESTful API Guidelines, раздел «Compatibility» (правила 106–113); Google Cloud API Design Guide — «Compatibility»; RFC 8594 (Sunset), RFC 9745 (Deprecation).</p>`
  });

  /* ---------- соберите ответ об ошибке ---------- */
  const PSTART = '{\n  "type": "",\n  "title": "",\n  "status": 0\n}';
  const PREF = JSON.stringify({ type: 'https://api.iskra-online.ru/problems/validation-error', title: 'Данные не прошли проверку', status: 422, detail: 'Исправьте поля из списка errors.', instance: 'req-0042', errors: [{ field: 'start_at', code: 'format', message: 'Дата и время в формате ISO 8601 со смещением: 2027-03-16T15:00:00+03:00' }, { field: 'service_ids', code: 'required', message: 'Непустой массив id услуг' }] }, null, 2);
  const pParse = t => { try { const v = JSON.parse(t); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; } };
  const PF = [
    { t: 'Тело — валидный JSON-объект', f: (v, ct) => !!v },
    { t: 'Content-Type: application/problem+json', f: (v, ct) => ct === 'application/problem+json' },
    { t: 'status — число 422', f: v => v && v.status === 422 },
    { t: 'type — URI типа ошибки (https://…)', f: v => v && /^https?:\/\/\S+$/.test(v.type || '') },
    { t: 'title — короткое название для человека', f: v => v && typeof v.title === 'string' && v.title.trim().length >= 5 },
    { t: 'detail — что случилось и что делать', f: v => v && typeof v.detail === 'string' && v.detail.trim().length >= 10 },
    { t: 'errors — массив с ошибками по полям', f: v => v && Array.isArray(v.errors) && v.errors.length >= 2 },
    { t: 'Есть ошибка для поля start_at с сообщением', f: v => v && Array.isArray(v.errors) && v.errors.some(e => e && e.field === 'start_at' && (e.message || e.detail)) },
    { t: 'Есть ошибка для поля service_ids с сообщением', f: v => v && Array.isArray(v.errors) && v.errors.some(e => e && /^service_ids/.test(e.field || '') && (e.message || e.detail)) },
    { t: 'Нет внутренностей сервера: стека, исключений, SQL', f: (v, ct, t) => !!v && !/exception|stack|traceback|\.java|\.py:|select |sql|null ?pointer/i.test(t) }
  ];
  const pEval = a => { const t = (a && a.text) || '', v = pParse(t), ct = (a && a.ct) || ''; const on = PF.map(f => !!f.f(v, ct, t)); return { on, n: on.filter(Boolean).length, v }; };
  const taskProblem = {
    id: 'problem', title: 'Соберите ответ об ошибке',
    simple: howErrors.simple,
    lead: ui.brief({
      situation: 'Игорь отправил запрос: «start_at»: "2027-03-16 15:00" — без часового пояса и буквы T, а «service_ids»: [] — пустой. Глеб: «Опиши в спецификации, какой ответ об ошибке вернуть в этом случае, — я сделаю ровно так».',
      todo: ['Выберите Content-Type и напишите тело ответа — признаки под редактором загораются сразу.', 'Нажмите «Проверить». Засчитывается от 9 признаков из 10, включая валидный JSON.'],
      lookTitle: 'Подсказка', look: 'Формат — RFC 9457: type, title, status, detail и расширение errors с полями field, code, message. Сообщите об обеих ошибках сразу.'
    }),
    blank: () => ({ text: '', ct: '' }),
    reference: () => ({ text: PREF, ct: 'application/problem+json' }),
    render(el, ctx) {
      el.classList.add('api-root');
      const a = ctx.ans; if (!a.text && !ctx.readonly) a.text = PSTART;
      el.innerHTML = `<div class="api-root"><div class="api-row"><div><b>Код ответа:</b> 422 Unprocessable Content · <b>Content-Type:</b></div><select data-ct ${ctx.readonly ? 'disabled' : ''}><option value="">выберите…</option>${['application/json', 'application/problem+json', 'text/plain'].map(c => `<option ${a.ct === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="api-two api-ed"><div class="stack"><textarea spellcheck="false" aria-label="Тело ответа об ошибке" ${ctx.readonly ? 'readonly' : ''}></textarea><div data-pm aria-live="polite"></div></div><div class="stack"><div class="eyebrow">Признаки</div><div class="api-feats" data-ft aria-live="polite"></div></div></div></div>`;
      const ta = TR.$('textarea', el); ta.value = a.text || '';
      const upd = () => { const r = pEval(a); TR.$('[data-ft]', el).innerHTML = PF.map((f, i) => `<div class="api-feat ${r.on[i] ? 'on' : ''}"><span class="mk">${r.on[i] ? '✓' : '○'}</span><span>${esc(f.t)}</span></div>`).join(''); let msg = ''; if ((a.text || '').trim() && !r.v) { try { JSON.parse(a.text); msg = 'Ожидается объект { … }.'; } catch (e) { msg = 'JSON не разбирается: ' + e.message; } } TR.$('[data-pm]', el).innerHTML = msg ? `<div class="api-pm">${esc(msg)}</div>` : ''; };
      if (!ctx.readonly) { ta.oninput = () => { a.text = ta.value; ctx.save(); upd(); }; TR.$('[data-ct]', el).onchange = e => { a.ct = e.target.value; ctx.save(); upd(); }; }
      upd();
    },
    check(ans) {
      const r = pEval(ans), notes = PF.map((f, i) => ({ ok: r.on[i], html: esc(f.t) + (r.on[i] ? '' : ' — нет.') }));
      return { ok: r.n >= 9 && r.on[0], score: r.n / PF.length, notes, summary: `Признаков: ${r.n} из ${PF.length}.`, mentor: r.n >= 9 && r.on[0] ? null : 'Начните с валидного JSON. Потом поля RFC 9457 и массив errors — по объекту на каждое поле с ошибкой.' };
    },
    explain: `<p>Эталон — тот же формат, что отдаёт учебный сервер: <code>type</code> с адресом типа, понятный <code>title</code>, <code>status: 422</code>, <code>detail</code> и массив <code>errors</code> с обеими ошибками. Сообщать обо всех ошибках сразу — уважение к клиенту: Игорь исправит запрос за одну итерацию. Машинные <code>code</code> в элементах errors позволяют «Шашке» локализовать сообщения у себя, не разбирая текст.</p>
      <p>Источник: RFC 9457, разделы 3 и 3.2 (расширения); Zalando RESTful API Guidelines, правило 176 «Use Problem JSON».</p>`,
    refNote: 'Засчитывается любое тело, где выполнено 9 признаков из 10 и JSON валиден.',
    report: ans => { const r = pEval(ans); return `- Признаков: ${r.n}/${PF.length}, Content-Type: ${(ans && ans.ct) || '—'}\n\n\`\`\`json\n${(ans && ans.text) || ''}\n\`\`\``; }
  };

  /* ---------- ошибки в ответах ---------- */
  const RESP = [
    { s: '# 1. GET /v1/bookings?limit=20  (записи «Шашки»)', k: null },
    { s: 'HTTP/1.1 200 OK', k: null },
    { s: 'Cache-Control: public, max-age=3600', k: 'a' },
    { s: '{ "items": [ … 20 записей … ], "next_cursor": "YmstMDk5OQ" }', k: 'b' },
    { s: '', k: null },
    { s: '# 2. POST /v1/bookings  с пустым service_ids', k: null },
    { s: 'HTTP/1.1 500 Internal Server Error', k: 'c' },
    { s: 'Content-Type: application/problem+json', k: 'd' },
    { s: '{ "type": "https://api.iskra-online.ru/problems/validation-error",', k: null },
    { s: '  "detail": "NullPointerException at BookingService.java:142" }', k: 'e' },
    { s: '', k: null },
    { s: '# 3. 130-й запрос за минуту', k: null },
    { s: 'HTTP/1.1 429 Too Many Requests', k: 'f' },
    { s: 'Content-Type: application/problem+json      (Retry-After нет)', k: 'g' },
    { s: '', k: null },
    { s: '# 4. PATCH с устаревшим If-Match', k: null },
    { s: 'HTTP/1.1 412 Precondition Failed', k: 'h' },
    { s: '', k: null },
    { s: '# 5. Письмо партнёрам: «/v2 запущен, /v1 выключаем сегодня в 18:00»', k: 'i' }
  ];
  const taskBugs = K.bugsTask({
    id: 'bugs', title: 'Найдите ошибки в ответах API',
    simple: howLists.simple,
    situation: 'Лиза прогнала регрессию партнёрского API на тестовом стенде и выписала ответы, которые её смутили. Отметьте настоящие проблемы.',
    look: 'Проверьте: кому разрешено кешировать личные данные, соответствует ли код смыслу, что видно в detail, знает ли клиент, когда повторить, как выводят старую версию.',
    items: [
      { k: 'a', t: 'Cache-Control: public у записей партнёра', err: 'Записи «Шашки» — личные данные партнёра. public разрешает CDN и прокси хранить и раздавать ответ другим. Нужно private, no-store.' },
      { k: 'b', t: 'Курсорная пагинация с next_cursor' },
      { k: 'c', t: 'Ошибка проверки данных — 500', err: 'Пустой service_ids — ошибка клиента: 422. На 500 клиент станет повторять запрос, который никогда не пройдёт.' },
      { k: 'd', t: 'Content-Type: application/problem+json' },
      { k: 'e', t: 'detail: NullPointerException at BookingService.java:142', err: 'Внутренности сервера в ответе: бесполезно партнёру, полезно атакующему. detail — что случилось и что делать; стек — в логи.' },
      { k: 'f', t: '429 при превышении лимита' },
      { k: 'g', t: '429 без Retry-After', err: 'Клиент не знает, когда повторить, и начнёт повторять в цикле, ещё сильнее нагружая сервер. Нужен Retry-After.' },
      { k: 'h', t: '412 при устаревшем If-Match' },
      { k: 'i', t: '/v1 выключаем в день запуска /v2', err: 'Ломающая версия без переходного периода: интеграция «Шашки» перестанет работать вечером. Объявить о выводе (Deprecation, Sunset) и дать месяцы на переход.' }
    ],
    svg: (nums, marks) => api.lines(RESP, 'http', nums, marks),
    mentor: 'Ищите: личные данные в общем кеше, код не по смыслу, утечку внутренностей, 429 без подсказки, вывод версии без переходного периода.',
    explain: `<p>Пять проблем: общий кеш для личных данных (утечка), 500 вместо 422 (ложные повторы), стек в detail (раскрытие устройства), 429 без Retry-After (шторм повторов) и выключение версии без переходного периода. Верные ответы — курсор, problem+json, сам по себе 429 и 412 при устаревшем ETag.</p>
      <p>Источники: RFC 9111 «HTTP Caching», раздел 5.2 (Cache-Control); RFC 9457; RFC 6585 (429); RFC 8594 (Sunset); OWASP API Security Top 10 (2023), API8 «Security Misconfiguration».</p>`
  });

  const taskIdem = K.labTask({
    id: 'idem', title: 'Что будет при повторе запроса',
    simple: howIdem.simple,
    situation: 'Лиза пишет тесты на сетевые сбои: в каждом сценарии клиент «Шашки» не дождался ответа и что-то повторил. Нужно описать ожидаемый результат.',
    look: 'Повтор безопасен, если метод идемпотентен или запрос несёт тот же Idempotency-Key с тем же телом. Тот же ключ с другим телом — 422. Повтор действия, которое уже выполнено, — конфликт состояния.',
    choices: [{ v: 'one', t: 'Результат как от одного запроса' }, { v: 'two', t: 'Дубль: операция выполнится дважды' }, { v: 'key', t: '422: ключ уже использован с другим телом' }, { v: 'c409', t: '409: действие уже выполнено' }],
    items: [
      { id: 'i1', t: 'POST /v1/bookings без ключа, таймаут, повтор', a: 'two', good: 'Сервер не может отличить повтор от новой записи — получится две.', badAny: 'Без ключа POST не идемпотентен.' },
      { id: 'i2', t: 'POST /v1/bookings с ключом K1, таймаут, повтор с K1 и тем же телом', a: 'one', good: 'Сервер узнал ключ и вернул сохранённый ответ (Idempotent-Replayed: true).', badAny: 'Для этого ключ и нужен.' },
      { id: 'i3', t: 'Запись по ключу K1 создана; диспетчер по ошибке отправил с тем же K1 запись для другой машины', a: 'key', good: 'Тело другое — сервер отказывает 422, чтобы не вернуть чужой результат.', bad: { one: 'Сервер вернул бы ответ о первой машине — диспетчер решит, что вторая записана.' }, badAny: 'Тот же ключ, другое тело — ошибка клиента.' },
      { id: 'i4', t: 'PUT /v1/webhooks/settings, таймаут, повтор', a: 'one', good: 'PUT идемпотентен: повтор кладёт те же настройки.', badAny: 'PUT — полная замена, повтор ничего не меняет.' },
      { id: 'i5', t: 'PATCH /v1/bookings/bk-0999 { "start_at": "…17 марта 10:00" }, таймаут, повтор', a: 'one', good: 'Абсолютное значение: второй раз ставит то же время. Такой PATCH идемпотентен по построению.', badAny: 'Значение не прибавляется, а задаётся.' },
      { id: 'i6', t: 'POST /v1/bookings/bk-0998/cancel без ключа, таймаут, повтор', a: 'c409', good: 'Первый запрос отменил запись, повтор получит 409 «уже отменена» — клиент должен понимать это как успех.', badAny: 'Действие уже выполнено.' },
      { id: 'i7', t: 'DELETE /v1/webhooks/settings, таймаут, повтор', a: 'one', good: 'Состояние то же: настроек нет. Второй ответ — 204 или 404, это нормально.', badAny: 'DELETE идемпотентен.' }
    ],
    scoreLabel: 'Верных ожиданий',
    mentor: 'Смотрите на метод и ключ: POST без ключа — риск дубля; с тем же ключом и телом — повтор безопасен; PUT, DELETE и PATCH с абсолютным значением — идемпотентны.',
    explain: `<p>Идемпотентность — свойство состояния сервера, а не одинаковости ответов: повторный DELETE может вернуть 404, повторная отмена — 409, но состояние то же, что после одного запроса. Поэтому клиент «Шашки» должен понимать 409 на повтор отмены как «уже сделано». Для POST безопасный повтор даёт только Idempotency-Key.</p>
      <p>Источники: RFC 9110, раздел 9.2.2; черновик IETF «The Idempotency-Key HTTP Header Field»; документация ЮKassa и Stripe об идемпотентности.</p>`
  });

  const taskJustify = K.justifyTask({
    id: 'justify', title: 'Ответьте Игорю про задвоенные записи',
    who: 'igor', say: 'У нас вчера машина Е041ТТ записалась дважды на одно утро. Наша система повторила запрос после таймаута — но это же ваш сервер создал две записи. Это ваш баг!',
    situation: 'Игорь пишет в общий чат с претензией. Рустам и Артём тоже там.',
    look: 'Вспомните факт из блокнота: система «Шашки» сама повторяет запросы при таймауте. Что должны сделать обе стороны?',
    q: 'Что ответить Игорю?',
    qPlain: 'Объясните разработчику партнёра, почему повтор POST после таймаута создаёт дубль и как это исправить с обеих сторон с помощью ключа идемпотентности.',
    rubric: [
      'Объясняет механизм: первый запрос дошёл и запись создана, потерялся только ответ; повтор POST сервер видит как новую запись',
      'Предлагает решение: заголовок Idempotency-Key — уникальный на каждую запись и тот же самый при повторе',
      'Описывает поведение сервера: тот же ключ и тело — тот же ответ, другой ключ — новая запись, тот же ключ с другим телом — 422',
      'Признаёт долю «Искры»: ключ должен быть описан в документации, а лучше — обязателен для POST /bookings; дубль отменить и проверить остальные',
      'Тон спокойный, без поиска виноватых, с конкретным следующим шагом'
    ],
    ref: 'Игорь, давай разберёмся без виноватых — ситуация типовая. Первый запрос до нас дошёл, запись создалась, а потерялся только ответ. Ваша система повторила POST, и для сервера это выглядело как новая запись — он не может отличить повтор от второй машины на то же утро. Решение — заголовок Idempotency-Key: на каждую новую запись вы генерируете уникальный ключ (например, UUID) и при повторе отправляете тот же самый. Тогда сервер вернёт прошлый ответ с той же записью и пометкой Idempotent-Replayed, а не создаст вторую. Если по ошибке придёт тот же ключ с другим телом, получите 422. С нашей стороны: в документации ключ был помечен как «желательный», это недостаточно — с версии на следующей неделе сделаем его обязательным для POST /bookings. Дубль по Е041ТТ сейчас отменю и проверю, нет ли других.',
    hint: 'Объясните, где именно потерялся ответ, и что конкретно делает каждая сторона.',
    mentor: 'Сначала механизм (ответ потерялся, а не запрос), потом решение для обеих сторон.',
    explain: `<p>Хороший ответ снимает конфликт фактами: объясняет механизм, даёт партнёру конкретное действие (ключ на операцию) и берёт на себя часть «Искры» (документация, обязательность ключа). Это реальный кейс из платёжных API — поэтому ЮKassa и Stripe требуют ключ для создания платежей.</p>
      <p>Источники: черновик IETF «The Idempotency-Key HTTP Header Field»; документация ЮKassa «Идемпотентность»; Brandur Leach, «Implementing Stripe-like Idempotency Keys in Postgres».</p>`
  });

  TR.stage({
    id: ID,
    when: 'четверг, 25 марта 2027, 09:30 · первая неделя тестов с «Шашкой»',
    facts: ['F-shk-retry', 'F-shk-volume', 'F-shk-sla'],
    intro: [
      { who: 'igor', html: 'Неделя тестов — и уже вопросы. Список записей на экране диспетчера иногда показывает одну запись дважды. А вчера после таймаута машина записалась два раза.' },
      { who: 'gleb', html: 'И мне надо добавить пару полей и новый статус. Это можно сразу в /v1 или придётся городить /v2?' },
      { who: 'vera', html: 'Это всё «взрослый» REST: формат ошибок, версии, пагинация, кеш, лимиты и идемпотентность. Разберём на живых симуляторах — увидите и дубль в списке, и дубль записи своими глазами.' }
    ],
    glossary: [
      { term: 'Problem Details', simple: 'Стандартный формат ошибки: type, title, status, detail.', tech: 'RFC 9457, application/problem+json.' },
      { term: 'Ломающее изменение', simple: 'Изменение, после которого старые клиенты перестают работать.', tech: 'Breaking change: удаление, переименование, смена типа или поведения.' },
      { term: 'Cursor-пагинация', simple: 'Страницы «после вот этой записи» — без дублей и пропусков.', tech: 'Keyset pagination, next_cursor.' },
      { term: 'Идемпотентность', simple: 'Повтор операции не меняет результат.', tech: 'Idempotency, RFC 9110, 9.2.2.' },
      { term: 'Idempotency-Key', simple: 'Ключ, по которому сервер узнаёт повтор запроса.', tech: 'Черновик IETF httpapi.' },
      { term: 'ETag', simple: 'Метка версии ресурса.', tech: 'Entity tag, RFC 9110, 8.8.3.' },
      { term: 'If-Match', simple: '«Меняй, только если версия всё ещё вот эта».', tech: 'Условный запрос; при несовпадении — 412.' },
      { term: 'Rate limit', simple: 'Ограничение числа запросов за период.', tech: '429 Too Many Requests, Retry-After, заголовки RateLimit.' }
    ],
    outro: 'Ключ идемпотентности стал обязательным для POST /bookings, список перешёл на курсор, формат ошибок закреплён. Осталось записать всё это так, чтобы Игорь и генераторы кода поняли одинаково, — следующее занятие про OpenAPI.',
    tasks: [howErrors, howLists, howIdem, taskCompat, taskProblem, taskBugs, taskIdem, taskJustify]
  });
})();
