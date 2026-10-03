/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

type ContractorDirectoryPanelProps = Readonly<{ canManage: boolean }>

export function ContractorDirectoryPanel({
  canManage,
}: ContractorDirectoryPanelProps): JSX.Element | null {
  void canManage
  return null
}
