/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext } from 'react'

import type { UseAccessKeyLookupQueueInput } from '@/modules/nfe-access-key-lookup/hooks/useAccessKeyLookupQueue.hook'

import type { ScannedNfeDocument } from '../shared/trip.types'

/** Só os testes trocam a fila de busca, o cadastro e o envio de XML: em produção o contexto fica vazio. */
export type BippedNotesOverrides = Readonly<{
  findDocument?: (accessKey: string) => Promise<null | ScannedNfeDocument>
  lookup?: UseAccessKeyLookupQueueInput
  uploadXml?: (file: File) => Promise<void>
}>

export const BippedNotesOverridesContext = createContext<BippedNotesOverrides>({})
