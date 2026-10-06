# Tarefas — 245

> Nenhum `[NEEDS CLARIFICATION]` aberto: as escolhas reversíveis (D1 não persistir pela opção do pacote,
> D3 sem configuração por empresa, D5 texto do painel) estão na spec com justificativa. **Sem migration**
> nos dois repositórios — se aparecer necessidade de uma, 🧠 **parar e perguntar**. Paradas humanas
> obrigatórias: T1.5 (publicar no npm), T3.1 (deploy) e T3.3 (redigir o legado em produção).
> Cada task fecha com typecheck + testes + commit isolado, evidência em `evidence.md`.

## Modelo por fase

| Fase | Conteúdo                   | Modelo                                                 | 🧠                                                                                       |
| ---- | -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1    | Pacote (outro repositório) | `sonnet`                                               | T1.1 (fonte × tarball; desenho da opção entre repos) → validar com `architect` em `opus` |
| 2    | API e painel               | `haiku` (T2.1 bump, T2.5 texto) · `sonnet` (T2.2–T2.4) | —                                                                                        |
| 3    | Docs, revisão e publicação | `haiku` (T3.4) · `sonnet` (T3.1–T3.3, revisão)         | —                                                                                        |

## Fase 1 — Pacote `@adatechnology/meta-whatsapp-module`

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `architect` em `opus` antes de escrever código)

- [ ] **T1.1** 🧠 No repositório de pacotes: `git fetch`, árvore limpa, conferir que a fonte do módulo
      corresponde ao tarball `0.7.0` publicado (`extractContent`/`extractPayload` contra
      `dist/index.js:2580-2602`; `package.json` local diz `0.6.0`). Registrar em `evidence.md` o SHA e o
      resultado da comparação. Validar com `architect` (opus) o nome `features.redactInboundLocation`, a
      forma do caso de uso `conversations.redactInboundLocations` e a ausência de migration. Divergência
      fonte × tarball: **parar e perguntar**.
- [ ] **T1.2** Testes **antes** (vermelhos): `ReceiveWebhook.location.test.ts` com a opção ligada (sem
      `payload.location`, `content = '📍 Localização'`, `type = 'location'`, gancho recebe `location`
      inteira) e desligada (igual à `0.7.0`) — CA1.
- [ ] **T1.3** Implementar a opção e a constante `INBOUND_LOCATION_CONTENT`. Mutação: ignorar a opção
      reprova o T1.2; restaurar.
- [ ] **T1.4** Teste de integração **antes**, depois o caso de uso `RedactInboundLocationsUseCase` +
      `MessageRepository.redactInboundLocations` + export em `index.ts` e em `conversations` — CA2, com as
      três mutações (filtro de empresa, corte de tempo, `payload - 'location'` → `NULL`). Postgres
      descartável com as migrations do pacote.
- [ ] **T1.5** Changeset `minor` só do módulo; testes e build do repositório de pacotes verdes.
      **PARAR E PERGUNTAR ao usuário antes de publicar.** Publicado, conferir a versão pelo tarball no npm.

## Fase 2 — API e painel

> 🤖 Modelo: `sonnet` (T2.1 e T2.5 são mecânicas, aceite por comando → `haiku`)

- [ ] **T2.1** (`haiku`) Bump de `@adatechnology/meta-whatsapp-module` na API; `bun install
--frozen-lockfile` verde; `dist/migrations/` com as mesmas 11 pastas;
      `test/whatsapp/module-migration.contract.ts` verde.
- [ ] **T2.2** Asserção nova em `test/integration/whatsapp-driver-flow-actions.integration.ts` (CA3)
      escrita e vista **vermelha** antes da T2.3 (com a versão nova e sem a opção).
- [ ] **T2.3** `features: { redactInboundLocation: true }` no resolver
      (`src/whatsapp/application/meta-whatsapp-module.resolver.ts:92`). Integração do arquivo tocada
      verde; mutação (tirar a opção) reprova; restaurar.
- [ ] **T2.4** `scripts/whatsapp-location-redact.ts` + contrato
      `test/whatsapp/location-redact-script.contract.ts` (CA4) **antes** do script; contrato na lista do
      `package.json`. Dry-run padrão; `--confirm` em lotes de 500; saída sem coordenada, rótulo,
      telefone ou id de mensagem.
- [ ] **T2.5** (`haiku`) Texto do D5 em `trip.locale.json:1081` e `trip.en.locale.json:1081`; testes do
      painel verdes (CA5).

## Fase 3 — Docs, revisão e publicação

> 🤖 Modelo: `sonnet` (T3.4 → `haiku`)

- [ ] **T3.1** Revisão de código das Fases 1–2 (`code-reviewer`, `sonnet`): PII em log, tenant no
      `UPDATE`, idempotência. Depois, publicar em staging (push com rebase limpo, gates verdes).
      **Produção só com aprovação humana.** Painel no mesmo deploy da API ou depois, nunca antes.
- [ ] **T3.2** Verificação em staging: uma localização de teste grava `captured` no evento e a linha do
      transcript sai sem `payload.location` e sem rótulo (consulta só de `payload ? 'location'` e
      `content`). Registrar em `evidence.md`.
- [ ] **T3.3** Redação do legado, por ambiente e por empresa: dry-run com contagem → **PARAR E
      PERGUNTAR ao usuário** com o número → `--confirm` → segunda execução = 0. `EXPLAIN` da consulta com
      o volume real em `evidence.md`. Produção: mesma sequência, aprovação separada.
- [ ] **T3.4** (`haiku`) `docs/SECURITY.md` (pendência resolvida com data, versão e contagens; entrada
      aberta "retenção do transcript inteiro"), ADR-0081 emenda 7.2, `apps/api-transportada/CLAUDE.md`
      § WhatsApp, `docs/ai-context/api-transportada.md`. Prettier nos `.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/245-a-localizacao-do-whatsapp-nao-fica-na-conversa/
(leia spec.md, plan.md e tasks.md antes de começar, e a spec 239 D9 e a 196 T3.6–T3.8 que ela cita).
Uma task por vez, na ordem do tasks.md, num worktree próprio. A Fase 1 é no repositório
~/Documents/personal/adatechnology-packages (packages/backend/meta-whatsapp-module), com git fetch e
árvore limpa antes.
Modelos: T1.1 🧠 → validar com architect model=opus antes de escrever código · Fase 1 → executor
model=sonnet · T2.1 e T2.5 → executor model=haiku · T2.2–T2.4 → executor model=sonnet · Fase 3 →
executor model=sonnet (T3.4 → haiku) · revisão de cada fase → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes (script `test` do package.json; integração da API com
`bun --env-file=../../.env.test run test:integration` e o arquivo tocado com ./test/integration/...;
testes do repositório de pacotes na Fase 1) + commit isolado (`git add` explícito, `--no-verify`),
evidência em evidence.md, e mutação onde o tasks.md pede.
Pare e pergunte antes de: publicar o pacote no npm (T1.5), qualquer deploy (staging na ordem do plan.md;
produção nunca sem aprovação humana), redigir o legado em qualquer ambiente (T3.3 — escrita
irreversível de dado pessoal), qualquer migration (esta spec não prevê nenhuma), divergência entre a
fonte do pacote e o tarball 0.7.0 (T1.1), e qualquer [NEEDS CLARIFICATION] que surgir.
```
