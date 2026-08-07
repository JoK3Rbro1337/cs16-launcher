import type { Messages } from './en.ts'
import { slavicPlural } from './pluralize.ts'

export const uk: Messages = {
  common: {
    cancel: 'Скасувати',
    close: 'Закрити',
    connect: 'Підключитися',
    retry: 'Повторити',
    refresh: 'Оновити',
    remove: 'Видалити',
    save: 'Зберегти',
    copy: 'Копіювати',
    copied: 'Скопійовано',
    dismiss: 'Приховати',
    loading: 'Завантаження…',
    dash: '—'
  },

  nav: {
    home: 'Головна',
    servers: 'Сервери',
    content: 'Контент',
    settings: 'Налаштування',
    collapseSidebar: 'Згорнути бічну панель',
    expandSidebar: 'Розгорнути бічну панель',
    steamChecking: 'Перевірка Steam…',
    steamDetected: 'Steam знайдено',
    steamNotFound: 'Steam не знайдено',
    fix: 'Виправити'
  },

  titleBar: {
    minimize: 'Згорнути',
    maximize: 'Розгорнути',
    restore: 'Відновити',
    close: 'Закрити'
  },

  commandPalette: {
    placeholder: 'Введіть команду…',
    empty: 'Немає відповідних дій',
    connectTo: (name: string) => `Підключитися до ${name}`,
    goToHome: 'Перейти на Головну',
    goToServers: 'Перейти до Серверів',
    goToContent: 'Перейти до Контенту',
    goToSettings: 'Перейти до Налаштувань',
    hintScreen: 'екран',
    hintSetting: 'налаштування',
    hintFolder: 'папка',
    toggleReduceMotionOn: 'Увімкнути «Менше анімації»',
    toggleReduceMotionOff: 'Вимкнути «Менше анімації»',
    openGameFolder: 'Відкрити папку гри',
    openBackupFolder: 'Відкрити папку резервних копій',
    verifyFiles: 'Перевірити файли',
    verifyFilesHint: 'перевірка та відновлення контенту'
  },

  home: {
    syncNoManifest: 'Пакет контенту не налаштовано',
    syncSyncing: 'Синхронізація контенту…',
    syncPending: 'Є незастосовані зміни контенту',
    syncUpToDate: 'Контент актуальний',
    steamMissingTooltipInstall: 'Steam встановлено, але CS 1.6 — ні. Встановіть гру через Steam',
    steamMissingTooltipLocate: 'Steam не знайдено в цій системі',
    checking: 'Перевірка',
    launching: 'ЗАПУСК…',
    update: 'ОНОВИТИ',
    play: 'ГРАТИ',
    installCs: 'Встановити CS 1.6…',
    locateSteam: 'Знайти Steam…',
    lastServer: 'Останній сервер',
    noRecentConnections: 'Немає недавніх підключень — перейдіть до Серверів, щоб підключитися.',
    sourceLauncher: 'Лаунчер',
    sourceInGame: 'У грі',
    knownOnline: (names: string) => `Знайомі онлайн: ${names}`,
    pingPending: '…',
    pingTimeout: 'тайм-аут',
    connecting: 'Підключення…',
    connect: 'ПІДКЛЮЧИТИСЯ'
  },

  servers: {
    sourceFailed: (id: string, error: string) => `Джерело серверів «${id}» не вдалося: ${error}`,
    searchPlaceholder: 'Пошук серверів…  (натисніть / для фокусу)',
    filterNotFull: 'Не заповнені',
    filterNotEmpty: 'Не порожні',
    filterNoPassword: 'Без пароля',
    filterFavorites: 'Обрані',
    filterShowUnresponsive: 'Показати недоступні',
    allMaps: 'Усі карти',
    viewGroupLabel: 'Вигляд',
    listView: 'Список',
    gridView: 'Сітка',
    refresh: 'Оновити',
    funnelSources: (n: number) => slavicPlural(n, { one: `${n} джерело`, few: `${n} джерела`, many: `${n} джерел` }),
    funnelAddresses: (n: number) => slavicPlural(n, { one: `${n} адреса`, few: `${n} адреси`, many: `${n} адрес` }),
    funnelResponding: 'відповідають',
    sourceKindBattlemetrics: 'BattleMetrics',
    sourceKindMaster: 'Master-сервер',
    sourceKindNeighborhood: 'Сканування околиці',
    addPlaceholder: 'Додати сервер за адресою — ip:port',
    addFavorite: 'Додати в обрані',
    removeFavorite: 'Прибрати з обраних',
    favorite: 'До обраних',
    addErrorInvalid: 'Введіть адресу у форматі ip:port',
    addErrorDuplicate: 'Вже в обраних',
    colName: 'Назва',
    colMap: 'Карта',
    colPlayers: 'Гравці',
    colPing: 'Пінг',
    emptyNoServers: 'Серверів не знайдено — додайте обраний або перевірте пізніше',
    emptyNoMatches: 'Жоден сервер не відповідає цим фільтрам',
    serverInfo: 'Інформація про сервер',
    connect: 'Підключитися',
    copyIp: 'Копіювати IP',
    address: 'Адреса',
    players: 'Гравці',
    ping: 'Пінг',
    timeout: 'тайм-аут',
    drawerPlayersHeading: 'Гравці',
    privacyNote: 'Нікнейми, показані тут, відстежуються лише локально — ніколи нікуди не завантажуються.',
    queryingPlayers: 'Отримання списку гравців…',
    playersUnavailable: 'Список гравців недоступний.',
    noPlayers: 'Немає підключених гравців.',
    unconnectedPlayer: 'не підключено',
    forgetKnownPlayer: 'Забути знайомого гравця',
    markKnownPlayer: 'Позначити як знайомого'
  },

  content: {
    title: 'Контент',
    manifestLoadError: (error: string) => `Не вдалося завантажити пакет контенту (${error}) — показано заповнювач.`,
    localBadge: 'Локальний',
    snapshotTaken: (date: string) => `Знімок зроблено ${date}`,
    strippedLines: (n: number) =>
      slavicPlural(n, {
        one: `${n} рядок видалено з міркувань безпеки`,
        few: `${n} рядки видалено з міркувань безпеки`,
        many: `${n} рядків видалено з міркувань безпеки`
      }),
    noConfigYet: 'Файл config.cfg ще не знайдено — нічого знімати.',
    checkingConfig: 'Перевірка наявності config.cfg…',
    updateSnapshot: 'Оновити знімок',
    updateSnapshotModalTitle: 'Оновлення знімка My Config',
    updateSnapshotModalMessageChanged: (n: number) =>
      `Зчитує ваші поточні ігрові налаштування. Буде змінено ${slavicPlural(n, { one: `${n} рядок`, few: `${n} рядки`, many: `${n} рядків` })}.`,
    updateSnapshotModalMessageFirst: 'Зчитує ваші поточні ігрові налаштування, щоб створити перший знімок.',
    updateSnapshotConfirming: 'Оновлення…',
    updateSnapshotConfirm: 'Оновити знімок',
    noManifestNote: 'Вибір контенту застосується після інтеграції пакета контенту.',
    featuresHeading: 'Додаткові функції',
    systemHeading: 'Система',
    detectingSteam: 'Пошук Steam…',
    steamDetectionFailed: 'Не вдалося визначити Steam.',
    steamPath: 'Шлях до Steam',
    gamePath: 'Шлях до гри',
    installed: 'Встановлено',
    notFound: 'не знайдено',
    yes: 'так',
    no: 'ні',
    configNotFoundToast: 'config.cfg не знайдено — спершу запустіть гру хоча б раз',
    snapshotUpdatedToast: 'Знімок My Config оновлено'
  },

  settings: {
    lastCheckFailed: (when: string, error: string) => `Остання перевірка (${when}): помилка — ${error}`,
    lastCheckOk: (when: string, n: number) =>
      `Остання перевірка (${when}): ${slavicPlural(n, { one: `${n} адреса`, few: `${n} адреси`, many: `${n} адрес` })}`,
    contentSyncTitle: 'Синхронізація контенту',
    manifestUrlLabel: 'URL маніфесту контенту',
    headlineFiles: (completed: number, total: number) => `${completed}/${total} файлів`,
    headlineUpToDate: 'Актуально',
    headlineSyncFailed: 'Синхронізація не вдалася',
    headlineReady: 'Готово до синхронізації',
    etaLine: (eta: string, speed: string) => `Залишилось ${eta} · ${speed || '—'}`,
    resultLine: (version: string, updated: number, skipped: number) =>
      `v${version} · оновлено ${updated}, без змін ${skipped}`,
    noSyncInProgress: 'Синхронізація не виконується',
    syncing: 'Синхронізація…',
    syncContent: 'Синхронізувати контент',
    verifying: 'Перевірка…',
    verifyAndRepair: 'Перевірити та відновити',
    retry: 'Повторити',
    itemDone: 'готово',
    verifyModalTitle: 'Перевірка та відновлення файлів',
    verifyModalMessage:
      'Перевіряє кожен файл активної збірки контенту за маніфестом і повторно завантажує все, що не збігається. На повільному з’єднанні це може зайняти певний час.',

    sectionFolders: 'Папки',
    gameFolderLabel: 'Папка гри',
    gameFolderDesc: 'Відкрити каталог встановлення CS 1.6 у файловому менеджері.',
    backupsFolderLabel: 'Папка резервних копій',
    backupsFolderDesc: 'Оригінальні файли, які лаунчер зберіг перед перезаписом.',
    open: 'Відкрити',

    sectionRestore: 'Відновлення оригінальних файлів',
    restoreHint:
      'Усе, що було на диску до першого перезапису лаунчером, для кожного зміненого файлу — запобіжник, що діє при кожній синхронізації.',
    restoreLoading: 'Завантаження…',
    restoreEmpty: 'Немає резервних копій — нічого відновлювати.',
    restoring: 'Відновлення…',
    restore: 'Відновити',
    restoringAll: 'Відновлення всього…',
    restoreAll: (n: number) => `Відновити все (${n})`,
    restoreAllModalTitle: 'Відновлення оригінальних файлів',
    restoreAllModalMessage: (n: number) =>
      `Відновлює ${slavicPlural(n, { one: `${n} файл резервної копії`, few: `${n} файли резервних копій`, many: `${n} файлів резервних копій` })} до стану перед тим, як лаунчер їх змінив. Усе, що поставив на їх місце варіант з маніфесту, буде замінено.`,
    restoreAllConfirm: 'Відновити все',
    restoredFileToast: (name: string) => `Відновлено ${name}`,
    restoredAllToast: (n: number) =>
      `Відновлено ${slavicPlural(n, { one: `${n} файл`, few: `${n} файли`, many: `${n} файлів` })}`,

    sectionServerSources: 'Джерела серверів',
    masterLabel: 'Пошук через master-сервер',
    masterDesc:
      'Master-сервер GoldSrc від Valve — завжди увімкнено, не налаштовується. Станом на 2026-07 він, схоже, не працює (недоступні як основна адреса, так і задокументована резервна IP-адреса), тож наразі це джерело нічого не дає; ми продовжуємо пробувати при кожному оновленні на випадок, якщо Valve це виправить.',
    battlemetricsLabel: 'BattleMetrics',
    battlemetricsDesc:
      'Список серверів з battlemetrics.com — станом на 2026-07 їхній публічний API вимагає платної підписки (неавторизовані запити повертають помилку доступу), тому за замовчуванням вимкнено. Вмикайте, лише якщо у вас є підписка. Назва сервера, карта, гравці та пінг у будь-якому разі беруться з наших власних запитів.',
    battlemetricsAriaLabel: 'Джерело BattleMetrics',
    subscriptionsHintBefore: 'Додавайте URL-адреси, що повертають рядки у форматі',
    subscriptionsHintCode: 'ip:port',
    subscriptionsHintAfter: 'у вигляді простого тексту або масиву JSON. Отримуються та додаються при кожному оновленні списку серверів.',
    noSubscriptions: 'Підписок не додано.',
    defaultSubscriptionLabel: 'Типовий добірний список (підтримується спільнотою)',
    removeSource: 'Видалити',
    subscriptionUrlPlaceholder: 'https://example.com/servers.txt',
    addSource: 'Додати джерело',
    subErrorInvalid: 'Введіть дійсну http(s) адресу',
    subErrorDuplicate: 'Уже додано',

    knownPoolLabel: 'Пул відомих серверів',
    knownPoolDesc:
      'Кожен публічний сервер, до якого ви справді підключалися — незалежно від способу підключення — запам’ятовується локально й додається до кожного оновлення, як і обрані. Не залежить від мережі; саме так лаунчер із часом знаходить більше серверів, що більше ви граєте.',
    retentionLabel: 'Термін зберігання',
    retentionDesc: 'Забути відомий сервер, якщо він не відповідав стільки днів.',

    neighborhoodLabel: 'Сканування околиці',
    neighborhoodDesc:
      'Вимкнено за замовчуванням. Якщо увімкнено, перевіряє сусідні адреси (та сама підмережа /24, порти 27015–27020) навколо вже відомих серверів — обраних і тих, до яких ви справді підключалися — тим самим публічним запитом стану, яким користується вбудований браузер серверів гри. Лише читання, без підключення до жодного сервера; обмежено та лімітовано на кожне оновлення. Може сповільнити оновлення й надсилає UDP-пакети на адреси, які ви не додавали явно.',
    neighborhoodAriaLabel: 'Джерело сканування околиці',

    sectionKnownPlayers: 'Знайомі гравці',
    knownPlayersHint:
      'Нікнейми, які ви позначили як знайомі/друзів зі списку гравців сервера. Відстежуються та зберігаються лише локально — ніщо з цього ніколи нікуди не завантажується. Позначені гравці виділяються в панелі інформації про сервер і вмикають позначку «знайомі онлайн» у браузері серверів та на Головній, коли їх нещодавно бачили.',
    knownPlayersEmpty: 'Ще немає знайомих гравців — позначте когось зі списку гравців сервера.',
    notePlaceholder: 'Необов’язкова примітка',
    noteSave: 'Зберегти',
    noteAdd: 'Додати примітку…',
    forgetPlayer: 'Забути',

    sectionProfile: 'Профіль',
    profileLabel: 'Експорт / імпорт профілю',
    profileDesc:
      'Один файл JSON з вашими обраними, джерелами серверів, відомими серверами, знайомими гравцями, правилами та налаштуваннями сповіщень, вибором контенту та локальним знімком My Config — усе необхідне, щоб перенести налаштування на іншу установку.',
    exporting: 'Експорт…',
    export: 'Експортувати…',
    importReading: 'Читання…',
    import: 'Імпортувати…',
    profileExportedToast: 'Профіль експортовано',
    profileNotAFileToast: 'Цей файл не є профілем 1.6X Launcher',
    profileImportedToast: (mode: string) => `Профіль імпортовано (${mode === 'merge' ? 'об’єднання' : 'заміна'})`,

    sectionLanguage: 'Мова',
    languageLabel: 'Мова',
    languageDesc: 'Мова інтерфейсу. Визначається автоматично під час першого запуску.',

    sectionNotifications: 'Сповіщення',
    notificationsLabel: 'Фонові сповіщення про сервери',
    notificationsDesc:
      'Вимкнено за замовчуванням. Якщо увімкнено, періодично перевіряє обрані сервери та пул відомих серверів, поки лаунчер відкрито, і надсилає системне сповіщення за кожним правилом нижче — ніколи, коли лаунчер закрито.',
    notificationsAriaLabel: 'Фонові сповіщення про сервери',
    pollStatusLine: (last: string, next: string, n: number) =>
      `Остання перевірка (${last}) · наступна (${next}) · відстежується ${slavicPlural(n, { one: `${n} обраний сервер`, few: `${n} обрані сервери`, many: `${n} обраних серверів` })} + пул відомих`,
    muteLabel: 'Заглушити',
    muteDesc: 'Продовжує опитування (статус вище лишається живим), але не показує сповіщення.',
    muteAriaLabel: 'Заглушити сповіщення',
    pollIntervalLabel: 'Інтервал опитування',
    pollIntervalDesc: 'Хвилин між фоновими перевірками (1–30).',
    quietHoursLabel: 'Тихі години',
    quietHoursDesc: 'Без сповіщень у цей проміжок часу (опитування й відстеження стану тривають).',
    quietHoursAriaLabel: 'Тихі години',
    quietHoursFrom: 'Від',
    quietHoursTo: 'До',
    rulesHint:
      'Правила застосовуються до кожної адреси з обраних і пулу відомих серверів, якщо не обмежені конкретним сервером. Спрацьовують один раз на перехід (наприклад, перетин порогу), а не постійно, поки умова виконується.',
    notificationsIntroModalTitle: 'Увімкнення фонових сповіщень',
    notificationsIntroModalMessage:
      'Лаунчер періодично опитуватиме ваші обрані та відомі сервери, поки він відкритий, і покаже системне сповіщення, коли спрацює задане вами правило (наприклад, сервер перетне поріг кількості гравців). Нічого не перевіряється, поки лаунчер закрито. Ви можете додавати правила, вимикати звук, встановлювати тихі години або вимкнути це в будь-який момент.',
    notificationsIntroConfirm: 'Увімкнути',

    sectionDesktopIntegration: 'Інтеграція з робочим столом',
    desktopIntegrationLabel: 'Додати до меню застосунків',
    desktopIntegrationDescBefore: 'Реєструє запис',
    desktopIntegrationDescCode1: '.desktop',
    desktopIntegrationDescMid: 'у (',
    desktopIntegrationDescCode2: '~/.local/share/applications',
    desktopIntegrationDescAfter:
      '), щоб ваше робоче середовище показувало правильну назву й іконку в панелі задач/меню, а на Wayland — могло надавати запити на підняття вікна від фонових сповіщень. Ніколи не виконується без цієї явної дії.',
    desktopIntegrationRemoving: 'Видалення…',
    desktopIntegrationRemove: 'Видалити',
    desktopIntegrationAdding: 'Додавання…',
    desktopIntegrationAdd: 'Додати до меню',
    addedToMenuToast: 'Додано до меню застосунків',
    removedFromMenuToast: 'Видалено з меню застосунків',

    sectionCrosshair: 'Приціл поверх гри',
    crosshairEnabledLabel: 'Увімкнути прицiл',
    crosshairEnabledDesc:
      'Вимкнено за замовчуванням. Показує приціл поверх CS 1.6 лише поки гра запущена, і автоматично ховається решту часу.',
    crosshairEnabledAriaLabel: 'Приціл поверх гри',
    crosshairDisclosureModalTitle: 'Увімкнути приціл поверх гри',
    crosshairDisclosureModalMessage:
      'Це малює приціл в окремому вікні поверх гри — воно жодним чином не читає й не змінює CS 1.6, її пам’ять чи файли. Правила адміністрації деяких серверів усе одно можуть забороняти такі накладення; дотримуйтеся правил серверів, на яких граєте.',
    crosshairDisclosureConfirm: 'Увімкнути',
    crosshairWaylandHint:
      'Виявлено Wayland: приціл надійно показується поверх гри без рамки або у віконному режимі, але може не відображатися в ексклюзивному повноекранному режимі — спробуйте режим без рамки/віконний, якщо він не з’являється.',
    crosshairShapeLabel: 'Форма',
    crosshairShapeDot: 'Крапка',
    crosshairShapeCross: 'Хрест',
    crosshairShapeCircle: 'Коло',
    crosshairShapeCrossDot: 'Хрест + крапка',
    crosshairSizeLabel: 'Розмір',
    crosshairThicknessLabel: 'Товщина',
    crosshairGapLabel: 'Проміжок',
    crosshairOpacityLabel: 'Непрозорість',
    crosshairOffsetXLabel: 'Зсув по X',
    crosshairOffsetYLabel: 'Зсув по Y',
    crosshairColorLabel: 'Колір',
    crosshairCustomColorAriaLabel: 'Свій колір',
    crosshairOutlineLabel: 'Обведення',
    crosshairOutlineDesc: 'Темний контур навколо прицілу для контрасту на світлому тлі.',
    crosshairOutlineAriaLabel: 'Обведення прицілу',
    crosshairDisplayLabel: 'Дисплей',
    crosshairDisplayDesc: 'На якому моніторі малювати приціл — для систем із кількома моніторами.',
    crosshairDisplayAuto: 'Авто',

    sectionPreferences: 'Налаштування вигляду',
    reduceMotionLabel: 'Менше анімації',
    reduceMotionDesc: 'Вимикає анімовані переходи, пульсацію та мерехтіння в усьому застосунку.',
    reduceMotionAriaLabel: 'Менше анімації',

    sectionUpdates: 'Оновлення лаунчера',
    versionLabel: (v: string) => `Версія ${v}`,
    updatesDevDisabled: 'Оновлення вимкнено в розробницьких збірках.',
    updatesChecking: 'Перевірка оновлень…',
    updatesNotAvailable: 'У вас остання версія.',
    updateAvailable: (v: string) => `Доступне оновлення v${v}.`,
    updateDownloading: (pct: number) => `Завантаження оновлення — ${pct}%`,
    updateDownloaded: (v: string) => `Оновлення v${v} завантажено і готове до встановлення.`,
    download: 'Завантажити',
    restartAndInstall: 'Перезапустити й встановити',
    checkForUpdates: 'Перевірити оновлення'
  },

  configScanner: {
    safeScoreLabel: 'Оцінка безпеки',
    scanning: 'Сканування…',
    scanUnavailable: 'Не вдалося просканувати цей конфіг',
    viewFindings: (n: number) =>
      slavicPlural(n, { one: `${n} знахідка`, few: `${n} знахідки`, many: `${n} знахідок` }),
    noFindings: 'Проблем не знайдено.',
    detailsTitle: 'Результати сканування',
    gateTitle: 'Заблоковано: критичні проблеми безпеки',
    gateIntro: (n: number) =>
      `У цьому конфігу ${slavicPlural(n, { one: `${n} критична знахідка`, few: `${n} критичні знахідки`, many: `${n} критичних знахідок` })} — встановлення без змін може непомітно перепідключити вас до іншого сервера, стерти прив’язки клавіш або виконати недовірені команди.`,
    gateWarningNote: (n: number) =>
      `Нижче також знайдено ${slavicPlural(n, { one: `${n} попередження`, few: `${n} попередження`, many: `${n} попереджень` })} — вони не блокують встановлення.`,
    installAnyway: 'Все одно встановити',
    severityCritical: 'Критично',
    severityWarning: 'Попередження',
    severityInfo: 'Інфо',
    fileLabel: 'Файл',
    lineLabel: 'Рядок',
    ruleServerHijack: (cmd: string) => `«${cmd}» може непомітно перепідключити вас до іншого сервера`,
    ruleRcon: (cmd: string) => `«${cmd}» може розкрити або повторно використати дані rcon-адміністрування`,
    ruleMotdWrite: 'Перезаписує файл повідомлення дня (motd) сервера',
    ruleExecOutsideCstrike: (path: string) => `Виконує файл поза папкою гри: ${path}`,
    ruleUnbindallNoRestore: 'Скидає всі прив’язки клавіш і ніколи не відновлює їх',
    ruleAliasScript: (name: string) => `Визначає скриптовий аліас («${name}») — ланцюжок команд, що виконається пізніше`,
    ruleMultiCommandBind: 'Прив’язка запускає кілька команд у ланцюжку',
    ruleWaitBind: 'Прив’язка використовує «wait» для затримки в скрипті',
    ruleSetinfoUnknownKey: (key: string) => `Встановлює нерозпізнаний ключ info: ${key}`,
    ruleUnknownCvar: (name: string) => `Нерозпізнана команда чи cvar: ${name}`,
    ruleValueOutOfRange: (detail: string) => `Значення поза очікуваним діапазоном: ${detail}`
  },

  notificationRules: {
    typePlayerThreshold: 'Поріг кількості гравців',
    typeEmptyToActive: 'Порожній → активний',
    typeMapMatch: 'Карта збігається',
    summaryThreshold: (n: number | string) => `${n}+ гравців`,
    summaryEmptyToActive: 'Стає активним з порожнього',
    summaryMapMatch: (maps: string) => `Карта: ${maps}`,
    summaryMapMatchUnset: 'Карта не вказана',
    targetAll: 'Усі відстежувані сервери',
    targetUnknown: 'Невідомий сервер',
    empty: 'Ще немає правил — додайте нижче.',
    enableRuleAriaLabel: (summary: string) => `Увімкнути правило: ${summary}`,
    removeRule: 'Видалити правило',
    scopeAll: 'Усі відстежувані сервери',
    scopeServer: 'Конкретний сервер…',
    addressPlaceholder: 'ip:port',
    mapsPlaceholder: 'de_dust2, de_inferno',
    addRule: 'Додати правило',
    errorAddress: 'Введіть адресу сервера у форматі ip:port',
    errorMaps: 'Введіть хоча б одну карту'
  },

  notices: {
    condebugTextBefore: 'Додайте',
    condebugCode: '-condebug',
    condebugTextAfter:
      'до параметрів запуску CS 1.6 у Steam (правий клік у бібліотеці Steam → Властивості → Загальні), щоб картка швидкого підключення відстежувала сервери, до яких ви приєднуєтесь у грі, а не лише через цей лаунчер — без цього відстежуються тільки підключення, ініційовані лаунчером.',
    launchOptionsTextBefore: 'Варіанти конфігурації виконуються через',
    launchOptionsCode: 'userconfig.cfg',
    launchOptionsTextAfter:
      'автоматично в більшості збірок Steam. Для додаткової надійності встановіть параметри запуску CS 1.6 у Steam (правий клік у бібліотеці Steam → Властивості → Загальні) на:',
    desktopIntegrationText:
      'Додати 1.6X Launcher до меню застосунків? Це також виправляє підняття вікна при кліку на фонове сповіщення (потрібен зареєстрований запис застосунку, щоб робочий стіл міг підняти вікно) і надає лаунчеру правильну назву й іконку в панелі задач.',
    desktopIntegrationAdding: 'Додавання…',
    desktopIntegrationAdd: 'Додати до меню',
    copy: 'Копіювати',
    copied: 'Скопійовано',
    dismiss: 'Приховати'
  },

  profileImportModal: {
    title: 'Імпорт профілю',
    summary: (parts: {
      exportedAt: string
      favorites: string
      subscriptions: string
      knownServers: string
      knownPlayers: string
      notificationRules: string
      hasLocalConfigVariant: boolean
    }) =>
      `Експортовано ${parts.exportedAt} — ${parts.favorites}, ${parts.subscriptions}, ${parts.knownServers}, ${parts.knownPlayers}, ${parts.notificationRules}${parts.hasLocalConfigVariant ? ', і знімок My Config' : ''}.`,
    favorites: (n: number) =>
      slavicPlural(n, { one: `${n} обраний сервер`, few: `${n} обрані сервери`, many: `${n} обраних серверів` }),
    subscriptions: (n: number) =>
      slavicPlural(n, { one: `${n} джерело серверів`, few: `${n} джерела серверів`, many: `${n} джерел серверів` }),
    knownServers: (n: number) =>
      slavicPlural(n, { one: `${n} відомий сервер`, few: `${n} відомі сервери`, many: `${n} відомих серверів` }),
    knownPlayers: (n: number) =>
      slavicPlural(n, { one: `${n} знайомий гравець`, few: `${n} знайомі гравці`, many: `${n} знайомих гравців` }),
    notificationRules: (n: number) =>
      slavicPlural(n, { one: `${n} правило сповіщення`, few: `${n} правила сповіщень`, many: `${n} правил сповіщень` }),
    mergeLabel: 'Об’єднати',
    mergeDesc: '— додає нове, ніколи не перезаписує те, що вже є.',
    replaceLabel: 'Замінити',
    replaceDesc: '— імпортований профіль повністю замінює поточні дані.',
    cancel: 'Скасувати',
    import: 'Імпортувати'
  },

  notifications: {
    thresholdBody: (players: number, threshold: number) => `Гравців онлайн: ${players} (поріг ${threshold})`,
    emptyToActiveBody: (players: number, map: string) =>
      `Знову активний — ${slavicPlural(players, { one: `${players} гравець`, few: `${players} гравці`, many: `${players} гравців` })} на ${map || 'невідомій карті'}`,
    mapMatchBody: (map: string) => `Зараз карта ${map}`,
    connectAction: 'Підключитися'
  },

  dialogs: {
    exportProfileTitle: 'Експорт профілю',
    importProfileTitle: 'Імпорт профілю'
  }
}
