/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import styles from './icon.module.css'

export type IconName =
  | 'add'
  | 'alert'
  | 'arrow-down'
  | 'arrow-up'
  | 'calendar'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'close'
  | 'columns'
  | 'copy'
  | 'document'
  | 'download'
  | 'edit'
  | 'export'
  | 'eye'
  | 'eye-off'
  | 'filter'
  | 'filter-clear'
  | 'image'
  | 'invoice'
  | 'link'
  | 'logout'
  | 'menu'
  | 'page-first'
  | 'page-last'
  | 'page-next'
  | 'page-previous'
  | 'power'
  | 'refresh'
  | 'remove'
  | 'save'
  | 'search'
  | 'send'
  | 'shield'
  | 'sort'
  | 'spinner'
  | 'trash'
  | 'upload'
  | 'workspace-billing'
  | 'workspace-company-settings'
  | 'workspace-cte-batch'
  | 'workspace-cte-profiles'
  | 'workspace-fleet'
  | 'workspace-freight'
  | 'workspace-mdfe-manifest'
  | 'workspace-nfe'
  | 'workspace-nfse-invoice'
  | 'workspace-operations'
  | 'workspace-trip'

export type IconSize = 'md' | 'sm'

export type IconProps = {
  readonly className?: string
  readonly name: IconName
  readonly size?: IconSize
}

/** Traçados de 24×24, sem preenchimento: a cor vem do botão que hospeda o ícone. */
const ICON_PATHS: Readonly<Record<IconName, readonly string[]>> = {
  add: ['M12 5v14', 'M5 12h14'],
  alert: ['M12 3.5 2.7 19.5h18.6L12 3.5z', 'M12 10v4', 'M12 17h.01'],
  'arrow-down': ['M12 4v14', 'M6 12l6 6 6-6'],
  'arrow-up': ['M12 20V6', 'M6 12l6-6 6 6'],
  calendar: ['M8 3v4', 'M16 3v4', 'M4 7h16v14H4z', 'M4 11h16'],
  check: ['M5 13l4 4L19 7'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 18l6-6-6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  columns: ['M4 5h16v14H4z', 'M10 5v14', 'M15 5v14'],
  copy: ['M9 9h11v11H9z', 'M15 9V4H4v11h5'],
  document: ['M13 3H6v18h12V8z', 'M13 3v5h5', 'M9 13h6', 'M9 17h6'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  edit: ['M4 20h4L20 8l-4-4L4 16z', 'M14 6l4 4'],
  export: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 20h14'],
  eye: ['M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'eye-off': [
    'M3 3l18 18',
    'M10.6 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8',
    'M6.4 7.5A16.8 16.8 0 0 0 2 11s3.6 6 10 6a9.5 9.5 0 0 0 3.6-.7',
  ],
  filter: ['M4 5h16l-6 7v6l-4 2v-8L4 5z'],
  'filter-clear': ['M4 5h16l-6 7v6l-4 2v-8L4 5z', 'M15 15l5 5', 'M20 15l-5 5'],
  image: ['M4 5h16v14H4z', 'M4 16l4.5-4.5 3 3L15 11l5 5', 'M9.4 9.4a1 1 0 1 1-2 0 1 1 0 0 1 2 0z'],
  invoice: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6'],
  link: [
    'M9 15l6-6',
    'M13 5.5 15 3.5a3.5 3.5 0 0 1 5 5L18 10.5',
    'M11 18.5 9 20.5a3.5 3.5 0 0 1-5-5L6 13.5',
  ],
  logout: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 16l4-4-4-4', 'M14 12H4'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  'page-first': ['M17 6l-6 6 6 6', 'M7 6v12'],
  'page-last': ['M7 6l6 6-6 6', 'M17 6v12'],
  'page-next': ['M10 6l6 6-6 6'],
  'page-previous': ['M14 6l-6 6 6 6'],
  power: ['M12 4v8', 'M7.5 7a7 7 0 1 0 9 0'],
  refresh: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'],
  remove: ['M5 12h14'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7', 'M8 14h8v6H8z'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  send: ['M4 12l16-8-6 16-2.5-6.5L4 12z'],
  shield: ['M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z'],
  sort: ['M8 9l4-4 4 4', 'M8 15l4 4 4-4'],
  spinner: ['M12 3a9 9 0 1 0 9 9'],
  trash: ['M5 7h14', 'M10 7V4h4v3', 'M7 7l1 13h8l1-13'],
  upload: ['M12 20V9', 'M7 13l5-5 5 5', 'M5 4h14'],
  'workspace-billing': [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M12 7v10',
    'M15 9.5c-.7-1-1.7-1.5-3-1.5-1.7 0-3 1-.8 3 1.7 0 3 .8 3 2.5s-1.3 3-3 3c-1.3 0-2.3-.5-3-1.5',
  ],
  'workspace-company-settings': [
    'M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6l-7-3z',
    'M9 12l2 2 4-5',
  ],
  'workspace-cte-batch': ['M7 4h10v3h3v13H4V7h3z', 'M9 4h6', 'M8 11h8', 'M8 15h5'],
  'workspace-cte-profiles': ['M5 4h9l5 5v11H5z', 'M14 4v5h5', 'M8 13h8', 'M8 17h5', 'M9 9h2'],
  'workspace-fleet': [
    'M4 8h9v7H4z',
    'M13 10h4l3 3v2h-7z',
    'M8 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M17 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M12 5.5a2 2 0 1 0-4 0',
  ],
  'workspace-freight': [
    'M3 7h11v10H3z',
    'M14 10h4l3 3v4h-7z',
    'M7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M17 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  ],
  'workspace-mdfe-manifest': [
    'M4 6h11v9H4z',
    'M15 9h3l2 3v3h-5z',
    'M8 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M7 9h5',
    'M7 12h5',
  ],
  'workspace-nfe': ['M6 3h9l3 3v15H6z', 'M15 3v4h4', 'M9 11h6', 'M9 15h6'],
  'workspace-nfse-invoice': [
    'M6 3h9l3 3v15H6z',
    'M15 3v4h4',
    'M12 9v8',
    'M14 11h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-3',
  ],
  'workspace-operations': ['M4 18V6', 'M4 18h16', 'M8 15v-3', 'M12 15V8', 'M16 15v-6'],
  'workspace-trip': ['M4 17l4-10h8l4 10', 'M4 17h16v3H4z', 'M8 20v-3', 'M16 20v-3', 'M9 12h6'],
}

/** O tipo gerado para CSS Module devolve `string | undefined`; `cn` já lida com a ausência. */
const SIZE_CLASS: Readonly<Record<IconSize, string | undefined>> = {
  md: styles.sizeMd,
  sm: styles.sizeSm,
}

const SPINNING_ICONS: ReadonlySet<IconName> = new Set<IconName>(['spinner'])

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
