/* Модуль 4, занятие 1: Безопасность API — аутентификация, авторизация, JWT, OAuth 2.0 и права доступа.
   Теория: how-sec-authn — идентификация, аутентификация, авторизация; API-ключ, Bearer, OAuth 2.0 (роли, Client
   Credentials, Authorization Code + PKCE), mTLS — на схеме «Ложки»; how-sec-jwt — живой разбор и подпись JWT
   (HMAC-SHA256 считается в браузере): части, claims, exp/aud/iss/scope, подделка payload, alg: none;
   how-sec-owasp — OWASP API Security Top 10 (2023) на примерах «Ложки», RBAC/ABAC/scope.
   Практика: 401, 403, 404 или разрешить; проверьте шесть токенов; матрица прав из политики доступа; уязвимости
   по отчёту пентестера; ответ Артуру «дайте постоянный ключ в адресе». */
'use strict';
(function () {
  const TR = window.TR, ui = TR.ui, esc = TR.esc, api = TR.api, K = TR.m5;
  const ID = 'a4-security';
  const N = (id, kind, t, sub, x, y, w, h) => ({ id, kind, t, sub, x, y, w: w || 160, h: h || 56 });
  const NOW = api.NOW_S, ISS = 'https://id.lozhka.ru', AUD = 'api.lozhka.ru';
  const fmtTs = s => api.fmtT(Math.floor(s / 60)).replace('T', ' ').slice(0, 16);

  /* ---------- кто есть кто ---------- */
  const OA = {
    W: 880, H: 330,
    nodes: [N('owner', 'person', 'Марат, «Тесто»', 'владелец ресурса', 20, 20, 160, 70), N('cab', 'cont', 'Кабинет партнёра', 'клиент: браузер', 20, 160, 160), N('shk', 'ext', 'Касса «Теста»', 'клиент: сервер', 20, 260, 160),
      N('idp', 'sys', 'Lozhka ID', 'сервер авторизации: выдаёт токены', 330, 60, 190, 64), N('api', 'sys', 'API «Ложки»', 'сервер ресурсов: проверяет токен и права', 330, 220, 190, 64),
      N('svc', 'cont', 'Сервис курьеров', 'внутренний сервис', 680, 220, 170)],
    edges: [{ a: 'owner', b: 'cab', t: 'входит, даёт согласие' }, { a: 'cab', b: 'idp', t: 'Authorization Code + PKCE' }, { a: 'shk', b: 'idp', t: 'Client Credentials', ax: 180, ay: 280, bx: 360, by: 124 },
      { a: 'cab', b: 'api', t: 'Bearer-токен', ax: 180, ay: 200, bx: 330, by: 240 }, { a: 'shk', b: 'api', t: 'Bearer-токен', ax: 180, ay: 295, bx: 330, by: 270 }, { a: 'api', b: 'svc', t: 'mTLS' }]
  };
  const P = (...k) => new Set(k);
  const HO = { ident: P('n:shk', 'e:4'), authn: P('n:idp', 'e:1', 'e:2'), authz: P('n:api'), key: P('n:shk', 'e:4', 'n:api'), bearer: P('e:3', 'e:4'), oauth: P('n:owner', 'n:cab', 'n:idp', 'n:api'), cc: P('n:shk', 'e:2', 'n:idp'), code: P('n:owner', 'n:cab', 'e:0', 'e:1'), mtls: P('e:5', 'n:svc') };
  const howAuthn = K.chipsTheory({
    id: 'how-sec-authn', covers: ['decide', 'justify'], title: 'Как это работает: кто ты, что тебе можно и как это доказать',
    simple: { icon: '🛂', title: 'Простыми словами', plain: 'Идентификация — назваться («я — „Тесто“»). Аутентификация — доказать («вот мой секрет или токен»). Авторизация — решить, что можно («„Тесту“ можно читать и создавать свои доставки, чужие — нельзя»). Ошибка аутентификации — 401, авторизации — 403.', analogy: 'Проходная завода: назвали фамилию (идентификация), показали пропуск с фото (аутентификация), охранник смотрит, в какие цеха вам можно (авторизация). Пропуск — это токен: его выдало бюро пропусков (сервер авторизации), а проверяет каждый охранник.', tech: 'OAuth 2.0 (RFC 6749) — протокол выдачи токенов доступа; Bearer-токены (RFC 6750); JWT (RFC 7519); PKCE (RFC 7636); OAuth 2.0 Security BCP (RFC 9700). OpenID Connect добавляет поверх OAuth аутентификацию пользователя (ID-токен).' },
    intro: 'Как в «Ложке» будут входить партнёры, люди и внутренние сервисы. Нажмите на понятие.',
    chips: [
      { k: 'ident', t: 'Идентификация', html: '<b>Назвать себя</b>: client_id «testo», логин оператора. Само по себе ничего не доказывает — имя может назвать кто угодно.' },
      { k: 'authn', t: 'Аутентификация', html: '<b>Доказать, что ты это ты</b>: секрет клиента, пароль + второй фактор, сертификат. Делает сервер авторизации Lozhka ID и выдаёт токен. Нет или неверный токен — <code>401</code>.' },
      { k: 'authz', t: 'Авторизация', html: '<b>Решить, что разрешено</b>: есть ли у токена scope deliveries:write, принадлежит ли доставка этому партнёру, не превышен ли порог 300 ₽ для автосогласования доплат. Делает API на каждом запросе. Нельзя — <code>403</code> (или <code>404</code> для чужих объектов).' },
      { k: 'key', t: 'API-ключ', html: '<b>Постоянная строка-секрет</b> в заголовке. Просто, но ключ живёт долго, его легко утечь (логи, репозиторий), и он не говорит, <i>кто</i> из сотрудников партнёра действовал. Годится для открытых справочников с лимитами, не для данных.' },
      { k: 'bearer', t: 'Bearer-токен', html: '<b>«Предъявитель сего»</b>: кто держит токен, тот и проходит. Поэтому токены короткоживущие (15–60 минут), передаются только по HTTPS и только в заголовке <code>Authorization: Bearer …</code>, никогда в адресе.' },
      { k: 'oauth', t: 'OAuth 2.0: роли', html: '<b>Владелец ресурса</b> — Марат, операционный директор «Теста». <b>Клиент</b> — приложение, которое действует от его имени (кабинет партнёра) или от своего (касса). <b>Сервер авторизации</b> — Lozhka ID, выдаёт токены. <b>Сервер ресурсов</b> — API, принимает токены. Пароль видит только сервер авторизации.' },
      { k: 'cc', t: 'Client Credentials', html: '<b>Сервер «Теста» → сервер «Ложки», человека нет.</b> Касса отправляет client_id и client_secret на Lozhka ID и получает токен на 15 минут со scope, выданными по договору. Секрет хранится только на сервере «Теста».' },
      { k: 'code', t: 'Authorization Code + PKCE', html: '<b>Человек в браузере или приложении.</b> Марат входит на странице Lozhka ID (не в чужой форме!), даёт согласие, кабинет получает одноразовый код и меняет его на токен. PKCE защищает код от перехвата. Это рекомендованный поток и для мобильных приложений.' },
      { k: 'mtls', t: 'mTLS', html: '<b>Взаимная проверка сертификатов</b>: и клиент, и сервер предъявляют сертификаты. Так внутренние сервисы «Ложки» доверяют друг другу; бывает и для партнёров с повышенными требованиями (банки).' }
    ],
    svg: k => K.graph(OA, { path: HO[k] || new Set(), label: 'Аутентификация и авторизация в «Ложке»' }), wide: true,
    notes: [['', 'Как спросят на собеседовании', '«Чем аутентификация отличается от авторизации?» — Аутентификация отвечает «кто ты» и подтверждается секретом или токеном; авторизация — «что тебе можно» и проверяется на каждом запросе по ролям, scope и владению объектом. 401 — проблема с аутентификацией, 403 — с авторизацией.']]
  });

  /* ---------- JWT ---------- */
  const H = { alg: 'HS256', typ: 'JWT' };
  const PL = { iss: ISS, sub: 'client:testo', aud: AUD, iat: NOW - 300, exp: NOW + 600, scope: 'points:read deliveries:read deliveries:write', partner_id: 'testo' };
  const howJwt = {
    id: 'how-sec-jwt', covers: ['tokens'], title: 'Как это работает: JWT изнутри — разберите и подделайте токен', free: true, noReset: true,
    simple: { icon: '🎫', title: 'Простыми словами', plain: 'JWT — токен из трёх частей через точку: заголовок, содержимое (claims) и подпись. Первые две — просто base64, их может прочитать кто угодно. Подпись доказывает, что содержимое выдал сервер и его не меняли. Поменяли хоть символ — подпись не сойдётся.', analogy: 'Пропуск в запаянном пластике с голограммой. Надпись видна всем (содержимое не секретно!), но переписать «цех №3» на «все цеха» не выйдет — голограмма (подпись) не совпадёт.', tech: 'JWT — RFC 7519, подпись — JWS (RFC 7515). HS256 — HMAC-SHA256 общим секретом; RS256/ES256 — подпись закрытым ключом, проверка открытым (сервер ресурсов не знает секрета). Проверки на сервере: подпись и разрешённый alg, exp, nbf, iss, aud, затем scope и права.' },
    render(el) {
      el.classList.add('api-root');
      let tok = api.jwtSign(H, PL), edit = JSON.stringify(PL, null, 2), msg = null;
      const draw = () => {
        const d = api.jwtDecode(tok);
        let checks = '';
        if (!d.err) {
          const p = d.payload, sc = String(p.scope || '').split(/\s+/);
          const row = (ok, t, why) => `<tr><td style="color:var(${ok ? '--ok' : '--bad'})">${ok ? '✓' : '✗'}</td><td>${t}</td><td class="small">${why}</td></tr>`;
          checks = `<table class="api-tbl"><tbody>
            ${row(d.header.alg === 'HS256' || d.header.alg === 'RS256', 'Алгоритм из разрешённого списка', `alg = ${esc(d.header.alg)}${d.header.alg === 'none' ? ' — «без подписи»: такой токен обязан быть отклонён' : ''}`)}
            ${row(d.sigOk, 'Подпись верна', d.sigOk ? 'содержимое выдал сервер и его не меняли' : 'содержимое изменено или подписано чужим ключом')}
            ${row(p.exp > NOW, 'Не истёк (exp)', `exp ${fmtTs(p.exp || 0)}, сейчас ${fmtTs(NOW)}`)}
            ${row(p.iss === ISS, 'Выдан нашим сервером (iss)', esc(String(p.iss)))}
            ${row(p.aud === AUD, 'Предназначен нашему API (aud)', esc(String(p.aud)))}
            ${row(sc.includes('deliveries:write'), 'Есть право на запись (scope deliveries:write)', esc(String(p.scope || '—')))}</tbody></table>`;
        }
        const pp = tok.split('.');
        el.innerHTML = `<div class="api-root"><p>Это токен кассы «Теста». Подпись проверяется по-настоящему: секрет сервера известен только кнопке «Подписать секретом сервера».</p>
          <div class="api-jwt" aria-label="Токен"><span class="h">${esc(pp[0] || '')}</span>.<span class="p">${esc(pp[1] || '')}</span>.<span class="s">${esc(pp.slice(2).join('.'))}</span></div>
          ${d.err ? `<div class="api-msg bad">${esc(d.err)}</div>` : `<div class="api-two"><div>${ui.code(JSON.stringify(d.header, null, 2), 'json', 'Заголовок (красный)')}${ui.code(JSON.stringify(d.payload, null, 2), 'json', 'Содержимое — claims (оранжевый)')}</div><div class="stack"><div class="eyebrow">Проверки сервера ресурсов</div>${checks}</div></div>`}
          <div class="api-con"><div class="lbl">Поменяйте содержимое — например, допишите scope или продлите exp</div><textarea data-ed spellcheck="false" style="min-height:150px">${esc(edit)}</textarea>
            <div class="row"><button type="button" class="btn sm" data-forge>Собрать токен без секрета (как злоумышленник)</button><button type="button" class="btn sm" data-sign>Подписать секретом сервера</button><button type="button" class="btn sm" data-none>Атака alg: none</button><button type="button" class="btn sm ghost" data-reset>⟲ Исходный токен</button></div>
            ${msg ? `<div class="api-msg ${msg.k}">${msg.t}</div>` : ''}</div>
          ${ui.note('warn', 'Что важно запомнить', 'Содержимое JWT не секретно — его читает любой (попробуйте jwt.io). Не кладите туда персональные данные и секреты. Защищает только подпись, и только если сервер её проверяет и не принимает alg: none. Отозвать выданный JWT нельзя — поэтому срок жизни короткий, а для долгой работы есть refresh-токен.')}</div>`;
      };
      el.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        const ta = TR.$('[data-ed]', el); edit = ta.value;
        let p; try { p = JSON.parse(edit); } catch (x) { msg = { k: 'bad', t: 'Содержимое — невалидный JSON.' }; draw(); return; }
        if (b.hasAttribute('data-forge')) { const old = tok.split('.'); tok = api.b64uStr(JSON.stringify(H)) + '.' + api.b64uStr(JSON.stringify(p)) + '.' + (old[2] || ''); msg = { k: 'bad', t: 'Содержимое поменяли, подпись осталась старой — сервер пересчитает подпись и увидит расхождение: 401.' }; }
        else if (b.hasAttribute('data-sign')) { tok = api.jwtSign(H, p); msg = { k: 'info', t: 'Токен подписан секретом сервера — так делает только Lozhka ID. Все проверки теперь зависят от содержимого.' }; }
        else if (b.hasAttribute('data-none')) { tok = api.b64uStr(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + api.b64uStr(JSON.stringify(p)) + '.'; msg = { k: 'bad', t: 'Атака alg: none: «подписи нет, верьте на слово». Уязвимые библиотеки принимали такие токены. Сервер обязан принимать только алгоритмы из своего списка.' }; }
        else if (b.hasAttribute('data-reset')) { tok = api.jwtSign(H, PL); edit = JSON.stringify(PL, null, 2); msg = null; }
        draw();
      };
      draw();
    }
  };

  /* ---------- OWASP ---------- */
  const howOwasp = K.textTheory({
    id: 'how-sec-owasp', covers: ['matrix', 'bugs'], title: 'Как это работает: права доступа и OWASP API Top 10',
    simple: { icon: '🛡', title: 'Простыми словами', plain: 'Самые частые дыры в API — не взлом шифров, а забытые проверки: «Тесто» поменяло id в адресе и увидело чужую доставку; API отдал лишние поля; можно сколько угодно подбирать пароль. Аналитик закладывает защиту в требования: кто что может, какие поля видит, какие лимиты.', analogy: 'Гардероб: номерок выдают всем (аутентификация), но гардеробщик обязан проверить, что пальто по номерку — ваше, а не просто «любое с таким номером» (авторизация на уровне объекта).', tech: 'OWASP API Security Top 10 — 2023. Модели прав: RBAC (по ролям), ABAC (по атрибутам: владелец, зона, сумма), scope OAuth (что разрешено клиенту). В реальных системах их сочетают.' },
    table: { head: ['Риск (OWASP 2023)', 'Что это', 'Как выглядит в «Ложке»', 'Защита в требованиях'], rows: [
      ['API1 · BOLA', 'Нет проверки владения объектом', 'GET /deliveries/dl-0777 отдаёт «Тесту» доставку «Бургер Лаб»', 'Каждый запрос объекта — проверка владельца; чужое → 404'],
      ['API2 · Broken Authentication', 'Слабая аутентификация', 'Вечный ключ в адресе, без лимита попыток входа', 'Короткие токены, OAuth, лимит попыток, ротация секретов'],
      ['API3 · BOPLA', 'Лишние поля в ответе или запросе', 'В ответе паспорт курьера; PATCH меняет price_from', 'Явный список полей на чтение и запись по ролям'],
      ['API4 · Unrestricted Resource Consumption', 'Нет лимитов', 'limit=100000, SMS-код без ограничений', 'Лимиты частоты, размера, страницы; 429'],
      ['API5 · BFLA', 'Нет проверки прав на функцию', 'Партнёр вызывает административный метод', 'Права на каждый метод, админка отдельно'],
      ['API6 · Unrestricted Access to Sensitive Business Flows', 'Автоматизация бизнес-процесса во вред', 'Скрипт занимает все окна курьеров на пятничный вечер', 'Квоты на партнёра, антибот, предоплата'],
      ['API7 · SSRF', 'Сервер ходит по адресу из запроса', 'Адрес вебхука указывает во внутреннюю сеть', 'Проверка адресов вебхуков, только https наружу'],
      ['API8 · Security Misconfiguration', 'Ошибки настройки', 'Стек в ответе 500, CORS «*»', 'Безопасные настройки по умолчанию, ревью'],
      ['API9 · Improper Inventory Management', 'Забытые версии и стенды', 'Старый /v0 без проверок жив на тестовом стенде', 'Реестр API, вывод версий по графику'],
      ['API10 · Unsafe Consumption of APIs', 'Слепое доверие чужим API', 'Принять вебхук «оплачено» без подписи', 'Проверять подписи и данные от внешних систем']
    ] },
    code: {
      'Client Credentials': 'POST https://id.lozhka.ru/oauth/token\nContent-Type: application/x-www-form-urlencoded\nAuthorization: Basic c2hhc2hrYTpzM2NyM3Q=      ← client_id:client_secret\n\ngrant_type=client_credentials&scope=deliveries:read deliveries:write\n\n200 OK\n{ "access_token": "eyJhbGciOiJIUzI1NiIs…",\n  "token_type": "Bearer",\n  "expires_in": 900,\n  "scope": "deliveries:read deliveries:write" }',
      'Code + PKCE': '1. Кабинет создаёт code_verifier (случайная строка) и code_challenge = SHA256(verifier)\n2. Перенаправляет Марата на\n   https://id.lozhka.ru/authorize?response_type=code&client_id=cabinet\n     &redirect_uri=…&scope=surcharges:approve&code_challenge=…&code_challenge_method=S256\n3. Марат входит на странице Lozhka ID и соглашается\n4. Lozhka ID возвращает на redirect_uri одноразовый ?code=…\n5. Кабинет: POST /oauth/token  code + code_verifier → access_token (+ refresh_token)',
      'Политика прав': 'роль / scope                      доставки  заказать  доплата>300  счета\nоператор (deliveries:*)              свои      да        нет          нет\nуправляющий (surcharges:approve)     свои      нет       да           нет\nбухгалтер (invoices:read)            нет       нет       нет          да\n+ ABAC: только точки своего партнёра; доплата ≤ 300 ₽ — автоматически'
    },
    notes: [['warn', 'Частая ошибка', 'Проверять права только на «входе» (есть токен и scope), но не на объекте. scope deliveries:read разрешает читать доставки, но только <i>свои</i>: владение проверяется отдельно на каждом id. Это API1 — самая частая уязвимость API.']]
  });

  /* =====================================================================
     ПРАКТИКА
     ===================================================================== */
  const taskDecide = K.matchTask({
    id: 'decide', title: '401, 403, 404 или разрешить',
    simple: howAuthn.simple,
    situation: 'Максим пишет проверку доступа в API и просит таблицу решений для тестов: что ответить в каждой ситуации.',
    look: 'Сначала аутентификация (есть ли действующий токен), потом права на действие (scope, роль), потом владение объектом. Чужой объект — 404, чтобы не подтверждать его существование.',
    choices: [{ v: '401', t: '401 — не аутентифицирован' }, { v: '403', t: '403 — нет прав' }, { v: '404', t: '404 — чужой объект скрываем' }, { v: 'ok', t: 'Разрешить' }],
    rows: [
      { id: 'd1', t: 'Оператор «Теста» с действующим токеном читает свою доставку dl-0998', a: 'ok', why: 'Токен, scope deliveries:read и владелец — всё сходится.' },
      { id: 'd2', t: 'Запрос без заголовка Authorization', a: '401', why: 'Кто спрашивает — неизвестно.' },
      { id: 'd3', t: 'Токен истёк 10 минут назад', a: '401', why: 'Недействительный токен — нужно получить новый.' },
      { id: 'd4', t: 'Токен «Теста» только с deliveries:read пытается создать доставку', a: '403', why: 'Кто это — известно, права на запись нет.' },
      { id: 'd5', t: '«Тесто» запрашивает dl-0777 — доставку ресторана «Бургер Лаб»', a: '404', why: 'Чужой объект: не раскрываем даже факт его существования.' },
      { id: 'd6', t: 'Управляющий со scope surcharges:approve согласует доплату 450 ₽ по своей точке', a: 'ok', why: 'Есть право, точка своя, дороже 300 ₽ — как раз его зона.' },
      { id: 'd7', t: 'Оператор (без surcharges:approve) пытается согласовать доплату', a: '403', why: 'Действие требует права, которого у роли нет.' },
      { id: 'd8', t: 'Токен выдан для api.testo-pizza.ru (aud), а пришёл в API «Ложки»', a: '401', why: 'Токен не для нас — считается недействительным.' },
      { id: 'd9', t: 'Подпись токена не сходится — в нём дописан scope', a: '401', why: 'Подделанный токен недействителен.' }
    ],
    need: 7,
    mentor: 'Порядок проверок: действующий ли токен (подпись, срок, aud) → есть ли право на действие → свой ли объект.',
    explain: `<p>Проверки идут слоями: аутентификация (подпись, срок, издатель, получатель) → авторизация на функцию (scope, роль) → авторизация на объект (владение, атрибуты вроде суммы). Ошибка на первом слое — 401, на втором — 403, на третьем — 404 для чужих объектов (или 403, если сам факт существования не секрет).</p>
      <p>Источники: RFC 6750, раздел 3.1 — коды invalid_token и insufficient_scope; OWASP API Security Top 10 (2023), API1 и API5.</p>`
  });

  /* ---------- шесть токенов ---------- */
  const mk = (h, p, tamper) => { let t = api.jwtSign(h, p); if (tamper) { const pp = t.split('.'); const q = Object.assign({}, p, tamper); t = pp[0] + '.' + api.b64uStr(JSON.stringify(q)) + '.' + pp[2]; } return t; };
  const base = { iss: ISS, sub: 'client:testo', aud: AUD, iat: NOW - 300, exp: NOW + 600, scope: 'deliveries:read deliveries:write', partner_id: 'testo' };
  const TOKS = [
    { id: 't1', tok: () => mk(H, base), a: 'ok', why: 'Подпись верна, срок не вышел, iss и aud наши, scope есть.' },
    { id: 't2', tok: () => mk(H, Object.assign({}, base, { iat: NOW - 4000, exp: NOW - 400 })), a: 'exp', why: 'exp раньше текущего времени — токен истёк, нужен новый.' },
    { id: 't3', tok: () => mk(H, Object.assign({}, base, { aud: 'api.testo-pizza.ru' })), a: 'aud', why: 'Токен выдан другому получателю — принимать его нельзя, даже если подпись верна.' },
    { id: 't4', tok: () => mk(H, Object.assign({}, base, { scope: 'deliveries:read points:read' })), a: 'scope', why: 'Токен действующий, но права на запись нет — 403 insufficient_scope.' },
    { id: 't5', tok: () => mk(H, Object.assign({}, base, { scope: 'deliveries:read' }), { scope: 'deliveries:read deliveries:write surcharges:approve' }), a: 'sig', why: 'Содержимое поменяли после подписи — подпись не сходится.' },
    { id: 't6', tok: () => api.b64uStr(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + api.b64uStr(JSON.stringify(base)) + '.', a: 'none', why: 'alg: none — токен без подписи, отклонять всегда.' }
  ];
  const VERD = [{ v: 'ok', t: 'Принять' }, { v: 'exp', t: 'Отклонить: истёк' }, { v: 'aud', t: 'Отклонить: не тот получатель (aud)' }, { v: 'scope', t: 'Отклонить: нет нужного scope' }, { v: 'sig', t: 'Отклонить: подпись не сходится' }, { v: 'none', t: 'Отклонить: alg none' }];
  const tEval = v => { v = v || {}; const good = TOKS.filter(t => v[t.id] === t.a).length; return { good, score: good / TOKS.length }; };
  const taskTokens = {
    id: 'tokens', title: 'Проверьте шесть токенов',
    simple: howJwt.simple,
    lead: ui.brief({
      situation: 'Аня собрала токены из логов тестового стенда — запросы POST /v1/deliveries (нужен scope deliveries:write). «Какие из них сервер должен был принять? Хочу сверить с тем, что он реально сделал».',
      todo: ['Для каждого токена посмотрите заголовок, содержимое и результат проверки подписи и выберите решение.', 'Сейчас по часам сервера: ' + fmtTs(NOW) + ' (Екатеринбург).', 'Нажмите «Проверить». Засчитывается от 5 верных из 6.'],
      lookTitle: 'Подсказка', look: 'Порядок: alg из разрешённых → подпись → exp → iss и aud → scope. Называйте первую причину отказа.'
    }),
    blank: () => ({ v: {} }),
    reference: () => ({ v: Object.fromEntries(TOKS.map(t => [t.id, t.a])) }),
    render(el, ctx) {
      el.classList.add('api-root');
      const a = ctx.ans; a.v = a.v || {};
      const shown = !!ctx.result || ctx.readonly;
      el.innerHTML = `<div class="api-root">${TOKS.map((t, i) => { const tok = t.tok(), d = api.jwtDecode(tok), pp = tok.split('.'), sel = a.v[t.id]; return `<div class="api-row" style="grid-template-columns:minmax(0,1fr)"><div class="meta">Токен ${i + 1}</div>
        <div class="api-jwt small"><span class="h">${esc(pp[0])}</span>.<span class="p">${esc(pp[1])}</span>.<span class="s">${esc(pp[2] || '')}</span></div>
        ${d.err ? `<div class="api-pm">${esc(d.err)}</div>` : `<div class="api-mono small">header ${esc(JSON.stringify(d.header))}</div><div class="api-mono small">payload ${esc(JSON.stringify(Object.assign({}, d.payload, { iat: fmtTs(d.payload.iat), exp: fmtTs(d.payload.exp) })))}</div><div class="small">Проверка подписи секретом сервера: ${d.header.alg === 'none' ? '<b>подписи нет</b>' : d.sigOk ? '<span style="color:var(--ok)">сходится</span>' : '<span style="color:var(--bad)">не сходится</span>'}</div>`}
        <select data-t="${t.id}" aria-label="Решение по токену ${i + 1}" ${ctx.readonly ? 'disabled' : ''}><option value="">Решение…</option>${VERD.map(x => `<option value="${x.v}" ${sel === x.v ? 'selected' : ''}>${esc(x.t)}</option>`).join('')}</select>
        ${shown ? `<div class="res ${sel === t.a ? 'ok' : 'bad'}">${sel === t.a ? '' : 'Правильно: ' + esc(VERD.find(x => x.v === t.a).t) + '. '}${esc(t.why)}</div>` : ''}</div>`; }).join('')}</div>`;
      el.onchange = ctx.readonly ? null : e => { const s = e.target.closest('[data-t]'); if (!s) return; if (s.value) a.v[s.dataset.t] = s.value; else delete a.v[s.dataset.t]; ctx.save(); };
    },
    check(ans) {
      const v = (ans && ans.v) || {}, r = tEval(v), notes = TOKS.map((t, i) => v[t.id] === t.a ? { ok: true, html: `Токен ${i + 1} — верно.` } : { ok: false, html: `Токен ${i + 1}: ${esc(VERD.find(x => x.v === t.a).t)}. ${esc(t.why)}` });
      return { ok: r.good >= 5, score: r.score, notes, summary: `Верно ${r.good} из ${TOKS.length}.`, mentor: r.good >= 5 ? null : 'Идите по проверкам по порядку: alg, подпись, exp против текущего времени, aud, scope.' };
    },
    explain: `<p>Один верный и пять отказов с разными причинами — ровно тот набор негативных тестов, который нужен любому API с JWT. Особое внимание — токенам 3 и 5: подпись у третьего верна, но токен выдан другому сервису (атака «подмена получателя»); у пятого всё выглядит правдоподобно, но содержимое дописано после подписи.</p>
      <p>Источники: RFC 7519 (JWT), раздел 7.2 — проверка; RFC 8725 «JSON Web Token Best Current Practices»; OWASP «JSON Web Token Cheat Sheet».</p>`,
    refNote: 'Засчитывается от 5 верных решений из 6.',
    report: ans => { const v = (ans && ans.v) || {}; return TOKS.map((t, i) => `- Токен ${i + 1}: ${v[t.id] ? VERD.find(x => x.v === v[t.id]).t : '—'}${v[t.id] === t.a ? ' ✓' : ''}`).join('\n'); }
  };

  /* ---------- матрица прав ---------- */
  const ROLES = [{ id: 'disp', t: 'Оператор «Теста»' }, { id: 'zav', t: 'Управляющий «Теста»' }, { id: 'acc', t: 'Бухгалтер «Теста»' }, { id: 'mst', t: 'Оператор поддержки «Ложки»' }, { id: 'mech', t: 'Курьер «Ложки»' }];
  const OPS = [
    { id: 'view', t: 'Смотреть доставки', ok: ['disp', 'zav', 'mst', 'mech'] },
    { id: 'book', t: 'Заказать, перенести, отменить доставку «Теста»', ok: ['disp'] },
    { id: 'appr', t: 'Согласовать доплату дороже 300 ₽', ok: ['zav'] },
    { id: 'inv', t: 'Смотреть счета и акты «Теста»', ok: ['acc'] },
    { id: 'surcharge', t: 'Выставить доплату с суммой', ok: ['mst'] },
    { id: 'done', t: 'Отметить «забрал» и «доставил»', ok: ['mech'] }
  ];
  const cells = []; OPS.forEach(o => ROLES.forEach(r => cells.push(o.id + ':' + r.id)));
  const mEval = m => { m = m || {}; let good = 0; OPS.forEach(o => ROLES.forEach(r => { if (!!m[o.id + ':' + r.id] === o.ok.includes(r.id)) good++; })); return { good, score: good / cells.length }; };
  const taskMatrix = {
    id: 'matrix', title: 'Соберите матрицу прав из политики доступа',
    simple: howOwasp.simple,
    lead: ui.brief({
      situation: 'Светлана Андреевна и Марат согласовали, кто что может. Максиму нужна матрица прав — по ней он настроит роли и scope, а Аня напишет тесты.',
      todo: ['Отметьте, какие операции разрешены каждой роли, — строго по политике в подсказке.', 'Нажмите «Проверить». Засчитывается от 28 верных клеток из 30.'],
      lookTitle: 'Политика доступа', look: 'Оператор «Теста» заказывает, переносит и отменяет доставки и видит их. Управляющий «Теста» видит доставки и согласует доплаты дороже 300 ₽; заказывать курьеров — не его задача. Бухгалтер «Теста» видит только счета и акты. Оператор поддержки «Ложки» видит доставки и выставляет доплаты с суммой; согласовывать за партнёра не может. Курьер видит доставки своей зоны и отмечает «забрал» и «доставил»; суммы не выставляет.'
    }),
    blank: () => ({ m: {} }),
    reference: () => { const m = {}; OPS.forEach(o => o.ok.forEach(r => { m[o.id + ':' + r] = true; })); return { m }; },
    render(el, ctx) {
      el.classList.add('api-root');
      const a = ctx.ans; a.m = a.m || {};
      const shown = !!ctx.result || ctx.readonly;
      el.innerHTML = `<div class="api-root"><div class="api-scroll"><table class="api-tbl"><thead><tr><th>Операция</th>${ROLES.map(r => `<th class="c">${esc(r.t)}</th>`).join('')}</tr></thead><tbody>
        ${OPS.map(o => `<tr><td>${esc(o.t)}</td>${ROLES.map(r => { const k = o.id + ':' + r.id, on = !!a.m[k], right = o.ok.includes(r.id); return `<td class="c" style="${shown ? `background:var(${on === right ? '--ok-soft' : '--bad-soft'})` : ''}"><input type="checkbox" data-c="${k}" ${on ? 'checked' : ''} ${ctx.readonly ? 'disabled' : ''} aria-label="${esc(r.t)}: ${esc(o.t)}"></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
        ${shown ? '<p class="small dim">Зелёные клетки — верно, красные — расходятся с политикой.</p>' : ''}</div>`;
      el.onchange = ctx.readonly ? null : e => { const c = e.target.closest('[data-c]'); if (!c) return; if (c.checked) a.m[c.dataset.c] = true; else delete a.m[c.dataset.c]; ctx.save(); };
    },
    check(ans) {
      const m = (ans && ans.m) || {}, r = mEval(m), notes = [];
      OPS.forEach(o => ROLES.forEach(rl => { const k = o.id + ':' + rl.id, on = !!m[k], right = o.ok.includes(rl.id); if (on !== right) notes.push({ ok: false, html: `${esc(rl.t)} — «${esc(o.t)}»: ${right ? 'должно быть разрешено' : 'должно быть запрещено'}.` }); }));
      if (!notes.length) notes.push({ ok: true, html: 'Матрица совпадает с политикой.' });
      const any = Object.keys(m).length > 0;
      return { ok: any && r.good >= 28, score: any ? r.score : 0, notes: notes.slice(0, 10), summary: `Верных клеток: ${any ? r.good : 0} из ${cells.length}.`, mentor: any && r.good >= 28 ? null : 'Идите по политике фразой за фразой: для каждой роли отметьте только то, что прямо сказано.' };
    },
    explain: `<p>Матрица «роль × операция» — главный артефакт авторизации: из неё получаются роли и scope (оператор — deliveries:*, управляющий — deliveries:read + surcharges:approve, бухгалтер — invoices:read), а каждая клетка — тест: разрешено — позитивный, запрещено — негативный (403). Плюс атрибуты сверх матрицы: курьер видит доставки только своей зоны, партнёр — только свои точки, автосогласование — до 300 ₽. Это уже ABAC.</p>
      <p>Принцип минимальных привилегий: роль получает только то, что нужно для работы. Источники: NIST SP 800-162 (ABAC); OWASP API Security Top 10 (2023), API5 «Broken Function Level Authorization».</p>`,
    refNote: 'Засчитывается от 28 верных клеток из 30.',
    report: ans => { const m = (ans && ans.m) || {}; return OPS.map(o => `- ${o.t}: ${ROLES.filter(r => m[o.id + ':' + r.id]).map(r => r.t).join(', ') || '—'}`).join('\n'); }
  };

  /* ---------- уязвимости ---------- */
  const PEN = [
    { s: '# Отчёт пентестера · тестовый стенд партнёрского API', k: null },
    { s: '1. GET /v1/deliveries/dl-0777 с токеном «Теста» → 200, доставка «Бургер Лаб»', k: 'a' },
    { s: '2. GET /v1/deliveries/dl-0998 → в ответе courier_phone и courier_passport', k: 'b' },
    { s: '3. POST /oauth/token: 10 000 попыток подобрать client_secret за минуту, без блокировки', k: 'c' },
    { s: '4. PATCH /v1/deliveries/dl-0998 { "price_from": 1 } → 200, цена доставки изменилась', k: 'd' },
    { s: '5. GET /v1/deliveries без токена → 401 и WWW-Authenticate: Bearer', k: 'e' },
    { s: '6. POST /v1/deliveries с токеном только на чтение → 403 insufficient_scope', k: 'f' },
    { s: '7. Токен «Теста» живёт 1 год, отозвать его нельзя', k: 'g' },
    { s: '8. Вебхук ЮKassa без верной подписи → 401, событие не обработано', k: 'h' },
    { s: '9. Чужой токен (aud = api.testo-pizza.ru) → 401 invalid_token', k: 'i' }
  ];
  const taskBugs = K.bugsTask({
    id: 'bugs', title: 'Найдите уязвимости в отчёте пентестера',
    simple: howOwasp.simple,
    situation: 'Перед запуском партнёрского API «Ложка» заказала тест на проникновение. В отчёте перемешаны находки и проверки, которые прошли успешно. Отметьте уязвимости — по ним заведут задачи.',
    look: 'Сверяйтесь с таблицей OWASP API Top 10 из теории: владение объектом, лишние поля, лимиты, массовое присвоение, срок жизни токенов.',
    items: [
      { k: 'a', t: 'Чужая доставка отдаётся по id', err: 'API1 BOLA: нет проверки владения объектом. Чужая доставка должна давать 404.' },
      { k: 'b', t: 'В ответе телефон и паспорт курьера', err: 'API3 BOPLA: лишние персональные данные в ответе. Паспорт курьера партнёру не нужен вовсе, телефон — только подменный номер на время доставки (152-ФЗ).' },
      { k: 'c', t: 'Неограниченный подбор client_secret', err: 'API2/API4: нет лимита попыток аутентификации — секрет подберут перебором. Лимит, блокировка, алерт.' },
      { k: 'd', t: 'PATCH меняет price_from', err: 'API3 BOPLA, массовое присвоение: сервер принял поле, которое клиент менять не должен. Явный список изменяемых полей (start_at, comment).' },
      { k: 'e', t: '401 без токена' },
      { k: 'f', t: '403 при нехватке scope' },
      { k: 'g', t: 'Токен на год без отзыва', err: 'API2: украденный токен работает год. Короткие токены (15 минут) через Client Credentials, секреты — с ротацией и возможностью отзыва.' },
      { k: 'h', t: 'Вебхук без подписи отклоняется' },
      { k: 'i', t: 'Чужой aud отклоняется' }
    ],
    svg: (nums, marks) => api.lines(PEN, 'text', nums, marks),
    mentor: 'Уязвимость — где сервер разрешил то, что должен был запретить, или отдал лишнее. Пункты, где сервер отказал правильно, — успешные проверки.',
    explain: `<p>Пять находок — это API1 (чужая доставка), API3 дважды (лишние поля в ответе и массовое присвоение в запросе), API2/API4 (перебор секрета) и API2 (вечный токен). Каждая превращается в требование: проверка владельца на каждом объекте, явные списки полей на чтение и запись по ролям, лимит попыток входа, срок жизни токена 15 минут и отзыв секретов.</p>
      <p>Источники: OWASP API Security Top 10 — 2023 (owasp.org/API-Security); RFC 9700 «OAuth 2.0 Security Best Current Practice»; 152-ФЗ «О персональных данных».</p>`
  });

  const taskJustify = K.justifyTask({
    id: 'justify', title: 'Ответьте Артуру: «дайте постоянный ключ»',
    who: 'artur', say: 'Не хочу возиться с OAuth и токенами. Дайте нам один постоянный ключ — положим в конфиг и будем передавать в адресе: ?key=… Так у всех делают.',
    situation: 'Артур не хочет реализовывать получение токенов и просит упрощённую схему доступа.',
    look: 'Вспомните, как работает Client Credentials, куда попадает адрес запроса и что будет, если ключ утечёт. И факты о «Тесту» из блокнота.',
    q: 'Что ответить Артуру?',
    qPlain: 'Объясните разработчику партнёра, почему нельзя передавать постоянный ключ в адресе запроса и почему Client Credentials с короткоживущим токеном — это несложно и безопаснее.',
    rubric: [
      'Объясняет, почему ключ в адресе опасен: адреса попадают в логи серверов, прокси, мониторинга и в историю',
      'Объясняет риск постоянного ключа: утечёт — работает бессрочно, пока не заметят; токен на 15 минут ограничивает ущерб',
      'Показывает, что Client Credentials простой: один POST за токеном раз в 15 минут, есть готовые библиотеки для Python',
      'Упоминает минимальные права (scope), отдельные ключи для теста и боевого, возможность отозвать секрет',
      'Тон партнёрский: признаёт неудобство и предлагает помощь — пример кода, песочницу'
    ],
    ref: 'Артур, понимаю, хочется проще, но ключ в адресе — это ключ в логах: адреса запросов пишут наш шлюз, ваши прокси, системы мониторинга, и любой, кто увидит такой лог, получит доступ к доставкам всех ваших 25 пиццерий. А постоянный ключ, если утечёт, работает, пока мы не заметим, — месяцами. С Client Credentials всё почти так же просто: ваш сервер раз в 15 минут отправляет один POST на /oauth/token с client_id и секретом в заголовке и получает токен, а дальше передаёт его в Authorization: Bearer. Для Python это пять строк с библиотекой requests-oauthlib или authlib, пример я пришлю. Токен живёт 15 минут, поэтому даже утёкший быстро становится бесполезным; права в нём только те, что вам нужны, — доставки и точки; ключи для песочницы и боевого разные, а секрет мы можем сменить за минуту, если что-то пойдёт не так. Песочница уже работает — попробуйте сегодня.',
    hint: 'Объясните про логи и срок жизни и покажите, что Client Credentials — это один запрос.',
    mentor: 'Партнёра убеждает простота решения. Покажите риск в его терминах и дайте путь, который займёт час, а не неделю.',
    explain: `<p>Ключ в URL нарушает RFC 6750 (раздел 2.3 не рекомендует query-параметр из-за утечек в логи и историю) и OWASP REST Security Cheat Sheet. Client Credentials (RFC 6749, раздел 4.4) — стандартный поток «сервер — сервер»: секрет на сервере партнёра, короткий токен, scope по договору, отзыв и ротация.</p>
      <p>Источники: RFC 6749, 6750; RFC 9700 «OAuth 2.0 Security Best Current Practice»; OWASP REST Security Cheat Sheet.</p>`
  });

  TR.stage({
    id: ID,
    when: 'понедельник, 19 апреля 2027, 10:00 · пентест перед запуском партнёрского API',
    facts: ['F-shk-tech', 'F-shk-pd'],
    intro: [
      { who: 'denis', html: 'Через две недели подключаем «Тесто» в бой. Служба безопасности потребовала пентест, и отчёт уже пришёл — красного там хватает.' },
      { who: 'artur', html: 'А можно без OAuth? Дайте постоянный ключ, мы его в адресе передадим. Так проще.' },
      { who: 'irina', html: 'Последний модуль — безопасность и проектирование. Сегодня: кто ты, что тебе можно и как это доказать. Разберём токены изнутри, проверим настоящие JWT, соберём матрицу прав и разберём отчёт пентестера по OWASP.' }
    ],
    glossary: [
      { term: 'Аутентификация', simple: 'Проверка, что ты тот, за кого себя выдаёшь.', tech: 'Authentication; ошибка — 401.' },
      { term: 'Авторизация', simple: 'Решение, что тебе разрешено.', tech: 'Authorization; ошибка — 403 (или 404 для чужих объектов).' },
      { term: 'OAuth 2.0', simple: 'Стандарт выдачи токенов доступа без передачи пароля приложению.', tech: 'RFC 6749.' },
      { term: 'JWT', simple: 'Токен из трёх частей: заголовок, содержимое, подпись.', tech: 'JSON Web Token, RFC 7519.' },
      { term: 'Scope', simple: 'Набор прав, выданных токену.', tech: 'Параметр OAuth 2.0: deliveries:read, surcharges:approve.' },
      { term: 'Client Credentials', simple: 'Поток OAuth для связи «сервер — сервер» без человека.', tech: 'RFC 6749, 4.4.' },
      { term: 'PKCE', simple: 'Защита одноразового кода в потоке входа через браузер или приложение.', tech: 'Proof Key for Code Exchange, RFC 7636.' },
      { term: 'RBAC и ABAC', simple: 'Права по ролям и по атрибутам (владелец, сумма, зона).', tech: 'Role-based / Attribute-based access control.' },
      { term: 'BOLA', simple: 'Уязвимость: можно получить чужой объект, подставив его id.', tech: 'OWASP API1:2023.' }
    ],
    outro: 'Находки пентеста закрыты: проверка владельца, списки полей, лимит попыток, токены на 15 минут через Client Credentials. Артур получил пример кода и перешёл на OAuth за вечер. Финальное занятие — проектирование API от требований: соберём всё вместе.',
    tasks: [howAuthn, howJwt, howOwasp, taskDecide, taskTokens, taskMatrix, taskBugs, taskJustify]
  });
})();
