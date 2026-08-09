import { englishPlural } from './pluralize.ts'

function plural(n: number, one: string, other: string): string {
  return `${n} ${englishPlural(n, { one, other })}`
}

// Canonical message tree (source of truth for M16 i18n) — uk.ts and ru.ts
// are type-checked against `typeof en` (see locales/index.ts), so a missing
// or extra key in either fails the build. Leaves that need interpolation or
// pluralization are functions rather than strings; a locale's own function
// body is where its plural/grammar rules live (see pluralize.ts).
//
// Deliberately NOT here: config variant/manifest content, player nicknames,
// map/server names, cvar names, file paths — those are data the manifest or
// A2S already supplies, not UI copy. See CLAUDE.md's M16 note.
export const en = {
  common: {
    cancel: 'Cancel',
    close: 'Close',
    connect: 'Connect',
    retry: 'Retry',
    refresh: 'Refresh',
    remove: 'Remove',
    save: 'Save',
    copy: 'Copy',
    copied: 'Copied',
    dismiss: 'Dismiss',
    loading: 'Loading…',
    dash: '—'
  },

  nav: {
    home: 'Home',
    servers: 'Servers',
    content: 'Content',
    settings: 'Settings',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Expand sidebar',
    steamChecking: 'Checking Steam…',
    steamDetected: 'Steam detected',
    steamNotFound: 'Steam not found',
    fix: 'Fix'
  },

  titleBar: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close'
  },

  commandPalette: {
    placeholder: 'Type a command…',
    empty: 'No matching actions',
    connectTo: (name: string) => `Connect to ${name}`,
    goToHome: 'Go to Home',
    goToServers: 'Go to Servers',
    goToContent: 'Go to Content',
    goToSettings: 'Go to Settings',
    hintScreen: 'screen',
    hintSetting: 'setting',
    hintFolder: 'folder',
    toggleReduceMotionOn: 'Turn on Reduce Motion',
    toggleReduceMotionOff: 'Turn off Reduce Motion',
    openGameFolder: 'Open Game Folder',
    openBackupFolder: 'Open Backup Folder',
    verifyFiles: 'Verify Files',
    verifyFilesHint: 'checks & repairs content'
  },

  home: {
    syncNoManifest: 'No content pack configured',
    syncSyncing: 'Syncing content…',
    syncPending: 'Content changes pending',
    syncUpToDate: 'Content up to date',
    steamMissingTooltipInstall: "Steam is installed, but CS 1.6 isn't — install it through Steam",
    steamMissingTooltipLocate: "Steam wasn't found on this system",
    checking: 'Checking',
    launching: 'LAUNCHING…',
    update: 'UPDATE',
    play: 'PLAY',
    installCs: 'Install CS 1.6…',
    locateSteam: 'Locate Steam…',
    lastServer: 'Last server',
    noRecentConnections: 'No recent connections — visit Servers to connect.',
    sourceLauncher: 'Launcher',
    sourceInGame: 'In-game',
    knownOnline: (names: string) => `Known online: ${names}`,
    pingPending: '…',
    pingTimeout: 'timeout',
    connecting: 'Connecting…',
    connect: 'CONNECT'
  },

  servers: {
    sourceFailed: (id: string, error: string) => `Server source "${id}" failed: ${error}`,
    searchPlaceholder: 'Search servers…  (press / to focus)',
    filterNotFull: 'Not full',
    filterNotEmpty: 'Not empty',
    filterNoPassword: 'No password',
    filterFavorites: 'Favorites',
    filterShowUnresponsive: 'Show unresponsive',
    allMaps: 'All maps',
    viewGroupLabel: 'View',
    listView: 'List view',
    gridView: 'Grid view',
    refresh: 'Refresh',
    funnelSources: (n: number) => plural(n, 'source', 'sources'),
    funnelAddresses: (n: number) => plural(n, 'address', 'addresses'),
    funnelResponding: 'responding',
    sourceKindBattlemetrics: 'BattleMetrics',
    sourceKindMaster: 'Master server',
    sourceKindNeighborhood: 'Neighborhood scan',
    addPlaceholder: 'Add server by address — ip:port',
    addFavorite: 'Add favorite',
    removeFavorite: 'Remove favorite',
    favorite: 'Favorite',
    addErrorInvalid: 'Enter an address as ip:port',
    addErrorDuplicate: 'Already in favorites',
    colName: 'Name',
    colMap: 'Map',
    colPlayers: 'Players',
    colPing: 'Ping',
    emptyNoServers: 'No servers found — add a favorite or check back',
    emptyNoMatches: 'No servers match these filters',
    serverInfo: 'Server info',
    connect: 'Connect',
    copyIp: 'Copy IP',
    address: 'Address',
    players: 'Players',
    ping: 'Ping',
    timeout: 'timeout',
    drawerPlayersHeading: 'Players',
    privacyNote: 'Nicknames seen here are tracked locally only — never uploaded.',
    queryingPlayers: 'Querying players…',
    playersUnavailable: 'Player list unavailable.',
    noPlayers: 'No players connected.',
    unconnectedPlayer: 'unconnected',
    forgetKnownPlayer: 'Forget known player',
    markKnownPlayer: 'Mark as known player'
  },

  content: {
    title: 'Content',
    manifestLoadError: (error: string) => `Couldn't load the content pack (${error}) — showing placeholder content.`,
    localBadge: 'Local',
    snapshotTaken: (date: string) => `Snapshot taken ${date}`,
    strippedLines: (n: number) => plural(n, 'line removed for safety', 'lines removed for safety'),
    noConfigYet: 'No config.cfg found yet — nothing to snapshot.',
    checkingConfig: 'Checking for an existing config.cfg…',
    updateSnapshot: 'Update snapshot',
    updateSnapshotModalTitle: 'Update My Config Snapshot',
    updateSnapshotModalMessageChanged: (n: number) =>
      `Re-reads your current in-game settings. ${plural(n, 'line', 'lines')} will change.`,
    updateSnapshotModalMessageFirst: 'Re-reads your current in-game settings to create the first snapshot.',
    updateSnapshotConfirming: 'Updating…',
    updateSnapshotConfirm: 'Update Snapshot',
    noManifestNote: 'Content selection will apply after content-pack integration.',
    featuresHeading: 'Features',
    systemHeading: 'System',
    detectingSteam: 'Detecting Steam…',
    steamDetectionFailed: 'Steam detection failed.',
    steamPath: 'Steam path',
    gamePath: 'Game path',
    installed: 'Installed',
    notFound: 'not found',
    yes: 'yes',
    no: 'no',
    configNotFoundToast: 'config.cfg not found — launch the game at least once first',
    snapshotUpdatedToast: 'My Config snapshot updated'
  },

  settings: {
    lastCheckFailed: (when: string, error: string) => `Last check (${when}): failed — ${error}`,
    lastCheckOk: (when: string, n: number) => `Last check (${when}): ${plural(n, 'address', 'addresses')}`,
    contentSyncTitle: 'Content Sync',
    manifestUrlLabel: 'Content manifest URL',
    headlineFiles: (completed: number, total: number) => `${completed}/${total} files`,
    headlineUpToDate: 'Up to date',
    headlineSyncFailed: 'Sync failed',
    headlineReady: 'Ready to sync',
    etaLine: (eta: string, speed: string) => `ETA ${eta} · ${speed || '—'}`,
    resultLine: (version: string, updated: number, skipped: number) =>
      `v${version} · ${updated} updated, ${skipped} unchanged`,
    noSyncInProgress: 'No sync in progress',
    syncing: 'Syncing…',
    syncContent: 'Sync Content',
    verifying: 'Verifying…',
    verifyAndRepair: 'Verify & Repair',
    retry: 'Retry',
    itemDone: 'done',
    verifyModalTitle: 'Verify & Repair Files',
    verifyModalMessage:
      "Re-checks every file in the active content build against the manifest and re-downloads anything that doesn't match. This can take a while on a slow connection.",

    sectionFolders: 'Folders',
    gameFolderLabel: 'Game folder',
    gameFolderDesc: 'Open the CS 1.6 install directory in your file manager.',
    backupsFolderLabel: 'Backups folder',
    backupsFolderDesc: 'Original files the launcher preserved before overwriting them.',
    open: 'Open',

    sectionRestore: 'Restore Original Files',
    restoreHint:
      "Whatever was on disk before the launcher first overwrote it, for every file it's touched — the safety net behind every sync.",
    restoreLoading: 'Loading…',
    restoreEmpty: 'No backed-up files — nothing to restore.',
    restoring: 'Restoring…',
    restore: 'Restore',
    restoringAll: 'Restoring all…',
    restoreAll: (n: number) => `Restore all (${n})`,
    restoreAllModalTitle: 'Restore Original Files',
    restoreAllModalMessage: (n: number) =>
      `Restores all ${plural(n, 'backed-up file', 'backed-up files')} to what they were before the launcher touched them. Anything a manifest variant put in their place is replaced.`,
    restoreAllConfirm: 'Restore All',
    restoredFileToast: (name: string) => `Restored ${name}`,
    restoredAllToast: (n: number) => `Restored ${plural(n, 'file', 'files')}`,

    sectionServerSources: 'Server Sources',
    masterLabel: 'Master server discovery',
    masterDesc:
      "Valve's GoldSrc master server — always on, not configurable. As of 2026-07 it appears to be down (both the hostname and its documented IP fallback are unreachable), so this currently contributes nothing; we keep trying every refresh in case Valve fixes it.",
    battlemetricsLabel: 'BattleMetrics',
    battlemetricsDesc:
      "Server list from battlemetrics.com — as of 2026-07 their public API requires a paid subscription (unauthenticated requests get an access-denied error), so this is off by default. Only enable it if you have one. Server name, map, players, and ping always come from our own queries either way.",
    battlemetricsAriaLabel: 'BattleMetrics source',
    subscriptionsHintBefore: 'Add URLs that return plain-text',
    subscriptionsHintCode: 'ip:port',
    subscriptionsHintAfter: 'lines or a JSON array. Fetched and merged in on every server-list refresh.',
    noSubscriptions: 'No subscriptions added.',
    defaultSubscriptionLabel: 'Default curated list (community-maintained)',
    removeSource: 'Remove',
    subscriptionUrlPlaceholder: 'https://example.com/servers.txt',
    addSource: 'Add source',
    subErrorInvalid: 'Enter a valid http(s) URL',
    subErrorDuplicate: 'Already added',

    knownPoolLabel: 'Known servers pool',
    knownPoolDesc:
      "Every public server you actually connect to — however you joined — is remembered locally and merged into every refresh, same as favorites. No network dependency; it's how the launcher gets better at finding servers the more you play.",
    retentionLabel: 'Retention',
    retentionDesc: "Drop a known server if it hasn't answered in this many days.",

    neighborhoodLabel: 'Neighborhood scan',
    neighborhoodDesc:
      "Off by default. When enabled, probes nearby addresses (same /24, ports 27015–27020) around servers you already know — favorites and servers you've actually connected to — using the same public status query the in-game browser itself uses. Read-only, no connection to any server; capped and rate-limited per refresh. May slow down refresh and sends UDP packets to addresses you haven't explicitly added.",
    neighborhoodAriaLabel: 'Neighborhood scan source',

    sectionKnownPlayers: 'Known Players',
    knownPlayersHint:
      'Nicknames you’ve marked known/friend from a server’s player list. Tracked and stored locally only — nothing here is ever uploaded. Marked players are highlighted in the server-info drawer and light up a "known online" badge on the server browser and Home when recently seen.',
    knownPlayersEmpty: "No known players yet — mark one from a server's player list.",
    notePlaceholder: 'Optional note',
    noteSave: 'Save',
    noteAdd: 'Add a note…',
    forgetPlayer: 'Forget',

    sectionProfile: 'Profile',
    profileLabel: 'Export / import profile',
    profileDesc:
      'A single JSON file with your favorites, server sources, known servers, known players, notification rules and settings, content selections, and your local My Config snapshot — everything needed to carry your setup to another install.',
    exporting: 'Exporting…',
    export: 'Export…',
    importReading: 'Reading…',
    import: 'Import…',
    profileExportedToast: 'Profile exported',
    profileNotAFileToast: "That file isn't a 1.6X Launcher profile",
    profileImportedToast: (mode: string) => `Profile imported (${mode})`,

    sectionLanguage: 'Language',
    languageLabel: 'Language',
    languageDesc: 'Interface language. Detected automatically on first run.',

    sectionNotifications: 'Notifications',
    notificationsLabel: 'Background server notifications',
    notificationsDesc:
      'Off by default. When on, periodically checks favorites + your known-servers pool while the launcher is open and fires a system notification per rule below — never while the launcher is closed.',
    notificationsAriaLabel: 'Background server notifications',
    pollStatusLine: (last: string, next: string, n: number) =>
      `Last poll (${last}) · next (${next}) · watching ${plural(n, 'favorite', 'favorites')} + known pool`,
    muteLabel: 'Mute',
    muteDesc: 'Keep polling (status above stays live) but suppress notifications.',
    muteAriaLabel: 'Mute notifications',
    pollIntervalLabel: 'Poll interval',
    pollIntervalDesc: 'Minutes between background checks (1–30).',
    quietHoursLabel: 'Quiet hours',
    quietHoursDesc: 'No notifications between these times (still polls, still tracks state).',
    quietHoursAriaLabel: 'Quiet hours',
    quietHoursFrom: 'From',
    quietHoursTo: 'To',
    rulesHint:
      'Rules apply to every favorite + known-servers-pool address unless scoped to one server. Fires once per transition (e.g. crossing a threshold), never repeatedly while it stays true.',
    notificationsIntroModalTitle: 'Enable Background Notifications',
    notificationsIntroModalMessage:
      "The launcher will periodically query your favorites and known servers while it's open, and show a system notification when a rule you define matches (e.g. a server crosses a player-count threshold). Nothing is checked while the launcher is closed. You can add rules, mute, set quiet hours, or turn this off again at any time.",
    notificationsIntroConfirm: 'Enable',

    sectionDesktopIntegration: 'Desktop Integration',
    desktopIntegrationLabel: 'Add to application menu',
    desktopIntegrationDescBefore: 'Registers a',
    desktopIntegrationDescCode1: '.desktop',
    desktopIntegrationDescMid: 'entry (',
    desktopIntegrationDescCode2: '~/.local/share/applications',
    desktopIntegrationDescAfter:
      ') so your desktop environment shows a proper name and icon in the taskbar/menu, and — on Wayland — can grant window-raise requests from background notifications. Never done without this explicit action.',
    desktopIntegrationRemoving: 'Removing…',
    desktopIntegrationRemove: 'Remove',
    desktopIntegrationAdding: 'Adding…',
    desktopIntegrationAdd: 'Add to menu',
    addedToMenuToast: 'Added to your application menu',
    removedFromMenuToast: 'Removed from your application menu',

    sectionNativeCrosshair: 'Native Crosshair',
    nativeCrosshairIntro:
      "Sets CS 1.6's own crosshair cvars — works in exclusive fullscreen and on Wayland, with zero window/overlay involvement. Recommended over the overlay below unless you need its extra shapes or multi-monitor offset.",
    nativeCrosshairEnabledLabel: 'Enable',
    nativeCrosshairEnabledDesc: 'Writes cl_crosshair_color/_size/_translucent and cl_dynamiccrosshair via a managed cfg.',
    nativeCrosshairEnabledAriaLabel: 'Native crosshair',
    nativeCrosshairSizeLabel: 'Size',
    nativeCrosshairSizeSmall: 'Small',
    nativeCrosshairSizeMedium: 'Medium',
    nativeCrosshairSizeLarge: 'Large',
    nativeCrosshairColorLabel: 'Color',
    nativeCrosshairCustomColorAriaLabel: 'Custom color',
    nativeCrosshairTranslucentLabel: 'Translucent',
    nativeCrosshairTranslucentDesc: 'Slightly see-through crosshair.',
    nativeCrosshairTranslucentAriaLabel: 'Translucent crosshair',
    nativeCrosshairDynamicLabel: 'Dynamic',
    nativeCrosshairDynamicDesc: "Crosshair spreads with the weapon's inaccuracy while moving or firing.",
    nativeCrosshairDynamicAriaLabel: 'Dynamic crosshair',
    nativeCrosshairAppliedHint: 'Applied to your CS 1.6 config.',
    nativeCrosshairNotAppliedHint: "CS 1.6 install not found yet — will apply the next time it's detected.",

    sectionCrosshair: 'Crosshair Overlay (Advanced)',
    crosshairOverlayIntro:
      'A separate on-screen window instead of an engine cvar — more shapes and a multi-monitor offset, at the cost of the platform caveats below. Prefer Native Crosshair above unless you need those.',
    crosshairEnabledLabel: 'Enable overlay',
    crosshairEnabledDesc:
      'Off by default. Shows a crosshair over CS 1.6 only while the game is running, and hides automatically the rest of the time.',
    crosshairEnabledAriaLabel: 'Crosshair overlay',
    crosshairDisclosureModalTitle: 'Enable Crosshair Overlay',
    crosshairDisclosureModalMessage:
      "This draws a crosshair in a separate window on top of the game — it does not read or modify CS 1.6, its memory, or its files in any way. Some servers' admin rules may still disallow overlays like this one; respect the rules of servers you play on.",
    crosshairDisclosureConfirm: 'Enable',
    crosshairWaylandHint:
      'Wayland detected: the overlay reliably shows over a borderless or windowed game, but may not render over exclusive fullscreen — try borderless/windowed mode if it doesn’t appear.',
    crosshairShapeLabel: 'Shape',
    crosshairShapeDot: 'Dot',
    crosshairShapeCross: 'Cross',
    crosshairShapeCircle: 'Circle',
    crosshairShapeCrossDot: 'Cross + Dot',
    crosshairSizeLabel: 'Size',
    crosshairThicknessLabel: 'Thickness',
    crosshairGapLabel: 'Gap',
    crosshairOpacityLabel: 'Opacity',
    crosshairOffsetXLabel: 'Offset X',
    crosshairOffsetYLabel: 'Offset Y',
    crosshairNudgeDecrementAriaLabel: 'Nudge left/up by 1px',
    crosshairNudgeIncrementAriaLabel: 'Nudge right/down by 1px',
    crosshairNudgeResetLabel: 'Center',
    crosshairNudgeResetDesc:
      "If the overlay doesn't land exactly on the game's own center for your setup, use the ±1px buttons above to nudge it while the game is running — no single formula works across every compositor and window mode.",
    crosshairNudgeResetButton: 'Reset to center',
    crosshairColorLabel: 'Color',
    crosshairCustomColorAriaLabel: 'Custom color',
    crosshairOutlineLabel: 'Outline',
    crosshairOutlineDesc: 'A dark edge around the crosshair for contrast against bright backgrounds.',
    crosshairOutlineAriaLabel: 'Crosshair outline',
    crosshairDisplayLabel: 'Display',
    crosshairDisplayDesc: 'Which monitor to draw the overlay on, for multi-monitor setups.',
    crosshairDisplayAuto: 'Auto',
    crosshairKwinHintTitle: 'Still falling behind the game on KDE Plasma?',
    crosshairKwinHintDesc:
      "The overlay re-asserts staying on top automatically, but some KWin setups won't reliably keep it above a focused game window. A KWin Window Rule guarantees it — copy the steps below and add one in System Settings.",
    crosshairScaleLabel: 'Game Resolution Scale',
    crosshairScaleDesc:
      "If CS 1.6 renders at a lower resolution than your monitor (upscaled to fill the screen), the overlay needs to match that scale or it renders too small. Enter the game's resolution, or auto-detect it from Steam Launch Options.",
    crosshairScaleCurrent: (n: string) => `Current: ${n}×`,
    crosshairScaleWidthLabel: 'Game width',
    crosshairScaleHeightLabel: 'Game height',
    crosshairScaleAutoDetectButton: 'Detect from Launch Options',
    crosshairScaleAutoDetectNotFound: 'No -w/-h resolution found in Steam Launch Options.',
    crosshairScaleSuggested: (n: string) => `Suggested: ${n}×`,
    crosshairScaleApplyButton: 'Apply',
    crosshairDebugAlignmentLabel: 'Alignment guide (debug)',
    crosshairDebugAlignmentDesc:
      "Temporarily replaces the crosshair with full-window crosshair lines, so you can visually confirm the overlay is dead-center against the game. Doesn't persist across restarts.",
    crosshairKwinCopyButton: 'Copy KWin Rule Steps',
    crosshairKwinInstructions: (windowClass: string, windowTitle: string) =>
      [
        '1. Open System Settings → Window Management → Window Rules',
        '2. Click "Add New…"',
        '3. Description: 1.6X Launcher Crosshair Overlay',
        `4. Window class: ${windowClass}  (match: Exact Match)`,
        `5. Window title: ${windowTitle}  (match: Exact Match)`,
        '6. On the "Arrangement & Access" tab, enable "Keep above other windows" and set it to "Force"',
        '7. Click Apply'
      ].join('\n'),

    sectionPreferences: 'Preferences',
    reduceMotionLabel: 'Reduce motion',
    reduceMotionDesc: 'Turns off animated transitions, pulses, and shimmer everywhere in the app.',
    reduceMotionAriaLabel: 'Reduce motion',

    sectionUpdates: 'Launcher Updates',
    versionLabel: (v: string) => `Version ${v}`,
    updatesDevDisabled: 'Updates are disabled in development builds.',
    updatesChecking: 'Checking for updates…',
    updatesNotAvailable: "You're on the latest version.",
    updateAvailable: (v: string) => `Update v${v} is available.`,
    updateDownloading: (pct: number) => `Downloading update — ${pct}%`,
    updateDownloaded: (v: string) => `Update v${v} downloaded and ready to install.`,
    download: 'Download',
    restartAndInstall: 'Restart & Install',
    checkForUpdates: 'Check for Updates'
  },

  // M12.5 — config security scanner. See electron/modules/config-scanner.ts
  // and src/lib/configScanner.ts (rule -> message mapping).
  configScanner: {
    safeScoreLabel: 'Safe Score',
    scanning: 'Scanning…',
    scanUnavailable: "Couldn't scan this config",
    viewFindings: (n: number) => plural(n, 'finding', 'findings'),
    noFindings: 'No issues found.',
    detailsTitle: 'Scan Findings',
    gateTitle: 'Blocked: Security Findings',
    gateIntro: (n: number) =>
      `This config has ${plural(n, 'critical finding', 'critical findings')} — installing it as-is could hijack your connection, wipe your key bindings, or run untrusted commands.`,
    gateWarningNote: (n: number) => `${plural(n, 'warning', 'warnings')} also found below — these don't block install.`,
    installAnyway: 'Install Anyway',
    severityCritical: 'Critical',
    severityWarning: 'Warning',
    severityInfo: 'Info',
    fileLabel: 'File',
    lineLabel: 'Line',
    ruleServerHijack: (cmd: string) => `"${cmd}" can silently reconnect you to a different server`,
    ruleRcon: (cmd: string) => `"${cmd}" can leak or replay remote-admin (rcon) credentials`,
    ruleMotdWrite: 'Overwrites the server message-of-the-day file',
    ruleExecOutsideCstrike: (path: string) => `Execs a file outside the game folder: ${path}`,
    ruleUnbindallNoRestore: 'Clears every key binding and never rebinds them',
    ruleAliasScript: (name: string) => `Defines a script alias ("${name}") — a command chain that runs later`,
    ruleMultiCommandBind: 'Bind runs multiple chained commands',
    ruleWaitBind: 'Bind uses "wait" to time a scripted sequence',
    ruleSetinfoUnknownKey: (key: string) => `Sets an unrecognized info key: ${key}`,
    ruleUnknownCvar: (name: string) => `Unrecognized command or cvar: ${name}`,
    ruleValueOutOfRange: (detail: string) => `Value outside the expected range: ${detail}`
  },

  notificationRules: {
    typePlayerThreshold: 'Player count threshold',
    typeEmptyToActive: 'Empty → active',
    typeMapMatch: 'Map appears',
    summaryThreshold: (n: number | string) => `${n}+ players`,
    summaryEmptyToActive: 'Goes from empty to active',
    summaryMapMatch: (maps: string) => `Map is ${maps}`,
    summaryMapMatchUnset: 'Map is (none set)',
    targetAll: 'All watched servers',
    targetUnknown: 'Unknown server',
    empty: 'No rules yet — add one below.',
    enableRuleAriaLabel: (summary: string) => `Enable rule: ${summary}`,
    removeRule: 'Remove rule',
    scopeAll: 'All watched servers',
    scopeServer: 'Specific server…',
    addressPlaceholder: 'ip:port',
    mapsPlaceholder: 'de_dust2, de_inferno',
    addRule: 'Add rule',
    errorAddress: 'Enter the server address as ip:port',
    errorMaps: 'Enter at least one map name'
  },

  notices: {
    condebugTextBefore: 'Add',
    condebugCode: '-condebug',
    condebugTextAfter:
      "to CS 1.6's Steam Launch Options (right-click in your Steam library → Properties → General) so the quick-connect card can track servers you join in-game, not just through this launcher — without it, only launcher-initiated connects are tracked.",
    launchOptionsTextBefore: 'Config variants exec via',
    launchOptionsCode: 'userconfig.cfg',
    launchOptionsTextAfter:
      "automatically on most Steam builds. For extra reliability, set CS 1.6's Steam Launch Options (right-click in your Steam library → Properties → General) to:",
    crosshairWindowedText:
      'The crosshair overlay is a separate window on top of the game — it only reliably shows over a windowed or borderless game, not exclusive fullscreen. Add these to Steam Launch Options (right-click in your Steam library → Properties → General):',
    desktopIntegrationText:
      'Add 1.6X Launcher to your application menu? This also fixes background-notification click-to-focus (needs a registered app entry for your desktop to raise the window) and gives the launcher a proper name and icon in your taskbar.',
    desktopIntegrationAdding: 'Adding…',
    desktopIntegrationAdd: 'Add to menu',
    copy: 'Copy',
    copied: 'Copied',
    dismiss: 'Dismiss'
  },

  profileImportModal: {
    title: 'Import Profile',
    summary: (parts: {
      exportedAt: string
      favorites: string
      subscriptions: string
      knownServers: string
      knownPlayers: string
      notificationRules: string
      hasLocalConfigVariant: boolean
    }) =>
      `Exported ${parts.exportedAt} — ${parts.favorites}, ${parts.subscriptions}, ${parts.knownServers}, ${parts.knownPlayers}, ${parts.notificationRules}${parts.hasLocalConfigVariant ? ', and a My Config snapshot' : ''}.`,
    favorites: (n: number) => plural(n, 'favorite', 'favorites'),
    subscriptions: (n: number) => plural(n, 'server source', 'server sources'),
    knownServers: (n: number) => plural(n, 'known server', 'known servers'),
    knownPlayers: (n: number) => plural(n, 'known player', 'known players'),
    notificationRules: (n: number) => plural(n, 'notification rule', 'notification rules'),
    mergeLabel: 'Merge',
    mergeDesc: "— add what's new, never overwrite anything you already have.",
    replaceLabel: 'Replace',
    replaceDesc: '— the imported profile overwrites your current data entirely.',
    cancel: 'Cancel',
    import: 'Import'
  },

  // Main-process strings — system notifications and native dialog titles.
  // See electron/modules/notification-rules.ts and profile.ts.
  notifications: {
    thresholdBody: (players: number, threshold: number) => `${players} players online (threshold ${threshold})`,
    emptyToActiveBody: (players: number, map: string) =>
      `Active again — ${plural(players, 'player', 'players')} on ${map || 'unknown map'}`,
    mapMatchBody: (map: string) => `Now playing ${map}`,
    connectAction: 'Connect'
  },

  dialogs: {
    exportProfileTitle: 'Export Profile',
    importProfileTitle: 'Import Profile'
  }
}

export type Messages = typeof en
