# Evidência — Feature 175

## Fase 1 — A permissão que diverge

### T001 — Contrato antes da correção

`apps/frontend-transportada/test/nfse-invoice/emission-dialog.contract.ts`: o teste
`opens the bulk action only for who manages service invoices` foi reescrito para exigir
`nfse.issue` (e negar `nfse.manage` isolado), e foi acrescentado
`gates the same permission the POST /nfse-service-invoices route requires`, que lê
`apps/api-transportada/src/nfse-invoices/presentation/nfse-invoices.routes.ts` e confirma
`policy: NFSE_ISSUE_POLICY` na rota de criação.

Rodado **antes** da correção, contra o gate ainda em `nfse.manage`:

```
$ bun test ./test/nfse-invoice.contract.test.ts
(fail) nfse emission action permission contract > opens the action only for who can issue service invoices
  Expected: true / Received: false   (canOpenNfseEmission(['nfse.issue']))
(fail) nfse emission action permission contract > gates the same permission the POST /nfse-service-invoices route requires
  Expected: true / Received: false
273 pass
2 fail
```

Confirmado: o contrato falha exatamente pelo motivo esperado (gate ainda pedindo `nfse.manage`).

### T002 — Correção

`canOpenNfseEmission` em `nfseEmission.service.ts:100-102` trocou `NFSE_MANAGE_PERMISSION` por
`NFSE_ISSUE_PERMISSION`. Comentário correspondente em `NfseEmissionAction.component.tsx:37`
atualizado (citava `nfse.manage`).

`NFSE_MANAGE_PERMISSION` **não foi removida**: ela segue em uso legítimo em
`useNfseInvoices.hook.ts:77` (`canManageInvoices`, campo do controller, dimensão distinta de
emitir), sem relação com o gate de abertura do diálogo de emissão.

Depois da correção:

```
$ bun test ./test/nfse-invoice.contract.test.ts
275 pass
0 fail
1301 expect() calls
```

```
$ bun run typecheck
$ tsc --noEmit          (sem saída, sem erro)

$ bun run lint
$ eslint .               (sem saída, sem erro)
```

### T003 — Medição em bancada

**O que foi confirmado por código, não por suposição:** o cenário "só `nfse.manage`, sem
`nfse.issue`" já existe entre os papéis reais do produto — é exatamente o papel `operator`
(`apps/api-transportada/src/identity/domain/authorization.policy.ts:199-215`), que tem
`nfse.manage` e `nfse.read` mas **não** `nfse.issue`. O papel `company-admin` (linhas 115-141),
`finance` e `fiscal` têm as duas permissões juntas — não servem para isolar a divergência.

**O que ficou pendente de verificação manual, e por quê:** tentei abrir a stack local
(frontend `http://localhost:53020`, API `http://localhost:53021`) para logar como um usuário com
papel `operator` e confirmar visualmente que o botão de emissão de NFS-e não aparece mais, e como
um usuário com `nfse.issue` para confirmar que aparece. O único usuário seedado no realm local
(`realm/transportada-local-realm.json`, `local-user`) não carrega `realmRoles` — ele existe para o
provisionamento do primeiro `company-admin` (ADR-0021), que soma as duas permissões e não separa o
caso. Criar um segundo usuário/papel no Keycloak local para isolar o cenário é alteração de
configuração de identidade, fora do escopo desta task de verificação (T003 pede medir o que já
existe, não provisionar cenário novo). Registro isso como pendente em vez de inventar um "visto na
tela" que não aconteceu.

**Evidência que cobre o requisito sem a bancada:** o contrato T001 exercita a própria função de
gate (`canOpenNfseEmission`) com os dois conjuntos de permissão — `['nfse.manage']` (nega) e
`['nfse.issue']` (permite) — que é o comportamento que o papel `operator` veria na tela, e o
segundo teste amarra esse gate à política real da rota (`NFSE_ISSUE_POLICY`). A lacuna que sobra é
só a confirmação visual do 403 sumindo na UI, não a lógica.

## Fase 2 — A ação sai do dado

### T101 — Contrato antes da implementação

`apps/frontend-transportada/test/trip/document-row-action.contract.ts` (novo, registrado em
`test/trip.contract.test.ts`): exercita `resolveDocumentRowAction` (função ainda inexistente) com
`expectedDocument === 'cte'` pendente (espera `{ kind: 'cte' }`), `'nfse'` pendente com
`nfse.issue` (espera `{ kind: 'nfse' }`), `expectedDocument === null` (`city_unknown`, nenhuma
ação), a entrada `undefined` (campo ausente na resposta — trata como `null`, RF requisito de casos
extremos), nota já pronta dos dois documentos, e a permissão negada por documento (RF7: sem
`cte.submit` não oferece CT-e mesmo pendente; sem `nfse.issue` não oferece NFS-e mesmo pendente).
Um segundo `describe` lê o código-fonte de `TripStopList.component.tsx` e exige que ele chame
`resolveDocumentRowAction(` e use o rótulo `t('actions.emitNfse')`.

Rodado **antes** da implementação:

```
$ bun test ./test/trip.contract.test.ts
error: Cannot find module '@/modules/trip/shared/documentRowAction.service' from
'.../test/trip/document-row-action.contract.ts'
0 pass / 1 fail / 1 error
```

Falha pelo motivo esperado: o módulo e a função ainda não existiam.

### T102 — `expectedDocument` já chega ao componente da linha

Confirmado por leitura, sem mudança na API: `TripDetail.component.tsx:341-345` já monta
`fiscalReadinessByDocumentId` a partir de `workspace.fiscalReadiness?.documents`, cada entrada
`TripDocumentReadiness` já trazendo `expectedDocument` (`trip.types.ts:682`). `TripStopList` já lia
esse mapa (spec 174) — o campo chega, a Fase 2 não mexeu em nada de backend nem de wiring de
dados, só na regra que decide a ação a partir dele.

### T103 — Botão fixo trocado pela ação derivada

- `apps/frontend-transportada/src/modules/trip/shared/documentRowAction.service.ts` (novo):
  `resolveDocumentRowAction(entry, { canIssueNfse, canSubmitCte })` — `entry === undefined` ou
  `expectedDocument === null` devolve `null` (RF2); `'cte'` pendente
  (`PENDING_CTE_REASONS`, importado de `cteSelection.service.ts` — sem redeclarar a lista) com
  `canSubmitCte` devolve `{ kind: 'cte' }`; `'nfse'` com `reason === 'nfse_expected'` e
  `canIssueNfse` devolve `{ kind: 'nfse' }`; qualquer permissão ausente devolve `null` (RF7).
- `apps/frontend-transportada/src/modules/trip/shared/cteSelection.service.ts`: removida
  `canGenerateCteForDocument` — a lógica que ela cobria (mesmas razões pendentes, mesmo
  `expectedDocument === 'cte'`) passou a viver em `resolveDocumentRowAction`, e a função ficaria
  código morto (nenhum outro consumidor além do componente que trocou de ponto de entrada).
- `apps/frontend-transportada/src/modules/trip/shared/trip.constant.ts`: nova constante
  `NFSE_ISSUE_PERMISSION = 'nfse.issue'` — cópia por valor da constante de mesmo nome em
  `modules/nfse-invoice/shared/nfseInvoice.constant.ts`, para `trip` não passar a depender do
  módulo `nfse-invoice` só por uma string (a dependência de módulo em si é decisão da Fase 3, T201,
  a validar com `architect`).
- `apps/frontend-transportada/src/modules/trip/hooks/useTripWorkspace.hook.ts`: `TripController`
  ganhou `canIssueNfse: boolean`, calculado como
  `input.permissions.includes(NFSE_ISSUE_PERMISSION)` — mesmo padrão de `canSubmitCte`.
- `apps/frontend-transportada/src/modules/trip/components/TripStopList.component.tsx`: a linha
  calcula `rowAction = resolveDocumentRowAction(fiscalReadiness, { canIssueNfse, canSubmitCte })`
  e renderiza **um botão só** — `rowAction?.kind === 'cte'` chama `actions.onGenerateCte` (emite
  direto, RF4, sem mudança de comportamento); `rowAction?.kind === 'nfse'` chama
  `actions.onOpenNfseEmission`, um callback novo, ainda **não ligado ao diálogo** — é o ponto de
  extensão explícito que a Fase 3 (T203) preenche. `TripStopDocumentActions` ganhou
  `canIssueNfse: boolean` e `onOpenNfseEmission: (documentId: string) => void`.
- `apps/frontend-transportada/src/modules/trip/components/TripDetail.component.tsx`: passa
  `canIssueNfse: workspace.controller.canIssueNfse` e `onOpenNfseEmission` — hoje um no-op
  documentado (`void documentId`), porque emitir NFS-e exige `profileId` escolhido no diálogo
  (RF3, Fase 3) e não pode ser disparado pelo clique da linha.
- Contratos existentes ajustados para o novo ponto de entrada, sem perder cobertura:
  `test/trip/fiscal-readiness-row.contract.ts` (o `describe` que testava
  `canGenerateCteForDocument` diretamente passou a testar `resolveDocumentRowAction`, e a asserção
  de texto-fonte que citava a condição antiga agora confere a chamada a
  `resolveDocumentRowAction(fiscalReadiness, {` e `canSubmitCte: actions.canSubmitCte`).

Depois da implementação:

```
$ bun test ./test/trip.contract.test.ts
1484 pass
0 fail
18834 expect() calls

$ bun run typecheck
$ tsc --noEmit          (sem saída, sem erro)

$ bun run lint
$ eslint .               (sem saída, sem erro)

$ bun run test           (suíte agregada: contrato + hooks, todas as apps do frontend)
44 pass
0 fail
164 expect() calls
```

### T104 — Locales pt-BR e en

`src/modules/trip/locales/trip.locale.json`: `actions.emitNfse` = `"Emitir NFS-e"`.
`src/modules/trip/locales/trip.en.locale.json`: `actions.emitNfse` = `"Issue NFS-e"`. O estado
"sem ação" (`expectedDocument === null`) não precisa de texto próprio — a linha simplesmente não
renderiza botão, e o selo fiscal da spec 174 (`readiness.reason.city_unknown`, já traduzido nas
duas locales) é quem explica o motivo.

### Pendências desta fase

- A ação de NFS-e ainda não abre `NfseEmissionDialog` — `onOpenNfseEmission` é o ponto de extensão
  explícito para a Fase 3 (T201-T203), que decide a fronteira de módulo com `architect` antes de
  importar o diálogo de `nfse-invoice`.
- O estado "sem perfil que case com a nota" (RF5) não foi tratado — depende do mesmo trabalho da
  Fase 3 (T204).
- O resumo de prontidão ainda não conta NFS-e pendente (RF8) — fica para a Fase 4 (T301/T302).

## Fase 3 — A fonte única e o caminho da NFS-e

### T205 — `expectedDocument` passa a sair de `classifyDocumentOutput`

**O que mudou.**

- `apps/api-transportada/src/trips/infrastructure/trip-fiscal-readiness.query.ts` — a consulta
  deixa de ler `company_fiscal_profiles` e os quatro `left join` de participante/endereço que só
  existiam para comparar código de município, e passa a classificar pela porta da listagem de
  notas (`classifyDocumentOutputs`), numa chamada para as N notas. A nota classificada é
  `coalesce(trip_documents.nfe_document_id, freight_calculations.nfe_document_id)` — os dois
  caminhos de vínculo que a consulta já atravessava.
- `apps/api-transportada/src/trips/application/read-trip-fiscal-readiness.use-case.ts` —
  `expectedDocument` passa a ser `'blocked' | 'cte' | 'nfse' | 'no_profile'` (nunca `null`), e a
  nota carrega `nfseProfileId`. Vocabulário de motivo ganhou `blocked` e `no_profile`.
- `apps/api-transportada/src/main.ts` — `tripFiscalReadinessQuery` nasce **depois** de
  `nfeDocumentRepository`, porque agora depende dele.
- `apps/frontend-transportada/src/modules/trip/shared/trip.types.ts` e
  `tripResponse.validation.ts` — guard tolerante: aceita `nfseProfileId` e os dois valores novos.

**Mapeamento de `blocked` e `no_profile` em `toReason` (hoje `readDocumentReason`).** Cada um vira
um motivo **próprio**, não um motivo existente. Achatá-los em `no_cte` ofereceria ao operador uma
emissão que terminaria em erro; achatá-los em `city_unknown` diria "cidade desconhecida" sobre
uma nota cuja cidade é conhecida e cujo problema é outro. Os dois entram no topo do `REASON_RANK`,
junto de `nfse_expected`, porque são classificação e não desfecho de tentativa — a classificação
manda sobre qualquer CT-e que por acaso exista. Os dois também entram em `UNDECIDED_REASONS`, pela
mesma razão que `city_unknown` entrava: a nota ainda pode ser CT-e, então ela **bloqueia** o
"pronta" em vez de sumir da conta.

**`city_unknown` continua no vocabulário dos dois lados.** A API não o produz mais, mas removê-lo
faria o bundle novo recusar a resposta inteira de uma API ainda não atualizada — o oposto da
tolerância que esta task pede. Ele fica como valor de compatibilidade, e é também o que o
frontend usa quando `expectedDocument` vem ausente.

**Forma da invariante (escolha registrada).** Leitura estática do fonte, não `goto-definition`. O
que se proíbe é uma **tela ou rota** decidir o documento de saída pelo município; isso é
propriedade dos arquivos que compõem esse caminho, não do grafo de chamadas — no grafo,
`resolveFiscalDocumentKind` continua legítima dentro do domínio que alimenta a fonte única, e uma
invariante sobre o grafo reprovaria o uso legítimo junto com o proibido. O contrato lê
`trip-fiscal-readiness.query.ts`, `read-trip-fiscal-readiness.use-case.ts` e `trip.routes.ts` e
exige que o nome não apareça. O frontend não entra na lista porque o bundle não carrega código da
API: lá a mesma invariante é a que já existe em `document-row-action.contract.ts` — a ação sai de
`expectedDocument`, e de mais nada.

**Estreitamento da porta de classificação.** `NfeDocumentOutputClassifierPort` passou a receber
`companyId` no lugar do `CompanyContext` inteiro. A prontidão da viagem só tem `companyId`, e
exigir o contexto autenticado a obrigaria a forjar permissões e papéis que ela não usa.

**Semeadura dos testes de integração.** `mixed-cargo-end-to-end.integration.ts` não dava CNPJ a
emitente/destinatário nem cadastrava perfil de emissão — com a conta de município isso bastava,
com a do perfil as três notas viravam `no_profile`. A regra de frete e os dois perfis (um de CT-e,
um de NFS-e, casados pelo CNPJ do destinatário) subiram para `seedWarehouse`, e
`authorizeCteDocuments` passou a reusá-los pelo `World` — o perfil precisa existir **antes** da
primeira leitura de prontidão, que acontece antes do lote.

**Ordem de execução.** O frontend tolerante fechou **antes** da API, em commit próprio: chave nova
que derrubasse o guard apagaria a tela da viagem na janela entre os dois deploys.

**Gates.**

```
$ cd apps/frontend-transportada
$ bun run typecheck        → $ tsc --noEmit (sem saída, sem erro)
$ bun run lint             → $ eslint . (sem saída, sem erro)
$ bun run test             → 5037 pass / 0 fail / 29 arquivos
                             44 pass / 0 fail (suíte de hooks)

$ cd apps/api-transportada
$ bun run typecheck        → $ bunx tsc --noEmit (sem saída, sem erro)
$ bun run lint             → $ bunx eslint ... --max-warnings=0 (sem saída, sem erro)
$ bun --env-file=../../.env.test test --timeout 120000
                           → 7165 pass / 23 skip / 0 fail / 183 arquivos
$ bun --env-file=../../.env.test test ./test/integration/trip-fiscal-readiness.integration.ts \
    ./test/integration/nfe-document-output.integration.ts
                           → 8 pass / 0 fail / 33 expect() calls
```

⚠️ **Correção da ressalva anterior.** A primeira rodada de `test:integration` fechou com 5 falhas
porque `mixed-cargo-end-to-end.integration.ts` (spec 065 T018) semeava notas sem CNPJ de
participante e sem perfil de emissão — sob a conta de município isso bastava, sob a do perfil as
três notas viravam `no_profile`. Com o seed corrigido (commit próprio), a suíte completa fechou
**duas vezes seguidas**, sem falha:

```
$ bun --env-file=../../.env.test run test:integration
564 pass / 7 skip / 0 fail — Ran 571 tests across 105 files [509.70s]
564 pass / 7 skip / 0 fail — Ran 571 tests across 105 files [660.54s]
```

O contrato novo (`test/trip-fiscal-readiness/document-output-source.contract.ts`, registrado no
entrypoint `test/trip-fiscal-readiness.contract.test.ts`) foi escrito **antes** da implementação e
falhou pelo motivo certo:

```
SyntaxError: Export named 'readDocumentClassification' not found in module
  '.../src/trips/infrastructure/trip-fiscal-readiness.query.ts'
0 pass / 1 fail / 1 error
```

No frontend, o contrato tolerante falhou antes com 4 casos:
`TRIP_RESPONSE_INVALID` nos dois estados novos, e `nfseProfileId` chegando `undefined`.

### T206 — a fronteira de módulo, escrita

`apps/frontend-transportada/CLAUDE.md` ganhou a seção "Fronteira entre módulos": um parágrafo
descrevendo o costume que já valia antes de T201 decidir por ele — módulo consome de outro só o
componente de ação autocontido que o dono exporta (`NfseEmissionAction`), nunca o diálogo ou o hook
internos —, com o precedente literal (`NfeDocumentTable.component.tsx` já importa
`NfseEmissionAction` de `nfse-invoice`). Não inventa regra nova; documenta a que T201 já tinha
encontrado no código.

### T202 e T203 — a linha abre o diálogo do módulo dono

**Contrato antes** (`test/trip/nfse-row-emission.contract.ts`, registrado em
`test/trip.contract.test.ts`), falhou em 4 casos pelo motivo certo: a linha não renderizava
`NfseEmissionAction`, não mandava `documentIds`, os comentários da fase anterior ainda citavam
`NfseEmissionDialog` dentro do módulo `trip`, e o no-op `void documentId` continuava em
`TripDetail.component.tsx`.

**O que mudou.**

- `src/modules/trip/components/TripStopList.component.tsx` — o ramo `nfse` passa a montar
  `NfseEmissionAction` (importado de `@/modules/nfse-invoice/components/…`, seguindo T201), com a
  nota pré-selecionada. O id enviado é o `nfeDocumentId` da prontidão, não o id do documento da
  viagem: é o que a rota de NFS-e conhece.
- `src/modules/trip/components/TripDetail.component.tsx` — `onOpenNfseEmission` (o no-op da Fase 2)
  some; no lugar descem `companyId`, `permissions` e `onNfseEmitted`.
- `src/modules/trip/hooks/useTripWorkspace.hook.ts` — passa a expor `companyId`, `permissions` e
  `refetchFiscalReadiness`. `permissions` já vem vazio sem empresa, como o hook fazia.
- `src/components/ui/button.tsx` — `buttonClassName` sai de dentro de `Button`. `NfseEmissionAction`
  renderiza um `<button>` cru e aceita `className`; copiar `ui-button ui-button-size-sm …` no call
  site faria a próxima mudança de variante do design system não chegar aqui. **Esta é a única
  mudança fora dos dois módulos, e foi o mínimo**: nenhuma variante nova, nenhum arquivo movido,
  `NfseEmissionAction` intocado.
- `actions.emitNfse` saiu das duas locales de `trip`: o rótulo é do módulo dono
  (`nfseInvoice:emission.action`), e a chave ficaria morta. O contrato de rótulo da Fase 2 passou a
  exigir `<NfseEmissionAction` no lugar de `t('actions.emitNfse')`.

**Descida de `permissions`/`companyId`.** Foram pelo objeto `actions` (`TripStopDocumentActions`),
que já é o portador do que a linha precisa para agir e já atravessa
`TripDetail → TripStopList → TripStopCard → linha`. Criar duas props paralelas ao lado dele
duplicaria a mesma travessia.

### T204 — os dois estados que informam e não agem

**Contrato antes** (`test/trip/document-row-action.contract.ts`): os dois casos de comportamento
(`blocked` e `no_profile` sem ação, mesmo com as duas permissões) **passaram de primeira** — hoje
eles caem no ramo da NFS-e e devolvem `null` só porque o motivo não é `nfse_expected`. Isso é
acidente, não decisão: a primeira mudança naquele ramo passaria a oferecer emissão para nota
bloqueada. O contrato que falhou é o que exige a recusa **escrita** no serviço, e ele falhou assim:

```
error: expect(received).toInclude(expected)
(fail) a ação da linha sai do dado > a recusa dos dois estados está escrita,
       não é resto do ramo da NFS-e
1496 pass / 1 fail
```

**O que mudou.** `src/modules/trip/shared/documentRowAction.service.ts` recusa os dois estados
explicitamente, antes do ramo de CT-e.

**O selo, não um componente novo.** O estado já aparece: a linha renderiza o selo fiscal da spec
174 para todo motivo que não seja `ok`, e os dois motivos novos entraram no `Record` exaustivo de
`readinessIcon.service.ts` (`blocked` → `alert`, `no_profile` → `search`) e nas duas locales
(`readiness.reason.blocked`, `readiness.reason.no_profile`). Nenhum componente novo — o padrão
existente já cobre "mostrar o motivo em texto".

⚠️ Não confundir com "nenhum perfil casa com a nota" (`emission-profile-resolution.policy.ts`, que
é resolução de perfil de **CT-e**): `blocked` e `no_profile` aqui vêm da fonte única do ADR-0071.

**Gates (frontend, depois de T202/T203/T204).**

```
$ bun run typecheck   → $ tsc --noEmit (sem saída, sem erro)
$ bun run lint        → $ eslint . (sem saída, sem erro)
$ bun run test        → 5047 pass / 0 fail / 29 arquivos
                        44 pass / 0 fail (suíte de hooks)
$ bun test ./test/trip.contract.test.ts → 1497 pass / 0 fail
```

### Nota de processo

Esta fase foi executada com **outra sessão ativa na mesma árvore**: os commits desta fase
(`e8f0bcd81`, `b65101654`, `82c74a38e`, `59008b26c`, `bdef455b7`) foram criados a partir deste
trabalho por essa sessão concorrente, à medida que cada task fechava. O conteúdo confere com o que
está descrito acima; o que **não** conferia era a ressalva sobre a integração, corrigida no início
desta seção com os números das duas rodadas verdes.

## Fase 4 e revisão final (23/09)

### T301/T302 — o resumo conta a NFS-e pendente

A correção ficou **só no frontend**, e a medição explica por quê: o contrato de backend
`trip-fiscal-readiness/readiness.contract.ts` já trava, de propósito (ADR-0046 / spec 065 D4), que
viagem com CT-e completo e nota `nfse_expected` é `state: 'ready'` — NFS-e não bloqueia o MDF-e.
Mudar o `state` teria quebrado esse contrato. O defeito era de exibição: o resumo que o operador lê
não citava a nota de NFS-e ao lado. `nfseCount` já existia na resposta.

### Revisão final (`code-reviewer`, opus): 7 achados, 0 bloqueios

Dois de severidade alta, os dois tratados:

**1. Id de espaço errado indo para a API de NFS-e.** A query classificava pelo id coalescido dos dois
vínculos (`coalesce(trip_documents.nfe_document_id, freight_calculations.nfe_document_id)`) e
publicava em `nfeDocumentId` **só** o vínculo direto. Nota que chega pelo cálculo de frete vinha como
`nfse_expected` com `nfeDocumentId` nulo, e a linha completava com `document.id`, que é de
`trip_documents` — outro espaço de id. Corrigido na origem (publica o id que classificou) e na tela
(sem id da nota não há ação). Commit `9dec27791`.

**2. Risco de dados, não de código.** `create-trip-cte-batch.use-case.ts:113` e
`set-trip-mdfe-requirement.use-case.ts:65` filtram `expectedDocument === 'cte'`. Com a fonte única,
nota sem perfil de emissão vira `no_profile` e **some do lote de CT-e e do `manifestableCount`**, sem
erro aparecer. Medido no banco local: `cte_emission_profiles` = 0, matchers = 0, `nfse_emission_profiles`
= 0, com 345 notas e 1 empresa — ou seja, 100% das notas locais cairiam em `no_profile`. Decisão do
usuário: semear perfis de emissão na bancada local antes de seguir.

⚠️ **Pré-requisito de produção, ainda não medido:** contar em produção as notas ativas cujo
`classifyDocumentOutput` devolveria `no_profile`/`blocked`. Diferente de zero significa que a
publicação desliga a emissão de CT-e dessas notas em silêncio.

**3. Guard que não guardava.** `document-output-source.contract.ts` listava
`src/trips/infrastructure/trip.routes.ts`, caminho que não existe (o arquivo está em
`presentation/`), e o laço fazia `continue` quando o arquivo faltava: um dos três caminhos prometidos
nunca era lido e o teste passava verde. Mesmo "pular não é passar" da spec 092. Caminho corrigido e o
`continue` virou falha explícita.

**4. `city_unknown` virou estado morto.** `readDocumentReason` não o devolve mais em nenhum ramo e
`expectedDocument` na API não admite mais `null`, então **P2/RF2/CA02 desta spec ficaram
inalcançáveis**: o caso "sem município resolvido" agora chega como `no_profile` ou `blocked`. O
frontend segue aceitando `null` por tolerância, corretamente. Fica registrado aqui em vez de removido:
o vocabulário ainda protege bundle novo contra API antiga.

**5. `nfseProfileId` ainda não entregou o valor prometido.** O campo viaja até a tela, mas a linha não
o repassa ao diálogo — o operador escolhe o perfil de novo. Não é defeito; é a promessa do ADR-0071
que falta cumprir.
