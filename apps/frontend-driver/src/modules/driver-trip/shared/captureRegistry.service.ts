/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Registro das capturas abertas (plan D2): câmera, recorte, assinatura e diálogo de ocorrência.
 * Tudo que navega a página — o `keycloak.init` da volta da rede (D4) e a atualização do SW (D2) —
 * espera `isIdle()`, porque navegar no meio de uma captura joga fora o que o motorista fez.
 *
 * A T3.3a trouxe o mínimo que o boot sem rede precisa (`open`, `close`, `isIdle`, `onIdle`); a T3.5
 * liga as quatro capturas a ele, traz o contrato próprio e soma `hasOpened` — a regra de aplicação
 * do SW (`serviceWorkerUpdate.service.ts`) só aplica sozinha antes da primeira captura da sessão.
 */
export const CAPTURE_KINDS = [
  'camera',
  'crop',
  'signature',
  'occurrence-dialog',
  /** Spec 189 T9.2 (A4): o que a captura entregou, ainda a caminho do IndexedDB. */
  'persisting',
  /** Spec 189 T9.2 (M10): nome/documento do recebedor digitados e ainda não anexados. */
  'proof-form',
] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]

export type CaptureRegistry = Readonly<{
  close: (kind: CaptureKind) => void
  /** Alguma captura já abriu nesta sessão, mesmo já tendo fechado — nunca volta a `false`. */
  hasOpened: () => boolean
  /** `ignored`: kinds que não contam para esta pergunta (N2: `proof-form` para a autenticação). */
  isIdle: (ignored?: readonly CaptureKind[]) => boolean
  /**
   * Chamado a cada vez que a última captura que conta fecha — fechar um kind ignorado não chama.
   * Devolve o cancelamento.
   */
  onIdle: (listener: () => void, ignored?: readonly CaptureKind[]) => () => void
  open: (kind: CaptureKind) => void
}>

export function createCaptureRegistry(): CaptureRegistry {
  const openCountByKind = new Map<CaptureKind, number>()
  const idleListeners = new Map<() => void, readonly CaptureKind[]>()
  let everOpened = false

  function isIdle(ignored: readonly CaptureKind[] = []): boolean {
    return [...openCountByKind.keys()].every((kind) => ignored.includes(kind))
  }

  return {
    close(kind) {
      const count = openCountByKind.get(kind) ?? 0
      if (count === 0) return
      if (count > 1) openCountByKind.set(kind, count - 1)
      else openCountByKind.delete(kind)
      for (const [listener, ignored] of [...idleListeners]) {
        if (!ignored.includes(kind) && isIdle(ignored)) listener()
      }
    },
    hasOpened: () => everOpened,
    isIdle,
    onIdle(listener, ignored = []) {
      idleListeners.set(listener, ignored)
      return () => {
        idleListeners.delete(listener)
      }
    },
    open(kind) {
      everOpened = true
      openCountByKind.set(kind, (openCountByKind.get(kind) ?? 0) + 1)
    },
  }
}

/**
 * Spec 189 T9.2, segunda leitura (N2): o comprovante é opcional, e o nome digitado sem anexo ficava
 * segurando o registro para sempre. Para quem autentica — a volta da rede e o "Entrar de novo" —
 * `proof-form` não conta: perder dois campos de texto custa menos que ficar sem sessão. A
 * atualização do SW continua respeitando tudo.
 */
const AUTHENTICATION_IGNORED_CAPTURES: readonly CaptureKind[] = ['proof-form']

export function createAuthenticationCaptureView(
  registry: Pick<CaptureRegistry, 'isIdle' | 'onIdle'>,
): Pick<CaptureRegistry, 'isIdle' | 'onIdle'> {
  return {
    isIdle: () => registry.isIdle(AUTHENTICATION_IGNORED_CAPTURES),
    onIdle: (listener) => registry.onIdle(listener, AUTHENTICATION_IGNORED_CAPTURES),
  }
}

export type IdleGate = Readonly<{
  /** `true` enquanto há uma ação esperando a última captura fechar. */
  isWaiting: () => boolean
  /** Roda agora se ocioso; senão guarda a ação e roda no `close` — uma vez, a mais recente. */
  request: (action: () => void) => 'deferred' | 'now'
}>

/**
 * O portão de quem navega a página (atualização do SW, "Entrar de novo"). Tocar duas vezes com a
 * captura aberta não empilha duas assinaturas de `onIdle`: a ação guardada é uma só.
 */
export function createIdleGate(registry: Pick<CaptureRegistry, 'isIdle' | 'onIdle'>): IdleGate {
  let pendingAction: (() => void) | undefined
  let unsubscribe: (() => void) | undefined

  function release(): void {
    unsubscribe?.()
    unsubscribe = undefined
    pendingAction = undefined
  }

  return {
    isWaiting: () => pendingAction !== undefined,
    request(action) {
      if (registry.isIdle()) {
        release()
        action()
        return 'now'
      }
      pendingAction = action
      unsubscribe ??= registry.onIdle(() => {
        const next = pendingAction
        release()
        next?.()
      })
      return 'deferred'
    },
  }
}

/**
 * Spec 189 T9.2 (A4): a captura fecha quando o componente desmonta, e o componente desmonta antes
 * de o que ele entregou chegar ao IndexedDB. `persisting` abre **na mesma volta síncrona** do
 * `onConfirm` — antes do `close` da captura, que só vem no commit do React — e fecha quando a
 * gravação termina, dando certo ou não. Sem isso, o SW novo recarregava no intervalo.
 */
export async function persistWhileOpen<TResult>(
  registry: Pick<CaptureRegistry, 'close' | 'open'>,
  task: () => Promise<TResult>,
): Promise<TResult> {
  registry.open('persisting')
  try {
    return await task()
  } finally {
    registry.close('persisting')
  }
}

/** O registro da página: um só, porque é a página inteira que navega. */
export const captureRegistry = createCaptureRegistry()
