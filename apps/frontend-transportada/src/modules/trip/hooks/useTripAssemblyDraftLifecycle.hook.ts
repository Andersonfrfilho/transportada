/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useRef, useState } from 'react'

import { DRAFT_DOCUMENTS_UNREACHABLE } from '../shared/tripAssemblyDraftRestore.service'
import {
  clearOtherScopeTripAssemblyDrafts,
  clearTripAssemblyDraft,
  readTripAssemblyDraft,
  resolveTripAssemblyDraftStorage,
  writeTripAssemblyDraft,
  type TripAssemblyDraftMode,
  type TripAssemblyDraftScope,
} from '../shared/tripAssemblyDraftStorage.service'

export const DRAFT_PHASE = {
  idle: 'idle',
  ready: 'ready',
  restoring: 'restoring',
  /** A busca de notas não respondeu: o rascunho fica guardado e **nada é gravado** até reler. */
  unreachable: 'unreachable',
} as const
type DraftPhase = (typeof DRAFT_PHASE)[keyof typeof DRAFT_PHASE]

/** A fase vale para **um** escopo: trocar de empresa ou usuário recomeça do `idle`. */
type ScopedPhase = Readonly<{ kind: DraftPhase; scopeKey: string | undefined }>

type TripAssemblyDraftLifecycleInput<TDraft> = Readonly<{
  /** O rascunho do estado atual — gravado a cada mudança. */
  draft: TDraft
  isDraft: (value: unknown) => value is TDraft
  isEmpty: (draft: TDraft) => boolean
  mode: TripAssemblyDraftMode
  /**
   * O operador mexeu antes da volta aplicar: o rascunho guardado é descartado e a próxima gravação o
   * substitui. ⚠️ O que só ele conhecia (a sugestão pedida) precisa ser encerrado aqui ou fica órfão.
   */
  onRestoreDiscarded?: (draft: TDraft) => void
  /** Zera o estado do dono: é o que a troca de escopo faz antes de restaurar o do escopo novo. */
  reset: () => void
  /** Relê o que o rascunho aponta e devolve **quem aplica** — aplicar é decidido aqui. */
  restore: (draft: TDraft) => Promise<(() => void) | typeof DRAFT_DOCUMENTS_UNREACHABLE>
  /**
   * Empresa e usuário. Só chega depois que a sessão **e** a frota carregaram: filtrar motorista e
   * veículo por uma frota ainda vazia apagaria a escolha que está voltando.
   */
  scope: TripAssemblyDraftScope | undefined
}>

/**
 * O ciclo do rascunho da montagem, comum ao manual e ao automático: restaurar uma vez por escopo,
 * gravar a cada mudança (o `<a href>` da frota recarrega sem avisar ninguém) e limpar.
 *
 * ⚠️ **A restauração não atropela o operador.** Se ele mexeu enquanto as notas eram relidas, o que
 * voltou é descartado e vale o que ele fez — e a gravação seguinte substitui o rascunho antigo.
 */
export function useTripAssemblyDraftLifecycle<TDraft>(
  input: TripAssemblyDraftLifecycleInput<TDraft>,
) {
  const [storage] = useState(resolveTripAssemblyDraftStorage)
  const [phase, setPhase] = useState<ScopedPhase>({ kind: DRAFT_PHASE.idle, scopeKey: undefined })
  const [isUnsaved, setIsUnsaved] = useState(false)
  const companyId = input.scope?.companyId
  const userId = input.scope?.userId
  /** Identidade estável: o escopo chega como objeto novo a cada render. */
  const scope = useMemo(
    () => (companyId === undefined || userId === undefined ? undefined : { companyId, userId }),
    [companyId, userId],
  )
  const scopeKey = scope === undefined ? undefined : `${scope.companyId}:${scope.userId}`
  const startedScopeKeyRef = useRef<string | undefined>(undefined)
  const generationRef = useRef(0)
  const isTouchedRef = useRef(false)
  /** O dono passa funções e rascunho novos a cada render; os efeitos leem sempre os últimos. */
  const latestRef = useRef(input)
  useEffect(() => {
    latestRef.current = input
  })
  /** O rascunho lido na volta — é ele que "Tentar novamente" relê quando a busca falhou. */
  const storedRef = useRef<TDraft | undefined>(undefined)

  async function runRestore(
    request: Readonly<{ draft: TDraft; generation: number; scopeKey: string | undefined }>,
  ): Promise<void> {
    setPhase({ kind: DRAFT_PHASE.restoring, scopeKey: request.scopeKey })
    let next: DraftPhase = DRAFT_PHASE.ready
    try {
      const apply = await latestRef.current.restore(request.draft)
      if (request.generation !== generationRef.current) return
      if (apply === DRAFT_DOCUMENTS_UNREACHABLE) next = DRAFT_PHASE.unreachable
      else if (isTouchedRef.current) latestRef.current.onRestoreDiscarded?.(request.draft)
      else apply()
    } catch {
      /** Volta que falha deixa o formulário como está: vazio é melhor que preso em "retomando". */
    }
    if (request.generation === generationRef.current) {
      setPhase({ kind: next, scopeKey: request.scopeKey })
    }
  }

  useEffect(() => {
    if (scope === undefined || startedScopeKeyRef.current === scopeKey) return
    const isScopeSwitch = startedScopeKeyRef.current !== undefined
    startedScopeKeyRef.current = scopeKey
    generationRef.current += 1
    const generation = generationRef.current
    /**
     * ⚠️ Só a troca de escopo esquece o toque. Na primeira volta o operador pode ter mexido enquanto a
     * frota carregava — e esse toque vale: a restauração não aplica por cima.
     */
    if (isScopeSwitch) {
      isTouchedRef.current = false
      latestRef.current.reset()
    }
    clearOtherScopeTripAssemblyDrafts({ scope, storage })
    const { isDraft, mode } = latestRef.current
    const stored = readTripAssemblyDraft({ isDraft, mode, now: Date.now(), scope, storage })
    storedRef.current = stored
    if (stored === undefined) {
      setPhase({ kind: DRAFT_PHASE.ready, scopeKey })
      return
    }
    void runRestore({ draft: stored, generation, scopeKey })
  }, [scope, scopeKey, storage])

  const serializedDraft = JSON.stringify(input.draft)
  useEffect(() => {
    if (phase.kind !== DRAFT_PHASE.ready || phase.scopeKey !== scopeKey || scope === undefined) {
      return
    }
    const { draft, isEmpty, mode } = latestRef.current
    if (isEmpty(draft)) {
      clearTripAssemblyDraft({ mode, scope, storage })
      setIsUnsaved(false)
      return
    }
    setIsUnsaved(!writeTripAssemblyDraft({ draft, mode, now: Date.now(), scope, storage }))
  }, [phase, scope, scopeKey, serializedDraft, storage])

  const isCurrentScope = phase.scopeKey === scopeKey

  return {
    /** Apagar também encerra uma volta pendente: não há mais o que reler. */
    clear: () => {
      if (scope === undefined) return
      clearTripAssemblyDraft({ mode: input.mode, scope, storage })
      storedRef.current = undefined
      generationRef.current += 1
      setPhase({ kind: DRAFT_PHASE.ready, scopeKey })
    },
    isRestoring: isCurrentScope && phase.kind === DRAFT_PHASE.restoring,
    /** As notas do rascunho não puderam ser relidas: ele continua guardado, e a tela oferece reler. */
    isUnreachable: isCurrentScope && phase.kind === DRAFT_PHASE.unreachable,
    retry: () => {
      const stored = storedRef.current
      if (stored === undefined || phase.kind !== DRAFT_PHASE.unreachable) return
      generationRef.current += 1
      void runRestore({ draft: stored, generation: generationRef.current, scopeKey })
    },
    /**
     * O rascunho guardado que a volta ainda não aplicou — relendo as notas ou sem rede para isso.
     * ⚠️ Quem apaga precisa dele: o que só ele conhece (a sugestão pedida) não está no estado ainda.
     */
    readUnrestored: (): TDraft | undefined =>
      isCurrentScope &&
      (phase.kind === DRAFT_PHASE.restoring || phase.kind === DRAFT_PHASE.unreachable)
        ? storedRef.current
        : undefined,
    /** A última gravação falhou (armazenamento bloqueado ou cheio): a tela avisa. */
    isUnsaved,
    /** O operador mexeu: uma restauração ainda a caminho não pode mais aplicar por cima. */
    markTouched: () => {
      isTouchedRef.current = true
    },
  }
}
