/* Copyright (c) 2026 Ada Technology. MIT License. */

export const WORKSPACE_STORAGE_KEY = 'transportada.workspace'

export type WorkspaceNavigator = Readonly<{
  dispatchPopState: () => void
  pushPath: (path: string) => void
  rememberWorkspace: (workspace: string) => void
}>

export function createBrowserWorkspaceNavigator(): WorkspaceNavigator {
  return {
    dispatchPopState: () => window.dispatchEvent(new PopStateEvent('popstate')),
    pushPath: (path) => window.history.pushState({}, '', path),
    rememberWorkspace: (workspace) =>
      window.sessionStorage.setItem(WORKSPACE_STORAGE_KEY, workspace),
  }
}
