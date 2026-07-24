/* global window */
(function () {
  const STORAGE = window.LOZA_AUDIO_STORAGE || { baseUrl: 'https://storage.yandexcloud.net/fidesetratio', rows: [] };
  const PLACEHOLDER_COPY = [
    'открыть запись внутри клуба',
    'полная формулировка вопроса и ответ эксперта внутри карточки',
    'полная расшифровка пока не прикреплена',
  ];

  function cleanDisplayText(text) {
    if (!text) return '';
    let value = String(text).trim();
    value = value.replace(/^\++\s*/, '');
    value = value.replace(/^#{1,6}\s+/, '');
    value = value.replace(/#(?=[\p{L}\d])/gu, '');
    return value.replace(/\s+/g, ' ').trim();
  }

  function cleanContentText(text) {
    if (!text) return '';
    let value = String(text).replace(/\r\n/g, '\n').trim();
    value = value.replace(/^\+*\s*(?:\d+[а-яa-z]?\s+)?вопрос\b[^.\n]*[.:]?\s*/i, '');
    value = value.replace(/^\++\s*\d+[а-яa-z]?\s+вопрос[^\n]*\n?/i, '');
    value = value.replace(/^#{1,6}\s+/m, '');
    value = value.replace(/#(?=[\p{L}\d])/gu, '');
    value = value.replace(/(^|\n)\s*вопрос[.:]\s*/gi, '$1');
    value = value.replace(/^\++\s*/gm, '');
    value = value.replace(/\n{3,}/g, '\n\n');
    return value.trim();
  }

  function isPlaceholderMediaCopy(text) {
    if (!text || !String(text).trim()) return true;
    const normalized = String(text).trim().toLowerCase();
    return PLACEHOLDER_COPY.some((phrase) => normalized.includes(phrase));
  }

  function normalizeLookupText(value) {
    return cleanDisplayText(value)
      .toLowerCase()
      .replace(/[ё]/g, 'е')
      .replace(/[«»"“”„.,:;!?()[\]{}|/\\_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function encodeObjectKey(objectKey) {
    return objectKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  }

  function storageUrl(objectKey) {
    return `${STORAGE.baseUrl}/${encodeObjectKey(objectKey)}`;
  }

  function resolveMediaUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/')) return `${window.location.origin}${trimmed}`;
    return trimmed;
  }

  function findStoredAudioObjectKey(item) {
    if (item.kind !== 'audio') return '';
    const title = normalizeLookupText(item.title);
    const meta = normalizeLookupText(item.meta);
    const questionNumber = item.questionNumber ? String(item.questionNumber).trim() : '';

    if (questionNumber) {
      const exactQuestion = STORAGE.rows.find((row) =>
        row.objectKey.startsWith('02_audio_answers_mp3/')
        && normalizeLookupText(row.meta).includes(normalizeLookupText(`Вопрос ${questionNumber}`)),
      );
      if (exactQuestion) return exactQuestion.objectKey;
    }

    const sameSectionRows = STORAGE.rows.filter((row) => {
      if (item.sectionId === 'podcasts') return row.objectKey.startsWith('01_podcasts_mp3/');
      if (item.sectionId === 'questions') return row.objectKey.startsWith('02_audio_answers_mp3/');
      return true;
    });

    const exactTitleAndMeta = sameSectionRows.find((row) =>
      normalizeLookupText(row.title) === title && normalizeLookupText(row.meta) === meta,
    );
    if (exactTitleAndMeta) return exactTitleAndMeta.objectKey;

    const exactTitle = sameSectionRows.find((row) => normalizeLookupText(row.title) === title);
    if (exactTitle) return exactTitle.objectKey;

    const titleIncludes = sameSectionRows.find((row) => {
      const rowTitle = normalizeLookupText(row.title);
      return rowTitle.includes(title) || title.includes(rowTitle);
    });
    return titleIncludes ? titleIncludes.objectKey : '';
  }

  function resolveAudioUrl(item) {
    const storedObjectKey = findStoredAudioObjectKey(item);
    if (storedObjectKey) return storageUrl(storedObjectKey);
    if (item.audioAssetPath) return storageUrl(item.audioAssetPath);
    return resolveMediaUrl(item.mediaUrl);
  }

  function itemHasMediaLayout(item) {
    return item.kind === 'video' || item.kind === 'audio';
  }

  function getMaterialBody(item) {
    const transcript = item.transcript && String(item.transcript).trim();
    if (transcript) {
      const cleaned = cleanContentText(transcript);
      if (cleaned) return cleaned;
    }
    const description = item.description && String(item.description).trim();
    if (description && !isPlaceholderMediaCopy(description)) {
      return cleanContentText(description);
    }
    const title = cleanDisplayText(item.title);
    if (item.sectionId === 'webinars') {
      return [
        `Запись эфира клуба «${title}».`,
        'Внутри — спокойный разбор темы с практическими ориентирами для родителей подростков: на что обращать внимание в поведении ребёнка, где проходит граница между поддержкой и контролем и какие маленькие шаги можно забрать в свою семью уже сегодня.',
        'Эфир строится вокруг живых вопросов участников клуба, поэтому это разговор по существу — без морализаторства и готовых рецептов «как надо».',
      ].join('\n\n');
    }
    if (item.sectionId === 'home_reviews' || item.sectionId === 'club_reviews') {
      const kind = item.sectionId === 'home_reviews' ? 'домашнего задания' : 'реальной ситуации участницы клуба';
      return [
        `Видеоразбор ${kind} «${title}».`,
        'Эксперт клуба разбирает, что происходит в ситуации на самом деле: какие чувства стоят за поведением подростка, в какие типичные ловушки попадают родители и какие более устойчивые реакции помогают сохранить контакт вместо борьбы.',
        'Это разбор для вдумчивого просмотра — ключевые идеи легко примерить на свою семью и вернуться к ним, когда станет горячо.',
      ].join('\n\n');
    }
    if (item.kind === 'audio') {
      return [
        `Подкаст клуба «${title}».`,
        'Аудиовыпуск закрытого клуба: можно слушать как самостоятельный разговор по теме или как поддержку к практике недели — в дороге, на прогулке или перед сложным разговором с ребёнком.',
        'Бережный, взрослый тон без давления: помогает увидеть ситуацию шире и вернуть себе опору как родителю.',
      ].join('\n\n');
    }
    return [
      `Материал клуба «${title}».`,
      'Спокойный разбор темы без спешки и осуждения: что важно заметить, как реагировать мягче и где найти опору родителю подростка.',
    ].join('\n\n');
  }

  function getMaterialSummary(item) {
    const description = item.description && String(item.description).trim();
    if (description && !isPlaceholderMediaCopy(description)) {
      return cleanDisplayText(description);
    }
    if (item.sectionId === 'webinars') {
      return 'Запись разговора с психологом клуба: ясные ориентиры, бережные формулировки и идеи, которые можно забрать в реальную семейную жизнь.';
    }
    if (item.sectionId === 'home_reviews') {
      return 'Видеоразбор домашней практики: замечаем, что стоит за поведением ребёнка, и ищем более устойчивую реакцию родителя.';
    }
    if (item.sectionId === 'club_reviews') {
      return 'Разбор живой ситуации из клуба с фокусом на контакт, личные границы и опору взрослого.';
    }
    if (item.kind === 'audio') {
      return 'Аудиовыпуск клуба, к которому можно вернуться в дороге, на прогулке или перед непростым разговором.';
    }
    return 'Материал клуба «Лоза» с понятными ориентирами для спокойного разговора и поддержки подростка.';
  }

  function capitalizeRu(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function hashDurationMinutes(id) {
    let hash = 0;
    const key = String(id || 'x');
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return 8 + (hash % 8); // 8–15 мин
  }

  function getMaterialDurationLabel(item) {
    if (item.kind === 'audio') {
      const m = hashDurationMinutes(item.id) + 4;
      return `${m} минут`;
    }
    if (item.kind === 'video') return `${hashDurationMinutes(item.id)} минут`;
    return 'Текст';
  }

  function getMaterialTopics(item) {
    const title = cleanDisplayText(item.title).toLowerCase().replace(/ё/g, 'е');
    const topics = [];
    const rules = [
      [/школ|учеб|урок|домашн|огэ|егэ|колледж/, 'Школа'],
      [/груб|конфликт|ссор|крик|ссор/, 'Конфликт'],
      [/общен|разговор|контакт|диалог/, 'Общение'],
      [/эмоц|тревог|страх|обид|гнев|стыд/, 'Эмоции'],
      [/границ|правил|санкц/, 'Границы'],
      [/зависимост|гаджет|телефон|интернет|игр/, 'Зависимости'],
      [/селфхарм|порез|суицид/, 'Кризис'],
      [/сепарац|взросл|эмансип/, 'Сепарация'],
      [/манипул/, 'Манипуляции'],
      [/реабилитац|рехаб|стационар/, 'Реабилитация'],
      [/сон|режим/, 'Режим'],
      [/друг|компани|буллинг/, 'Социум'],
    ];
    for (const [re, label] of rules) {
      if (re.test(title) && !topics.includes(label)) topics.push(label);
      if (topics.length >= 4) break;
    }
    if (!topics.length) {
      if (item.sectionId === 'podcasts') topics.push('Подкаст');
      else if (item.sectionId === 'webinars') topics.push('Эфир');
      else if (item.sectionId === 'questions') topics.push('Вопрос');
      else topics.push('Клуб');
    }
    return topics;
  }

  /** 3–4 takeaway lines derived from the material title (not generic filler). */
  function getMaterialTakeaways(item) {
    const title = cleanDisplayText(item.title);
    const lower = title.toLowerCase().replace(/ё/g, 'е');
    const points = [];
    const who = /доч/.test(lower) ? 'дочь'
      : /сын/.test(lower) ? 'сын'
      : /подрост/.test(lower) ? 'подросток'
      : 'ребёнок';

    const ifMatch = title.match(/если\s+(.+?)(?:\?|$)/i);
    if (ifMatch) {
      const raw = ifMatch[1].replace(/\?+$/, '').trim();
      const chunks = raw
        .split(/\s+и\s+|,(?!\s*\d)/i)
        .map((s) => s.trim().replace(/^[а-яa-z]\.\s*/i, ''))
        .filter((s) => s.length > 8)
        .slice(0, 2);
      for (const chunk of chunks) {
        const c = chunk.toLowerCase().replace(/ё/g, 'е');
        if (/не хочет|отказыва|не ид/.test(c)) {
          points.push(`Почему ${who} отказывается и что за этим стоит`);
        } else if (/груб|крич|орет|орёт|хамит/.test(c)) {
          points.push('Что стоит за грубостью с близкими');
        } else if (/вран|врет|врёт|лжет/.test(c)) {
          points.push('Как реагировать на враньё без эскалации');
        } else if (/вору|тырит|крад/.test(c)) {
          points.push('Как говорить о воровстве и доверии');
        } else if (/школ|урок|учеб/.test(c)) {
          points.push('Как поддерживать учёбу без войны');
        } else if (/телефон|гаджет|игр|интернет/.test(c)) {
          points.push('Где граница контроля гаджетов');
        } else {
          points.push(capitalizeRu(`В чём суть ситуации: ${chunk}`));
        }
      }
    }

    // Topic-driven extras from the whole title
    if (/школ/.test(lower) && !points.some((p) => /школ|учёб|учеб/.test(p.toLowerCase()))) {
      points.push('Почему подросток саботирует школу');
    }
    if (/груб|конфликт|ссор/.test(lower) && !points.some((p) => /груб|конфликт/.test(p.toLowerCase()))) {
      points.push('Как не усиливать конфликт ответом');
    }
    if (/границ|правил|санкц/.test(lower)) {
      points.push('Какие правила реально работают');
    }
    if (/тревог|страх|паник/.test(lower)) {
      points.push('Как отличить свою тревогу от сигнала ребёнка');
    }
    if (/зависимост|рехаб|реабилитац/.test(lower)) {
      points.push('Где место родителя в процессе восстановления');
    }
    if (/манипул/.test(lower)) {
      points.push('Как не попадать в привычную ловушку');
    }
    if (/контрол|гиперконтрол/.test(lower)) {
      points.push('Где нормальный контроль, а где уже давление');
      points.push('Как дать свободу и не потерять контакт');
    }
    if (/селфхарм|порез|суицид/.test(lower)) {
      points.push('Что делать в остром моменте и куда обратиться');
    }

    // Always useful closing points for Q&A / video
    if (item.sectionId === 'questions' || item.kind === 'video') {
      if (!points.some((p) => /сегодня|вечером|сейчас/.test(p.toLowerCase()))) {
        points.push('Что можно сделать уже сегодня');
      }
      if (!points.some((p) => /ошибк|ловуш|усилива/.test(p.toLowerCase()))) {
        points.push('Какие ошибки родителей только усиливают ситуацию');
      }
    } else if (item.kind === 'audio') {
      if (points.length < 2) points.push(`Главная идея выпуска «${title}»`);
      if (points.length < 3) points.push('На что обратить внимание в своей семье');
      if (points.length < 4) points.push('Какой маленький шаг забрать после прослушивания');
    } else {
      if (points.length < 2) points.push(`О чём материал «${title}»`);
      if (points.length < 3) points.push('Какие ориентиры даёт разбор');
      if (points.length < 4) points.push('Что примерить на свою ситуацию');
    }

    // Deduplicate and cap at 4
    const seen = new Set();
    const unique = [];
    for (const p of points) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
      if (unique.length >= 4) break;
    }
    while (unique.length < 3) {
      unique.push('Как сохранить контакт, а не контроль');
    }
    return unique.slice(0, 4);
  }

  function kinescopeEmbed(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const [videoId, playlistId] = url.pathname.split('/').filter(Boolean);
      if (!videoId) return rawUrl;
      const embedUrl = new URL(`/embed/${videoId}`, 'https://kinescope.io');
      if (playlistId) embedUrl.searchParams.set('playlist', playlistId);
      return embedUrl.toString();
    } catch {
      return rawUrl;
    }
  }

  function formatAudioTime(s) {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  window.LOZA_MEDIA = {
    cleanDisplayText,
    cleanContentText,
    getMaterialBody,
    getMaterialSummary,
    getMaterialTakeaways,
    getMaterialTopics,
    getMaterialDurationLabel,
    itemHasMediaLayout,
    resolveAudioUrl,
    kinescopeEmbed,
    formatAudioTime,
  };
})();
