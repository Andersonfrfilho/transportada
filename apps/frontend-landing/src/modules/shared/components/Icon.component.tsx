/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode, SVGProps } from 'react'

const ICON_PATHS: Readonly<Record<string, ReactNode>> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  map: (
    <>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21Z" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  package: (
    <>
      <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
      <path d="M3 7.5 12 12l9-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  phone: (
    <path d="M6.5 4h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2.2 2 18 18 0 0 1-15.3-15.3A2 2 0 0 1 6.5 4Z" />
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h7a3 3 0 0 0 3-3v-1a3 3 0 0 0-3-3H9a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h7" />
    </>
  ),
  'shield-check': (
    <>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  smartphone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  truck: (
    <>
      <rect x="2" y="7" width="13" height="10" rx="1" />
      <path d="M15 10h3.5L21 13v4h-6z" />
      <circle cx="7" cy="19" r="1.6" />
      <circle cx="17.5" cy="19" r="1.6" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M15 14.5h3" />
    </>
  ),
  x: (
    <>
      <path d="M5 5l14 14" />
      <path d="M19 5 5 19" />
    </>
  ),
}

export type IconName = keyof typeof ICON_PATHS

type IconProps = SVGProps<SVGSVGElement> & Readonly<{ name: IconName }>

export function Icon({ name, ...svgProps }: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width="24"
      {...svgProps}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
