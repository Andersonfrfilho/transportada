/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoArrivalGroup } from '../shared/cargoArrival.types'
import { findDocumentByScannedText } from '../shared/cargoArrivalGroups.service'

export type ScanResult =
  | Readonly<{ kind: 'found'; number: string }>
  | Readonly<{ kind: 'notFound' }>

export type SeparationScannerController = Readonly<{
  close: () => void
  isOpen: boolean
  open: () => void
  result: ScanResult | undefined
  submit: (scanned: string) => void
}>

type SeparationScannerParams = Readonly<{
  groups: readonly CargoArrivalGroup[]
  /** A nota achada vira a busca: a tela abre o grupo dela e mostra só ela. */
  onFound: (number: string) => void
}>

/** A leitura da chave de acesso pela câmera: achou nesta chegada, fecha o leitor; senão avisa e segue lendo. */
export function useSeparationScanner({
  groups,
  onFound,
}: SeparationScannerParams): SeparationScannerController {
  const [isOpen, setIsOpen] = useState(false)
  const [result, setResult] = useState<ScanResult | undefined>(undefined)

  return {
    close: () => setIsOpen(false),
    isOpen,
    open: () => {
      setResult(undefined)
      setIsOpen(true)
    },
    result,
    submit: (scanned) => {
      const found = findDocumentByScannedText({ groups, scanned })
      if (found === undefined) {
        setResult({ kind: 'notFound' })
        return
      }
      onFound(found.number)
      setResult({ kind: 'found', number: found.number })
      setIsOpen(false)
    },
  }
}
