/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 082 D3: a assinatura é canvas + pointer events. Aparelho sem os dois cai para a foto — o
 * caminho que já existe —, nunca para um botão que não faz nada.
 */
export function isSignatureCaptureSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof window.PointerEvent !== 'undefined'
  )
}

type LockableOrientation = Readonly<{
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
}>

function readOrientation(): LockableOrientation | undefined {
  return typeof screen === 'undefined'
    ? undefined
    : (screen.orientation as LockableOrientation | undefined)
}

/**
 * O modo tela inteira trava em paisagem: o traço é horizontal, e a mão assina deitado. O lock não
 * existe no iOS — `screen.orientation.lock` ausente ou recusado devolve `false`, e a tela rotaciona
 * o conteúdo por CSS (`transform: rotate(90deg)`) em vez de desistir.
 */
export async function enterSignatureFullscreen(element: HTMLElement): Promise<{
  readonly isLandscapeLocked: boolean
}> {
  try {
    await element.requestFullscreen?.()
  } catch {
    /* Fullscreen negado não impede assinar — só não amplia. */
  }

  try {
    const orientation = readOrientation()
    if (orientation?.lock === undefined) return { isLandscapeLocked: false }
    await orientation.lock('landscape')
    return { isLandscapeLocked: true }
  } catch {
    return { isLandscapeLocked: false }
  }
}

/** Ao sair: unlock + exitFullscreen, cada um no próprio try/catch — sair nunca pode falhar. */
export async function exitSignatureFullscreen(): Promise<void> {
  try {
    readOrientation()?.unlock?.()
  } catch {
    /* iOS não tem unlock — e não há o que desfazer. */
  }
  try {
    if (typeof document !== 'undefined' && document.fullscreenElement !== null) {
      await document.exitFullscreen()
    }
  } catch {
    /* Já fora do fullscreen. */
  }
}
