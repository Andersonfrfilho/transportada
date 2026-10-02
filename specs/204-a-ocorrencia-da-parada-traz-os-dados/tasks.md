# Tasks — Feature 204

Uma task por vez, na ordem abaixo. Cada task fecha com:

- typecheck (`bun run typecheck` na raiz);
- testes da app tocada. Suíte nova só roda se estiver importada pelo entrypoint nomeado na task (ou
  listada no `package.json`, no caso da integração da API). O aceite traz **"a contagem de testes subiu
  em N"**, com o N conferido na saída do `bun test`;
- commit isolado, com caminhos explícitos (`--no-verify` só com caminhos explícitos: o hook de
  pre-commit dá `git add` na árvore inteira);
- evidência em `evidence.md`.

Teste de aceite ou de contrato vem **antes** da implementação.

Comandos de teste da API, de dentro de `apps/api-transportada`:

```bash
bun --env-file=../../.env.test test --timeout 120000   # contrato — sem banco
bun --env-file=../../.env.test run test:integration    # integração — sem a flag, PULA em vez de falhar
```

- Os dois comandos não se cobrem.
- Task que mexe em `test/integration/**` só fecha com o segundo.
- Suíte nova de integração entra **à mão** no script `test:integration` do `package.json`.
- Migration fecha com `make migration-test`, não só com `make check`.

**Regra de tela do usuário.** Toda task que muda tela roda primeiro no **preview local**. Ela só sobe para
staging **depois de o usuário ver os prints** e dizer "pode subir". Entradas do `.claude/launch.json`:

- `motorista-local`: porta 53200, com `VITE_API_URL=http://localhost:53901`;
- `motorista-api-demo`: a API de demonstração na 53901, versionada em
  `apps/frontend-driver/scripts/driver-preview-api.ts` pela T4.0. Antes disso ela está em
  `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`;
- `painel-local` (53000) ou `painel-worktree` (53010). Confirme de qual árvore são o Vite e a API.

**Ordem de publicação** (`plan.md` § Ordem de deploy):

1. push 1: T1.1 (painel tolerante);
2. push 2: Fases 1–3 e a sonda da T3.7, **com a 209 já publicada**;
3. push 3: Fases 4–5, depois do preview e do ok do usuário (T6.1).

Depois do push 3, a API nunca volta para antes do push 2.

**Pré-requisito: spec 209.** As Fases 3 e 4 não começam sem ela em `origin/staging`.

**Arquivos em disputa.** Ver `spec.md` § Interseções. Antes de cada task das Fases 3, 4 e 5, rodar
`git fetch` e `git log origin/staging -- <arquivo>`.

## Fase 0 — Conferir antes de escrever

> 🤖 Modelo: `opus` 🧠

- [ ] **T0.1** Conferir a spec contra o código e contra as vizinhas.
  - Reler 057 D6, 060 D4/D4b/D4c/D6, 079, 157, 164, 169, 179, 182, 195, 196, 197, 198 D14, 205, 208 e
    **209**, com o `tasks.md` e o `evidence.md` de cada uma. Conferir as linhas citadas em `spec.md` §
    O que já existe e em `plan.md` § Premissas.
  - Preencher a tabela de pré-requisitos do `plan.md` com o estado de `origin/staging`, e conferir que a
    209 entrega exatamente o que a 204 usa.
  - Responder em `evidence.md`:
    1. o renderizador de notificação troca placeholder ausente por "", ou quebra?
    2. algum contrato de paridade do worker exige as chaves novas?
    3. a página pública do lote lê o recibo da ocorrência? (ela não deve ler)
    4. confirmar uma taxa numa viagem `completed` gera nova versão da valoração (ADR-0049 §5)?
  - Passar a ADR-0086 para `aceita`, e emendar as linhas de estado:
    - ADR-0045: "revisada pela ADR-0086 na §6.1, só no valor de `unexpected_charge`";
    - ADR-0048: "dedupe da D4c emendada pela ADR-0086 §5".
  - Aceite: `evidence.md` com a tabela e as quatro respostas. Divergência vira correção no `spec.md` ou no
    `plan.md` **antes** de código. Se a 209 divergir do que o `plan.md` assume, parar e perguntar.

## Fase 1 — O painel tolera, e o banco guarda

> 🤖 Modelo: T1.1 `sonnet` · T1.2 e T1.3 `opus` 🧠 (modelo de dados, CHECKs, FK `SET NULL (coluna)` e troca
> de índice; validar com `architect` antes da T1.3)

- [ ] **T1.1** Painel tolerante (push 1, sozinho), no molde do commit `694de05b5`.
  - Contrato primeiro, em `apps/frontend-transportada/test/trip/charge-stage-tolerance.contract.ts`
    (importado por `test/trip.contract.test.ts`):
    - `isOccurrenceType` aceita a etapa `charge` com `deliveryChargeType`, e reprova categoria fora do
      vocabulário;
    - a referência `occurrence` da linha do tempo aceita `charge`, `wait` e `occurredAt` ausentes, `null`
      ou válidos, e reprova tipo errado;
    - o painel de tipos de ocorrência não quebra com um tipo `charge` na lista (ele o esconde).
  - Aceite: contrato verde, a contagem subiu em N, e `bun run --cwd apps/frontend-transportada test`
    verde. Publicado em staging antes de qualquer push da Fase 3.

- [ ] **T1.2** 🧠 Contrato de schema primeiro.
  - `test/trip-schema/stop-occurrence-charge-wait.contract.ts` (importado por
    `test/trip-schema.contract.test.ts`):
    - as nove colunas e os oito CHECKs com os nomes do `plan.md`;
    - a FK do tipo;
    - a etapa `charge`, `delivery_charge_type` e os dois CHECKs novos de `company_occurrence_types`;
    - o CHECK de `trip_document_occurrences.stage` intacto.
  - `test/delivery-client-schema/stop-occurrence-link.contract.ts` (importado por
    `test/delivery-client-schema.contract.test.ts`):
    - a coluna e a FK, com `confdelsetcols` só em `stop_occurrence_id`;
    - o índice único parcial;
    - o predicado novo de `delivery_charges_suggested_unique`.
  - Aceite: os dois contratos falham pelo motivo certo.

- [ ] **T1.3** 🧠 Schema TS e migration.
  - Arquivos:
    - `shared/trip-occurrence.constant.ts` (`COMPANY_OCCURRENCE_TYPE_STAGE`);
    - `shared/delivery-charge-type.constant.ts`;
    - `trip.schema.ts`;
    - `delivery-client.schema.ts`;
    - `drizzle/<timestamp>_stop_occurrence_charge_and_wait/` com o `migration.sql` à mão (FK com lista de
      colunas), o `rollback.sql` com a pré-checagem e o `snapshot.json`.
  - Validar com `architect`: a FK, a troca de índice, o CHECK de forma e a ausência de ciclo.
  - `docs/spec/domain-model.md` atualizado.
  - Aceite:
    - T1.2 verde;
    - `make migration-test` verde, com rollback;
    - `bun run db:generate` = `no_changes`;
    - `test/database-migration/schema-snapshot.contract.ts` verde.

## Fase 2 — As taxas entram no cadastro de tipos de ocorrência

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato primeiro, em `test/trip-occurrence/charge-stage.contract.ts` (importado por
      `test/trip-occurrence.contract.test.ts`):
  - `PUT /company-settings/occurrence-types` com `stage: 'charge'` cria, renomeia, troca a categoria e
    aposenta;
  - `returned_goods` → 400; campo fora da forma fixa → 400;
  - o `GET` devolve `deliveryChargeType`;
  - um tipo `charge` é recusado como ocorrência de nota pelo motorista, pelo lote do escritório, pelo
    galpão e pelos dois fluxos do WhatsApp;
  - `GET /me/trips/current/occurrence-types` não o lista;
  - `GET /me/trips/current/charge-types` lista só `charge` ativos da empresa do token; o papel `driver` a
    alcança; conta sem motorista → `DRIVER_NOT_REGISTERED`.
  - Aceite: contrato falha pelo motivo certo.

- [ ] **T2.2** Implementação:
  - `occurrenceTypeSchema`;
  - `save-occurrence-type.use-case.ts` e `occurrence-settings.policy.ts` (forma fixa);
  - `delivery-proof-read.support.ts`;
  - `list-field-occurrence-types.use-case.ts` com a etapa como parâmetro;
  - a rota `/me` em `me-trip.routes.ts`;
  - `main.ts`.
  - Aceite: T2.1 verde; a contagem subiu em N; `bun run typecheck` verde.

- [ ] **T2.3** Bootstrap (D4): `shared/charge-type-catalog.constant.ts`,
      `database/charge-type-catalog-seed.service.ts` no `runPreDeploy` (depois de `seedOccurrenceTypeCatalog`,
      `INSERT` em lote) e o seed local.
  - Integração primeiro: `test/integration/charge-type-catalog-seed.integration.ts`, acrescentada à mão em
    `test:integration`.
    - Empresa sem `charge` recebe seis.
    - Empresa com um `charge` aposentado fica intocada.
    - Duas execuções não duplicam.
    - O catálogo de `delivery`/`separation` não é tocado.
  - Aceite: o segundo comando da API com a suíte rodando (não pulando).

## Fase 3 — A ocorrência grava hora, valor e espera, e a cobrança nasce

> 🤖 Modelo: `sonnet` (T3.2 é 🧠: dinheiro e dedupe; validar com `architect` antes de implementar)
>
> Pré-requisito: a 209 em `origin/staging`.

- [ ] **T3.1** Hora do toque e corpo novo.
  - Contratos primeiro:
    - `test/trip-domain/field-occurred-at.contract.ts` (importado por `test/trip-domain.contract.test.ts`):
      a trava nas duas pontas, e `missingAfterHours` da empresa;
    - `test/driver-trip/stop-occurrence-charge.contract.ts` (importado por
      `test/driver-trip.contract.test.ts`): CA05 e CA06 inteiros.
  - Implementação:
    - `field-occurred-at.policy.ts`;
    - `me-trip.schema.ts`;
    - `report-stop-occurrence.use-case.ts`, a porta e o repositório (`findChargeOccurrenceType`,
      `recordOccurrence`);
    - `main.ts`.
  - Aceite: contratos verdes; a contagem subiu em N.

- [ ] **T3.2** 🧠 A cobrança nasce do relato (RF7, RF8, RF11, D13).
  - Contrato primeiro, em `test/delivery-clients/stop-charge-suggestion.contract.ts` (importado por
    `test/delivery-clients.contract.test.ts`):
    - cria só com nota e recibo;
    - sem recibo não cria;
    - o reenvio não duplica;
    - `onDelivered` pula com relato não descartado e não pula com relato descartado;
    - `charged_on` usa `formatFiscalDay` (toque às 23:30 de Brasília = dia do toque);
    - o lançamento manual com `stopOccurrenceId` gera `STOP_OCCURRENCE_CHARGE_MISMATCH` e
      `STOP_OCCURRENCE_ALREADY_CHARGED`;
    - falha loga e não lança.
  - Implementação: `onStopChargeReported` e o pulo em `onDelivered` (`suggest-delivery-charges.use-case.ts`),
    o repositório e `deliveryChargeRecordSchema`.
  - Integração: `test/integration/stop-occurrence-charge.integration.ts`, acrescentada em
    `test:integration`, cobrindo o CA07 e o CA12:
    - as duas ordens;
    - Descarga + Chapa;
    - concorrência;
    - a parcela `delivery_charges` antes e depois de confirmar.
  - Aceite: os dois comandos de teste da API verdes, com a integração rodando.

- [ ] **T3.3** A espera (D12).
  - Contrato puro primeiro, em `test/trip-domain/stop-wait-policy.contract.ts`:
    - `device`/`device`, `device`/`server`, `server`/`server`;
    - sem chegada, duração negativa, 5 h e `office`.
  - Implementação: `stop-wait.policy.ts`, `findFirstStopArrival` (`captured_at ?? created_at` do primeiro
    `arrived`) e o ramo `long_wait`.
  - Integração: `test/integration/stop-occurrence-wait.integration.ts`, acrescentada em `test:integration`,
    pelas rotas `/me` e pela do escritório.
  - Aceite: os dois comandos de teste da API verdes.

- [ ] **T3.4** A parada apagada (D17).
  - Integração primeiro: `test/integration/stop-occurrence-stop-deleted.integration.ts`, acrescentada em
    `test:integration`.
  - O caminho: desvincular a última nota de uma parada com relato e cobrança.
  - Esperado:
    - a parada e a ocorrência somem;
    - a cobrança fica com `stop_occurrence_id` nulo;
    - nada falha;
    - com Descarga + Chapa na mesma nota, o `SET NULL` não bate em índice nenhum.
  - Aceite: o segundo comando da API, com a suíte rodando.

- [ ] **T3.5** O aviso com chaves novas (D15).
  - Contrato primeiro, estendendo `test/trip-occurrence/stop-notification.contract.ts`:
    - a escolha da chave (nova com o dado, antiga sem ele);
    - `chargeLabel` e `waitLabel`;
    - o "às HH:MM" vindo de `occurred_at`;
    - "" no lugar do ausente;
    - as duas chaves no catálogo do seed.
  - Implementação: `notification-catalog.constant.ts`, `stop-occurrence-notification.policy.ts` e
    `stop-occurrence-notifier.gateway.ts`. O worker **não** entra, salvo o que a T0.1 apontar.
  - Aceite: testes da API verdes.

- [ ] **T3.6** O escritório lê (RF12–RF15).
  - Contrato primeiro:
    - os campos novos sempre presentes e `null` fora do motivo, no feed, na linha do tempo e em
      `/delivery-charges` (`stopOccurrence`, `ruleAmount`, `siblingRuleCharge`);
    - os `tenant-safety` estendidos.
  - Implementação: as três consultas, cada uma num `SELECT` só.
  - Estender `test/integration/trip-timeline.integration.ts` com uma cobrança e uma espera.
  - Aceite: os dois comandos de teste da API verdes.

- [ ] **T3.7** Push 2 e sonda.
  - Gates: `make check`, `make migration-test` e os dois comandos da API. Depois: rebase limpo sobre
    `origin/staging`, `bun install --frozen-lockfile`, gates de novo e push.
  - Sonda em staging, com a saída em `evidence.md`:
    1. corpo antigo → 201;
    2. com `occurredAt` e `charge` válidos e recibo (upload da 209) → 201, e a sugestão aparece em
       `GET /delivery-charges?status=suggested`;
    3. `charge` em `long_wait` → 400;
    4. `GET /me/trips/current/charge-types` devolve o catálogo padrão;
    5. **o aviso chega:** `GET /v1/notifications` de quem despachou traz o texto da chave nova, com valor e
       duração;
    6. o painel de staging abre Configurações → Tipos de ocorrência sem erro.

## Fase 4 — A app do motorista

> 🤖 Modelo: `sonnet` (T4.1 pode ir com `haiku`: só move código)
>
> Pré-requisito: a forma do item e o `send` da 209.

- [ ] **T4.0** Versionar a API de demonstração em `apps/frontend-driver/scripts/driver-preview-api.ts`, se
      a 196 T5.0 não o fez, e apontar o `motorista-api-demo` do `.claude/launch.json` para ela.
  - Ela passa a responder `GET /me/trips/current/charge-types`, o upload por parada e o `POST` com
    `charge`/`occurredAt`, com uma parada de duas notas e uma chegada às 13:05.
  - Aceite: `curl` das rotas em `evidence.md`.

- [ ] **T4.1** Extrair o formulário do "Deu problema" de `DriverStopCard.component.tsx` para
      `components/DriverStopOccurrenceForm.component.tsx`, **sem mudar comportamento**. Se a 209 já o
      extraiu, registrar e pular.
  - Aceite: mesma contagem de testes antes e depois; diff só de movimento.

- [ ] **T4.2** Peças puras.
  - Contratos primeiro, em `test/driver-trip/driver-money.contract.ts`, `stop-charge-form.contract.ts` e
    `stop-wait.contract.ts` (importados por `test/driver-trip.contract.test.ts`):
    - máscara com teto de 7 dígitos e `"150,00"` → `"150.0000"`;
    - `formatDuration`;
    - `listMissingStopChargeFields` (tipo, valor, nota com várias, recibo sempre);
    - PDF acima de 896 KiB recusado;
    - `resolveWaitReference`.
  - Implementação: `driverMoney.service.ts` e `driverDuration.service.ts` (cópias por valor, com o
    cabeçalho da ADR-0075 §7), `stopOccurrence.service.ts` e `stopWait.service.ts`.
  - Aceite: contratos verdes; a contagem subiu em N.

- [ ] **T4.3** Tipos de taxa na app: `listChargeTypes` (nunca lança), `chargeTypesCache.service.ts` e a
      carga no workspace.
  - Contrato primeiro, em `test/driver-trip/charge-types-cache.contract.ts`:
    - falha sem cópia → só "Outra taxa";
    - falha com cópia → a cópia;
    - cópia de outro dono não vale.
  - Aceite: contrato verde; a contagem subiu em N.

- [ ] **T4.4** O formulário da cobrança (RF17): `StopChargeFields.component.tsx` e
      `useStopOccurrenceForm.hook.ts`, com "Tirar foto" e "Anexar".
  - Contrato de tela primeiro (CA15).
  - Aceite: contrato verde; print de 375 px em `prints/`.

- [ ] **T4.5** O resumo da espera (RF18), com o temporizador limpo ao fechar.
  - Contrato de tela primeiro (CA17).
  - Aceite: contrato verde; print de 375 px das três variantes.

- [ ] **T4.6** A fila (RF19).
  - Contrato primeiro, em `test/driver-trip/stop-charge-queue.contract.ts`:
    - o item da 209 com `occurredAt` (hora do toque, não da drenagem) e `charge`;
    - item antigo válido;
    - fila cheia com cobrança → relato sem a foto e o texto do P2;
    - sem rede, o item fica "na fila".
  - Aceite: contrato verde; a contagem subiu em N; as suítes da fila e do upload continuam verdes.

- [ ] **T4.7** Textos (RF20): `occurrenceCharge.*` e `occurrenceWait.*` nos dois locales; a prévia do
      aviso com as chaves novas, na app e no módulo legado, com os contratos de paridade.
  - Aceite: `bun run --cwd apps/frontend-driver check` e `bun run --cwd apps/frontend-transportada test`
    verdes.

## Fase 5 — O painel mostra

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Seção "Tipos de taxa" (RF22).
  - Contrato primeiro, em `test/company-settings/charge-type-section.contract.ts` (importado por
    `test/company-settings.contract.test.ts`):
    - criar, renomear, trocar a categoria e aposentar;
    - a lista antiga esconde `charge`;
    - pt-BR e en.
  - Aceite: contrato verde; a contagem subiu em N; print.

- [ ] **T5.2** Feed e linha do tempo (RF23, RF24, RF26): o detalhe, o motivo traduzido e "Lançar à mão".
  - Contrato primeiro, em `test/trip/stop-occurrence-detail.contract.ts`.
  - Aceite: contrato verde; a contagem subiu em N; print.

- [ ] **T5.3** `/repasses` (RF25): os dois valores, o aviso de irmã e "Ver recibo".
  - Contrato primeiro, em `test/extra-charges/stop-occurrence-suggestion.contract.ts` (importado por
    `test/extra-charges.contract.test.ts`).
  - Aceite: contrato verde; a contagem subiu em N; print.

## Fase 6 — Preview, revisão e publicação

> 🤖 Modelo: T6.1 `sonnet` · T6.2 `opus` 🧠 (revisão de design) · T6.3 `haiku` · T6.4 `sonnet`, com a
> revisão final pelo `code-reviewer` em `opus`

- [ ] **T6.1** Preview local para o usuário.
  - Ambiente: `motorista-local` (53200) com `motorista-api-demo` (53901), e o painel local.
  - Prints em `prints/`, em 375 px e 768 px:
    - cobrança completa, com "Falta: …", sem lista de tipos e com a fila cheia;
    - espera com chegada, com a chegada na fila e sem chegada;
    - o feed, com cobrança, recibo pendente e espera;
    - a linha de `/repasses`;
    - "Tipos de taxa".
  - Aceite: o "pode subir" do usuário, com data, em `evidence.md`. **Sem ele, nada da Fase 4 ou 5 vai a
    staging.**

- [ ] **T6.2** 🧠 Revisão de design e usabilidade com print (`web.md` §15):
  - o formulário numa mão só;
  - 44 px de área de toque e contraste;
  - a leitura do valor;
  - o texto do recibo pendente;
  - a espera legível de relance.
  - Aceite: achados corrigidos ou registrados com motivo, e os prints finais.

- [ ] **T6.3** Documentação viva:
  - `apps/api-transportada/CLAUDE.md`: a etapa `charge`, o valor sugerido, a dedupe nova, a espera e as
    chaves de aviso;
  - `apps/frontend-driver/CLAUDE.md`;
  - `docs/ai-context/*.md`;
  - `docs/spec/domain-model.md`;
  - `docs/SECURITY.md`: o recibo com CPF do chapa (LGPD), quem vê, a retenção e o que não vai para log.
  - Rodar `prettier --write` nos `.md` tocados.
  - Aceite: `bun run format:check` verde.

- [ ] **T6.4** Gates finais e push 3.
  - Gates: `make check`, `make migration-test`, os dois comandos da API e o smoke da app do motorista.
  - Revisão final pelo `code-reviewer` (`opus`), com a auditoria do `code-standart.md` §15.
  - Rebase limpo, `bun install --frozen-lockfile`, gates de novo e push.
  - Aceite: CI verde em staging, registrada em `evidence.md`. A partir daqui a API não volta para antes do
    push 2. Produção fica fora desta spec e pede aprovação humana.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/204-a-ocorrencia-da-parada-traz-os-dados/ (leia
spec.md, plan.md, tasks.md, docs/adr/0086-a-cobranca-da-parada-chega-com-valor-e-a-espera-conta-da-chegada.md
e a spec 209 antes de começar). Uma task por vez, na ordem do tasks.md.
PRÉ-REQUISITO: a spec 209 (a foto da ocorrência não vira canhoto) publicada em origin/staging antes das
Fases 3 e 4 — sem ela, pare e pergunte.
Modelos: Fase 0 🧠 → opus · T1.1 → executor model=sonnet · T1.2 e T1.3 🧠 → opus (validar com architect
antes da T1.3: FK SET NULL (stop_occurrence_id), troca do índice suggested_unique, CHECK de forma da etapa
charge, ciclo de import) · Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet, com T3.2 🧠
validada por architect (opus) antes de implementar · Fase 4 → executor model=sonnet (T4.1 pode ser haiku)
· Fase 5 → executor model=sonnet · T6.1 → sonnet · T6.2 🧠 → opus (revisão de design) · T6.3 → haiku ·
T6.4 → sonnet, revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes da app, com a suíte nova importada pelo entrypoint nomeado na
task e "a contagem subiu em N" conferida, + commit isolado com caminhos explícitos, evidência em
evidence.md. Contrato antes da implementação. Migration fecha com make migration-test e rollback.sql.
API: bun --env-file=../../.env.test test --timeout 120000 (contrato) E bun --env-file=../../.env.test
run test:integration (integração, de dentro de apps/api-transportada; sem a flag ela pula) — suíte nova
de integração entra à mão em test:integration.
ORDEM DE PUBLICAÇÃO: push 1 = T1.1 (painel tolerante) · push 2 = Fases 1–3 + a sonda da T3.7 (inclui ler
o aviso em staging) · push 3 = Fases 4–5, só depois do preview e do "pode subir" do usuário (T6.1).
Depois do push 3 a API nunca volta para antes do push 2: reverte-se a app primeiro.
REGRA DO USUÁRIO: toda mudança de tela roda primeiro no PREVIEW local — motorista-local na 53200 com a
API de demonstração motorista-api-demo na 53901 (versionada na T4.0), e o painel local (confirme a
árvore da 53000/53010) — com prints de 375 e 768 px, e só sobe para staging depois de o usuário ver.
Antes das Fases 3, 4 e 5, confira git log origin/staging nos arquivos da tabela de Interseções da
spec.md (192, 193, 195, 196, 197, 203, 205, 206, 207, 208, 209).
Pare e pergunte antes de: deploy em produção, migration destrutiva, rollback em banco com dado (o
rollback.sql falha com Descarga+Chapa ou com tipo charge), qualquer [NEEDS CLARIFICATION], todo push de
tela sem o ok do usuário, a 209 ausente ou diferente do plan.md, e se a T0.1 achar que o renderizador de
aviso quebra com placeholder ausente.
```
