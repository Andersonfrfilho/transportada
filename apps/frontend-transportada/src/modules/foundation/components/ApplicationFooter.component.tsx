/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

const COPYRIGHT_HOLDER = 'Ada Technology'
const COPYRIGHT_HOLDER_URL = 'https://adatechnology.com.br'
const PRODUCT_NAME = 'TransportAdA'

export function ApplicationFooter(): ReactNode {
  const year = new Date().getFullYear()

  return (
    <footer className="application-footer">
      <span>
        © {year}{' '}
        {/* `noreferrer` também nega o `window.opener`: a aba do site não alcança a sessão daqui */}
        <a href={COPYRIGHT_HOLDER_URL} target="_blank" rel="noreferrer">
          {COPYRIGHT_HOLDER}
        </a>{' '}
        — {PRODUCT_NAME}
      </span>
    </footer>
  )
}
