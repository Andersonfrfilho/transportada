/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const NFSE_STATUS_PULL_JOB = 'nfse.status.pull'

/** A prefeitura costuma responder em minutos; reconsultar antes disso só gasta chamada. */
export const NFSE_PENDING_RECHECK_MINUTES = 5

/** Falha de transporte ou resposta ilegível recua mais: o problema não é a nota. */
export const NFSE_DEFERRED_RECHECK_MINUTES = 30

/**
 * O recorte de um ciclo. A batida é de cinco minutos, e a rotina não pagina: o que sobrar do recorte
 * volta na batida seguinte, porque nota pendente não deixa de ser devida por ter ficado de fora.
 */
export const NFSE_STATUS_PULL_PAGE_SIZE = 50
