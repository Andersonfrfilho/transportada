# Tasks — Spec 214 (revisão 2)

> **Revisão 2 (2026-09-26):** o usuário contrariou o §3 da ADR — **os dois documentos descem, CNPJ e
> CPF**. Cai a condição do mapper (T1.3), cai a asserção que provava a exclusão (T1.1), cai o ramo de
> aviso na tela (T3.2), e nascem três tasks de privacidade (T1.6, T2.7, T3.10). O **gate não mudou**: a
> T0.1 continua sendo o aceite humano da ADR — mudou o conteúdo dela.

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.
**🧠 = task que sobe para `opus`** dentro de uma fase mais barata.
**`[P]`** = pode rodar em paralelo, porque não edita os mesmos arquivos.

Task só fecha com evidência em `evidence.md`. Contrato **antes** da implementação, vermelho visto.

## Base

A 214 começa quando:

- `git status --short` está vazio nesta árvore (hoje há WIP de outras sessões — **não tocar**, e
  **nunca** `git stash`);
- a branch nasce na própria árvore: `git switch -c work/spec-214 origin/staging`;
- a T0.1 passou.

## Bloqueios declarados

| Task      | Depende de                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 1    | **T0.1** — o aceite humano da ADR-0090, já decidida por inteiro. §3 reverte uma decisão de privacidade escrita no código, e §3.5 grava o documento no disco |
| Fase 1    | **T0.2** — premissa 8 (a rota não projeta `stops`) e premissa 3 (o `select` já traz o `taxId`) conferidas em `origin/staging`                               |
| T3.4      | nada. Usa `findCurrentStop`, que já existe. **Não** depende da 206                                                                                          |
| §7 da ADR | spec **192**, que não tem código. Esta spec entrega só a regra e a chave de tradução                                                                        |

Nada nesta spec depende da 206, da 197 ou da 192 para ser publicado.

## Fase 0 — Premissas e aceite

> 🤖 Modelo: `opus` (as duas tasks são decisão e medição, não código)

- [ ] **T0.1 👤 🧠** Levar a ADR-0090 ao usuário e obter o aceite — `docs/adr/0090-a-busca-esconde-o-que-nao-casa-e-o-documento-desce.md`. **Não há pergunta pendente:** a Q1 (os dois documentos descem) e a Q4 (gravado no disco) foram decididas por ele em 2026-09-26, e estão registradas em §3 e §3.5 com as citações. O aceite é da ADR inteira, e o que ele confirma é o custo já nomeado: o documento em texto claro no aparelho por até 24 h, mitigado por §3.2 (nunca renderizado), mais as cinco travas obrigatórias de §3.5. Evidência: a linha de status da ADR virando "aceita", com data e citação.
- [ ] **T0.2 🧠** Conferir as 19 premissas do `plan.md` contra `origin/staging`, por leitura, com arquivo:linha em `evidence.md` — com atenção à **8** (`me-trip.routes.ts:229` não projeta `stops`), à **3** (`:710`, `:840`) e à **17** (a lista do entrypoint). **E medir** notas por viagem: `SELECT count(*)` de documentos por viagem em `staging`, por leitura só — máximo, mediana, p95. Sem número, a Fase 2 não tem orçamento. Se qualquer premissa divergir, **parar e perguntar**.

## Fase 1 — A API entrega o CNPJ e o bairro

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — é o teste que impede o vazamento de CPF)

- [ ] **T1.1 🧠** Contrato do mapper, **antes** do código — `apps/api-transportada/test/...` (suíte no entrypoint nomeado da API): destinatário **PJ** traz `recipientTaxId` com o CNPJ; destinatário **PF** traz `recipientTaxId` com o **CPF**; `recipientTaxId` é `null` só quando não há participante destinatário com documento; `stop.district` desce. ⚠️ **A asserção da revisão 1 que provava a exclusão do CPF ("não sai nem como campo vazio") não deve ser escrita.** Evidência: vermelho antes, verde depois, com os **dois** comandos da API (`bun --env-file=../../.env.test test --timeout 120000` e `bun --env-file=../../.env.test run test:integration` — sem o `--env-file` a integração **pula** em vez de falhar).
- [ ] **T1.2** Declarar os campos — `apps/api-transportada/src/trips/application/find-current-driver-trip.use-case.ts`: `DriverTripDocument.recipientTaxId: string | null` e `DriverTripStop.district: string | null`. **E reescrever o comentário de `:49-53`** ("O documento nunca sai") para dizer a verdade nova: o documento do destinatário sai, **PF e PJ**, por ADR-0090 §3, e o custo está no `docs/SECURITY.md`. Evidência: `bun run typecheck`.
- [ ] **T1.3** Preencher no mapper — `apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`: em `toDriverDocument`, `recipientTaxId` **sem condição nenhuma** (o `recipientIsCompany` de `:840` fica como está, servindo só ao que já servia — **não** transformá-lo em filtro); em `listStops`/`toDriverStop`, o `district` do join de endereço (`nfe_addresses.district`). **Sem migration.** Evidência: T1.1 verde.
- [ ] **T1.4 [P]** Conferir que `me-trip.routes.ts` **não** precisou de mudança (premissa 8). Se precisou, a premissa caiu — **parar e perguntar**. Evidência: uma linha em `evidence.md` com o `serializeTrip` conferido.
- [ ] **T1.6** Nada na API coloca `recipientTaxId` em objeto de log, em mensagem de erro ou em query string — contrato de fonte. **Por que a task existe, medido em 2026-09-26:** o `@adatechnology/logger` redige **por valor**, não pela chave. `DEFAULT_REDACTED_KEYS` tem `cpf` e `cnpj` e casa por igualdade **ou sufixo** sobre a chave normalizada, e `normalizeKey('recipientTaxId')` dá `recipienttaxid`, que não casa nenhum dos dois — então a chave nova **não** é reconhecida. Sobra a camada de valor, que pega CPF de **11** e CNPJ de **14** dígitos, com ou sem pontuação: cobre o caso bem-formado, e deixa passar documento truncado, com espaços ou colado a outro número. E `createApiLogger` (`main.ts:1373-1381`) **não** passa `extraKeys`, e o `createLogger` chama `redactMeta(meta)` sem opções — **não existe conserto por configuração neste repositório**. Daí a regra ser "nada põe o campo em objeto de log", garantida por contrato de fonte. Evidência: contrato verde. ⚠️ O conserto durável — `taxid` entrar em `DEFAULT_REDACTED_KEYS` — é no repositório `adatechnology-packages`, com bump e publicação: **não** é desta spec, e está no acompanhamento da ADR e no "o que falta" do `docs/SECURITY.md`.
- [ ] **T1.5** Gates da API + commit isolado: `bun run lint && bun run typecheck`, os dois comandos de teste, `make migration-test` **não** se aplica (sem migration — registrar isso). Commit com `--no-verify` e caminhos explícitos.

## As cinco travas obrigatórias

Porque o documento é gravado no disco (ADR-0090 §3.5), as cinco travas de §3.3 que não cobrem o
documento são **obrigação**, não opção. Cada uma tem task e critério:

| Trava                                                                                                                                                                                 | Requisito | Task  | Critério |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----- | -------- |
| Documento nunca renderizado (nem `title`/`aria-label`/`data-*`)                                                                                                                       | F10       | T3.10 | P35      |
| Documento fora da fila offline (`field-reports`, `event-attachments`) — a fila sobrevive ao "Sair" e tem prazo de 7 dias, e `recipientDisplayName` **já vaza** para `receivedBy` hoje | F11       | T3.10 | P36      |
| Documento nunca espelhado em `localStorage`/`sessionStorage` — nenhum dos dois é varrido no "Sair"                                                                                    | F11       | T3.10 | P36      |
| Contrato que **enumera** os campos de dado pessoal do snapshot                                                                                                                        | F12       | T2.7  | P37      |
| Varredura de vencidos no boot, de **qualquer** dono                                                                                                                                   | F12       | T2.7  | P38      |

Mais duas que já existiam e continuam vigiadas: ausência de cache de API no service worker (P39) e a
proibição de o documento cair em log da API (T1.6).

## Fase 2 — O serviço de busca, sem tela

> 🤖 Modelo: `sonnet` (TDD puro; T2.1 é 🧠 — é o contrato que define a função inteira)

- [ ] **T2.1 🧠** Contrato **antes** do código — `apps/frontend-driver/test/driver-trip/trip-search.contract.ts`, cobrindo os critérios **A** (1-5), **B** (6-8), **C11-C12** e **H33**: acento, caixa, pontuação de CNPJ, E entre termos, sufixo de número (`123` casa `000123`, **não** casa `001234`), mínimo de 4 para CNPJ, snapshot antigo sem os campos, e índice construído uma vez (contador de normalizações não cresce com as teclas). **Mais** a linha de import no entrypoint `test/driver-trip.contract.test.ts` em ordem alfabética — sem ela o arquivo **nunca roda** (premissa 17). Evidência: vermelho, rodado por nome.
- [ ] **T2.2** Contrato de visibilidade **antes** do código — `apps/frontend-driver/test/driver-trip/trip-search-visibility.contract.ts`, critérios **D** (13-17), **E** (18-22) e **F** (23-26): parada que casa por nota esconde o resto e diz quantas; parada que casa pelo próprio endereço mostra tudo; snapshot não é mutado (comparação profunda); ordem preservada; parada corrente mantida e **fora** da contagem; nada-encontrado e parada corrente ao mesmo tempo; progresso idêntico com e sem busca. **Mais** a linha no entrypoint. Evidência: vermelho.
- [ ] **T2.3** Implementar `apps/frontend-driver/src/modules/driver-trip/shared/driverTripSearch.service.ts` — `parseSearchQuery`, `buildTripSearchIndex` e `filterTripBySearch`, com as assinaturas do `plan.md`. ⚠️ **Sem** `looksLikeIndividualTaxId`: ela existia para o aviso de "só CNPJ", que a revisão 2 eliminou. Reusar `normalizeSearchText` (`src/components/ui/searchableSelect.service.ts`) e `normalizeTaxId` (`src/modules/shared/taxId.service.ts`). **Proibido** criar função nova de acento ou de pontuação, e **proibido** importar qualquer coisa de `apps/frontend-transportada` (ADR-0075 §7). Evidência: T2.1 e T2.2 verdes.
- [ ] **T2.4 [P]** Os dois campos no tipo e na validação da app — `.../shared/driverTrip.types.ts` (`DriverTripDocument.recipientTaxId`, `DriverTripStop.district`, na ordem alfabética do arquivo) e `.../shared/driverTripResponse.validation.ts` (`toDocument`, `toStop`, no padrão `readOptionalText`, para snapshot antigo virar `null`). Evidência: C12 verde.
- [ ] **T2.5** Medir o custo contra o número da T0.2 e registrar em `evidence.md`: tempo por tecla no teto de 200 paradas com a mediana e o p95 de notas medidos. Orçamento ≤ 16 ms. **Se estourar**, a saída é `startTransition` — **nunca** paginar nem mover a busca para o servidor (é offline-first). Evidência: número, não impressão.
- [ ] **T2.7 🧠** As duas travas que faltavam no snapshot (F12) — `apps/frontend-driver/test/driver-trip/search-document-exposure.contract.ts` e a implementação: (a) contrato que **enumera** os campos de dado pessoal admitidos no snapshot e reprova campo novo não declarado (hoje `isStoredTripSnapshot` só confere que `trips` e `pendingProofs` são arrays); (b) varredura no boot que remove todo registro **vencido, de qualquer dono**, antes de decidir o modo de arranque (a expiração de hoje é preguiçosa, só roda na leitura daquele registro). **Mais** a linha no entrypoint. Evidência: critérios P37, P38.
- [ ] **T2.6** Gates da app + commit isolado: `bun run lint && bun run typecheck && bun run --cwd apps/frontend-driver test`.

## Fase 3 — A tela

> 🤖 Modelo: `sonnet` (T3.4 é 🧠 — é a regra que mantém o atalho da 206 apontando para algo)

- [ ] **T3.1** Chaves nos **dois** locales — `.../locales/driverTrip.locale.json` e `.en.locale.json`, bloco `search`: `label`, `placeholder`, `clear`, `resultNotes_one/_other`, `resultStops_one/_other`, `empty`, `emptyHint`, `hiddenNotes_one/_other`, `enRouteKept`, `progressScope`, `reorderBlocked`. Mesmos nomes e mesmos plurais nos dois. Evidência: teste de paridade de locale verde (no `catalog-parity.contract.ts` se ele já compara, senão suíte própria, e então **mais** a linha no entrypoint).
- [ ] **T3.2** O componente do campo — `.../components/DriverTripSearchField.component.tsx`: `<label>` visível associado por `htmlFor`/`id`, botão de limpar quando há texto, contador de resultado e aviso de vazio, os dois em `role="status"`. ⚠️ **Não existe mais ramo de aviso por tipo de documento**: busca por CPF acha, então o aviso é um só (nada encontrado + o que tentar). **Não** criar `search.cnpjOnly` nem `looksLikeIndividualTaxId`. **Nenhum literal de interface** — tudo por `t()`. O campo **não** rouba foco ao abrir a tela. Evidência: teste de fonte + critérios G27, G28, G31.
- [ ] **T3.3** Ligar na página — `.../pages/DriverTripWorkspace.page.tsx`: estado do texto, `useMemo` do índice pela identidade da viagem, `useMemo` do resultado, e `trip.stops.map` (`:724`) passando a mapear `visibleStops`. O `DriverTripProgress` continua recebendo `trip` **cru**. Evidência: F23 verde.
- [ ] **T3.4 🧠** A parada a caminho não se esconde — F6: `filterTripBySearch` recebe `keepStopId` de `findCurrentStop`, a parada mantida vem com **todas** as notas, ganha o selo `search.enRouteKept`, **não** entra na contagem, e o aviso de nada-encontrado aparece junto dela. Deixar a origem do id numa linha só, para a 206 trocar por `resolveEnRouteStopId` sem mexer na regra. Evidência: critérios E18-E22.
- [ ] **T3.5** O cartão filtra as notas — `.../components/DriverStopCard.component.tsx`: três props novas (`hiddenNoteCount`, `isKeptByEnRoute`, `visibleDocumentIds`), a lista de notas filtrada, a linha `search.hiddenNotes`. `countPendingDocuments` continua sobre a parada inteira. **Três props, nenhuma refatoração** — o arquivo tem 1369 linhas. Evidência: D13, D14, F24.
- [ ] **T3.6 [P]** A linha de escopo do progresso — `.../components/DriverTripProgress.component.tsx`: `search.progressScope` sob a barra, atrás de prop booleana, só com busca ligada. Evidência: F25.
- [ ] **T3.7** CSS — `.../styles/driverTrip.module.css`: campo, botão de limpar, selo, aviso. Alturas **literais ≥ 44 px** no campo e no botão; o `touch-target.contract.ts` lê o CSS e reprova abaixo disso. 375 px sem rolagem horizontal. Evidência: G29 verde.
- [ ] **T3.8** Limpar não estraga nada — G32: cartão aberto continua aberto, foto anexada continua anexada, fila intacta. Evidência: contrato.
- [ ] **T3.10 🧠** O documento casa e não escapa (F10, F11) — completar `search-document-exposure.contract.ts`: (a) busca que casou por CPF produz cartão **sem** o documento em texto, em `title`, em `aria-label` ou em `data-*`; (b) teste de fonte reprovando `recipientTaxId` dentro de `DriverFieldReport`, de `QueuedAttachment`, de `localStorage`/`sessionStorage`, de `console.*` e de qualquer objeto de log ou beacon. ⚠️ A fila sobrevive ao "Sair" e tem prazo de 7 dias, e há precedente de vazamento: `recipientDisplayName` já alimenta `receivedBy`. Evidência: critérios P35, P36, e `service-worker.contract.ts` verde (P39).
- [ ] **T3.9** Gates da app + commit isolado.

## Fase 4 — Preview, design e revisão

> 🤖 Modelo: `sonnet` (T4.2 é 🧠 → `designer`; T4.3 é 🧠 → `code-reviewer` em `opus`)

- [ ] **T4.1 👤** Preview local **antes** de subir: `motorista-local` 53200 + `motorista-api-demo`. Prints em **375** e **768** dos quatro estados do `## Preview` da spec: sem busca, com busca casando, sem resultado nenhum, e a parada a caminho aparecendo apesar da busca. Esperar o "pode subir". Evidência: os prints em `evidence.md`. ⚠️ Conferir de qual árvore o Vite está servindo antes de prometer que a mudança aparece — a porta pode ser de outra sessão.
- [ ] **T4.2 🧠** Revisão de design e usabilidade (`designer`), sobre os prints: hierarquia entre os dois números (resultado junto do campo, progresso junto da barra), leitura do selo da parada mantida, o aviso de vazio acima do cartão mantido, contraste, alvo de toque de pé com uma mão. Evidência: achados e o que foi corrigido.
- [ ] **T4.3 🧠** Revisão de código (`code-reviewer`, `opus`), com foco em: CPF não sai da API (C10), snapshot não mutado (D16), nenhum literal de interface, nenhum import de `frontend-transportada`, nenhum texto de busca em log ou beacon, e as duas linhas novas no entrypoint de teste.
- [ ] **T4.4** Publicar: `git fetch && git rebase origin/staging && bun install --frozen-lockfile && <gates> && git push origin HEAD:staging`, tudo com `&&`. Rodar `bunx prettier --write` nos `.md` antes (especs entram no `format:check`). Ordem: **API primeiro** (Fase 1, com aceite em staging), **app depois**.
- [ ] **T4.5 [P]** Registrar em `evidence.md` o que fica para as specs irmãs: a trava de reordenação (§7 da ADR) para a **192**, a troca de `findCurrentStop` por `resolveEnRouteStopId` para a **206**, e `recipientNames[]` no mesmo casador para a **197**.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/214-a-busca-mostra-so-a-entrega-procurada/ (leia
spec.md, plan.md e tasks.md, e a ADR docs/adr/0090-a-busca-esconde-o-que-nao-casa-e-o-documento-desce.md
antes de começar — a ADR está na REVISÃO 2, com o §3 invertido). Uma task por vez, na ordem do
tasks.md.
Modelos: Fase 0 → opus (T0.1 é 👤, T0.2 é 🧠) · Fase 1 → executor model=sonnet (T1.1 🧠 → opus) ·
Fase 2 → executor model=sonnet (T2.1 🧠 → opus) · Fase 3 → executor model=sonnet (T3.4 🧠 → opus) ·
Fase 4 → T4.2 designer, T4.3 code-reviewer model=opus.
GATE DA FASE 1: a T0.1 é aceite humano da ADR-0090, que reverte a decisão escrita em
find-current-driver-trip.use-case.ts:49-53 ("O documento nunca sai"). Sem o aceite, NADA de API.
A Q1 (o CPF também desce?) está FECHADA pelo usuário em 2026-09-26: os dois descem, CNPJ e CPF, sem
condição no mapper. A Q4 também está FECHADA: o documento é GRAVADO NO DISCO, no snapshot, porque
buscar por CPF tem de funcionar sem sinal. NÃO há pergunta pendente no aceite — a T0.1 é confirmação
da ADR inteira, já decidida. E porque o disco foi escolhido, as CINCO travas de ADR-0090 §3.5 são
OBRIGAÇÃO, não opção: F10 (nada renderizado, T3.10), F12 (contrato dos campos de PII e varredura de
vencidos no boot, T2.7), F11 (documento fora da fila offline e fora de localStorage/sessionStorage,
T3.10).
Cada task: contrato/teste antes (vermelho visto), typecheck + lint + testes da app; na API os DOIS
comandos (bun --env-file=../../.env.test test --timeout 120000 e
bun --env-file=../../.env.test run test:integration); suíte nova SEMPRE com a linha de import no
entrypoint test/driver-trip.contract.test.ts, senão ela não roda; evidência em evidence.md; commit
isolado com --no-verify e caminhos explícitos. bunx prettier --write nos .md (é gate da CI).
PROIBIDO: migration (as duas colunas já existem; se parecer necessária, pare e pergunte);
RENDERIZAR o documento do destinatário em qualquer lugar da tela, inclusive title/aria-label/data-*
(F10 — ele é chave de busca, não conteúdo); copiar recipientTaxId para field-reports, para
event-attachments, para localStorage/sessionStorage, para console.*, para log, URL, beacon ou
telemetria (F11 — a fila sobrevive ao "Sair" e tem prazo de 7 dias, e recipientDisplayName já vaza
para receivedBy hoje); criar runtimeCaching no service worker ou tirar o cache: 'no-store' do cliente
(seria uma segunda cópia do CPF em disco); criar search.cnpjOnly ou looksLikeIndividualTaxId (não há
mais ramo de aviso por tipo de documento); transformar recipientIsCompany em filtro do mapper;
importar qualquer
coisa de apps/frontend-transportada (ADR-0075 §7); criar função nova de normalização de acento ou de
pontuação (use normalizeSearchText e normalizeTaxId, que já existem nesta app); filtrar a viagem antes
de computeTripProgress/computeTripNoteProgress (os números são da viagem inteira); mexer em
buildStopLabel ou no rótulo da parada; refatorar DriverStopCard (três props, nada mais); logar ou
mandar em beacon o texto digitado; git stash; tocar em arquivo fora de specs/214, docs/adr/0090 e dos
arquivos nomeados nas tasks (a árvore tem WIP de outras sessões).
REGRA DO USUÁRIO: tela nova roda primeiro no PREVIEW — motorista-local 53200 + motorista-api-demo —
com prints 375 e 768 dos quatro estados, e só sobe depois do "pode subir". Ordem de deploy: API
(Fase 1) → app (Fase 3). Confira de qual árvore o Vite está servindo antes de prometer o efeito.
MEDIÇÃO PENDENTE: não existe número de notas por viagem. A T0.2 mede em staging por leitura
(máximo, mediana, p95) e a T2.5 usa esse número. Sem número, não otimize; se o teto de 200 paradas
estourar 16 ms, a saída é startTransition, nunca paginar nem mover a busca para o servidor.
Sem dado, nada: sem CNPJ no snapshot, busca por documento não casa e a tela diz por que; sem bairro,
o endereço cai só no label; sem parada corrente, F6 não mantém ninguém.
Pare e pergunte antes de: deploy em produção, qualquer migration, qualquer premissa do plan.md que
divergir de origin/staging (em especial a 8 — me-trip.routes.ts não projetar stops, e as 19a-19g, que
são as travas de descarte do snapshot e a lista de redação do logger), qualquer [NEEDS CLARIFICATION].
Não há pergunta de produto pendente nesta spec: Q1, Q2, Q3 e Q4 estão decididas.
```
