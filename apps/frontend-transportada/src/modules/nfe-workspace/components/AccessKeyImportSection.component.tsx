/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'

import type { KeyReaderFieldHandle } from '@/components/ui/key-reader-field'

import { useAccessKeyImport } from '../hooks/useAccessKeyImport.hook'
import { AccessKeyImportPanel } from './AccessKeyImportPanel.component'

type AccessKeyImportSectionProps = Readonly<{ onOpenDocument: (documentId: string) => void }>

/** Monta a fila só enquanto a origem "Busca por chave" está aberta: fechar a origem para o polling. */
export function AccessKeyImportSection({ onOpenDocument }: AccessKeyImportSectionProps) {
  const readerRef = useRef<KeyReaderFieldHandle>(null)
  const importer = useAccessKeyImport({ refocusReader: () => readerRef.current?.focus() })

  return (
    <AccessKeyImportPanel
      importer={importer}
      onOpenDocument={onOpenDocument}
      readerRef={readerRef}
    />
  )
}
