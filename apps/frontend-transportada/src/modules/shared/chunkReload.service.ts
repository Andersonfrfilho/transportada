/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Cada deploy troca o hash dos arquivos em `/assets/`. Quem estava com a aba aberta ainda aponta
 * para o hash antigo; ao abrir uma tela nova o `import()` leva 404 e o painel fica em branco até
 * alguém dar F5. O Vite avisa por `vite:preloadError` — aqui a aba recarrega **uma vez** para
 * pegar o HTML novo. A trava em `sessionStorage` impede laço de recarga se o erro não for deploy.
 */
export const CHUNK_RELOAD_STORAGE_KEY = 'transportada.chunk-reload-at'
export const CHUNK_RELOAD_COOLDOWN_MILLISECONDS = 30_000

interface ChunkReloadStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function shouldReloadAfterChunkError(
  storage: ChunkReloadStorage | null,
  now: number,
): boolean {
  if (storage === null) return false
  try {
    const lastReload = Number(storage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? '0')
    if (Number.isFinite(lastReload) && now - lastReload < CHUNK_RELOAD_COOLDOWN_MILLISECONDS) {
      return false
    }
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now))
    return true
  } catch {
    return false
  }
}

export function installChunkReloadHandler(target: Window): void {
  target.addEventListener('vite:preloadError', (event) => {
    if (!shouldReloadAfterChunkError(target.sessionStorage, Date.now())) return
    event.preventDefault()
    target.location.reload()
  })
}
