/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ADR-0047 / spec 065 D2b: a autorização do CT-e é o **evento** que acende o manifesto. O gatilho é
 * opcional por desenho — instalação sem crachá continua emitindo MDF-e à mão, e a ausência da porta
 * é o desligado.
 */
export type MdfeAutoIssueTrigger = {
  /** Nunca lança: o CT-e já está autorizado, e nada aqui pode desfazer isso. */
  trigger(input: { readonly batchItemId: string; readonly companyId: string }): Promise<void>
}

export type TripByBatchItemPort = {
  /** `null` quando a nota do item não está em viagem nenhuma — o caso comum, e não é erro. */
  findTripId(input: {
    readonly batchItemId: string
    readonly companyId: string
  }): Promise<string | null>
}

export type AutomaticManifestApiPort = {
  issue(input: { readonly companyId: string; readonly tripId: string }): Promise<string>
}
