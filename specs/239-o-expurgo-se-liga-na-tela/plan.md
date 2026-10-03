# Plano — 239

## Ordem e por quê

1. **Banco e API primeiro** (tabela, índices, rotas). Gravar configuração que ninguém lê é inócuo: o
   worker velho continua desligado pela variável.
2. **Worker depois**, lendo a tabela pela junção. Contra o banco sem a tabela, ele falha seguro (a
   contagem de elegíveis lança `42P01` e o ciclo falha inteiro, nada apagado).
3. **Painel por último**, só com o worker novo no ar — senão a tela diria "ligado" para um worker que
   ainda obedece à variável. **Gate B:** o job do painel não espera o worker (`deploy.yml:266-289`);
   pushes separados (worker antes do painel) ou confirmar o worker no ar antes de alguém ligar.
   **Gate A:** antes do deploy, `TRIP_LOCATION_PURGE_ENABLED` não pode estar `true` em nenhum worker.

## API (`apps/api-transportada`)

| Peça             | Arquivo (novo, salvo indicação)                                                                                                                                                                                                                                  | Molde                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Schema           | `src/database/company-location-retention-settings.schema.ts` + export em `database.schema.ts`                                                                                                                                                                    | `company-driver-allowance-settings.schema.ts:17-37`                                                |
| Índices parciais | em `src/database/trip.schema.ts`, um por tabela: `(company_id, <tempo>) WHERE latitude IS NOT NULL`                                                                                                                                                              | `trip.schema.ts:1281-1283`                                                                         |
| Migration        | `drizzle/<timestamp>_location_retention_settings/{migration.sql,rollback.sql,snapshot.json}`                                                                                                                                                                     | `drizzle/20260917034547_driver_daily_allowance/`                                                   |
| Domínio          | `src/companies/domain/location-retention.policy.ts` (`resolvePurgeEffectiveAt`, limites 30–90, carência 24 h) + `location-retention.constant.ts`                                                                                                                 | `trips/domain/daily-allowance.policy.ts`                                                           |
| Port/repositório | `src/companies/application/location-retention-settings.port.ts`, `src/companies/infrastructure/drizzle-location-retention-settings.repository.ts` (upsert `onConflictDoUpdate`, audit na **mesma** transação, contagem de impacto com `LIMIT 100001` por tabela) | `drizzle-driver-allowance-settings.repository.ts:45-88` + `trip-field-office-audit.persistence.ts` |
| Use cases        | `src/companies/application/location-retention-settings.use-case.ts` (`get`, `save`, `clear`, `readImpact`)                                                                                                                                                       | `driver-allowance-settings.use-case.ts`                                                            |
| Rotas e Zod      | `src/companies/presentation/location-retention-settings.{routes,schema}.ts`; caminho em `src/shared/api.constant.ts`; montagem em `src/main.ts`                                                                                                                  | `driver-allowance-settings.routes.ts`, `.schema.ts`                                                |
| Testes           | `test/companies/location-retention-settings.contract.ts` (entrypoint existente), `test/integration/location-retention-settings.integration.ts` (+ lista do `package.json`), `test/database-migration/location-retention-rollback.assertion.ts`                   | `test/companies/driver-allowance-settings.contract.ts`, `driver-allowance-rollback.assertion.ts`   |

### A carência (D5), como função pura

```
resolvePurgeEffectiveAt({ before, after, now }):
  !after.purgeEnabled                                   → before?.purgeEffectiveAt ?? null  (não importa)
  after.purgeEnabled && !before?.purgeEnabled           → now + 24 h   (ligar)
  after.retentionDays < before.retentionDays            → now + 24 h   (encurtar ligado)
  senão                                                 → before.purgeEffectiveAt (alongar / igual)
```

Tabela de casos no contrato, com mutação em cada ramo.

### Contagem de impacto

Por tabela: `select count(*) from (select 1 from <t> where company_id = $c and latitude is not null and
<tempo> < $now - make_interval(days => $d) limit 100001) x`. Índice do D1 atende. Resposta:
`{ data: { byTable: [{ kind: 'stop_event'|'delivery_proof'|'status_event'|'stop_occurrence'|'document_occurrence', count, capped }] } }`
— `kind` estável, nunca o nome da tabela (nome de tabela é detalhe interno, `apis.md`).

## Worker (`apps/worker-transportada`)

- `src/database/company-location-retention-settings.schema.ts` (cópia por valor) e `companyId` nas cinco
  tabelas de `src/database/trip-execution.schema.ts`; o contrato de paridade cobre as duas.
- `drizzle-trip-location.repository.ts`: os cinco redatores viram um `UPDATE` único com
  `CROSS JOIN LATERAL` (forma da spec D2) e o corte por `make_interval(days => s.retention_days)`,
  recebendo `now` em vez de `before`, com `$now::timestamptz` (cópia worker de `timestamptzParameter`,
  em `src/database/`). Sem `FOR UPDATE SKIP LOCKED`.
- Port (`trip-location.port.ts`): `{ before, limit }` → `{ now, limit }`.
- Novo port `CountEligibleCompanies` (uma consulta: `count(*)::int` de configurações ligadas e vigentes,
  com o **mesmo `now`** dos redatores), para o desvio `trip_location_purge_disabled` (RF6) e o contador
  `companies` do log (RF7). Ordem do ciclo: `purgeStalePings` → contagem → redatores.
- Rotina: sai `enabled`; o desvio passa a ser "elegíveis = 0". `resolveRetentionCutoff` e
  `TRIP_LOCATION_RETENTION_DAYS` saem (o prazo vem da linha); o limite 30–90 fica **só** no banco e na
  API — o worker obedece ao que está gravado, e o CHECK garante o intervalo.
- `config/environment.schema.ts`, `shared/worker.types.ts`, `main.ts`, `.env.example`: sai
  `TRIP_LOCATION_PURGE_ENABLED`.
- Testes: `test/trip-location-purge/*.contract.ts` — `disabled-switch.contract.ts` (vira "sem empresa
  elegível" contando chamadas e "chave sobrando é ignorada"), `purge.contract.ts` (sai
  `resolveRetentionCutoff`/`before`), `stale-pings.contract.ts:60` (compara 36 h com o piso de 30 dias),
  `batch-ceiling` e `table-isolation` (perdem `enabled: true`), `schema-parity` e `stamped-tables`;
  integração em `test/trip-location-purge.integration.test.ts` (já está no `test:integration`) com cinco
  empresas nas cinco tabelas (CA6) e `EXPLAIN`; `make worker-integration`.

## Painel (`apps/frontend-transportada`)

- `companySettingsTabs.service.ts`: `locationRetention` em `SETTINGS_PANELS`,
  `'locationRetentionSettings'` em `SettingsDataSource`, endereço
  `{ module: 'trip', source: 'locationRetentionSettings', tab: 'location' }`.
- `TripWorkspace.page.tsx`: `TripTabId` ganha `'location'`; `TRIP_TABS = ['trips', 'proof', 'location']`;
  query habilitada só com a aba aberta e a permissão (o `enabled` composto da 041).
- `src/modules/trip/components/TripLocationRetentionPanel.component.tsx` + `.module.css`;
  `TripLocationRetentionConfirmDialog.component.tsx` (via `useModalDialog`, como os diálogos do módulo);
  `queries/useLocationRetentionSettings.query.ts`; `shared/locationRetentionClient.service.ts`;
  `shared/locationRetention.validation.ts`.
- Locales: `trip.locale.json` / `trip.en.locale.json` — `tabs.location`, bloco `locationRetention`,
  e a troca do texto "90 dias" do D8 (`:856-857,899`).
- Testes: `test/trip/location-retention-panel.contract.ts` (+ entrypoint e lista do `package.json`),
  `test/company-settings/tabs.contract.ts` (endereço novo), smoke de prints
  `test/spec-239-prints.smoke.spec.ts` no molde de `test/spec-220-prints.smoke.spec.ts`.

### Desenho da tela

Mesmo cartão do painel do Comprovante (`TripDeliveryProofSettingsPanel`), de cima para baixo:

1. Cabeçalho: título "Posição dos eventos" e selo mono maiúsculo (`DESLIGADO` neutro, `LIGADO` cobre,
   `A PARTIR DE 04/10 14:20` cobre contornado).
2. Texto de LGPD (D5), uma vez, em texto secundário.
3. Interruptor "Apagar a posição depois do prazo" + campo numérico "Prazo (dias)" 30–90 com ajuda
   "entre 30 e 90". Botões: "Salvar" (primário) e "Voltar ao padrão" (secundário, só com `origin: 'company'`).
4. Duas linhas fixas, informativas: "Rastro ao vivo: apagado depois de 36 h, sempre." e "Mensagens do
   WhatsApp seguem regra própria."
5. Confirmação (diálogo): número por tipo de evento, frase "Apagar é definitivo", data da carência,
   botões "Cancelar" e "Ligar e apagar N pontos" (destrutivo, `--color-alert`).

Em 375 px: campo e botões empilham, botões em largura total, alvo ≥ 44 px.

## Docs

- `docs/SECURITY.md`: o achado de 2026-10-02 passa de "ligar a variável" para "ligar na tela", com a
  carência; pendência nova da coordenada do transcript do WhatsApp (D9).
- `docs/adr/0081-*.md`: emenda curta — o interruptor virou configuração por empresa (196 D11 → 239).
- `apps/worker-transportada/CLAUDE.md` § "O expurgo de posição", `docs/ai-context/worker-transportada.md:256`,
  `apps/api-transportada/CLAUDE.md` e `apps/frontend-transportada/CLAUDE.md` § "Configuração perto do
  efeito" (painel novo na aba Localização).

## Riscos de execução

- **Migration com índices em transação** trava escrita nas cinco tabelas pelo tempo do `CREATE INDEX`
  (`SHARE` até o `COMMIT`: leitura segue, escrita do motorista espera). A produção está atrás do schema, e
  o migrador aplica todas as pendentes numa transação: as migrations da 196 (`20261001123700`,
  `20261002153258`, `20261003010806`) tomam `ACCESS EXCLUSIVE` nas mesmas tabelas. **Pré-condições de
  deploy em produção:** (1) medir `pg_total_relation_size` das cinco tabelas em produção; (2) promover as
  migrations da 196 em deploy **separado, antes** da 239; (3) aplicar fora do horário de campo; (4)
  considerar `statement_timeout` por índice. `lock_timeout` limita a espera pelo lock, não a construção.
  Detalhe em `evidence.md` (M3).
- **Snapshot do drizzle colide** com migration de outra sessão: conferir `origin/staging` e
  `db:generate` = `no_changes` antes do push (memória "numeração e migrations no rebase").
- **`toEqual` exato do contrato de ambiente** do worker reprova a remoção da chave — é acerto; ajustar a
  expectativa, nunca afrouxar.
