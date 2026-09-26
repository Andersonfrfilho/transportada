# Tasks — Feature 195

Uma task por vez, na ordem abaixo. Cada task fecha com:

- typecheck (`bun run typecheck` na raiz) e lint (`bun run lint`);
- testes da app tocada, conferidos contra a lista explícita do `package.json` (teste novo fora da lista
  não roda). Na API são **dois comandos**, e task que mexe em `test/integration/**` só fecha com o
  segundo:
  `bun --env-file=../../.env.test test --timeout 120000` e
  `bun --env-file=../../.env.test run test:integration`;
- task com migration fecha também com `make migration-test`;
- commit isolado, com caminhos explícitos (`--no-verify`, porque o hook varre a árvore);
- evidência em `evidence.md` (comando, contagem, mutação quando houver).

Teste de aceite ou de contrato vem **antes** da implementação.

**Regra de tela do usuário.** Toda task que muda tela roda primeiro no **preview local** e só sobe
para staging **depois de o usuário ver**. Entradas do `.claude/launch.json`:

- `motorista-local` — porta 53200, com `VITE_API_URL=http://localhost:53901`;
- `motorista-api-demo` — a API de demonstração em
  `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`;
- `painel-local` — o painel, na porta 53000, contra a API local (`make dev`).

A API de demonstração fica fora do repositório. Quem acrescentar respostas nela registra o que mudou
em `evidence.md`.

⚠️ As specs 192, 193, 194, 196 e 197 estão mexendo agora no `DriverStopCard`, na fila, nos locales do
motorista e no `useDriverTrip`. Antes de cada task das Fases 4 e 5: `git fetch && git log
origin/staging -- <arquivo>`, rebase e `bun install --frozen-lockfile`.

As quatro perguntas foram respondidas pelo usuário em 2026-09-25 (spec, "Decisões do usuário"): (a)
`/ocorrencias` com o sino levando ao detalhe; (b) `occurrences.resolve`; (c) o escritório também
registra, com pino arrastado; (d) a descartada pode ser reaberta.

## Fase 0 — O pré-requisito está em staging

> 🤖 Modelo: `sonnet`

- [ ] **T0.1** Conferir em `origin/staging`, por código e por `git log` e sem confiar em relatório:
  - a tabela "Pré-requisito e convivência" do `plan.md` (196 T1.2, T2.2, T3.x e T3.4);
  - se a 197 já está lá (`trip_stops.recipient_key`), para saber de onde sai `recipientCount`;
  - que 195 e 0080 continuam livres;
  - que nenhuma spec nova recriou `wrong_address` ou uma sugestão de ponto
    (`ls specs/ | grep -iE "endere|ponto|pino"`).

  Aceite: a tabela preenchida em `evidence.md`, com o commit de cada item. **Se faltar item da 196,
  parar e perguntar ao usuário.** Não criar as colunas do carimbo aqui.

## Fase 1 — O modelo e a regra da correção

> 🤖 Modelo: `opus` 🧠 (modelo de dados, transação da decisão, ambiguidade, LGPD). Revisão por
> `architect` antes de fechar a T1.3.

- [ ] 🧠 **T1.1** Testes antes:
  - `test/trip-occurrence/stop-location-suggestion-policy.contract.ts`:
    - `decideSuggestion`: as nove células da tabela de transições da RF14 (inclui `dismissed→pending`
      = `reopen`, `applied→pending` = `conflict`, e as três repetições = `noop`); `locationState`
      `unavailable`/`expired`/`null` (`without-point`); precisão 101 m (`too-imprecise`) e 100 m
      (aplica) em `driver_stamp`; `office_pin` sem precisão aplica; ambiguidade (`ambiguous-key`) nas
      duas origens; e a precedência entre elas;
    - `resolveProposedPoint` e `isSelfApplied`;
    - `resolveKeyAmbiguity`: `…|S/N` → `no_number`; duas ruas canônicas diferentes →
      `multiple_streets`; `R DR MATTA` e `RUA DR. MATTA` → `null`;
    - `computeReportedDistanceMeters`: pino nulo → `null`; dois pontos conhecidos → valor medido à mão,
      com tolerância de 1 m;
    - `isWithinLateReportWindow`: 23 h dentro, 25 h fora;
  - `test/database-migration/stop-location-suggestion-rollback.assertion.ts` (molde
    `driver-allowance-rollback.assertion.ts`): o CHECK aceita `wrong_address`; a tabela recusa pino pela
    metade, `applied` sem trilha, `pending` com `decided_by`, status ou origem fora da lista,
    `address_key` vazia, `proposed_*` em `driver_stamp`, `office_pin` sem `proposed_*` e
    `last_reopened_*` pela metade; o rollback recusa com uma linha `wrong_address`;
  - CA7 por nome de coluna: nenhuma coluna de `trip_stop_location_suggestions` casa
    `latitude|longitude|accuracy|captured_at` além de `pin_*` e `proposed_*`.

  Aceite: os testes falham antes da T1.2.

- [ ] 🧠 **T1.2** Migration `drizzle/<timestamp>_stop_location_suggestions/` (`migration.sql`,
      `rollback.sql`, `snapshot.json`) e schema TS, conforme o plano (§ Modelo de dados). Na mesma task:
  - `TRIP_STOP_OCCURRENCE_KINDS` ganha `wrong_address`;
  - os **seis contratos** das duas apps de front (plano, § Contratos que quebram em outras apps);
  - as três listas: `DRIVER_PROBLEM_KINDS` no app novo, `DRIVER_PROBLEM_KINDS` no módulo legado do
    painel (`DriverStopCard.component.tsx:600`) e `OFFICE_STOP_OCCURRENCE_KINDS` no diálogo do escritório
    (`TripStopOccurrenceDialog.component.tsx:107`);
  - o quinto template de parada aparece nos dois `occurrence-preview.contract.ts` (T2.2 escreve o
    texto; aqui só a lista esperada, que falha até lá, com o motivo anotado no teste).

  Aceite: `make migration-test` verde; `bun run db:generate` devolve _no changes_;
  `schema-snapshot.contract.ts` verde; testes de `apps/frontend-driver` e de `apps/frontend-transportada`
  verdes, salvo o `occurrence-preview` anotado; numeração conferida contra `origin/staging`.

- [ ] 🧠 **T1.3** Policy e erros (`stop-location-suggestion.policy.ts`,
      `stop-location-suggestion.error.ts`, códigos no catálogo central). Extração de
      `applyGeocodedAddressCorrection(transaction, input)`: transação de fora, `origin` como parâmetro e
      `returning({ id })` da trilha. O `PATCH /geocoded-addresses` continua com `operator`.

  Aceite:
  - T1.1 verde;
  - os contratos existentes do `PATCH /geocoded-addresses` verdes sem alteração;
  - um teste afirma que `excluded.source = 'manual'` sempre grava e devolve o id;
  - `architect` (opus) revisou a transação, a extração e a regra de ambiguidade, com o parecer em
    `evidence.md`.

## Fase 2 — O relato chega à API

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Testes antes (contrato, sem banco, `test/trip-occurrence/wrong-address-report.contract.ts`
      no entrypoint da área):
  - CA1, CA2, CA3;
  - CA11: `wrong_address` em viagem `completed` há 23 h é aceito, há 25 h não; `long_wait` na mesma
    viagem continua recusado; o upload por parada segue a mesma janela;
  - RF15: `GET /me/trips/current` devolve `addressReportedAt` da parada, sem coordenada, e só dos
    relatos do próprio motorista;
  - RF18: a rota de balcão recusa `wrong_address` com `details[kind]`;
  - RF17: `resolveStopOccurrenceTemplateKey('wrong_address')` = `trip.occurrence-wrong-address`; a
    paridade com o worker compara a chave; o deep link. Antes de escrever este teste, conferir nos tipos
    de `@adatechnology/notification-client` se há campo de ação/link. Se houver, usá-lo. Se não, o
    marcador `occurrenceLink` só neste template, com `stop-notification.contract.ts` emendado para essa
    chave;
  - o inventário do D9 da 196 lista as duas rotas de upload por parada como exceção "anexos".

  Aceite: os testes falham antes da T2.2.

- [ ] **T2.2** Implementar:
  - schema `.strict()` (`me-trip.schema.ts:42-53`) com `attachmentObjectId`;
  - fiação de `main.ts:3078` e `:3134`;
  - ramo `wrong_address` em `report-stop-occurrence.use-case.ts` e no repositório (transação única,
    lendo o carimbo da 196);
  - janela de 24 h em `findStopForDriver`, só para este tipo;
  - rotas de upload por parada;
  - `addressReportedAt` em lote na leitura do motorista;
  - template no catálogo e na cópia do worker, com o texto que fecha os dois `occurrence-preview`;
  - recusa na rota de balcão.

  Aceite: T2.1 verde; `test/integration/wrong-address-report.integration.ts` (Postgres) prova a
  transação, a idempotência e a janela. Rodar **os dois comandos** da API e os testes das duas apps de
  front (os `occurrence-preview` ficam verdes aqui).

## Fase 3 — O escritório decide e registra

> 🤖 Modelo: `sonnet` (T3.2 é 🧠: a transação da decisão e a reabertura; validar com `opus` antes de fechar)

- [ ] **T3.1** Testes antes:
  - contrato `test/trip-occurrence/stop-location-suggestion-decision.contract.ts`: CA5 inteiro (a
    tabela de transições, com a reabertura e o audit `reopened`; `403` sem `occurrences.resolve`; `429`
    do limitador), CA12 (chave ambígua, nas duas origens) e CA20 (`selfApplied`); o `GET` com
    `fleet.read` e sem ele;
  - `test/separator-role.contract.test.ts`: a rota de decisão entra no array de rotas, e a lista
    exaustiva registra que o separador **não** a alcança;
  - `test/trip-schema/tenant-safety.contract.ts`, `occurrence-feed-query-tenant-safety.contract.ts` e
    `trip-timeline-query-tenant-safety.contract.ts` estendidos (CA6), incluindo as contagens da RF13;
  - integração `test/integration/stop-location-suggestion-decision.integration.ts`: CA4 inteiro,
    incluindo a falha injetada no `audit_logs` que desfaz a coordenada; a geocodificação em lote rodada
    depois **sem** desfazer o `manual`; `streetCount` e `recipientCount` com duas empresas na mesma chave
    (cada uma conta só as suas).

  Aceite: os testes falham antes da T3.2.

- [ ] 🧠 **T3.2** Implementar:
  - `decide-stop-location-suggestion.use-case.ts` e `read-stop-location-suggestion.use-case.ts`;
  - o repositório, com as contagens em lote;
  - as rotas `GET`/`PATCH /trip-occurrences/:id/location-suggestion`, com `occurrences.resolve` e o
    limitador (`scope: 'stop-location-suggestion'`, Postgres, 300 s, 120);
  - as três transições (aplicar, descartar, reabrir) com `audit_logs` sem coordenada e com
    `selfApplied`.

  Aceite: T3.1 verde nos dois comandos da API. Um `grep` nos arquivos novos mostra que nenhum `logger.*`
  recebe latitude, longitude ou observação.

- [ ] **T3.3** Feed e linha do tempo: `addressSuggestionStatus` com os cinco valores da RF16, filtro
      `addressSuggestionStatusIn` com os mesmos cinco, e o valor no `stop.occurrence`. Testes antes, nos
      contratos do feed e da linha do tempo, com um caso por valor.

  Aceite: contratos do feed e da linha do tempo verdes; os três `tenant-safety` verdes.

- [ ] **T3.4** Testes antes do registro pelo escritório (CA19), em
      `test/trip-occurrence/office-location-suggestion.contract.ts` e
      `test/integration/office-location-suggestion.integration.ts`:
  - a RF23 grava ocorrência `backoffice` sem `on_behalf_of_driver_id` e sem carimbo, e sugestão
    `office_pin` com `proposed_*`, fotografia do pino e distância;
  - idempotência (CA3), coordenada fora da faixa (`400`), parada de outra empresa (`404`), sem
    `occurrences.resolve` (`403`), limitador (`429`);
  - chave ambígua é aceita no registro, com `ambiguity` na resposta, e recusada no `PATCH applied`;
  - o `PATCH applied` de `office_pin` grava a trilha com `origin = 'operator'` e não verifica precisão;
  - a rota "em nome de" continua recusando `wrong_address` (RF18);
  - `separator-role.contract.test.ts`: a rota nova entra no array, e o separador não a alcança;
  - `tenant-safety` estendido para a rota nova.

  Aceite: os testes falham antes da T3.5.

- [ ] **T3.5** Implementar `register-office-location-suggestion.use-case.ts` e a rota
      `POST /trips/:tripId/stops/:stopId/location-suggestions` (schema `.strict()`, `occurrences.resolve`,
      limitador compartilhado `stop-location-suggestion`), disparando o mesmo aviso.

  Aceite: T3.4 verde nos dois comandos da API.

## Fase 4 — O botão no app do motorista

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Testes antes (`test/driver-trip/address-report.contract.ts`, importado em
      `test/driver-trip.contract.test.ts`):
  - CA8: o `send` de `stopAddressReport` chama upload → `PUT` → confirmação → `POST`, nessa ordem, e o
    `POST` leva `kind`, `location`, `attachmentObjectId` e a chave;
  - CA9, com **relógio falso**:
    - leitura de 20 s vai no item;
    - leitura de 40 s é refeita no "Enviar", e o item com `awaitingLocationUntil` no futuro fica fora
      da drenagem até `applyReportLocation` completar o `location` ou o prazo de 8 s passar;
    - com geolocalização recusada, o item drena com `location: null` depois de 8 s;
    - a folha abre e fecha `occurrence-dialog` no `captureRegistry`;
  - CA10: foto acima do teto de bytes → o relato entra sem a foto, com o aviso, e o `POST` sai com
    `attachmentObjectId: null`;
  - CA13: `resolveAddressReportStatus` diz "na fila" pela fila e "enviada às HH:MM" por
    `addressReportedAt`, que sobrevive a recarregar;
  - `driverTripResponse.validation.ts` aceita `addressReportedAt` e recusa formato inválido;
  - `touch-target.contract.ts` cobre as classes novas.

  Aceite: os testes falham antes da T4.2.

- [ ] **T4.2** Implementar:
  - tipos e validação;
  - a regra de drenagem do prazo;
  - `send`, `stopAddressReport.service.ts`, `useAddressReport.hook.ts` (relógio injetável) e
    `DriverAddressReportSheet.component.tsx`;
  - o botão e o status no `DriverStopCard`;
  - o rótulo na fila e os locales pt-BR/en.

  Aceite: T4.1 verde e `bun run --cwd apps/frontend-driver check` verde (build e orçamento de precache
  inclusos).

- [ ] **T4.3** Preview do motorista: subir `motorista-api-demo` (com `addressReportedAt` depois do
      `POST`) e `motorista-local`. No navegador, em 375 px e 768 px:
  - card com o botão;
  - folha com ponto (geolocalização simulada), sem ponto (permissão negada) e com "ponto de há 2 min";
  - foto anexada com miniatura;
  - "Correção na fila" com a API segurando (`PREVIEW_HOLD_QUEUE=1`) e "Correção enviada às HH:MM"
    depois, mantida após recarregar.

  **Parar e mostrar ao usuário.** Nada sobe antes do "ok".

  Aceite: prints 375/768 enviados ao usuário e o "ok" dele registrado em `evidence.md`.

## Fase 5 — A correção na página de avisos do painel

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Testes antes (contratos do módulo `trip` do painel, na lista do `package.json`):
  - a linha `wrong_address` mostra "Correção de endereço" e o selo de cada um dos cinco estados;
  - o hook do painel expõe as ações só com `occurrences.resolve`: "Usar este ponto" e "Descartar" em
    `pending`, "Reabrir" em `dismissed`, nada em `applied`; com precisão > 100 m (só GPS) ou chave
    ambígua, "Usar este ponto" fica desabilitado com o motivo, e aparecem "Ajustar no mapa" (só
    precisão) e o caminho da 150;
  - a origem ("pelo motorista" / "pelo escritório"), o subtexto "reaberta" e a trilha "registrada e
    aplicada por" quando `selfApplied`;
  - CA21: "Endereço incorreto" na linha da parada e a entrada separada no `TripStopOccurrenceDialog`
    abrem o mesmo diálogo de mapa; os chips do diálogo continuam sem `wrong_address`; o mapa começa
    no pino atual e avisa a chave ambígua antes de arrastar; "Registrar correção" chama a RF23 e abre o
    detalhe; nada disso aparece sem `occurrences.resolve`;
  - a confirmação traz o texto do efeito com o número de destinatários;
  - `/ocorrencias?ocorrencia=<id>` abre o detalhe (CA14);
  - a mutação invalida feed, detalhe da viagem, linha do tempo e rota (`invalidateMutationEffect`);
  - o filtro dos cinco estados vai para a query string (`data-tables.md`).

  Aceite: os testes falham antes da T5.2.

- [ ] **T5.2** Implementar:
  - query e as duas mutações (decisão com três transições; registro do escritório);
  - a extração da interação de arrastar pino do "Ajustar no mapa" num componente comum, usado pelo
    "Ajustar no mapa" existente (sem mudar o comportamento dele) e pelo `OfficeLocationPinDialog`;
  - "Endereço incorreto" na linha da parada e a entrada no `TripStopOccurrenceDialog`;
  - o painel de sugestão com o mapa (o da 196 T6.2, se existir; senão o primitivo MapLibre), dois
    marcadores, círculo de precisão, linha tracejada e contagens;
  - o deep link;
  - os rótulos em `TripOccurrenceTable`, `TripOccurrences` e `TripTimeline`;
  - o filtro e os locales pt-BR/en.

  Aceite: T5.1 verde e o gate do painel verde (`lint`, `typecheck`, `test`, `build`).

- [ ] **T5.3** Relatos de demonstração locais para o preview do painel: um passo no seeder local que
      **executa o use case do relato** (nunca `INSERT` cru, `code-standart.md` §5), **sem foto**, porque a
      foto exige storage e o seed não deve depender do MinIO. Numa viagem de exemplo: um relato do
      motorista com ponto, um sem ponto, um numa chave `S/N` (ambígua), um `office_pin` pelo use case da
      RF23 e uma sugestão descartada, para mostrar o "Reabrir".

  Aceite: `db:seed:local` rodado duas vezes não duplica (reconcilia por chave de idempotência fixa), e
  o efeito foi conferido no banco, não pela mensagem.

- [ ] **T5.4** Preview do painel em desktop (`painel-local`):
  - linha pendente e aviso do sino abrindo o detalhe;
  - detalhe com o mapa e detalhe ambíguo;
  - aplicar, e o detalhe aplicado com "Aplicada por …";
  - reabrir a descartada, e o selo "Pendente · reaberta";
  - o fluxo do pino: "Endereço incorreto" na parada, arrastar, registrar, aplicar a própria, e o
    detalhe com "registrada e aplicada por …";
  - o mapa da viagem com o pino novo;
  - a linha do tempo.

  **Parar e mostrar ao usuário.**

  Aceite: prints desktop enviados e o "ok" registrado em `evidence.md`.

## Fase 6 — Retenção e documentação viva

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** Testes antes:
  - integração (CA7, parte viva): o expurgo da 196 sobre uma ocorrência `wrong_address` com mais de 90
    dias deixa o carimbo `expired`, o detalhe diz "Ponto expirado", o `PATCH applied` dá `422`, e a
    sugestão e a fotografia do pino ficam intactas;
  - worker (CA18): o expurgo da foto apaga a de uma sugestão decidida há 91 dias e a de uma pendente
    há 91 dias, deixa a decidida há 89 dias, marca `photo_purged_at` e trabalha em lote com teto.

  Aceite: os testes falham antes da T6.2 (o primeiro pode já passar; registrar).

- [ ] **T6.2** Implementar o expurgo da foto: antes, localizar o job existente de fotos de ocorrência
      e decidir se ele ganha a regra ou se nasce uma rotina irmã do `trip.location.purge`, registrando a
      escolha em `evidence.md`. Depois, a linha datada em `docs/SECURITY.md`:
  - a sugestão não guarda ponto de pessoa;
  - o ponto é o carimbo (90 dias, 196);
  - a foto da fachada fica 90 dias depois da decisão;
  - a coordenada aplicada é dado de cadastro do endereço (ADR-0080 §5).

  Aceite: T6.1 verde; `bun run --cwd apps/worker-transportada test` e `make worker-integration` verdes;
  os dois comandos da API verdes.

- [ ] **T6.3** Documentação viva e specs vizinhas:
  - núcleo de `apps/api-transportada/CLAUDE.md` (rotas, sugestão, janela de 24 h, ambiguidade,
    retenção) e de `apps/frontend-driver/CLAUDE.md` (item `stopAddressReport`, prazo de drenagem,
    `addressReportedAt`);
  - `docs/ai-context/*` das três apps;
  - `specs/196-todo-evento-carrega-onde-aconteceu/spec.md:260-265`: a 195 grava o carimbo nas colunas
    da 196 e a sugestão fica fora do expurgo, pelo motivo da ADR-0080 §5;
  - a nota "exceção: ADR-0080 §7" na ADR-0081 §6;
  - `CLAUDE.md` da raiz, se a lista de convenções mudar;
  - prettier nos `.md` tocados.

  Aceite: `format:check` verde.

## Fase 7 — O relato vira motivo do pedido à contratante (P3, pode ser cortada)

> 🤖 Modelo: `sonnet`

- [ ] **T7.1** Testes antes: o relatório de endereços lista a chave com sinal `driver_report` quando
      há sugestão `pending` ou `applied`; o rascunho da 150 acha essa chave e grava
      `reason_match_level = 'driver_report'` com a distância do relato; o motivo do e-mail (RF11 da 150)
      sai "o motorista relatou endereço incorreto a X km do pino", escapado.

  Aceite: os testes falham antes da T7.2; os contratos existentes da 150 continuam verdes.

- [ ] **T7.2** Implementar no relatório (`drizzle-address-report.repository.ts`), no rascunho e na
      política de formato do e-mail; o link "Pedir correção do cadastro à contratante" no painel de
      sugestão, visível só com `settings.manage`. Preview desktop e "ok" do usuário antes de subir.

  Aceite: T7.1 verde; print enviado; "ok" registrado.

## Fase 8 — Revisão final

> 🤖 Modelo: `opus` (revisão) · `sonnet` (correções)

- [ ] **T8.1** Revisão de design contra os vizinhos (`web.md` §15), cobrindo o CA16:
  - botão do card × "Deu problema" e "Não entreguei" (altura, ícone, peso);
  - folha × formulário do comprovante;
  - painel de sugestão × `OccurrenceCasePanel`;
  - diálogo do pino do escritório × "Ajustar no mapa" (o mesmo arrastar, os mesmos botões);
  - contraste dos cinco selos nos temas.

  Divergência achada é consertada aqui. Prints finais 375/768 (app) e desktop (painel) enviados ao
  usuário.

- [ ] **T8.2** Auditoria do go-live (`code-standart.md` §15 e `security.md`):
  - N+1 no feed e nas contagens;
  - nenhum PII ou coordenada em log (`grep` nos arquivos da spec);
  - sanitização das rotas e ausência de stack trace no 500;
  - os três `tenant-safety` e o contrato do separador verdes, com as duas rotas novas do escritório.

  Fazer com `code-reviewer` (opus) e `security-reviewer`, com os pareceres em `evidence.md`.

- [ ] **T8.3** Gate completo: `make check`, `make migration-test` e os dois comandos da API. Publicar
      em staging só com rebase limpo (`fetch → rebase → install → gates → push`, com `&&`). **Produção
      não** entra aqui: produção pede aprovação humana.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/195-o-endereco-errado-vira-correcao/ (leia spec.md,
plan.md e tasks.md, mais a ADR-0080, a ADR-0057 "o-endereco-errado", a ADR-0081 com a spec 196 e a
ADR-0082 com a spec 197, antes de começar). Uma task por vez, na ordem do tasks.md.
PRÉ-REQUISITO (T0.1): as Fases 1, 2 e 3 da spec 196 em origin/staging; se faltar alguma, PARE e
pergunte — não crie as colunas do carimbo aqui. A 197 só é registrada (não bloqueia).
Modelos: Fase 0 → executor model=sonnet · Fase 1 → opus 🧠 (T1.3 revisada por architect model=opus
antes de fechar) · Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet, T3.2 🧠 → opus
(ou validar com architect model=opus antes de fechar) · Fases 4, 5, 6 e 7 → executor model=sonnet ·
Fase 8 → code-reviewer model=opus + security-reviewer, correções com executor model=sonnet.
Cada task fecha com typecheck + lint + testes da app (na API, os DOIS comandos: contrato e
test:integration com --env-file=../../.env.test; nas Fases 1 e 2, também os testes das duas apps de
front) + make migration-test quando houver migration + commit isolado com caminhos explícitos
(--no-verify), e evidência em evidence.md. Teste antes da implementação.
Tela nova (T4.3, T5.4, T7.2) roda primeiro no preview local (motorista-local 53200 +
motorista-api-demo; painel-local 53000) e PARA para o usuário ver; nada de tela sobe antes do "ok" dele.
Pare e pergunte antes de: deploy em produção, migration destrutiva, qualquer [NEEDS CLARIFICATION], e
conflito de rebase no DriverStopCard, na fila ou nos locales com as specs 192/193/194/196/197.
Staging só com rebase limpo (fetch → rebase → bun install --frozen-lockfile → gates → push, com &&).
```
