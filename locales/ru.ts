import type { Messages } from './en.ts'
import { slavicPlural } from './pluralize.ts'

export const ru: Messages = {
  common: {
    cancel: 'Отмена',
    close: 'Закрыть',
    connect: 'Подключиться',
    retry: 'Повторить',
    refresh: 'Обновить',
    remove: 'Удалить',
    save: 'Сохранить',
    copy: 'Копировать',
    copied: 'Скопировано',
    dismiss: 'Скрыть',
    loading: 'Загрузка…',
    dash: '—'
  },

  nav: {
    home: 'Главная',
    servers: 'Серверы',
    content: 'Контент',
    settings: 'Настройки',
    collapseSidebar: 'Свернуть боковую панель',
    expandSidebar: 'Развернуть боковую панель',
    steamChecking: 'Проверка Steam…',
    steamDetected: 'Steam найден',
    steamNotFound: 'Steam не найден',
    fix: 'Исправить'
  },

  titleBar: {
    minimize: 'Свернуть',
    maximize: 'Развернуть',
    restore: 'Восстановить',
    close: 'Закрыть'
  },

  commandPalette: {
    placeholder: 'Введите команду…',
    empty: 'Нет подходящих действий',
    connectTo: (name: string) => `Подключиться к ${name}`,
    goToHome: 'Перейти на Главную',
    goToServers: 'Перейти к Серверам',
    goToContent: 'Перейти к Контенту',
    goToSettings: 'Перейти к Настройкам',
    hintScreen: 'экран',
    hintSetting: 'настройка',
    hintFolder: 'папка',
    toggleReduceMotionOn: 'Включить «Меньше анимации»',
    toggleReduceMotionOff: 'Выключить «Меньше анимации»',
    openGameFolder: 'Открыть папку игры',
    openBackupFolder: 'Открыть папку резервных копий',
    verifyFiles: 'Проверить файлы',
    verifyFilesHint: 'проверка и восстановление контента'
  },

  home: {
    syncNoManifest: 'Пакет контента не настроен',
    syncSyncing: 'Синхронизация контента…',
    syncPending: 'Есть неприменённые изменения контента',
    syncUpToDate: 'Контент актуален',
    steamMissingTooltipInstall: 'Steam установлен, но CS 1.6 — нет. Установите игру через Steam',
    steamMissingTooltipLocate: 'Steam не найден в этой системе',
    checking: 'Проверка',
    launching: 'ЗАПУСК…',
    update: 'ОБНОВИТЬ',
    play: 'ИГРАТЬ',
    installCs: 'Установить CS 1.6…',
    locateSteam: 'Найти Steam…',
    lastServer: 'Последний сервер',
    noRecentConnections: 'Нет недавних подключений — перейдите к Серверам, чтобы подключиться.',
    sourceLauncher: 'Лаунчер',
    sourceInGame: 'В игре',
    knownOnline: (names: string) => `Знакомые онлайн: ${names}`,
    pingPending: '…',
    pingTimeout: 'тайм-аут',
    connecting: 'Подключение…',
    connect: 'ПОДКЛЮЧИТЬСЯ'
  },

  servers: {
    sourceFailed: (id: string, error: string) => `Источник серверов «${id}» не удался: ${error}`,
    searchPlaceholder: 'Поиск серверов…  (нажмите / для фокуса)',
    filterNotFull: 'Не заполнены',
    filterNotEmpty: 'Не пустые',
    filterNoPassword: 'Без пароля',
    filterFavorites: 'Избранные',
    filterShowUnresponsive: 'Показать недоступные',
    allMaps: 'Все карты',
    viewGroupLabel: 'Вид',
    listView: 'Список',
    gridView: 'Сетка',
    refresh: 'Обновить',
    funnelSources: (n: number) => slavicPlural(n, { one: `${n} источник`, few: `${n} источника`, many: `${n} источников` }),
    funnelAddresses: (n: number) => slavicPlural(n, { one: `${n} адрес`, few: `${n} адреса`, many: `${n} адресов` }),
    funnelResponding: 'отвечают',
    sourceKindBattlemetrics: 'BattleMetrics',
    sourceKindMaster: 'Master-сервер',
    sourceKindNeighborhood: 'Сканирование окрестности',
    addPlaceholder: 'Добавить сервер по адресу — ip:port',
    addFavorite: 'Добавить в избранное',
    removeFavorite: 'Убрать из избранного',
    favorite: 'В избранное',
    addErrorInvalid: 'Введите адрес в формате ip:port',
    addErrorDuplicate: 'Уже в избранном',
    colName: 'Название',
    colMap: 'Карта',
    colPlayers: 'Игроки',
    colPing: 'Пинг',
    emptyNoServers: 'Серверы не найдены — добавьте избранный или проверьте позже',
    emptyNoMatches: 'Ни один сервер не соответствует этим фильтрам',
    serverInfo: 'Информация о сервере',
    connect: 'Подключиться',
    copyIp: 'Копировать IP',
    address: 'Адрес',
    players: 'Игроки',
    ping: 'Пинг',
    timeout: 'тайм-аут',
    drawerPlayersHeading: 'Игроки',
    privacyNote: 'Никнеймы, показанные здесь, отслеживаются только локально — никогда никуда не загружаются.',
    queryingPlayers: 'Получение списка игроков…',
    playersUnavailable: 'Список игроков недоступен.',
    noPlayers: 'Нет подключённых игроков.',
    unconnectedPlayer: 'не подключён',
    forgetKnownPlayer: 'Забыть знакомого игрока',
    markKnownPlayer: 'Отметить как знакомого'
  },

  content: {
    title: 'Контент',
    manifestLoadError: (error: string) => `Не удалось загрузить пакет контента (${error}) — показан заполнитель.`,
    localBadge: 'Локальный',
    snapshotTaken: (date: string) => `Снимок сделан ${date}`,
    strippedLines: (n: number) =>
      slavicPlural(n, {
        one: `${n} строка удалена из соображений безопасности`,
        few: `${n} строки удалены из соображений безопасности`,
        many: `${n} строк удалено из соображений безопасности`
      }),
    noConfigYet: 'Файл config.cfg ещё не найден — нечего снимать.',
    checkingConfig: 'Проверка наличия config.cfg…',
    updateSnapshot: 'Обновить снимок',
    updateSnapshotModalTitle: 'Обновление снимка My Config',
    updateSnapshotModalMessageChanged: (n: number) =>
      `Считывает ваши текущие игровые настройки. Будет изменено ${slavicPlural(n, { one: `${n} строка`, few: `${n} строки`, many: `${n} строк` })}.`,
    updateSnapshotModalMessageFirst: 'Считывает ваши текущие игровые настройки, чтобы создать первый снимок.',
    updateSnapshotConfirming: 'Обновление…',
    updateSnapshotConfirm: 'Обновить снимок',
    noManifestNote: 'Выбор контента применится после интеграции пакета контента.',
    featuresHeading: 'Дополнительные функции',
    systemHeading: 'Система',
    detectingSteam: 'Поиск Steam…',
    steamDetectionFailed: 'Не удалось определить Steam.',
    steamPath: 'Путь к Steam',
    gamePath: 'Путь к игре',
    installed: 'Установлено',
    notFound: 'не найдено',
    yes: 'да',
    no: 'нет',
    configNotFoundToast: 'config.cfg не найден — сначала запустите игру хотя бы раз',
    snapshotUpdatedToast: 'Снимок My Config обновлён'
  },

  settings: {
    lastCheckFailed: (when: string, error: string) => `Последняя проверка (${when}): ошибка — ${error}`,
    lastCheckOk: (when: string, n: number) =>
      `Последняя проверка (${when}): ${slavicPlural(n, { one: `${n} адрес`, few: `${n} адреса`, many: `${n} адресов` })}`,
    contentSyncTitle: 'Синхронизация контента',
    manifestUrlLabel: 'URL манифеста контента',
    headlineFiles: (completed: number, total: number) => `${completed}/${total} файлов`,
    headlineUpToDate: 'Актуально',
    headlineSyncFailed: 'Синхронизация не удалась',
    headlineReady: 'Готово к синхронизации',
    etaLine: (eta: string, speed: string) => `Осталось ${eta} · ${speed || '—'}`,
    resultLine: (version: string, updated: number, skipped: number) =>
      `v${version} · обновлено ${updated}, без изменений ${skipped}`,
    noSyncInProgress: 'Синхронизация не выполняется',
    syncing: 'Синхронизация…',
    syncContent: 'Синхронизировать контент',
    verifying: 'Проверка…',
    verifyAndRepair: 'Проверить и восстановить',
    retry: 'Повторить',
    itemDone: 'готово',
    verifyModalTitle: 'Проверка и восстановление файлов',
    verifyModalMessage:
      'Проверяет каждый файл активной сборки контента по манифесту и заново загружает всё, что не совпадает. На медленном соединении это может занять некоторое время.',

    sectionFolders: 'Папки',
    gameFolderLabel: 'Папка игры',
    gameFolderDesc: 'Открыть каталог установки CS 1.6 в файловом менеджере.',
    backupsFolderLabel: 'Папка резервных копий',
    backupsFolderDesc: 'Оригинальные файлы, которые лаунчер сохранил перед перезаписью.',
    open: 'Открыть',

    sectionRestore: 'Восстановление исходных файлов',
    restoreHint:
      'Всё, что было на диске до первой перезаписи лаунчером, для каждого изменённого файла — подстраховка, действующая при каждой синхронизации.',
    restoreLoading: 'Загрузка…',
    restoreEmpty: 'Нет резервных копий — нечего восстанавливать.',
    restoring: 'Восстановление…',
    restore: 'Восстановить',
    restoringAll: 'Восстановление всего…',
    restoreAll: (n: number) => `Восстановить всё (${n})`,
    restoreAllModalTitle: 'Восстановление исходных файлов',
    restoreAllModalMessage: (n: number) =>
      `Восстанавливает ${slavicPlural(n, { one: `${n} файл резервной копии`, few: `${n} файла резервных копий`, many: `${n} файлов резервных копий` })} до состояния перед тем, как лаунчер их изменил. Всё, что поставил на их место вариант из манифеста, будет заменено.`,
    restoreAllConfirm: 'Восстановить всё',
    restoredFileToast: (name: string) => `Восстановлен ${name}`,
    restoredAllToast: (n: number) =>
      `Восстановлено ${slavicPlural(n, { one: `${n} файл`, few: `${n} файла`, many: `${n} файлов` })}`,

    sectionServerSources: 'Источники серверов',
    masterLabel: 'Поиск через master-сервер',
    masterDesc:
      'Master-сервер GoldSrc от Valve — всегда включён, не настраивается. По состоянию на 2026-07 он, похоже, не работает (недоступны как основной адрес, так и задокументированный резервный IP), поэтому сейчас этот источник ничего не даёт; мы продолжаем пробовать при каждом обновлении на случай, если Valve это исправит.',
    battlemetricsLabel: 'BattleMetrics',
    battlemetricsDesc:
      'Список серверов с battlemetrics.com — по состоянию на 2026-07 их публичный API требует платной подписки (неавторизованные запросы возвращают ошибку доступа), поэтому по умолчанию выключен. Включайте, только если у вас есть подписка. Название сервера, карта, игроки и пинг в любом случае берутся из наших собственных запросов.',
    battlemetricsAriaLabel: 'Источник BattleMetrics',
    subscriptionsHintBefore: 'Добавляйте URL-адреса, которые возвращают строки в формате',
    subscriptionsHintCode: 'ip:port',
    subscriptionsHintAfter: 'в виде обычного текста или массива JSON. Загружаются и добавляются при каждом обновлении списка серверов.',
    noSubscriptions: 'Подписки не добавлены.',
    defaultSubscriptionLabel: 'Стандартный подобранный список (поддерживается сообществом)',
    removeSource: 'Удалить',
    subscriptionUrlPlaceholder: 'https://example.com/servers.txt',
    addSource: 'Добавить источник',
    subErrorInvalid: 'Введите корректный http(s) адрес',
    subErrorDuplicate: 'Уже добавлено',

    knownPoolLabel: 'Пул известных серверов',
    knownPoolDesc:
      'Каждый публичный сервер, к которому вы действительно подключались — независимо от способа подключения — запоминается локально и добавляется при каждом обновлении, как и избранные. Не зависит от сети; именно так лаунчер со временем находит больше серверов, чем больше вы играете.',
    retentionLabel: 'Срок хранения',
    retentionDesc: 'Забыть известный сервер, если он не отвечал столько дней.',

    neighborhoodLabel: 'Сканирование окрестности',
    neighborhoodDesc:
      'Выключено по умолчанию. Если включено, проверяет соседние адреса (та же подсеть /24, порты 27015–27020) вокруг уже известных серверов — избранных и тех, к которым вы действительно подключались — тем же публичным запросом состояния, которым пользуется встроенный браузер серверов игры. Только чтение, без подключения к какому-либо серверу; ограничено и лимитировано на каждое обновление. Может замедлить обновление и отправляет UDP-пакеты на адреса, которые вы не добавляли явно.',
    neighborhoodAriaLabel: 'Источник сканирования окрестности',

    sectionKnownPlayers: 'Знакомые игроки',
    knownPlayersHint:
      'Никнеймы, которые вы отметили как знакомых/друзей из списка игроков сервера. Отслеживаются и хранятся только локально — ничто из этого никогда никуда не загружается. Отмеченные игроки выделяются на панели информации о сервере и включают значок «знакомые онлайн» в браузере серверов и на Главной, когда их недавно видели.',
    knownPlayersEmpty: 'Знакомых игроков пока нет — отметьте кого-нибудь из списка игроков сервера.',
    notePlaceholder: 'Необязательная заметка',
    noteSave: 'Сохранить',
    noteAdd: 'Добавить заметку…',
    forgetPlayer: 'Забыть',

    sectionProfile: 'Профиль',
    profileLabel: 'Экспорт / импорт профиля',
    profileDesc:
      'Один файл JSON с вашими избранными, источниками серверов, известными серверами, знакомыми игроками, правилами и настройками уведомлений, выбором контента и локальным снимком My Config — всё необходимое, чтобы перенести настройки на другую установку.',
    exporting: 'Экспорт…',
    export: 'Экспортировать…',
    importReading: 'Чтение…',
    import: 'Импортировать…',
    profileExportedToast: 'Профиль экспортирован',
    profileNotAFileToast: 'Этот файл не является профилем 1.6X Launcher',
    profileImportedToast: (mode: string) => `Профиль импортирован (${mode === 'merge' ? 'объединение' : 'замена'})`,

    sectionLanguage: 'Язык',
    languageLabel: 'Язык',
    languageDesc: 'Язык интерфейса. Определяется автоматически при первом запуске.',

    sectionNotifications: 'Уведомления',
    notificationsLabel: 'Фоновые уведомления о серверах',
    notificationsDesc:
      'Выключено по умолчанию. Если включено, периодически проверяет избранные серверы и пул известных серверов, пока лаунчер открыт, и отправляет системное уведомление по каждому правилу ниже — никогда, когда лаунчер закрыт.',
    notificationsAriaLabel: 'Фоновые уведомления о серверах',
    pollStatusLine: (last: string, next: string, n: number) =>
      `Последняя проверка (${last}) · следующая (${next}) · отслеживается ${slavicPlural(n, { one: `${n} избранный сервер`, few: `${n} избранных сервера`, many: `${n} избранных серверов` })} + пул известных`,
    muteLabel: 'Без звука',
    muteDesc: 'Продолжает опрос (статус выше остаётся живым), но не показывает уведомления.',
    muteAriaLabel: 'Без звука для уведомлений',
    pollIntervalLabel: 'Интервал опроса',
    pollIntervalDesc: 'Минут между фоновыми проверками (1–30).',
    quietHoursLabel: 'Тихие часы',
    quietHoursDesc: 'Без уведомлений в этот промежуток времени (опрос и отслеживание состояния продолжаются).',
    quietHoursAriaLabel: 'Тихие часы',
    quietHoursFrom: 'От',
    quietHoursTo: 'До',
    rulesHint:
      'Правила применяются к каждому адресу из избранных и пула известных серверов, если не ограничены конкретным сервером. Срабатывают один раз при переходе (например, пересечении порога), а не постоянно, пока условие выполняется.',
    notificationsIntroModalTitle: 'Включение фоновых уведомлений',
    notificationsIntroModalMessage:
      'Лаунчер будет периодически опрашивать ваши избранные и известные серверы, пока он открыт, и покажет системное уведомление, когда сработает заданное вами правило (например, сервер пересечёт порог количества игроков). Ничего не проверяется, пока лаунчер закрыт. Вы можете добавлять правила, отключать звук, задавать тихие часы или выключить это в любой момент.',
    notificationsIntroConfirm: 'Включить',

    sectionDesktopIntegration: 'Интеграция с рабочим столом',
    desktopIntegrationLabel: 'Добавить в меню приложений',
    desktopIntegrationDescBefore: 'Регистрирует запись',
    desktopIntegrationDescCode1: '.desktop',
    desktopIntegrationDescMid: 'в (',
    desktopIntegrationDescCode2: '~/.local/share/applications',
    desktopIntegrationDescAfter:
      '), чтобы ваше рабочее окружение показывало корректное имя и значок в панели задач/меню, а на Wayland — могло предоставлять запросы на поднятие окна от фоновых уведомлений. Никогда не выполняется без этого явного действия.',
    desktopIntegrationRemoving: 'Удаление…',
    desktopIntegrationRemove: 'Удалить',
    desktopIntegrationAdding: 'Добавление…',
    desktopIntegrationAdd: 'Добавить в меню',
    addedToMenuToast: 'Добавлено в меню приложений',
    removedFromMenuToast: 'Удалено из меню приложений',

    sectionCrosshair: 'Прицел поверх игры',
    crosshairEnabledLabel: 'Включить прицел',
    crosshairEnabledDesc:
      'Выключено по умолчанию. Показывает прицел поверх CS 1.6 только пока игра запущена, и автоматически скрывается всё остальное время.',
    crosshairEnabledAriaLabel: 'Прицел поверх игры',
    crosshairDisclosureModalTitle: 'Включить прицел поверх игры',
    crosshairDisclosureModalMessage:
      'Это рисует прицел в отдельном окне поверх игры — оно никак не читает и не изменяет CS 1.6, её память или файлы. Правила администрации некоторых серверов всё же могут запрещать подобные оверлеи; соблюдайте правила серверов, на которых играете.',
    crosshairDisclosureConfirm: 'Включить',
    crosshairWaylandHint:
      'Обнаружен Wayland: прицел надёжно отображается поверх игры без рамки или в оконном режиме, но может не показываться в эксклюзивном полноэкранном режиме — попробуйте режим без рамки/оконный, если он не появляется.',
    crosshairShapeLabel: 'Форма',
    crosshairShapeDot: 'Точка',
    crosshairShapeCross: 'Крест',
    crosshairShapeCircle: 'Круг',
    crosshairShapeCrossDot: 'Крест + точка',
    crosshairSizeLabel: 'Размер',
    crosshairThicknessLabel: 'Толщина',
    crosshairGapLabel: 'Промежуток',
    crosshairOpacityLabel: 'Непрозрачность',
    crosshairOffsetXLabel: 'Смещение X',
    crosshairOffsetYLabel: 'Смещение Y',
    crosshairColorLabel: 'Цвет',
    crosshairCustomColorAriaLabel: 'Свой цвет',
    crosshairOutlineLabel: 'Обводка',
    crosshairOutlineDesc: 'Тёмный контур вокруг прицела для контраста на светлом фоне.',
    crosshairOutlineAriaLabel: 'Обводка прицела',
    crosshairDisplayLabel: 'Дисплей',
    crosshairDisplayDesc: 'На каком мониторе рисовать прицел — для систем с несколькими мониторами.',
    crosshairDisplayAuto: 'Авто',

    sectionPreferences: 'Настройки вида',
    reduceMotionLabel: 'Меньше анимации',
    reduceMotionDesc: 'Отключает анимированные переходы, пульсацию и мерцание во всём приложении.',
    reduceMotionAriaLabel: 'Меньше анимации',

    sectionUpdates: 'Обновления лаунчера',
    versionLabel: (v: string) => `Версия ${v}`,
    updatesDevDisabled: 'Обновления отключены в сборках для разработки.',
    updatesChecking: 'Проверка обновлений…',
    updatesNotAvailable: 'У вас последняя версия.',
    updateAvailable: (v: string) => `Доступно обновление v${v}.`,
    updateDownloading: (pct: number) => `Загрузка обновления — ${pct}%`,
    updateDownloaded: (v: string) => `Обновление v${v} загружено и готово к установке.`,
    download: 'Загрузить',
    restartAndInstall: 'Перезапустить и установить',
    checkForUpdates: 'Проверить обновления'
  },

  configScanner: {
    safeScoreLabel: 'Оценка безопасности',
    scanning: 'Сканирование…',
    scanUnavailable: 'Не удалось просканировать этот конфиг',
    viewFindings: (n: number) =>
      slavicPlural(n, { one: `${n} находка`, few: `${n} находки`, many: `${n} находок` }),
    noFindings: 'Проблем не найдено.',
    detailsTitle: 'Результаты сканирования',
    gateTitle: 'Заблокировано: критические проблемы безопасности',
    gateIntro: (n: number) =>
      `В этом конфиге ${slavicPlural(n, { one: `${n} критическая находка`, few: `${n} критические находки`, many: `${n} критических находок` })} — установка без изменений может незаметно переподключить вас к другому серверу, стереть привязки клавиш или выполнить недоверенные команды.`,
    gateWarningNote: (n: number) =>
      `Ниже также найдено ${slavicPlural(n, { one: `${n} предупреждение`, few: `${n} предупреждения`, many: `${n} предупреждений` })} — они не блокируют установку.`,
    installAnyway: 'Всё равно установить',
    severityCritical: 'Критично',
    severityWarning: 'Предупреждение',
    severityInfo: 'Инфо',
    fileLabel: 'Файл',
    lineLabel: 'Строка',
    ruleServerHijack: (cmd: string) => `«${cmd}» может незаметно переподключить вас к другому серверу`,
    ruleRcon: (cmd: string) => `«${cmd}» может раскрыть или повторно использовать данные rcon-администрирования`,
    ruleMotdWrite: 'Перезаписывает файл сообщения дня (motd) сервера',
    ruleExecOutsideCstrike: (path: string) => `Выполняет файл вне папки игры: ${path}`,
    ruleUnbindallNoRestore: 'Сбрасывает все привязки клавиш и никогда не восстанавливает их',
    ruleAliasScript: (name: string) => `Определяет скриптовый алиас («${name}») — цепочку команд, которая выполнится позже`,
    ruleMultiCommandBind: 'Привязка запускает несколько команд подряд',
    ruleWaitBind: 'Привязка использует «wait» для задержки в скрипте',
    ruleSetinfoUnknownKey: (key: string) => `Устанавливает нераспознанный ключ info: ${key}`,
    ruleUnknownCvar: (name: string) => `Нераспознанная команда или cvar: ${name}`,
    ruleValueOutOfRange: (detail: string) => `Значение вне ожидаемого диапазона: ${detail}`
  },

  notificationRules: {
    typePlayerThreshold: 'Порог количества игроков',
    typeEmptyToActive: 'Пустой → активный',
    typeMapMatch: 'Карта совпадает',
    summaryThreshold: (n: number | string) => `${n}+ игроков`,
    summaryEmptyToActive: 'Становится активным из пустого',
    summaryMapMatch: (maps: string) => `Карта: ${maps}`,
    summaryMapMatchUnset: 'Карта не указана',
    targetAll: 'Все отслеживаемые серверы',
    targetUnknown: 'Неизвестный сервер',
    empty: 'Правил пока нет — добавьте ниже.',
    enableRuleAriaLabel: (summary: string) => `Включить правило: ${summary}`,
    removeRule: 'Удалить правило',
    scopeAll: 'Все отслеживаемые серверы',
    scopeServer: 'Конкретный сервер…',
    addressPlaceholder: 'ip:port',
    mapsPlaceholder: 'de_dust2, de_inferno',
    addRule: 'Добавить правило',
    errorAddress: 'Введите адрес сервера в формате ip:port',
    errorMaps: 'Введите хотя бы одну карту'
  },

  notices: {
    condebugTextBefore: 'Добавьте',
    condebugCode: '-condebug',
    condebugTextAfter:
      'в параметры запуска CS 1.6 в Steam (правый клик в библиотеке Steam → Свойства → Общие), чтобы карточка быстрого подключения отслеживала серверы, к которым вы присоединяетесь в игре, а не только через этот лаунчер — без этого отслеживаются только подключения, инициированные лаунчером.',
    launchOptionsTextBefore: 'Варианты конфигурации выполняются через',
    launchOptionsCode: 'userconfig.cfg',
    launchOptionsTextAfter:
      'автоматически в большинстве сборок Steam. Для дополнительной надёжности установите параметры запуска CS 1.6 в Steam (правый клик в библиотеке Steam → Свойства → Общие) на:',
    desktopIntegrationText:
      'Добавить 1.6X Launcher в меню приложений? Это также исправляет поднятие окна при клике на фоновое уведомление (нужна зарегистрированная запись приложения, чтобы рабочий стол мог поднять окно) и даёт лаунчеру корректное имя и значок в панели задач.',
    desktopIntegrationAdding: 'Добавление…',
    desktopIntegrationAdd: 'Добавить в меню',
    copy: 'Копировать',
    copied: 'Скопировано',
    dismiss: 'Скрыть'
  },

  profileImportModal: {
    title: 'Импорт профиля',
    summary: (parts: {
      exportedAt: string
      favorites: string
      subscriptions: string
      knownServers: string
      knownPlayers: string
      notificationRules: string
      hasLocalConfigVariant: boolean
    }) =>
      `Экспортировано ${parts.exportedAt} — ${parts.favorites}, ${parts.subscriptions}, ${parts.knownServers}, ${parts.knownPlayers}, ${parts.notificationRules}${parts.hasLocalConfigVariant ? ', и снимок My Config' : ''}.`,
    favorites: (n: number) =>
      slavicPlural(n, { one: `${n} избранный сервер`, few: `${n} избранных сервера`, many: `${n} избранных серверов` }),
    subscriptions: (n: number) =>
      slavicPlural(n, { one: `${n} источник серверов`, few: `${n} источника серверов`, many: `${n} источников серверов` }),
    knownServers: (n: number) =>
      slavicPlural(n, { one: `${n} известный сервер`, few: `${n} известных сервера`, many: `${n} известных серверов` }),
    knownPlayers: (n: number) =>
      slavicPlural(n, { one: `${n} знакомый игрок`, few: `${n} знакомых игрока`, many: `${n} знакомых игроков` }),
    notificationRules: (n: number) =>
      slavicPlural(n, { one: `${n} правило уведомлений`, few: `${n} правила уведомлений`, many: `${n} правил уведомлений` }),
    mergeLabel: 'Объединить',
    mergeDesc: '— добавляет новое, никогда не перезаписывает то, что уже есть.',
    replaceLabel: 'Заменить',
    replaceDesc: '— импортированный профиль полностью заменяет текущие данные.',
    cancel: 'Отмена',
    import: 'Импортировать'
  },

  notifications: {
    thresholdBody: (players: number, threshold: number) => `Игроков онлайн: ${players} (порог ${threshold})`,
    emptyToActiveBody: (players: number, map: string) =>
      `Снова активен — ${slavicPlural(players, { one: `${players} игрок`, few: `${players} игрока`, many: `${players} игроков` })} на ${map || 'неизвестной карте'}`,
    mapMatchBody: (map: string) => `Сейчас карта ${map}`,
    connectAction: 'Подключиться'
  },

  dialogs: {
    exportProfileTitle: 'Экспорт профиля',
    importProfileTitle: 'Импорт профиля'
  }
}
