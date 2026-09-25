/* Cópia por valor de apps/frontend-transportada/src/components/ui/icon.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ Só os nomes que este app usa (ADR-0075 §7) — não o catálogo inteiro do painel. Ícone novo
 * usado por uma tela copiada entra aqui, com o mesmo traçado 24×24 do original.
 */
import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import styles from './icon.module.css'

export type IconName =
  | 'alert'
  | 'camera'
  | 'check'
  | 'chevron-down'
  | 'clipboard-list'
  | 'clock'
  | 'close'
  | 'copy'
  | 'document'
  | 'download'
  | 'link'
  | 'logout'
  | 'message'
  | 'printer'
  | 'refresh'
  | 'save'
  | 'trash'
  | 'upload'
  | 'workspace-driver-trip'
  | 'workspace-users'

export type IconSize = 'md' | 'sm'

export type IconProps = {
  readonly className?: string
  readonly name: IconName
  readonly size?: IconSize
}

/** Traçados de 24×24, sem preenchimento: a cor vem do botão que hospeda o ícone. */
export const ICON_PATHS: Readonly<Record<IconName, readonly string[]>> = {
  alert: ['M12 3.5 2.7 19.5h18.6L12 3.5z', 'M12 10v4', 'M12 17h.01'],
  camera: ['M4 8h4l2-3h4l2 3h4v11H4z', 'M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'],
  check: ['M5 13l4 4L19 7'],
  /** Só o gatilho de abrir/fechar: gira 180° via CSS quando a lista que ele controla está aberta. */
  'chevron-down': ['M6 9l6 6 6-6'],
  /** Prancheta com a lista: a contagem de notas do romaneio, ao lado do número. */
  'clipboard-list': ['M6 4h12v17H6z', 'M9 3h6v3H9z', 'M9 10h6', 'M9 14h4'],
  /** Relógio: o tempo que o roteiro leva, ao lado do número que o diz. */
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  copy: ['M9 9h11v11H9z', 'M15 9V4H4v11h5'],
  document: ['M13 3H6v18h12V8z', 'M13 3v5h5', 'M9 13h6', 'M9 17h6'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  link: [
    'M9 15l6-6',
    'M13 5.5 15 3.5a3.5 3.5 0 0 1 5 5L18 10.5',
    'M11 18.5 9 20.5a3.5 3.5 0 0 1-5-5L6 13.5',
  ],
  logout: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 16l4-4-4-4', 'M14 12H4'],
  /** Balão de conversa, com a ponta que aponta para quem fala: o vínculo de WhatsApp do perfil. */
  message: ['M4 5h16v11H9l-4 4v-4H4V5z'],
  /** A impressora: papel entrando por cima, corpo no meio, folha saindo por baixo. */
  printer: ['M6 8V4h12v4', 'M4 8h16v8H4z', 'M7 16h10v4H7z'],
  refresh: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7', 'M8 14h8v6H8z'],
  trash: ['M5 7h14', 'M10 7V4h4v3', 'M7 7l1 13h8l1-13'],
  upload: ['M12 20V9', 'M7 13l5-5 5 5', 'M5 4h14'],
  /** O volante: a tela de quem está com as mãos nele, e não a de quem monta a viagem. */
  'workspace-driver-trip': [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M12 3v6',
    'M4.5 16.5 9.9 13.5',
    'M19.5 16.5 14.1 13.5',
  ],
  'workspace-users': [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M3 20v-1.5C3 15.9 5.7 14 9 14s6 1.9 6 4.5V20',
    'M16 5.5a3 3 0 0 1 0 6',
    'M17.5 14c2 .6 3.5 2 3.5 4v2',
  ],
}

/** O tipo gerado para CSS Module devolve `string | undefined`; `cn` já lida com a ausência. */
const SIZE_CLASS: Readonly<Record<IconSize, string | undefined>> = {
  md: styles.sizeMd,
  sm: styles.sizeSm,
}

const SPINNING_ICONS: ReadonlySet<IconName> = new Set<IconName>([])

export function Icon({ className, name, size = 'md' }: IconProps): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        styles.icon,
        SIZE_CLASS[size],
        SPINNING_ICONS.has(name) ? styles.spinning : undefined,
        className,
      )}
      viewBox="0 0 24 24"
    >
      {ICON_PATHS[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  )
}
