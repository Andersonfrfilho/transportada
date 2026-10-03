# Tarefas — 239

> Nenhum `[NEEDS CLARIFICATION]` aberto: as escolhas reversíveis (D3 a variável some, D5 carência de 24 h,
> D6 prazo 30–90, D7 aba Localização em Viagens, D9 WhatsApp em spec própria) estão na spec com
> justificativa. **A T1.2 tem migration: parar e perguntar ao usuário antes de escrevê-la.**
> Cada task fecha com typecheck + testes da app + commit isolado, evidência em `evidence.md`.

## Modelo por fase

| Fase | Conteúdo                   | Modelo                                      | 🧠                                                                                  |
| ---- | -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | Banco e API                | `sonnet`                                    | T1.2 (migration) → `opus`, **parar e perguntar ao usuário antes**                   |
| 2    | Worker                     | `sonnet`                                    | T2.2 (junção por empresa, isolamento de tenant) → validar com `architect` em `opus` |
| 3    | Painel                     | `sonnet`                                    | —                                                                                   |
| 4    | Docs, revisão e publicação | `haiku` (T4.1–T4.3) · `opus` (T4.5 revisão) | —                                                                                   |

## Fase 1 — Banco e API

> 🤖 Modelo: `sonnet` (T1.2 é 🧠 — `opus`, e só depois do "ok" do usuário)

- [x] **T1.1** Contrato **antes**: `resolvePurgeEffectiveAt` em tabela (ligar, encurtar ligado, alongar,
      desligar, igual) e limites 30–90 — `test/companies/location-retention-policy.contract.ts`.
      Mutação em cada ramo.
- [x] **T1.2** 🧠 **PARAR E PERGUNTAR ao usuário antes.** (autorizado em 2026-10-03, aditiva) Migration aditiva
      `company_location_retention_settings` (D1) + cinco índices parciais `(company_id, tempo) WHERE
latitude IS NOT NULL`; `rollback.sql` que recusa com linha; asserção de rollback;
      `make migration-test`; `db:generate` = `no_changes`. Conferir colisão de timestamp/snapshot com
      `origin/staging`.
- [x] **T1.3** Contrato HTTP **antes** (CA1–CA5): `GET` padrão, `PUT` válido/inválido (29, 91, string,
      decimal, chave a mais), `DELETE` 204, `impact` com teto, `403` sem `settings.manage`, nenhuma
      coordenada/id/data na resposta.
- [x] **T1.4** Repositório, use cases, rotas, Zod `.strict()`, montagem no `main.ts`; auditoria **na
      transação** (D4) com IP em `metadata`. Integração contra Postgres
      (`bun --env-file=../../.env.test run test:integration`, arquivo novo na lista do `package.json`):
      gravação + `audit_logs` na mesma transação (falha simulada no audit desfaz a gravação), isolamento
      entre duas empresas no `impact`.
- [ ] **T1.5** Revisão da fase com `code-reviewer` em `opus` (passada separada).

## Fase 2 — Worker

> 🤖 Modelo: `sonnet` (T2.2 é 🧠 — validar o desenho da junção com `architect` em `opus` antes)

- [x] **T2.0** Correções 1–10 do parecer do architect aplicadas à spec/plan/tasks (docs).
- [x] **T2.1** Contrato de paridade **antes** (CA7): a cópia do worker tem `company_id` nas cinco tabelas e
      a tabela nova com as colunas que lê. `schema-parity.contract.ts`: estender a regex `COLUMN_LINE` a
      `boolean`/`integer`, contagem `toBe(24)` → 29, as três tabelas da 196 no segundo teste, parser por
      assinatura para a tabela nova (sem `updated_by_user_id`, sem `.default(...)`), mutação tirando
      `companyId` de uma cópia; `stamped-tables.contract.ts`: o bloco de cada tabela carimbada na API tem
      `companyId: uuid('company_id').notNull()` e `buildEventLocationCompanyIndex`/`_company_located_`.
- [x] **T2.2** 🧠 Redatores com `UPDATE` único `CROSS JOIN LATERAL` por empresa e corte por
      `retention_days` (D2); port `{ now, limit }`; `CountEligibleCompanies` no mesmo `now`. Integração com
      cinco empresas A–E nas cinco tabelas (CA6) e relógio injetado, cinco mutações;
      `EXPLAIN` (`SET LOCAL enable_seqscan = off`) conferindo o nome `*_company_located_*` e `company_id` no
      `Index Cond`, e `EXPLAIN` sem toggle no volume possível, registrados em `evidence.md`.
      `make worker-integration`. ⚠️ **Não rodou como escrito:** a integração do worker rodou na mesma receita
      do `make` (migrate + `test:integration`) num **banco descartável próprio**, não pelo alvo. Causa: o
      banco compartilhado `transportada_worker_integration` tem o journal de uma pasta de migration renumerada
      que não existe em nenhuma branch remota e não migra; precisa de `drop` + reprovisionamento por quem o
      administra (não foi tocado).
- [x] **T2.3** Remover `TRIP_LOCATION_PURGE_ENABLED` (D3, CA9): schema de ambiente, tipo, `main.ts`,
      `.env.example`, rotina; `disabled-switch.contract.ts` vira "sem empresa elegível" (CA8) contando
      **chamadas** (lista de redatores chamados = `[]`, pings chamados). Mutação no desvio.
- [ ] **T2.4** Revisão da fase com `code-reviewer` em `opus`.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Contrato **antes**: `tabs.contract.ts` com o endereço novo; `location-retention-panel.contract.ts`
      com os estados (carregando, erro, padrão, ligado, carência, salvando, sem permissão), a
      confirmação só ao ligar/encurtar (RF9), o botão destrutivo com o número, e o texto de LGPD.
- [x] **T3.2** Aba `location` em `TripWorkspace.page.tsx`, `TripLocationRetentionPanel`, diálogo de
      confirmação, query/cliente/validação, locales pt-BR e `en`. Design real do repo (tema escuro, cobre,
      cantos retos, rótulo mono) — ler `src/styles/index.css` e o `.module.css` do painel do Comprovante
      antes; nada de shadcn/Tailwind.
- [x] **T3.3** Linha do tempo sem "90 dias" no estado `expired` (D8, CA11), pt-BR e `en`.
- [x] **T3.4** Prova por mutação (tirar a confirmação, inverter a regra de carência na tela, tirar a
      permissão) e evidência.

## Fase 4 — Docs, revisão e publicação

> 🤖 Modelo: `haiku` (T4.1–T4.3), `opus` (T4.5)

- [x] **T4.1** `docs/SECURITY.md` (achado de 2026-10-02 atualizado; pendência da coordenada do
      transcript do WhatsApp, D9) e emenda curta à ADR-0081.
- [x] **T4.2** `apps/worker-transportada/CLAUDE.md`, `apps/api-transportada/CLAUDE.md`,
      `apps/frontend-transportada/CLAUDE.md` § "Configuração perto do efeito",
      `docs/ai-context/worker-transportada.md`.
- [x] **T4.3** Prettier nos `.md` tocados (`format:check` da raiz cobre `specs/`).
- [x] **T4.4** Smoke de prints `test/spec-239-prints.smoke.spec.ts` (1280 e 375 px: desligado,
      confirmação, aguardando carência, sem permissão), com a API de demonstração.
- [ ] **T4.5** **Revisão de design e usabilidade** (web.md §15): comparar com o painel do Comprovante
      (campo, botão, cartão, selo, estados de foco/desabilitado), contraste nos estados, print enviado ao
      usuário e **ok dele** antes de publicar. Revisão final do código com `code-reviewer` em `opus`.
- [ ] **T4.6** Publicar em staging na ordem do plano (API+migration → worker → painel), gates verdes,
      deploy confirmado. Produção só com aprovação humana. **Gate A:** `TRIP_LOCATION_PURGE_ENABLED` não é
      `true` em nenhum worker — comando: `railway variables --service <worker> --environment <env>` (ou o painel),
      conferindo só a chave; se estiver `true`, criar **antes do deploy do worker** a linha de configuração da
      empresa (90 dias, já vigente) — escrita de dado, decisão do usuário. **Gate B:** pushes separados (worker antes do painel) ou worker confirmado
      no ar antes de alguém ligar.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/239-o-expurgo-se-liga-na-tela/ (leia spec.md, plan.md e
tasks.md antes de começar, e as specs 196 e 041 que ela cita). Uma task por vez, na ordem do tasks.md,
num worktree próprio.
Modelos: Fase 1 → executor model=sonnet · T1.2 🧠 (migration) → opus, SÓ depois do ok do usuário ·
Fase 2 → executor model=sonnet · T2.2 🧠 → validar com architect model=opus antes de implementar ·
Fase 3 → executor model=sonnet · Fase 4 → executor model=haiku (T4.1–T4.3) · revisão de cada fase e
T4.5 → code-reviewer model=opus.
Cada task fecha com typecheck + testes da app (script `test` do package.json; integração da API com
`bun --env-file=../../.env.test run test:integration`; worker com `make worker-integration`) + commit
isolado (`git add` explícito, `--no-verify`), evidência em evidence.md. Lote com migration roda também
`make migration-test` e `db:generate` = no_changes.
Pare e pergunte antes de: a migration da T1.2 (esta spec TEM uma, 🧠), qualquer migration destrutiva,
deploy (staging na ordem API → worker → painel; produção nunca sem aprovação humana), a T4.5 sem o ok
do usuário sobre o print, e qualquer [NEEDS CLARIFICATION] que surgir.
```
