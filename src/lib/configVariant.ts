/**
 * Renderer-side copies of the two sentinel ids from
 * electron/modules/local-config-variant.ts — kept separate (not imported)
 * because that module pulls in Electron's `app`, which only exists in the
 * main process.
 */
export const CONFIG_SLOT_ID = 'config'
export const LOCAL_VARIANT_ID = 'my-config'
