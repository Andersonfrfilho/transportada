/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

const COPYRIGHT_HOLDER = 'Ada Technology'
const PRODUCT_NAME = 'TransportAdA'

export function ApplicationFooter(): ReactNode {
  const year = new Date().getFullYear()

  return (
    <footer className="application-footer">
      <span>
        © {year} {COPYRIGHT_HOLDER} — {PRODUCT_NAME}
      </span>
    </footer>
  )
}
