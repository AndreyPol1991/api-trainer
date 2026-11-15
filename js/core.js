/* Ядро тренажёра «Шлюз» (API, движок «Искры»): состояние, факты блокнота, регистрация этапов, очки, словарь, доступ к Claude.
   Контракт для модулей этапов — _dev/CONTRACT.md. */
'use strict';
(function () {
  const TR = window.TR = window.TR || {};

  // ---------- утилиты ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  TR.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  TR.$ = (sel, root) => (root || document).querySelector(sel);
  TR.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  TR.el = html => { const t = document.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; };
  TR.on = (root, type, sel, fn) => root.addEventListener(type, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });
  TR.clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  TR.norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9{}/\-_.:+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  TR.hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  TR.rand = seed => { let a = TR.hash(seed) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  TR.shuffle = (arr, seed) => { const r = TR.rand(seed || 'shluz'), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  TR.plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many); };
  TR.fmtRub = kop => (kop / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ₽';
  TR.sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- события ----------
  const subs = {};
  TR.sub = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); return () => { subs[ev] = subs[ev].filter(f => f !== fn); }; };
  TR.emit = (ev, data) => (subs[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });

  // ---------- состояние ----------
  const KEY = 'amp-api-shluz-trainer-v1';
  const fresh = () => ({ v: 1, name: '', group: '', trust: 50, xp: 0, facts: {}, notes: '', stages: {}, decisions: [], log: [], teacher: false, started: null });
  let S = fresh();
  try {
    const hot = window.claude && window.claude.hot && window.claude.hot.data;
    const raw = hot && hot.state ? hot.state : JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.v === 1) S = Object.assign(fresh(), raw);
  } catch (e) { /* хранилище недоступно — работаем в памяти */ }
  TR.S = () => S;
  let saveT = 0;
  TR.save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }, 250); };
  TR.reset = () => { S = fresh(); try { localStorage.removeItem(KEY); } catch (e) { } TR.emit('reset'); TR.emit('hud'); };
  try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => ({ state: S })); } catch (e) { }

  TR.stageState = id => (S.stages[id] = S.stages[id] || { tasks: {}, visited: null, done: null });
  TR.taskState = (sid, tid) => { const st = TR.stageState(sid); return (st.tasks[tid] = st.tasks[tid] || { ans: null, attempts: 0, ok: false, best: 0, revealed: false, done: false }); };
  TR.teacher = () => !!S.teacher;
  TR.setTeacher = on => { S.teacher = !!on; TR.save(); TR.emit('teacher', S.teacher); };

  // ---------- персонажи ----------
  // Заказчик — сеть автосервисов «Искра» (Казань); исполнитель — студия разработки «Орбита», где работаете вы.
  TR.PEOPLE = {
    timur: { name: 'Тимур Рашидович', role: 'владелец сети автосервисов «Искра»', ini: 'ТР' },
    marina: { name: 'Марина Олеговна', role: 'управляющая станцией на Победы, старший мастер-приёмщик', ini: 'МО' },
    petrovich: { name: 'Сергей Петрович', role: 'мастер цеха, старший механик «Искры»', ini: 'СП' },
    aliya: { name: 'Алия', role: 'кладовщица, закупка запчастей «Искры»', ini: 'А' },
    olga: { name: 'Ольга Викторовна', role: 'главный бухгалтер «Искры»', ini: 'ОВ' },
    kirill: { name: 'Кирилл', role: 'маркетолог «Искры»', ini: 'К' },
    elena: { name: 'Елена', role: 'клиентка «Искры», Kia Rio 2019', ini: 'Е' },
    igor: { name: 'Игорь', role: 'разработчик таксопарка «Шашка», подключается к API «Искры»', ini: 'И' },
    rustam: { name: 'Рустам', role: 'завгар таксопарка «Шашка», корпоративный клиент', ini: 'Р' },
    vera: { name: 'Вера', role: 'ведущий системный аналитик «Орбиты», ваш наставник', ini: 'В' },
    artem: { name: 'Артём', role: 'руководитель проекта «Орбиты»', ini: 'Ар' },
    gleb: { name: 'Глеб', role: 'тимлид, бэкенд-разработчик «Орбиты»', ini: 'Г' },
    dasha: { name: 'Даша', role: 'мобильный разработчик «Орбиты»', ini: 'Д' },
    liza: { name: 'Лиза', role: 'тестировщица (QA) «Орбиты»', ini: 'Л' },
    nika: { name: 'Ника', role: 'дизайнер интерфейсов «Орбиты»', ini: 'Н' },
    me: { name: 'Вы', role: 'младший системный аналитик «Орбиты»', ini: 'Я' }
  };
  TR.MENTOR = 'vera';

  // ---------- факты блокнота ----------
  TR.FACTS = {};
  TR.TOPICS = [];
  TR.fact = (id, def) => { TR.FACTS[id] = Object.assign({ id }, def); if (def.topic && !TR.TOPICS.includes(def.topic)) TR.TOPICS.push(def.topic); return TR.FACTS[id]; };
  TR.facts = {
    get: id => TR.FACTS[id],
    has: id => !!S.facts[id],
    unlock(id, how) {
      if (!TR.FACTS[id] || S.facts[id]) return false;
      S.facts[id] = { at: Date.now(), how: how || 'ask' };
      TR.save(); TR.emit('fact', id); TR.emit('hud');
      return true;
    },
    lock(id) { delete S.facts[id]; TR.save(); TR.emit('fact', id); TR.emit('hud'); },
    count: () => Object.keys(S.facts).filter(id => TR.FACTS[id]).length,
    all: () => Object.values(TR.FACTS)
  };

  // ---------- программа: 4 модуля курса, занятия — как на платформе ----------
  TR.ACTS = [
    { n: 1, title: 'Модуль 1 · Основы API', sub: 'Что такое API, HTTP изнутри, виды API и подходы к интеграции' },
    { n: 2, title: 'Модуль 2 · REST', sub: 'Ресурсы и методы, продвинутый REST, контракт в OpenAPI' },
    { n: 3, title: 'Модуль 3 · gRPC и асинхронность', sub: 'gRPC и Protocol Buffers, вебхуки и брокеры сообщений' },
    { n: 4, title: 'Модуль 4 · Безопасность и проектирование', sub: 'Аутентификация, авторизация, JWT, OAuth 2.0, права; проектирование API по требованиям' }
  ];
  // Каталог занятий: id тренировки = id задания на платформе. lesson — номер занятия в модуле (null — выжимка),
  // mins — длительность урока на платформе, ic — значок карточки на обложке.
  TR.LESSONS = [
    { id: 'a1-api', act: 1, lesson: 1, ic: 'api', mins: 20, title: 'Что такое API и зачем оно нужно', sub: 'Разбираем, как API связывает интерфейс, бэкенд, данные и внешние системы и почему API — это контракт' },
    { id: 'a1-http', act: 1, lesson: 2, ic: 'http', mins: 25, title: 'HTTP изнутри: запросы, ответы, коды', sub: 'Разбираем методы, адреса, заголовки, тело и коды ответов, безопасные и идемпотентные методы' },
    { id: 'a1-kinds', act: 1, lesson: 3, ic: 'kinds', mins: 25, title: 'Виды API и подходы к интеграции', sub: 'Сравниваем REST, SOAP, gRPC, GraphQL, вебхуки, брокеры и файловый обмен и учимся выбирать подход' },
    { id: 'a2-rest', act: 2, lesson: 1, ic: 'rest', mins: 25, title: 'REST API', sub: 'Разбираем ресурсы, методы, коды, структуру запросов и ключевые элементы REST-контракта' },
    { id: 'a2-rest2', act: 2, lesson: 2, ic: 'rest2', mins: 25, title: 'REST продвинутый: ошибки, пагинация, версии, идемпотентность', sub: 'Учимся описывать ошибки по RFC 9457, пагинацию и фильтры, версии, ключ идемпотентности, кеш и лимиты' },
    { id: 'a2-openapi', act: 2, lesson: 3, ic: 'openapi', mins: 25, title: 'OpenAPI: описываем контракт', sub: 'Учимся читать и писать спецификацию OpenAPI: пути, параметры, схемы, ответы, примеры' },
    { id: 'a3-grpc', act: 3, lesson: 1, ic: 'grpc', mins: 25, title: 'gRPC на базовом уровне', sub: 'Разбираем gRPC, Protocol Buffers, типы вызовов и основы proto-контракта' },
    { id: 'a3-async', act: 3, lesson: 2, ic: 'async', mins: 25, title: 'Асинхронная интеграция: вебхуки и брокеры сообщений', sub: 'Разбираем вебхуки, очереди и топики, повторы, дубли и порядок сообщений' },
    { id: 'a4-security', act: 4, lesson: 1, ic: 'sec', mins: 25, title: 'Безопасность API: аутентификация, авторизация, JWT и права доступа', sub: 'Разбираем аутентификацию и авторизацию, JWT, OAuth 2.0, роли и права, типичные уязвимости API' },
    { id: 'a4-design', act: 4, lesson: 2, ic: 'design', mins: 30, title: 'Проектирование API по требованиям, сценариям и данным', sub: 'Учимся проектировать API от требований и сценариев к ресурсам, методам, полям и ошибкам' }
  ];
  TR.lesson = id => TR.LESSONS.find(l => l.id === id) || null;
  // «Занятие 2 · Модуль 4» — как на карточках платформы
  TR.lessonLabel = id => { const l = TR.lesson(id); return l ? (l.lesson == null ? `Модуль ${l.act}` : `Занятие ${l.lesson} · Модуль ${l.act}`) : ''; };
  const STAGES = [];
  TR.stage = def => {
    if (!def || !def.id) throw new Error('TR.stage: нужен id');
    if (STAGES.some(s => s.id === def.id)) throw new Error('TR.stage: повтор id ' + def.id);
    // модуль, порядок и название берутся из каталога занятий — тренировки стоят ровно как уроки на платформе
    const L = TR.lesson(def.id);
    if (L) { def.act = L.act; def.order = (TR.LESSONS.indexOf(L) + 1) * 10; def.title = def.title || L.title; def.slot = def.slot || (L.lesson == null ? `${L.act}·★` : `${L.act}·${L.lesson}`); }
    def.tasks = def.tasks || [];
    def.tasks.forEach((t, i) => { if (!t.id) t.id = 't' + (i + 1); });
    STAGES.push(def);
    STAGES.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (def.glossary) TR.glossary(def.glossary, def.id);
    TR.emit('stages');
    return def;
  };
  TR.stages = () => STAGES.slice();
  TR.stageById = id => STAGES.find(s => s.id === id) || null;
  // теория — вводные разделы «Как это работает» (id how-*) или подходы с theory: true; в прогресс и зачёт не входят
  TR.isTheory = t => !!(t && (t.theory || /^how-/.test(t.id)));
  TR.practiceTasks = def => def.tasks.filter(t => !TR.isTheory(t));
  TR.stageProgress = id => {
    const def = TR.stageById(id); if (!def) return { done: 0, total: 0, ratio: 0 };
    const st = TR.stageState(id), list = TR.practiceTasks(def);
    const total = list.length, done = list.filter(t => (st.tasks[t.id] || {}).done).length;
    return { done, total, ratio: total ? done / total : 0, score: total ? list.reduce((s, t) => s + ((st.tasks[t.id] || {}).best || 0), 0) / total : 0 };
  };

  // ---------- очки ----------
  TR.score = (dTrust, dXp, reason) => {
    S.trust = Math.max(0, Math.min(100, S.trust + (dTrust || 0)));
    S.xp = Math.max(0, S.xp + (dXp || 0));
    if (reason) S.log.push({ at: Date.now(), t: reason, d: dTrust || 0, x: dXp || 0 });
    if (S.log.length > 400) S.log = S.log.slice(-400);
    TR.save(); TR.emit('hud', { dTrust, dXp, reason });
  };
  TR.decide = (stageId, label, value) => {
    S.decisions = S.decisions.filter(d => !(d.stage === stageId && d.label === label));
    S.decisions.push({ stage: stageId, label, value: String(value), at: Date.now() });
    TR.save();
  };

  // ---------- словарь ----------
  TR.GLOSSARY = [];
  TR.glossary = (list, stageId) => (list || []).forEach(g => {
    if (!g || !g.term) return;
    const ex = TR.GLOSSARY.find(x => TR.norm(x.term) === TR.norm(g.term) && x.stage === (stageId || null));
    if (ex) return;
    TR.GLOSSARY.push(Object.assign({ stage: stageId || null }, g));
  });

  // ---------- Claude (возможность sample) ----------
  let sampleP = null;
  TR.sample = () => {
    if (!sampleP) sampleP = (async () => {
      try { return window.claude && window.claude.use ? (await window.claude.use('sample')) || null : null; } catch (e) { return null; }
    })();
    return sampleP;
  };
  TR.sampleDead = false;
  TR.sampleErr = e => {
    const c = e && e.code;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(c)) { TR.sampleDead = true; return 'Claude недоступен в этом окне — работаем без него.'; }
    if (c === 'rate_limited') return 'Слишком много вопросов подряд. Подождите минуту.';
    if (c === 'cancelled') return '';
    if (c === 'session_expired') return 'Сессия истекла — войдите в claude.ai заново.';
    return 'Не получилось получить ответ. Попробуйте ещё раз.';
  };
  let dlP = null;
  TR.downloads = () => {
    if (!dlP) dlP = (async () => { try { return window.claude && window.claude.use ? (await window.claude.use('downloads')) || null : null; } catch (e) { return null; } })();
    return dlP;
  };

  TR.go = id => TR.emit('go', id);
})();
