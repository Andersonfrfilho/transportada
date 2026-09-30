/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/driverTrip.module.css'

const HISTORY_MARKER_KEY = 'proofImageLightbox'

type ProofImageLightboxProps = Readonly<{
  alt: string
  onClose: () => void
  src: string
}>

function hasHistoryMarker(): boolean {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && HISTORY_MARKER_KEY in state
}

/**
 * Pedido do usuário (25/09, spec 207): "cadê opção de abrir imagem" — a miniatura do canhoto (foto
 * ou assinatura) abre em tela cheia. Diálogo modal (`useModalDialog`, cópia por valor do painel):
 * foco preso, Esc fecha, e devolve o foco à miniatura ao desmontar. Fecha também no toque fora e no
 * botão voltar do Android — para o botão físico não navegar a app inteira para fora da tela.
 */
export function ProofImageLightbox({ alt, onClose, src }: ProofImageLightboxProps) {
  const { t } = useTranslation('driverTrip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })

  // O efeito do histórico é por montagem; `onClose` muda de identidade a cada render do cartão.
  const onCloseRef = useRef(onClose)
  const pendingUndoRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /**
   * O botão voltar do Android dispara `popstate`, nunca um evento de UI — sem isto ele saía da app
   * inteira. Uma entrada de histórico "reserva" o gesto: o toque explícito (Esc, fora, "Fechar")
   * também a desfaz, para não sobrar uma entrada morta que peça um segundo "voltar" depois.
   *
   * Desfazer na limpeza do efeito, porém, não serve: sob `StrictMode` o React monta, limpa e monta
   * de novo, e o `popstate` do `back()` chega depois da remontagem — fechando o diálogo no mesmo
   * toque que o abriu. Medido na página do painel (spec 220), sobre esta mesma cópia. O desfazer
   * espera uma tarefa, e a remontagem o cancela; só a saída de verdade chega a executá-lo.
   */
  useEffect(() => {
    if (pendingUndoRef.current === undefined) {
      window.history.pushState({ [HISTORY_MARKER_KEY]: true }, '')
    } else {
      clearTimeout(pendingUndoRef.current)
      pendingUndoRef.current = undefined
    }

    function handlePopState(): void {
      onCloseRef.current()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      pendingUndoRef.current = setTimeout(() => {
        pendingUndoRef.current = undefined
        if (hasHistoryMarker()) window.history.back()
      })
    }
  }, [])

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
