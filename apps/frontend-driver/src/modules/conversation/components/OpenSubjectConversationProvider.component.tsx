/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext, useContext, type ReactNode } from 'react'

const OpenSubjectConversationContext = createContext(false)

type OpenSubjectConversationProviderProps = Readonly<{
  children: ReactNode
  isEnabled: boolean
}>

/** Liga o "Falar com o escritório" nas notas lá embaixo; sem a provider (ou desligada) o cartão não muda. */
export function OpenSubjectConversationProvider({
  children,
  isEnabled,
}: OpenSubjectConversationProviderProps) {
  return (
    <OpenSubjectConversationContext.Provider value={isEnabled}>
      {children}
    </OpenSubjectConversationContext.Provider>
  )
}

export function useIsOpenSubjectConversationEnabled(): boolean {
  return useContext(OpenSubjectConversationContext)
}
