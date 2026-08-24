/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Uma batida por vez na instalação inteira. A chave é do relógio, não de uma rotina: duas batidas
 * concorrentes leriam a mesma janela vencida e abririam a mesma execução duas vezes — o índice
 * parcial recusaria a segunda, mas só depois de a primeira já ter avançado a janela.
 */
export const JOB_TICK_LOCK_KEY = 'cron:job-tick'

/** A rota do trilho que o worker consome. O nome viaja na topologia e no envelope. */
export const JOB_RUN_QUEUE_ROUTE = 'job-run.v1'

export const JOB_RUN_EVENT_TYPE = 'transportada.job.run.requested'

/**
 * O que o invólucro do ciclo grava quando a publicação em si falha. Execução aberta e nunca fechada
 * é rotina travada para sempre: o `409` do botão a recusaria sem que nada estivesse correndo.
 */
export const JOB_TICK_PUBLISH_FAILURE_OUTCOME = 'unexpected_error'

/**
 * Quinze minutos. É o prazo de **retirada**: execução aberta que ninguém reivindicou nesse tempo é
 * mensagem que morreu no caminho — dead-letter depois das três tentativas, ou rota que não existe.
 * Ela não tem lease para vencer, e sem este piso ficaria aberta para sempre, travando a rotina e
 * fazendo o botão recusar com 409 sem que nada estivesse correndo.
 *
 * Folgado de propósito: três batidas e as três tentativas do trilho cabem dentro dele, então fila
 * apenas lenta não perde a execução.
 */
export const JOB_EXECUTION_PICKUP_GRACE_SECONDS = 900

/** O que a varredura grava. O processo morreu no meio, e ninguém está mais correndo aquela linha. */
export const JOB_EXECUTION_ABANDONED_OUTCOME = 'abandoned'
