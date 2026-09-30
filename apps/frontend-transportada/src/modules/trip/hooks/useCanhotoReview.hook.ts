/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.13: o disparo da conferência automática do canhoto. A leitura sincroniza com sistema
 * externo (rede, decodificação), por isso é efeito. O leitor e o prazo entram pelo parâmetro.
 */
import { useEffect, useRef, useState } from 'react'

import type { CanhotoReviewOutcome } from '@/modules/trip/shared/canhotoReview.service'
import type { DeliveryProof } from '@/modules/trip/shared/deliveryProof.service'

export type ReadCanhotoParams = Readonly<{ accessKey: string; proofId: string }>

export type UseCanhotoReviewParams = Readonly<{
  accessKey: string | undefined
  deadlineMs: number
  // O `review` do veredito nunca vai no corpo do PATCH automático: a rota é `.strict()` e devolve 400.
  onRead: (outcome: CanhotoReviewOutcome) => void
  proof: Pick<DeliveryProof, 'canhotoReadSource' | 'canhotoReview' | 'id' | 'kind'>
  readCanhoto: (params: ReadCanhotoParams) => Promise<CanhotoReviewOutcome>
}>

export type UseCanhotoReviewResult = Readonly<{ isAutomaticReviewUnavailable: boolean }>

const DEADLINE_EXCEEDED = Symbol('canhoto-review-deadline')

function waitForDeadline(deadlineMs: number): {
  cancel: () => void
  expired: Promise<typeof DEADLINE_EXCEEDED>
} {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE_EXCEEDED), deadlineMs)
  })
  return { cancel: () => clearTimeout(timer), expired }
}

export function useCanhotoReview(params: UseCanhotoReviewParams): UseCanhotoReviewResult {
  const { accessKey, proof } = params
  const [unavailableProofId, setUnavailableProofId] = useState<string | undefined>(undefined)
  const startedProofIds = useRef<Set<string>>(new Set())
  const latestParams = useRef(params)

  // Escrever a ref em efeito, não em render: render descartado pelo modo concorrente não pode
  // deixar para trás parâmetro que nunca entrou em tela.
  useEffect(() => {
    latestParams.current = params
  })

  const isEligible =
    proof.kind === 'photo' &&
    proof.canhotoReview === 'pending' &&
    proof.canhotoReadSource === undefined

  useEffect(() => {
    if (!isEligible || accessKey === undefined) return undefined
    if (startedProofIds.current.has(proof.id)) return undefined
    startedProofIds.current.add(proof.id)

    const proofId = proof.id
    let isListening = true
    const { cancel, expired } = waitForDeadline(latestParams.current.deadlineMs)
    const reading = latestParams.current.readCanhoto({ accessKey, proofId })

    async function settle(): Promise<void> {
      try {
        const outcome = await Promise.race([reading, expired])
        if (!isListening) return
        if (outcome === DEADLINE_EXCEEDED) setUnavailableProofId(proofId)
        else latestParams.current.onRead(outcome)
      } catch {
        if (isListening) setUnavailableProofId(proofId)
      } finally {
        cancel()
      }
    }
    void settle()

    return () => {
      isListening = false
      cancel()
    }
  }, [accessKey, isEligible, proof.id])

  return { isAutomaticReviewUnavailable: unavailableProofId === proof.id }
}
