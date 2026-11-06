/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AccessKeyLookupClient } from './accessKeyLookupClient.service'
import type { AccessKeyLookupRow } from './accessKeyLookupRow.service'
import type { QueueScheduler } from './accessKeyLookupScheduler.service'

export type AddAccessKeyResult = Readonly<{ alreadyScanned: boolean }>

export type RestoredAccessKey = Readonly<{
  accessKey: string
  lookupId: null | string
  wasRegistered: boolean
}>

export type AccessKeyLookupQueue = Readonly<{
  add: (accessKey: string) => AddAccessKeyResult
  /** Esvazia a lista da tela: relógios e respostas em voo são descartados; nada é apagado no servidor. */
  clear: () => void
  getRows: () => readonly AccessKeyLookupRow[]
  /** Recarrega a lista guardada pela tela: só a chave e os ids, o estado vem de novo do servidor. */
  restore: (entries: readonly RestoredAccessKey[]) => void
  /** Depois do envio do XML: confere o cadastro da chave e vira "pronta" se a nota já entrou. */
  recheck: (accessKey: string) => Promise<boolean>
  markXmlImported: (accessKey: string, documentId: string) => void
  retry: (accessKey: string) => void
  /** Retoma o que ficou pendente quando a tela volta; sem efeito se a fila já está ativa. */
  start: () => void
  /** A tela fechou: cancela relógios e descarta respostas em voo, mantendo as linhas. */
  stop: () => void
  subscribe: (listener: () => void) => () => void
}>

export type AccessKeyLookupQueueOptions = Readonly<{
  client: AccessKeyLookupClient
  scheduler?: QueueScheduler
}>
