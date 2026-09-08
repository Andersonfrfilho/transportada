/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const MAKEFILE = readFileSync(new URL('../../../../Makefile', import.meta.url), 'utf8')
const RAILWAY = readFileSync(new URL('../../../../.railway/railway.ts', import.meta.url), 'utf8')
const API_RAILWAY_JSON = readFileSync(
  new URL('../../../../deploy/api/railway.json', import.meta.url),
  'utf8',
)

/**
 * **Ninguém aplica migration à mão** — nem no local, nem em deploy.
 *
 * ⚠️ O boot da aplicação **não** migra, e não deve: com réplicas subindo juntas, N processos
 * correriam a mesma migration ao mesmo tempo, e uma destrutiva rodaria sozinha num restart
 * automático, sem ninguém decidir. Quem migra é o alvo do Makefile no local e o `preDeployCommand`
 * em deploy — os dois com um dono e um momento claros.
 */
describe('as migrations não dependem de ninguém lembrar', () => {
  /**
   * ⚠️ Sem isto o defeito é **silencioso**: a coluna nova não existe, toda consulta da tabela quebra
   * na validação do cliente, e a tela mostra lista vazia com 200 na rede e nada no console. Medido
   * em 2026-09-08 com `fleet_drivers.secures_cargo` — a tela dizia "cadastre um motorista".
   */
  it('`make dev` aplica o que estiver pendente antes de subir os processos', () => {
    expect(MAKEFILE).toContain('dev: identity-bootstrap up migrate')
  })

  it('existe um alvo que só migra, e ele sobe o banco antes', () => {
    expect(MAKEFILE).toContain('migrate: postgres-up')
    expect(MAKEFILE).toContain('db:migrate')
  })

  /**
   * ⚠️ **O `preDeployCommand` é o que faz o deploy falhar sem publicar** quando a migration não
   * passa. Perdê-lo não quebra nada visível: a aplicação sobe, e só as consultas da tabela nova
   * quebram — em produção, no cliente. O `CLAUDE.md` registra que um `railway config pull` cru
   * devolve `config: {}` e o apaga em silêncio, e é por isso que ele é conferido nos dois arquivos.
   */
  it('o deploy migra antes de publicar, nos dois arquivos de configuração', () => {
    expect(API_RAILWAY_JSON).toContain(
      '"preDeployCommand": "bun src/database/pre-deploy.service.ts"',
    )
    expect(RAILWAY).toContain("preDeployCommand: ['bun src/database/pre-deploy.service.ts']")
  })
})
