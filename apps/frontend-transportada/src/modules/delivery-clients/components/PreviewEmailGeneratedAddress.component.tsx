/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'

import type { GeneratedInboundAddress } from '../shared/previewEmail.types'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'

type PreviewEmailGeneratedAddressProps = Readonly<{
  generated: GeneratedInboundAddress
  onClose: () => void
}>

/**
 * O endereço completo aparece aqui UMA vez (`security.md` §4): o servidor guarda só o hash. O valor vive na
 * memória do componente — nunca em `localStorage`, URL, log ou telemetria — e fechar o painel o apaga.
 */
export function PreviewEmailGeneratedAddress({
  generated,
  onClose,
}: PreviewEmailGeneratedAddressProps): JSX.Element {
  const { t } = useTranslation('previewEmail')
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)

  /** O endereço acabou de aparecer: o foco vai até ele, para o leitor de tela anunciar o aviso junto. */
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <section
      aria-labelledby={titleId}
      className={previewStyles.generated}
      ref={panelRef}
      tabIndex={-1}
    >
      <h5 id={titleId}>{t('generated.title')}</h5>
      <div className={previewStyles.addressRow}>
        <code className={previewStyles.address}>{generated.address}</code>
        <CopyButton
          copiedLabel={t('generated.copied')}
          label={t('generated.copy')}
          value={generated.address}
        />
      </div>
      <p className={previewStyles.warning}>{t('generated.warning')}</p>
      <p className={styles.hint}>{t('generated.next')}</p>
      <div className={styles.actions}>
        <Button onClick={onClose} type="button" variant="secondary">
          {t('generated.close')}
        </Button>
      </div>
    </section>
  )
}
