# Plano técnico — Spec 214

## Contexto e premissas

Premissas levantadas em 2026-09-26 contra esta árvore. A **T0.2** confere cada uma contra
`origin/staging` e registra arquivo:linha em `evidence.md` antes de a Fase 1 começar. Se alguma
divergir, a task para e pergunta.

| #   | Premissa                                                                                                                                                                                                                                                    | Onde                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Não existe busca nem filtro na tela da viagem do motorista. Terreno novo.                                                                                                                                                                                   | `apps/frontend-driver/src/modules/driver-trip/` — nenhum `filter`/`search` de texto                                                            |
| 2   | O snapshot **não tem** documento do destinatário em nenhum nível.                                                                                                                                                                                           | `apps/frontend-driver/src/modules/driver-trip/shared/driverTrip.types.ts:2-33` (`DriverTripDocument`)                                          |
| 3   | O CNPJ/CPF **já vem** do `select` e é descartado no mapper; só alimenta `recipientIsCompany` e a config de comprovante.                                                                                                                                     | `apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts:710`, `:773`, `:816-819`, `:840`                     |
| 4   | Existe decisão escrita contra expor o documento: "O documento **nunca** sai".                                                                                                                                                                               | `apps/api-transportada/src/trips/application/find-current-driver-trip.use-case.ts:49-53`                                                       |
| 5   | A coluna do dado é `nfe_participants.tax_id`, na linha de `role = RECIPIENT_ROLE`.                                                                                                                                                                          | `apps/api-transportada/src/database/nfe.schema.ts:368` (tabela em `:356`)                                                                      |
| 6   | O endereço da parada é **um campo só formatado** (`stop.label`), montado por `buildStopLabel` como rua, número, cidade, UF — **sem bairro**.                                                                                                                | `apps/api-transportada/src/trips/domain/stop-label.policy.ts:40-47`; coluna em `trip.schema.ts:560`                                            |
| 7   | O bairro existe no banco, em `nfe_addresses.district`.                                                                                                                                                                                                      | `apps/api-transportada/src/database/nfe.schema.ts:406`                                                                                         |
| 8   | A rota `GET /me/trips/current` devolve `stops` **sem projeção** — quem define o que vaza é o mapper.                                                                                                                                                        | `apps/api-transportada/src/trips/presentation/me-trip.routes.ts:229`                                                                           |
| 9   | `recipientNames[]` / `sameAddressStopIds` (spec 197) **não existem no código**; a 197 está sem nenhuma task fechada.                                                                                                                                        | zero ocorrências em `apps/`; `specs/197-a-parada-e-do-cliente/tasks.md`                                                                        |
| 10  | O título da parada hoje é "Parada {{sequence}}" + `stop.label`, não o nome do cliente.                                                                                                                                                                      | `DriverStopCard.component.tsx:296-300`; `driverTrip.locale.json:263`                                                                           |
| 11  | `computeTripNoteProgress(trip)` achata `stops.flatMap(documents)` e devolve `{percent, resolved, total}`.                                                                                                                                                   | `.../shared/driverTripNoteProgress.service.ts:16-26`                                                                                           |
| 12  | `computeTripProgress(trip)` e `findCurrentStop` existem; a corrente é a primeira sem `completedAt`.                                                                                                                                                         | `.../shared/driverTripProgress.service.ts:28-54`                                                                                               |
| 13  | A lista de paradas é renderizada por `trip.stops.map` direto, sem camada intermediária.                                                                                                                                                                     | `.../pages/DriverTripWorkspace.page.tsx:724`                                                                                                   |
| 14  | Existe `normalizeSearchText` (NFD + diacrítico + minúscula) **dentro desta app**.                                                                                                                                                                           | `apps/frontend-driver/src/components/ui/searchableSelect.service.ts:14-18`                                                                     |
| 15  | Existe `normalizeTaxId` (tira `./-` e espaço, sobe caixa) **dentro desta app**, e ele já cobre CNPJ alfanumérico.                                                                                                                                           | `apps/frontend-driver/src/modules/shared/taxId.service.ts:17-19`                                                                               |
| 16  | Spec 192 (reordenar) e spec 206 (parada a caminho) são **só spec, sem código**. A página diz por escrito que "não reordena parada".                                                                                                                         | `DriverTripWorkspace.page.tsx:74-78`; `specs/192/tasks.md`; `specs/206/tasks.md` (só T0.1)                                                     |
| 17  | Teste novo só roda se entrar na lista explícita do entrypoint.                                                                                                                                                                                              | `apps/frontend-driver/test/driver-trip.contract.test.ts`; `package.json:15`                                                                    |
| 18  | `touch-target.contract.ts` **lê o CSS** e reprova altura literal < 44 px.                                                                                                                                                                                   | `apps/frontend-driver/test/shared/touch-target.contract.ts`                                                                                    |
| 19a | O snapshot é persistido no IndexedDB `transportada.driver-trip` v3, store `trip-snapshot`, chaveada por `subHash`, com ponteiro `last`; travas: `retainOnly`, TTL de 24 h com `remove`, viagem concluída apagando, `clear()` no "Sair" antes do `logout()`. | `tripSnapshot.service.ts:13,54-56,69-84,87-102,110-113,122-126`; `indexedDbQueue.service.ts:27,35,36,38,238-247`; `signOut.service.ts:8-19`    |
| 19b | **Não há cache de API no service worker**: `sw.ts` sem `runtimeCaching`, cliente com `cache: 'no-store'`, vigiado por contrato. Não existe segunda cópia do corpo em disco.                                                                                 | `apps/frontend-driver/src/sw.ts`; `vite.config.ts:72-88`; `driverTripClient.service.ts:668`; `test/shared/service-worker.contract.ts:29,49-53` |
| 19c | O snapshot é montado por **allowlist explícita** — a API mandar o campo não basta.                                                                                                                                                                          | `driverTripResponse.validation.ts:67-93`, `178-194`, `201-226`                                                                                 |
| 19d | O boot **sem rede** abre o snapshot pela posse do aparelho, sem token. Risco já registrado.                                                                                                                                                                 | `tripSnapshot.service.ts:69-84`; `docs/SECURITY.md:130-138`                                                                                    |
| 19e | Sem criptografia em repouso, e o texto do achado pede para revisitar "se o produto passar a guardar mais do que a viagem corrente".                                                                                                                         | `docs/SECURITY.md:180-182`                                                                                                                     |
| 19f | A fila (`field-reports`, `event-attachments`) **não** sai no "Sair" e tem prazo de 7 dias; e `recipientDisplayName` já vaza para `receivedBy` hoje.                                                                                                         | `tripSnapshot.service.ts:121`; `offlineAttachments.service.ts:237`                                                                             |
| 19g | `DEFAULT_REDACTED_KEYS` do logger tem `cpf`/`cnpj` mas **não** `taxid`; casa por igualdade ou sufixo sobre a chave normalizada; a camada de valor pega CPF de 11 e CNPJ de 14 dígitos. `createApiLogger` **não** passa `extraKeys`.                         | pacote `@adatechnology/logger` `0.1.0-rc.0` (`redact.ts`); `apps/api-transportada/src/main.ts:1373-1381`                                       |
| 19  | Não existe número medido de notas por viagem.                                                                                                                                                                                                               | —                                                                                                                                              |

## Arquitetura e arquivos afetados

### API — dois campos, um mapper, zero migration

- `apps/api-transportada/src/trips/application/find-current-driver-trip.use-case.ts`
  — `DriverTripDocument` (25-61) ganha `recipientTaxId: string | null`; `DriverTripStop` (74-87) ganha
  `district: string | null`. O comentário de 49-53 é reescrito para dizer a verdade nova: **o documento
  do destinatário sai, PF e PJ**.
- `apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`
  — `toDriverDocument` (810-848) passa `row.recipientTaxId` **sem condição nenhuma** (a condição de
  `recipientIsCompany` da revisão 1 caiu; `recipientIsCompany` em `:840` continua como está, servindo só
  ao que já servia); `listStops`/`toDriverStop` (674-693, 783-804) ganham o `district` do join de
  endereço. `DocumentRow` (773) já tem o campo.
- `apps/api-transportada/src/trips/presentation/me-trip.routes.ts` — **nada**. `serializeTrip` não
  projeta (`:229`), então o campo novo já sai. É premissa 8; se tiver mudado, a task para.
- **Nenhuma migration.** As duas colunas existem.

### App do motorista — um serviço, um hook, um componente, dois locales

Novo:

- `apps/frontend-driver/src/modules/driver-trip/shared/driverTripSearch.service.ts`
  — puro, sem React. Expõe:
  - `type DriverTripSearchTerm = { readonly digits: string; readonly text: string }`
  - `parseSearchQuery(query: string): readonly DriverTripSearchTerm[]`
  - `type DriverTripSearchIndex` — normalizado por parada e por nota, chaveado por id
  - `buildTripSearchIndex(trip: DriverTrip): DriverTripSearchIndex`
  - `type DriverTripSearchResult = { readonly hiddenNoteCountByStopId: ReadonlyMap<string, number>; readonly keptEnRouteStopId: string | undefined; readonly resultNoteCount: number; readonly resultStopCount: number; readonly visibleDocumentIdsByStopId: ReadonlyMap<string, ReadonlySet<string>>; readonly visibleStops: readonly DriverTripStop[] }`
  - `filterTripBySearch({ index, keepStopId, query, trip }): DriverTripSearchResult`
- `apps/frontend-driver/src/modules/driver-trip/components/DriverTripSearchField.component.tsx`
  — campo, rótulo, botão de limpar, contador de resultado (`role="status"`), aviso de vazio
  (`role="status"`).

Alterado:

- `apps/frontend-driver/src/modules/driver-trip/shared/driverTrip.types.ts` — os dois campos novos
  (`DriverTripDocument.recipientTaxId`, `DriverTripStop.district`), na ordem alfabética do arquivo.
- `.../shared/driverTripResponse.validation.ts` — `toDocument` e `toStop` (154-172) leem os campos com
  o padrão `readOptionalText`, para snapshot antigo virar `null` e não `undefined`.
- `.../pages/DriverTripWorkspace.page.tsx` — estado do texto, `useMemo` do índice pela identidade da
  viagem, `useMemo` do resultado, e `trip.stops.map` (`:724`) passa a mapear `visibleStops`. O
  `DriverTripProgress` continua recebendo `trip` **cru** (F8).
- `.../components/DriverStopCard.component.tsx` — recebe `visibleDocumentIds?: ReadonlySet<string>` e
  `hiddenNoteCount?: number` e `isKeptByEnRoute?: boolean`; filtra a lista de notas que renderiza,
  mostra o selo e a linha de escondidas. `countPendingDocuments` continua sobre a parada inteira.
- `.../components/DriverTripProgress.component.tsx` — a linha `search.progressScope` sob a barra,
  atrás de uma prop booleana.
- `.../styles/driverTrip.module.css` — campo, botão de limpar, selo, aviso. Alturas literais ≥ 44 px.
- `.../locales/driverTrip.locale.json` e `.en.locale.json` — bloco `search`.
- `apps/frontend-driver/test/driver-trip.contract.test.ts` — duas linhas de import, em ordem
  alfabética (`trip-search`, `trip-search-visibility`).

Não alterado, de propósito: `driverTripNoteProgress.service.ts`, `driverTripProgress.service.ts`,
`driverTripView.service.ts` (`countPendingDocuments`), fila offline, service worker, `buildStopLabel`.

### Por que serviço próprio e não a busca do painel

ADR-0075 §7 proíbe importar de `apps/frontend-transportada`. E não vale copiar: a do painel é
`toLowerCase().includes()` sem acento e sem pontuação, e erraria nome de cliente, CNPJ e endereço —
três dos quatro campos. O que se reaproveita é **de dentro desta app**: `normalizeSearchText`
(premissa 14) e `normalizeTaxId` (premissa 15). Nenhuma função nova de normalização nasce aqui.

## Contratos/API/eventos

`GET /me/trips/current` — resposta, campos **novos e opcionais** por natureza (o cliente lê com
`readOptionalText`):

```jsonc
{
  "trips": [
    {
      "stops": [
        {
          "district": "CENTRO", // novo — só busca, nunca na tela
          "documents": [
            {
              "recipientTaxId": "12345678000199", // novo — CNPJ ou CPF; null só sem destinatário
              "recipientIsCompany": true,
            },
          ],
        },
      ],
    },
  ],
}
```

- Sem versão nova de rota: adição de campo, compatível para trás.
- Nenhum evento novo, nenhuma fila, nenhum estado no servidor. A busca não é um fato do domínio.
- Nenhum parâmetro de query de busca. A poda é da tela.

## Dados, migration e rollback

**Nenhuma migration.** `nfe_participants.tax_id` (premissa 5) e `nfe_addresses.district` (premissa 7)
já existem. Rollback da Fase 1 é reverter o mapper: os dois campos voltam a não sair, e a app trata
ausência como `null` por contrato (critério C12) — a tela degrada para "busca por documento e bairro não
casa", sem quebrar.

## Segurança e tenant

- `companyId` continua vindo do contexto autenticado; nada nesta spec toca a consulta de tenant.
- **O documento do destinatário passa a descer, PF e PJ**, sem condição no mapper. Decisão do usuário
  em 2026-09-26, contra o que esta ADR propunha; história em ADR-0090 §3. Registrado em
  `docs/SECURITY.md` como achado aberto ("CPF do destinatário no aparelho do motorista").
- **O custo é de guarda, não de trânsito.** O documento fica em texto claro no IndexedDB
  `transportada.driver-trip`, store `trip-snapshot`, por até 24 h. Já coberto por travas cegas ao
  conteúdo: dono por `subHash` + `retainOnly`, prazo de 24 h com `remove` do disco, viagem concluída
  apagando em vez de gravar, `clear()` no "Sair" antes do `logout()`, e allowlist explícita em
  `toDriverTripSnapshot` (a API mandar o campo **não basta**).
- **Não há segunda cópia em disco.** `sw.ts` não tem `runtimeCaching` e o cliente usa
  `cache: 'no-store'`; `test/shared/service-worker.contract.ts:29` reprova se nascer. A spec não pode
  introduzir cache de API.
- **Mitigação do buraco principal:** o boot sem rede abre o snapshot pela posse do aparelho
  (`readLastTripSnapshot`), então o documento **nunca é renderizado** (F10). Quem pega o celular
  desbloqueado não lê o CPF na tela.
- **Duas travas novas** (F12): contrato dos campos de dado pessoal do snapshot, e varredura de vencidos
  no boot — a expiração de hoje é preguiçosa, só roda na leitura daquele registro.
- **O documento não escapa do snapshot** (F11): nunca em `field-reports` nem `event-attachments` (que
  sobrevivem ao "Sair" e têm prazo de 7 dias, e onde `recipientDisplayName` já vaza hoje para
  `receivedBy`), nunca em `localStorage`/`sessionStorage`, nunca em log, URL, beacon ou telemetria — nem
  o termo digitado no campo.
- **O logger redige o valor mas não a chave.** `DEFAULT_REDACTED_KEYS` de `@adatechnology/logger` tem
  `cpf` e `cnpj` e casa por igualdade ou sufixo; `recipienttaxid` não casa nenhum. A camada de padrão
  ainda pega CPF de 11 e CNPJ de 14 dígitos, com ou sem pontuação, mas documento truncado passaria. E
  `createApiLogger` (`main.ts:1373-1381`) **não** passa `extraKeys`, então não há conserto por
  configuração aqui: a defesa desta spec é nada colocar o campo em objeto de log, com contrato de fonte
  (critério P36). O conserto durável (`taxid` na lista do pacote) é no repositório
  `adatechnology-packages` e está no acompanhamento da ADR.
- O comentário de privacidade do use case é reescrito na mesma task que muda o comportamento.
- `companyId` e tenant: nada muda.

## Idempotência e concorrência

A busca é função pura do snapshot mais o texto. Não há efeito, não há escrita, não há idempotência a
garantir. Concorrência relevante é uma só: o snapshot recarrega enquanto a busca está ligada — o
índice é reconstruído pela identidade da viagem, o texto permanece, e uma nota pode sair da tela ao
mudar de estado (caso extremo já aceito na spec).

## Observabilidade

Nada de novo no servidor. Na app, um beacon **sem conteúdo**, só para saber se a função é usada:
`driver_trip_search_used`, com `termCount` e `resultNoteCount` — **jamais** o texto digitado, que
pode ser um CNPJ ou um nome. Se o padrão de beacon da app não estiver pronto para isto, a task cai e
a spec fecha sem beacon; não vale inventar canal novo.

## Estratégia de testes

Contrato **antes** da implementação, vermelho visto e registrado.

- `apps/frontend-driver/test/driver-trip/trip-search.contract.ts` — normalização, termos, sufixo de
  número, documento (CNPJ **e CPF**), mínimo de 4, índice construído uma vez (critérios A, B, C11-12,
  H33).
- `apps/frontend-driver/test/driver-trip/trip-search-visibility.contract.ts` — visibilidade, notas
  escondidas, imutabilidade do snapshot, ordem, parada a caminho, números (critérios D, E, F).
- Os dois entram no entrypoint `test/driver-trip.contract.test.ts` em ordem alfabética (premissa 17).
  **Sem a linha, o arquivo nunca roda.**
- Acessibilidade e i18n: teste de fonte no padrão que a app já usa (o `progress.contract.ts` lê o
  `.tsx` e exige a chamada certa) — sem literal de interface, `role="status"` presente, `<label>`
  associado. `touch-target.contract.ts` continua verde.
- Paridade de locale: se `catalog-parity.contract.ts` já compara os dois JSONs, o bloco `search` entra
  ali; se não, teste próprio de paridade de chave e de plural.
- **Privacidade** — `apps/frontend-driver/test/driver-trip/search-document-exposure.contract.ts`,
  critérios **P35-P39**: documento não renderizado (fonte + saída), documento não copiado para fila /
  `localStorage` / log / beacon / `console.*`, contrato dos campos de dado pessoal admitidos no
  snapshot, varredura de vencidos no boot, e `service-worker.contract.ts` continuando verde. Entra no
  entrypoint em ordem alfabética.
- API: contrato do mapper — PJ traz **CNPJ**, PF traz **CPF**, `district` desce. A asserção da revisão 1
  que provava a exclusão do CPF ("não sai nem como campo vazio") **sai da suíte**. `bun --env-file=../../.env.test test --timeout 120000` e, se a suíte tocar banco,
  `bun --env-file=../../.env.test run test:integration` (sem o `--env-file` a integração **pula** em
  vez de falhar).
- Medição: N1, registrada em `evidence.md` com o número real da T0.2.
- Preview local antes de subir: `motorista-local` 53200 + `motorista-api-demo`, prints em 375 e 768.

## Riscos

| Risco                                                                      | Mitigação                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| O aceite da ADR-0090 não vem                                               | T0.1 👤 é gate da Fase 1. Nada de API antes. Não há pergunta pendente: a ADR está decidida por inteiro |
| Premissa 8 mudou e a rota passou a projetar `stops`                        | T0.2 confere; se mudou, a task para e pergunta                                                         |
| Filtrar notas dentro do cartão quebrar contagem, comprovante ou fila       | `countPendingDocuments` e o progresso recebem a parada/viagem crua. Critérios F23-F24, G32             |
| O cartão de parada tem 1369 linhas — mexer nele é caro e arrisca regressão | três props novas, nenhuma refatoração. A lista de notas é o único ponto tocado                         |
| Teste novo não entrar no entrypoint e a suíte passar em falso              | premissa 17 é task explícita, com o `bun test` rodando os dois arquivos por nome                       |
| Custo por tecla no teto de 200 paradas                                     | índice uma vez por snapshot; T0.2 mede; saída prevista é `startTransition`, não paginar                |
| A 206 entrar antes e mudar quem é "a parada a caminho"                     | F6 isola a origem do id numa linha. Trocar `findCurrentStop` por `resolveEnRouteStopId`                |
| A 197 entrar e criar um segundo caminho de nome de cliente                 | ADR-0090 §4 e o acompanhamento: `recipientNames[]` alimenta **o mesmo** casador                        |
| A 192 entrar sem a trava de §7 e deixar arrastar com filtro ligado         | a regra e a chave de tradução nascem aqui; a 192 implementa. Dito no handback                          |
| Documento renderizado por descuido num cartão ou num `aria-label`          | F10 e critério P35: teste de fonte mais teste de saída                                                 |
| Documento copiado do snapshot para a fila, que sobrevive ao "Sair"         | F11 e critério P36. Há precedente: `recipientDisplayName` já vai para `receivedBy`                     |
| Campo de PII novo entrar no snapshot sem ninguém notar                     | F12 e critério P37: contrato que enumera os campos admitidos                                           |
| Cache de API nascer no service worker e criar segunda cópia em disco       | critério P39: `service-worker.contract.ts` já reprova `runtimeCaching`                                 |
| Texto digitado cair em log ou beacon                                       | Observabilidade proíbe; beacon leva só contagem                                                        |
