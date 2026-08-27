/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ChangeEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useDocumentIntake } from '../hooks/useDocumentIntake.hook'
import type { DocumentIntakeResult } from '../shared/documentIntake.service'
import styles from '../styles/documentIntake.module.css'

const PDF_MEDIA_TYPE = 'application/pdf'

type DocumentIntakeDropZoneProps = Readonly<{
  onApply: (result: DocumentIntakeResult) => void
}>

/**
 * Spec 048: o operador solta o PDF e a ficha se preenche. O que o documento diz chega marcado; o que
 * ele não diz — e o motivo — fica escrito aqui, porque campo vazio sem explicação vira digitação de
 * novo.
 */
export function DocumentIntakeDropZone({ onApply }: DocumentIntakeDropZoneProps) {
  const { t } = useTranslation('documentIntake')
  const intake = useDocumentIntake(onApply)
  const [isDragging, setIsDragging] = useState(false)

  function handleFile(file: File | undefined): void {
    if (file === undefined) return
    void intake.read(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsDragging(false)
    handleFile(event.dataTransfer.files[0])
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    handleFile(event.target.files?.[0])
  }

  return (
    <div
      className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDrop={handleDrop}
    >
      <label className={styles.fileField}>
        <span>{t('title')}</span>
        <input accept={PDF_MEDIA_TYPE} type="file" onChange={handleChange} />
      </label>
      <p className={styles.hint}>{t('dropHint')}</p>
      <DocumentIntakeStatus result={intake.result} status={intake.status} />
    </div>
  )
}

type DocumentIntakeStatusProps = Readonly<{
  result: DocumentIntakeResult | null
  status: ReturnType<typeof useDocumentIntake>['status']
}>

function DocumentIntakeStatus({ result, status }: DocumentIntakeStatusProps) {
  const { t } = useTranslation('documentIntake')

  if (status === 'reading') return <p className={styles.status}>{t('reading')}</p>
  if (status === 'failed') {
    return (
      <p className={`${styles.status} ${styles.statusAlert}`} role="alert">
        {t('failed')}
      </p>
    )
  }
  if (result === null) return null
  if (result.kind === 'scanned') return <p className={styles.status}>{t('scanned')}</p>
  if (result.kind === 'ccmei') return <p className={styles.status}>{t('ccmei')}</p>
  /**
   * Lista **positiva**: só o CRLV chega ao resumo. Antes o encadeamento recusava `scanned` e
   * `unknown` e deixava passar todo o resto — quando o pacote aprendeu o CCMEI, um documento de
   * empresa passou a cair no ramo de sucesso e a tela dizia "reconhecido" com a lista de campos
   * vazia. Tipo novo no pacote agora vira "não reconhecido", que é a verdade até alguém decidir
   * o contrário.
   */
  if (result.kind !== 'crlv') return <p className={styles.status}>{t('unknown')}</p>

  return (
    <div className={styles.summary}>
      <p className={`${styles.status} ${styles.statusReady}`}>{t('recognized')}</p>
      <FilledFields fields={Object.keys(result.values)} />
      <Remarks remarks={result.remarks} />
    </div>
  )
}

function FilledFields({ fields }: Readonly<{ fields: readonly string[] }>) {
  const { t } = useTranslation('documentIntake')
  if (fields.length === 0) return null

  return (
    <>
      <p className={styles.summaryTitle}>{t('filledTitle')}</p>
      <ul>
        {fields.map((field) => (
          <li key={field}>{t(`field.${field}`)}</li>
        ))}
      </ul>
    </>
  )
}

function Remarks({ remarks }: Readonly<{ remarks: DocumentIntakeResult['remarks'] }>) {
  const { t } = useTranslation('documentIntake')
  if (remarks.length === 0) return null

  return (
    <>
      <p className={styles.summaryTitle}>{t('remarksTitle')}</p>
      <ul>
        {remarks.map((remark) => (
          <li className={styles.remark} key={`${remark.field}-${remark.reason}`}>
            {t(`field.${remark.field}`)} — {t(`reason.${remark.reason}`)}
          </li>
        ))}
      </ul>
    </>
  )
}
