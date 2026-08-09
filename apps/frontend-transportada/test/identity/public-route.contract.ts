/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('first access public route contract', () => {
  test('renders the first-access page before Keycloak initializes, for its own path', async () => {
    const main = await readModule('src/main.tsx')

    const bootstrapFunction = main.slice(main.indexOf('async function bootstrapApplication'))
    const pathCheckIndex = bootstrapFunction.indexOf("'/primeiro-acesso'")
    const keycloakInitIndex = bootstrapFunction.indexOf('await initializeKeycloakAuth()')

    expect(main).toContain('FirstAccessPage')
    expect(pathCheckIndex).toBeGreaterThan(-1)
    expect(keycloakInitIndex).toBeGreaterThan(-1)
    expect(pathCheckIndex).toBeLessThan(keycloakInitIndex)
    expect(bootstrapFunction.slice(0, keycloakInitIndex)).toContain('return')
  })
})
