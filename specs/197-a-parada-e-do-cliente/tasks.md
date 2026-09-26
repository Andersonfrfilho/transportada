# Tasks — Spec 197

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.
**🧠 = task que sobe para `opus`** dentro de uma fase mais barata.

## Regras de fechamento

Toda task de comportamento começa pelo contrato ou teste, **visto vermelho**, e fecha com:

- `bun run typecheck`, `bun run lint` e os testes da app tocada;
- na API, os **dois** comandos, rodados de dentro de `apps/api-transportada`:
  - `bun --env-file=../../.env.test test --timeout 120000`;
  - `bun --env-file=../../.env.test run test:integration`, se a task tocou `test/integration/**`, uma
    query, um repositório ou o comando. Sem o `--env-file` a integração **pula**, e pular não é passar;
- no worker, os mesmos dois comandos, rodados de dentro de `apps/worker-transportada`, quando a task o
  tocou;
- arquivo de teste novo:
  - suíte de contrato: importada no entrypoint nomeado na task;
  - arquivo `test/integration/*.integration.ts` novo: acrescentado **à mão** na lista `test:integration`
    do `package.json` (a lista é explícita, e o arquivo fora dela não roda);
- evidência no `evidence.md`: comando, contagem de testes e trecho relevante;
- commit isolado, com `--no-verify` e caminhos explícitos (o hook de pre-commit varre a árvore).

**Migration:** uma só (T5.2), aditiva, com `rollback.sql`. Fecha com:

- `make migration-test`;
- `bun run db:generate` devolvendo `no_changes`.

Antes do push, conferir que o timestamp não colide com migration nova de `origin/staging`.

**Deploy em três passos (D21), nesta ordem:**

1. **T0.2** (o painel tolera o campo).
2. **Fase 1** (leituras aditivas), depois dos gates.
3. **Fases 2–3** (fronts), **só depois da T4.2 👤**.
4. **Fases 5–7** (migration, vínculo, worker e comando), depois dos gates.
5. **T7.3 👤** roda o comando em staging.

Cada push sobe sozinho e deixa staging coerente.

## Fase 0 — ADR, premissas e o painel tolerar o campo

> 🤖 Modelo: `opus` (T0.2 é `haiku`)

- [ ] **T0.1** Conferir a ADR-0082 e as premissas do plano:
  - conferir a ADR-0082 (`Status: proposta`) contra o código e passá-la a `aceita` sem mudar decisão;
  - acrescentar "Revisada por ADR-0082 (§3)" no cabeçalho da ADR-0043;
  - conferir as dez premissas do `plan.md` § "Contexto e premissas" e anotar no `evidence.md` o
    arquivo:linha de cada uma. Em especial:
    - (1) os quatro chamadores de `reconcileStopOnLink`, pelo grep
      `grep -rn "reconcileStopOnLink\|reconcileLinkedDocumentStop" apps/api-transportada/src`;
    - (3) o lock de cada caminho;
    - (6) se a 192 já está em `origin/staging`;
  - anotar também:
    - o formato do `UnplacedBox` do pacote instalado (`{ count, documentId?, label, reason }`,
      `adatechnology-packages/packages/backend/cargo-placement/src/cargo-placement.policy.ts:155-164`)
      e o casamento por `label` em `cargo-layout-label.policy.ts:84-87`. O `label` é igual entre irmãs,
      e é por isso que a D14 tira o cliente do `documentId`;
    - que `POST /trips/cargo-preview` só serve viagem que ainda não existe: só a proposta e a criação
      rápida chamam `useTripCargoPreview.hook.ts`. Se algum caminho a chamar para viagem existente,
      a paridade do CA14 pode divergir pela irmã no fim (D9): pare e pergunte;
    - a closure de `main.ts:1921+` (`tripRouteTollFreezer`), que a T7.2 extrai;
    - onde a API lê o tempo de parada padrão da empresa (spec 058);
    - o estado de `DriverStopCard.component.tsx`, `drizzle-current-driver-trip.repository.ts` e
      `TripStopList.component.tsx` em `origin/staging` (192, 193, 195, 201 e a correção de
      coordenadas mexem neles);
  - conferir que 197 e 0082 seguem livres: `git fetch && git log --all --oneline -- 'specs/197*' 'docs/adr/0082*'`.

  Divergiu: pare e pergunte.

- [ ] **T0.2** O painel tolera os campos novos:
  - `recipientNames` em `TRIP_STOP_OPTIONAL_KEYS`
    (`apps/frontend-transportada/src/modules/trip/shared/trip.constant.ts:234-241`);
  - `recipientNames?` em `TripStopDetail` (`trip.types.ts:370-391`);
  - `clientName` no item `unplaced` da planta, se o validador for estrito ali;
  - o mesmo no validador do módulo antigo `src/modules/driver-trip` do painel, se ele for estrito;
  - contrato no entrypoint `test/trip.contract.test.ts`: detalhe com `recipientNames: ["A"]` é aceito,
    e sem o campo também;
  - **primeiro push da spec** (não muda tela; sobe depois dos gates).

## Fase 1 — API: leituras aditivas (passo 1)

> 🤖 Modelo: `sonnet`

- [ ] **T1.1** Identidade do `dest` (RF1). `nfe-destination-address.support.ts:64-96`, `:102-136`
      ganham um `leftJoin` próprio do papel `recipient` (`taxId`, `legalName`, `tradeName`), e
      `nfe-destination-choice.policy.ts` tira `recipientName` do `dest`. Contratos no entrypoint
      `test/trip-stops.contract.test.ts` (CA04):
  - nota com `<entrega>` dá o nome do `dest`;
  - `dest` sem endereço ainda dá o nome;
  - o `taxId` não aparece na serialização.
- [ ] **T1.2** `GET /trips/:id` e a planta (RF2, D8, D14):
  - `recipientNames` por parada (`drizzle-trip.repository.ts:1187-1214`), na mesma consulta em lote;
  - `clientName` da linha (`trip-cargo-layout-input.support.ts:73`);
  - `clientName` do `unplaced` (`cargo-layout-label.policy.ts:84-87`) pela D14: com `documentId`, o
    `dest` da nota; sem ele, a parada única do `label` ou as irmãs juntadas por " · ".

  Contratos no entrypoint `test/trip-http.contract.test.ts`:
  - formato;
  - parada antiga misturada devolve os nomes distintos;
  - caixa de fora com cliente: duas irmãs, cada uma com uma caixa de fora com `documentId`, dão duas
    linhas, cada uma com o seu cliente; sem `documentId`, a linha junta os nomes das irmãs.

  Negativo multiempresa em `test/trip-schema/tenant-safety.contract.ts`.

- [ ] **T1.3** `GET /me/trips/current` (RF3):
  - `recipientNames` e `sameAddressStopIds` (`find-current-driver-trip.use-case.ts:63-76`,
    `drizzle-current-driver-trip.repository.ts:661-790`);
  - `tradeName` em `listDocuments` (`:696`).

  Contrato em `test/driver-trip/current-trip.contract.ts` (entrypoint `test/driver-trip.contract.test.ts`):
  - formato;
  - `sameAddressStopIds` só da mesma viagem;
  - parada antiga devolve `[]`.

  Integração com duas paradas no mesmo endereço (criadas à mão no fixture) em
  `test/integration/trip-stop-recipient.integration.ts`, **novo, acrescentado à lista
  `test:integration`**.

  Push do passo 1.

## Fase 2 — App do motorista (passo 2)

> 🤖 Modelo: `sonnet`

Antes da T2.1: rebase em `origin/staging` e conferir o cabeçalho do acordeão
(`DriverStopCard.component.tsx:230-275`, commits `8ba3e4b17` e `9ec97d683`).

- [ ] **T2.1** Tipos e validação aditiva (RF19): `driverTrip.types.ts:47-62` e
      `driverTripResponse.validation.ts:133-151`. Ausentes viram `[]`. Contrato com snapshot antigo e
      novo, entrypoint `test/driver-trip.contract.test.ts`.
- [ ] **T2.2** `driverStopSiblings.service.ts` (puro) e o cabeçalho (RF16, RF17, RF18):
  - `stopHeaderLabelText` com o cliente e "+N" para parada misturada;
  - linha `stopHeaderAddress` com `stop.label`;
  - chip "Mesmo endereço da Parada N" / "das Paradas N e M" em `stopChips`;
  - sem nome, o endereço fica no título;
  - nome acessível "Parada N, cliente, endereço".

  Locales pt-BR e en. Contratos do serviço e do texto do cartão (entrypoint
  `test/driver-trip.contract.test.ts`). `touch-target` continua verde.

- [ ] **T2.3** Romaneio e prévia de ocorrência (RF20): `DriverLoadSheet.component.tsx:95-98` e
      `DriverStopCard.component.tsx:959`. Contrato de texto.
- [ ] **T2.4** Fixtures e smoke.
  - `recipientNames` nas fixtures com `label`:
    - `test/driver-trip-smoke.helper.ts:98`;
    - `test/driver-trip/occurrence.contract.ts:207`;
    - `progress.contract.ts:44`;
    - `proof-fields.contract.ts:82`, `:152`;
    - `proof-pending.contract.ts:74`, `:102`;
    - `schedule.contract.ts:23`;
    - `stop-distance.contract.ts:22`;
    - `occurrence-preview.contract.ts:81-108`.
  - Cenário novo em `test/driver-app.smoke.spec.ts` (CA18):
    - dois clientes no mesmo endereço, cada um com o nome e o chip;
    - a 1 chega e conclui, e a 2 vira a atual com o próprio "Cheguei";
    - alvo ≥ 44 px em 375 px.

## Fase 3 — Painel (passo 2)

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** `TripStopList` (RF22):
  - título = cliente, endereço embaixo, selo de mesmo endereço (derivado de `addressKey` na própria
    lista);
  - `aria-label` da alça e do checkbox com o cliente;
  - locales;
  - contrato de texto, entrypoint `test/trip.contract.test.ts`;
  - ajustar `test/spec-181-prints.smoke.spec.ts:67-71` e as fixtures de smoke com parada:
    - `trip-smoke.helper.ts:316-345`;
    - `field-delivery-smoke.helper.ts:58`;
    - `spec-164-prints-smoke.helper.ts:79`;
    - `spec-156-t16-prints.smoke.spec.ts:164`.

  Conferir a 201 (o mesmo arquivo).

- [ ] **T3.2** Mapa (RF23):
  - `TripRouteMap.component.tsx:98` com `stopKey: stop.id`;
  - correção de pino deduplicada por `addressKey`, com o rótulo "endereço — paradas N e M".

  Contratos:
  - `resolveMarkerOffsets` com duas paradas no mesmo ponto: leque, não sobreposição;
  - o `Select` sem `value` repetido (CA19).

- [ ] **T3.3** Caixa de fora (RF25): `TripCargoLayers`, `TripReviewQueue` e `cargoPrintSummary.service.ts`
      mostram "Cliente — endereço" com `clientName`. Contrato de texto e do resumo impresso. **É a
      prioridade nº 1 do usuário**: o print da T4.2 inclui a caixa de fora.

## Fase 4 — API de demonstração e preview (portão do passo 2)

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** API de demonstração do preview, fora do repositório:
      `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`.
      Se sumiu, recriar no scratchpad da sessão (`Bun.serve` na 53901, fixture de `GET /me/trips/current`
      e proxy do resto para a 53001) e apontar o `motorista-api-demo` de `.claude/launch.json` para ela.
      Ajustes:
  - `stop()` (linhas ~61-94) aceita e devolve `recipientNames` e `sameAddressStopIds`. As irmãs são
    calculadas pelo `label` dentro da mesma viagem.
  - Viagem `…0100`:
    - `…0101` (Praça da Sé, 100) se parte em `…0101` "Mercearia do Centro" (nota 1) e `…0104`
      "Padaria Estrela" (nota 2), com a mesma coordenada e sequências 1 e 2;
    - `…0102` (Farmácia) vira sequência 3;
    - `…0103` (Rua Vergueiro, 3000) se parte em três: `…0103` "Supermercado Bom Preço" (nota 4 e uma
      nota nova 8 do mesmo cliente, duas notas numa parada), `…0105` "Loja de Ferragens Silva" (nota 5)
      e `…0106` "Restaurante Sabor da Casa" (nota 6), com sequências 4, 5 e 6;
    - parada nova `…0107`, "Supermercado Bom Preço" em "R. Domingos de Morais, 2100 — Vila Mariana,
      São Paulo" (nota 9), sequência 7: o mesmo cliente em outro endereço, sem chip.
  - A rota de chegada (`:210-211`) segue por parada: "Cheguei" na `…0101` não marca a `…0104`.
  - Nenhum CNPJ/CPF na fixture: a API real não manda documento para a app.
- [ ] **T4.2** 👤 **Preview local antes de staging.**
  - Subir `motorista-api-demo` (53901) e `motorista-local` (53200) de `.claude/launch.json`.
  - Para o painel, subir `painel-worktree` (53010) com uma viagem de dois clientes no mesmo endereço,
    por seed local ou API local.
  - Prints em **375 e 768**:
    - da lista do motorista (cartões fechados e o atual aberto);
    - da Parada 2 virando a atual depois de a 1 concluir;
    - do romaneio;
    - no painel: da lista de paradas, do mapa com as irmãs em leque e da caixa de fora com o cliente.
  - Comparar com a seção `## Preview` da `spec.md`.
  - Revisão de design e usabilidade: tokens, contraste, alvo ≥ 44 px, foco, quebra do nome longo e do
    endereço em 375 px, e o chip que quebra linha. Achados corrigidos.
  - **O usuário vê e diz "pode subir"**. Anotar no `evidence.md` (CA20).
  - Só então as Fases 2–3 sobem (passo 2).

## Fase 5 — Chave e migration (passo 3)

> 🤖 Modelo: `opus` (chave, LGPD e migration)

- [ ] **T5.1** 🧠 `src/trips/domain/stop-recipient-key.ts`, `trip-stop-key.ts` e `sibling-eta.policy.ts`
      (RF4, D5, D6, D13). Contratos em `test/trip-stops/recipient-key.contract.ts` e
      `sibling-eta.contract.ts` (entrypoint `test/trip-stops.contract.test.ts`):
  - CNPJ com e sem máscara → mesma chave;
  - CNPJ alfanumérico;
  - CPF;
  - mesma entrada em duas empresas → chaves diferentes;
  - nome com acento, pontuação e espaço duplo → mesma chave;
  - `SUPERMERCADO BOM PRECO` ≠ `SUPERMERCADO BOM PRECO LTDA`;
  - sem nada → `unknown`;
  - o formato bate com o CHECK da T5.2;
  - ETA da irmã _k_ = lugar + Σ atendimento das anteriores.

  Comentário de `stop-address-key.ts:5-9` atualizado.

- [ ] **T5.2** 🧠 Migration `<timestamp>_trip_stop_recipient_key`, conforme `plan.md` § "Dados":
  - coluna, CHECK, unique parcial e `trip_stop_split_runs` com FK de `company_id`;
  - schema Drizzle (`trip.schema.ts:546-630`), `snapshot.json` e `rollback.sql` que aborta só com
    execução pendente que criou parada e cuja viagem ainda esteja em `draft`/`route_planned`;
  - `test/database-migration/trip-stop-recipient-key.assertion.ts`, chamado de
    `test/database-migration/database-migration.integration.ts` (CA17):
    - sobe;
    - o CHECK recusa `doc:xyz` e `DOC:…`;
    - o unique recusa duplicata e aceita dois nulos no mesmo endereço;
    - o rollback aborta com execução pendente e volta ao estado anterior sem ela.

  Aceite: `make migration-test` verde e `db:generate` = `no_changes`.

## Fase 6 — API: vínculo, prévias, ETA e conclusão (passo 3)

> 🤖 Modelo: `sonnet` (T6.1 e T6.2 são 🧠)

- [ ] **T6.1** 🧠 Vínculo por (cliente, endereço) (RF5, RF6, D9, D17):
  - port e use case de `reconcile-trip-stops`;
  - `drizzle-trip-stop-reconciliation.support.ts` (`findStopByKey`, `findLegacyStopForRecipient`,
    `assignRecipientKey`, `insertStopAfterSiblings` só em `draft`/`route_planned` com ETA de irmã,
    SAVEPOINT e releitura em `23505`);
  - os quatro chamadores;
  - lock no desvio de endereço: hoje ele trava só `trip_documents`
    (`drizzle-delivery-address-override.repository.ts:145`). Passa a travar `trips` com `FOR UPDATE` e
    a reler o status sob o lock (`override-delivery-address.use-case.ts:80` lê fora);
  - irmã inserida com ETA da D13, e as pendentes seguintes com ETA andando +1 tempo padrão.

  Testes:
  - contrato `test/trip-stops/reconcile-recipient.contract.ts` (port falso);
  - integração em `test/integration/trip-stop-recipient.integration.ts`: CA01, CA02, CA03, CA05,
    CA06, CA06b, CA07 (desvio e vínculo concorrentes), CA08.

- [ ] **T6.2** 🧠 Prévias, ordem da prévia e composer (RF7, RF9, D13, D15):
  - `buildTripStopKey` nos seis pontos de prévia;
  - `orderStopKeys` pelo prefixo `addressKey` com desempate pelo primeiro vínculo;
  - `trip-composer.adapter.ts:125-165`.

  Testes:
  - `test/trip-stops/preview-parity.contract.ts`, para CA14 com ordem;
  - caso novo em `test/integration/multi-vehicle-suggestion.integration.ts` (CA12).

- [ ] **T6.3** Rota, chegada e conclusão (RF8, RF10, RF15, D12, D22):
  - `test/trip-stops/route-sibling-leg.contract.ts` (CA13, sem mudança de código esperada);
  - `report-stop-arrival.use-case.ts:154-167`: `shiftPendingStopsByDelay` não roda quando outra
    parada da viagem, com o mesmo `address_key`, tem `arrived_at` e não tem `completed_at` (D13);
  - integração:
    - CA10: chegada na 1, chegada na 2 vinte minutos depois dentro do previsto, e a 3 não se desloca;
    - CA10b: 1 e 2 no mesmo minuto, e a 3 não se desloca nem no portal;
  - `recordTripStatusChange` (`trip-status-event.persistence.ts`) zerando `recipient_key` em
    `completed`/`cancelled` (CA21).

- [ ] **T6.4** Exposição (CA09): `test/trip-stops/recipient-key-exposure.contract.ts`:
  - varre os corpos de `GET /trips/:id` e `GET /me/trips/current`, o log do vínculo e o
    `warn trip_stop_key_conflict` (`error-descriptor.service.ts:21-38`);
  - estático: nenhuma chamada `logger.` em `src/trips` e `src/cli` com `recipientKey`.

## Fase 7 — Worker, comando e medida (passo 3)

> 🤖 Modelo: `sonnet` (T7.1 e T7.2 são 🧠)

- [ ] **T7.1** 🧠 Worker (RF13, RF14, D10, D13):
  - `src/routing/domain/place-grouping.policy.ts` e o uso em `drizzle-route-optimization.repository.ts:488-560`;
  - cópia por valor da canonicalização da identidade para o pool (`:873-903`, `:950-961`).

  Contratos em `test/routing/place-grouping.contract.ts` e `stop-recipient-key-parity.contract.ts`
  (entrypoint `test/routing.contract.test.ts`), para o CA11:
  - 3 lugares / 5 paradas viram 3 pontos;
  - peso e tempo somados;
  - irmãs contíguas, com 0 m / 0 s e ETA pela D13;
  - pool com cliente sem documento contado.

  - pool com `unknown` contando como um cliente.

  Guarda no `UPDATE` que grava `ready` (`drizzle-route-optimization.repository.ts:339-356`):
  `where status in ('queued', 'running')`. Contrato de que uma sugestão `stale` não volta a `ready`.

  Integração: `test/route-optimization-siblings.integration.test.ts`, na raiz de `test/`, no molde de
  `geocoded-route-optimization.integration.test.ts`, **acrescentada à lista `test:integration` do
  worker**. Rodar os dois comandos do worker, inclusive
  `bun --env-file=../../.env.test run test:integration`.

- [ ] **T7.2** 🧠 Comando (RF11, RF12, D16):
  - `src/cli/split-stops-by-recipient.ts` e `src/cli/unsplit-stops.ts`, com o trabalho em
    `src/trips/application/*` e `drizzle-stop-split.repository.ts`;
  - os dois no `build` do `package.json` (`bun run build` gera `dist/cli/split-stops-by-recipient.js` e
    `dist/cli/unsplit-stops.js`);
  - `createTripRouteTollFreezer({ database, environment })` extraído da closure de `main.ts:1921+`,
    com `requestCargoLayoutForTrip` e o lease, em `trip-route-toll-freezer.factory.ts`, e usado pelo
    `main` e pelo comando. O `main` continua verde nos contratos existentes;
  - `markTripSuggestionsStale` em `drizzle-route-suggestion.repository.ts`, vencendo só
    `queued`/`ready`;
  - as pendentes seguintes com ETA andam +1 tempo padrão por irmã criada (D13);
  - dois grupos que exigem agendamento: fica com a original o do primeiro vínculo entre eles (D16);
  - `rollback.sql` bloqueia só com execução pendente cuja viagem ainda esteja em
    `draft`/`route_planned` (estender a assertion da T5.2).

  Integração em `test/integration/stop-split-command.integration.ts`, **nova, acrescentada à lista
  `test:integration`**, cobrindo CA15, CA16, CA16b–CA16e e mais:
  - duas empresas: uma nunca toca a outra;
  - saída sem nome, documento ou chave;
  - o dry-run lista as antigas duplicadas.

- [ ] **T7.3** 👤 Rodar em staging, depois do deploy das Fases 5–7. O executor escreve os comandos, o
      usuário roda, e o executor confere.
  1. `railway ssh --service api -- bun apps/api-transportada/dist/cli/split-stops-by-recipient.js`
     (dry-run). Colar a contagem no `evidence.md`.
  2. `railway ssh --service api -- bun apps/api-transportada/dist/cli/split-stops-by-recipient.js --apply`.
     Colar a contagem e o `runId`.
  3. Consulta de conferência, só ids e contagens:
     ```sql
     select s.trip_id, s.address_key is not null as has_place, count(*) as stops,
            count(s.recipient_key) as keyed
     from trip_stops s join trips t on t.company_id = s.company_id and t.id = s.trip_id
     where t.status in ('draft', 'route_planned')
     group by 1, 2 order by 3 desc limit 20;
     ```
     Mais uma viagem partida conferida: `trip_documents.stop_id` das notas movidas, com
     `trip_stop_split_runs.moves` batendo.

  **Produção fica fora desta spec.**

- [ ] **T7.4** Medida da planta (risco do `plan.md`): a fixture de
      `test/cargo-volume/cargo-layout.contract.ts:21` (três paradas na ordem de entrega), com uma parada
      duplicada em dois clientes no mesmo portão. Anotar no `evidence.md` o volume desenhado, as caixas
      fora e o tempo do empacotador, antes e depois. Perda > 5%: pare e pergunte.

## Fase 8 — Documentação, revisão e publicação

> 🤖 Modelo: `sonnet` (T8.2 é `opus`)

- [ ] **T8.1** Documentação viva:
  - `apps/api-transportada/CLAUDE.md:190-191`: "nunca pelo CNPJ" vira "pelo par (cliente `dest`,
    endereço), ADR-0082"; acrescentar os comandos de `src/cli`, a regra de que `recipient_key` nunca sai
    e a D13;
  - `apps/frontend-driver/CLAUDE.md`: título, chip e chegada por parada;
  - `apps/frontend-transportada/CLAUDE.md`: validador, mapa em leque, montagem por lugar e caixa de
    fora;
  - `docs/ai-context/*.md`;
  - `docs/SECURITY.md`: `recipient_key` como pseudônimo fraco e dado pessoal, sem saída do servidor,
    zerado na conclusão;
  - comentários de `trip.schema.ts:546-551`, `apps/worker-transportada/src/routing/domain/pool-address-key.ts`
    e `apps/frontend-transportada/src/modules/trip/shared/stopAddressKey.service.ts:3-13`.

  **Gate:**
  - `bunx prettier --check` nos `.md` tocados;
  - `grep -rn "nunca pelo CNPJ\|nunca por CNPJ" apps/*/src apps/*/CLAUDE.md` devolve só texto que
    cita a ADR-0082 como revisora.

- [ ] **T8.2** Revisão final:
  - `code-reviewer` (`opus`) sobre a spec inteira;
  - `security-reviewer` sobre a chave do cliente, a exposição e o comando;
  - auditoria do `code-standart.md` §15: N+1 nos nomes e irmãs, `Set`/`Map` no agrupamento, logs sem
    PII, 500 sem stack;
  - achados corrigidos ou registrados.
- [ ] **T8.3** Publicação em staging, pela ordem da D21:
  1. T0.2;
  2. Fase 1;
  3. Fases 2–3 (depois da T4.2);
  4. Fases 5–7;
  5. T7.3.

  Cadeia: `git fetch && git rebase origin/staging && bun install --frozen-lockfile` → gates →
  `make migration-test` (no passo que leva a migration) → push, encadeado com `&&`. O relatório ao
  usuário avisa que o despacho automático pode travar por agendamento de cliente antes escondido.
  Produção, inclusive o comando, fica fora desta spec.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/197-a-parada-e-do-cliente/ (leia spec.md, plan.md,
tasks.md e docs/adr/0082-a-parada-e-do-cliente.md antes de começar; leia também
apps/api-transportada/CLAUDE.md, apps/frontend-driver/CLAUDE.md e as specs 192 (ADR-0077), 195 e 201,
que mexem nos mesmos arquivos). Uma task por vez, na ordem do tasks.md. Trabalhe em árvore própria
(make worktree NAME=spec-197; se a sessão já estiver num worktree do Claude, branch própria nesta
árvore) — nada de git stash.
Modelos: Fase 0 → opus (T0.2 → executor model=haiku) · Fase 1 → executor model=sonnet ·
Fases 2, 3, 4 → executor model=sonnet · Fase 5 → opus (T5.1, T5.2 🧠) ·
Fase 6 → executor model=sonnet (T6.1 e T6.2 🧠 → opus) · Fase 7 → executor model=sonnet
(T7.1 e T7.2 🧠 → opus) · Fase 8 → sonnet (T8.2 → code-reviewer e security-reviewer model=opus).
Cada task: teste/contrato antes (visto vermelho), typecheck + lint + testes da app; na API e no worker
os DOIS comandos (bun --env-file=../../.env.test test --timeout 120000 e
bun --env-file=../../.env.test run test:integration); suíte nova no entrypoint nomeado na task;
integration nova acrescentada à mão na lista test:integration do package.json; evidência em
evidence.md; commit isolado com --no-verify e caminhos explícitos. A migration (T5.2) fecha com
rollback.sql, make migration-test e db:generate = no_changes.
DEPLOY EM TRÊS PASSOS (D21): T0.2 → Fase 1 (leituras) → fronts (Fases 2–3, só depois do "pode subir"
da T4.2) → Fases 5–7 (migration, vínculo, worker, comando) → T7.3.
REGRA DO USUÁRIO: toda mudança de tela roda primeiro no PREVIEW local — motorista-local na 53200 com a
API de demonstração motorista-api-demo na 53901 (.claude/launch.json; o arquivo está no scratchpad e,
se sumiu, recrie conforme a T4.1) e o painel na 53010 — com prints 375 e 768, e só sobe para staging
depois de o usuário ver e dizer "pode subir".
Publicar: git fetch && git rebase origin/staging && bun install --frozen-lockfile && gates && push,
conferindo numeração de migration contra origin/staging.
Pare e pergunte antes de: deploy em produção, rodar o comando em qualquer ambiente (T7.3 é do
usuário), migration destrutiva, perda > 5% na medida da planta (T7.4), qualquer divergência das premissas da T0.1, qualquer [NEEDS CLARIFICATION].
```
