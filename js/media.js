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
      return 'Запись эфира или вебинара закрытого клуба: тема, разбор и практические ориентиры для родителей.';
    }
    if (item.sectionId === 'home_reviews') {
      return 'Видеоразбор домашнего задания: что в ситуации важно увидеть и как действовать спокойнее.';
    }
    if (item.sectionId === 'club_reviews') {
      return 'Видеоразбор ситуации участницы клуба с фокусом на контакт, границы и устойчивость родителя.';
    }
    if (item.kind === 'audio') {
      return 'Аудиоматериал закрытого клуба для внимательного прослушивания.';
    }
    return 'Материал закрытого клуба Лоза: смотрите медиа и возвращайтесь к ключевым идеям в описании.';
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
    itemHasMediaLayout,
    resolveAudioUrl,
    kinescopeEmbed,
    formatAudioTime,
  };
})();
