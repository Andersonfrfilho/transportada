/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/driverTrip.module.css'

type ProofImageLightboxProps = Readonly<{
  alt: string
  onClose: () => void
  src: string
}>

/**
 * Pedido do usuário (25/09, spec 207): "cadê opção de abrir imagem" — a miniatura do canhoto (foto
 * ou assinatura) abre em tela cheia. Diálogo modal (`useModalDialog`, cópia por valor do painel):
 * foco preso, Esc fecha, e devolve o foco à miniatura ao desmontar. Fecha também no toque fora e no
 * botão voltar do Android — para o botão físico não navegar a app inteira para fora da tela.
 */
export function ProofImageLightbox({ alt, onClose, src }: ProofImageLightboxProps) {
  const { t } = useTranslation('driverTrip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })

  /**
   * O botão voltar do Android dispara `popstate`, nunca um evento de UI — sem isto ele saía da app
   * inteira. Uma entrada de histórico "reserva" o gesto: o toque explícito (Esc, fora, "Fechar")
   * também a desfaz, para não sobrar uma entrada morta que peça um segundo "voltar" depois.
   */
  useEffect(() => {
    window.history.pushState({ proofImageLightbox: true }, '')

    function handlePopState(): void {
      onClose()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      if ((window.history.state as { proofImageLightbox?: boolean } | null)?.proofImageLightbox === true) {
        window.history.back()
      }
    }
  }, [onClose])

  return (
    <div
      aria-label={alt}
      aria-modal="true"
      className={styles.imageLightboxBackdrop}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className={styles.imageLightboxFrame} onClick={(event) => event.stopPropagation()}>
        <img alt={alt} className={styles.imageLightboxImage} src={src} />
        <Button onClick={onClose} type="button" variant="ghost">
          <Icon name="close" />
          {t('proofCapture.close')}
        </Button>
      </div>
    </div>
  )
}
