# Evidência — Spec 218

## Fase 0 (T0/T0b) — 29/09/2026

Investigação só de leitura, sem edição de código. Achados abaixo já refletidos em `plan.md` e nas
decisões do `spec.md` (D1).

### T0.1 — call site de `document.deliveryProof`

`apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts:835-844`
(`toDriverDocument`):

```
const deliveryProof = resolveProofSettingsForRecipient({
  lookup: proofSettings,
  recipientTaxId: row.recipientTaxId ?? '',
})
```

Segundo call site irmão, para "Fotos pendentes": mesma função, linha 328 do mesmo arquivo. A query
de origem (linhas 395-415, `selectDistinctOn`) já seleciona `recipientTaxId`
(`nfeParticipants.taxId`, linha 407) mas **não** seleciona `emitterTaxId` — RF-C3 precisa adicionar
esse select nos dois pontos.

### T0.2 — call site de `attachmentMode` efetivo para o motorista

`apps/api-transportada/src/trips/presentation/me-trip.routes.ts:721-734`, rota `GET` em
`OCCURRENCE_TYPES_PATH` (`me-trip.routes.ts:99`, `${API_ME_CURRENT_TRIP_PATH}/occurrence-types`) →
`listFieldOccurrenceTypes` em
`apps/api-transportada/src/trips/application/list-field-occurrence-types.use-case.ts:35-47`. Linha
43: `attachmentMode: type.attachmentMode ?? 'off'`. Filtra por `type.active && type.stage ===
TRIP_OCCURRENCE_STAGE.delivery` (linha 41). Reaproveitado por duas rotas: o motorista
(`me-trip.routes.ts:724`) e o escritório em nome do motorista
(`trip-field-office-occurrence.routes.ts:68`) — plugar a resolução de 3 camadas aqui cobre as duas.

### T0.3 — junção `nfe_documents`/`nfeParticipants` → `contractors.taxId`

Não existe leitura (SELECT/JOIN) do lado da API hoje. A ligação existe do lado da **escrita**, no
worker:

- `apps/worker-transportada/src/nfe-imports/domain/delivery-registry.policy.ts:34-41`
  (`resolveDeliveryRegistryCandidates`) pega o `party` com `role === 'emitter'`.
- `apps/worker-transportada/src/nfe-imports/infrastructure/delivery-registry.writer.ts`
  (`ensureDeliveryRegistry`) faz o upsert em `contractors`, chamado de
  `apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.ts:450-459`.

Ou seja: `contractors.taxId` **já é** o CNPJ do emitente por construção (ADR-0048 §1) — não existe
ambiguidade, só falta o _read_ do lado da API. Primitivos reaproveitáveis:
`findContractorByTaxId`/`findByTaxId` em
`apps/api-transportada/src/delivery-clients/infrastructure/drizzle-contractor.repository.ts:50-59`
(hoje usado por `address-correction`). `emitterTaxId` já sai em `GET /nfe-documents`
(`apps/api-transportada/src/nfe-documents/presentation/nfe-documents.routes.ts:316`, coluna em
`apps/api-transportada/src/database/nfe.schema.ts:505`), só não no snapshot do motorista (ver T0.1).

### T0.4 — rotas de `company_occurrence_types` (CRUD do catálogo)

`apps/api-transportada/src/trips/presentation/trip.routes.ts:174`:
`OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'`. Mesmo arquivo hospeda outras rotas
de `company-settings` — confirma que a rota nova de `attachment-overrides` (RF-B3) e o campo `flow`
(RF-B5) entram ali, sem arquivo próprio.

### T0b — os dois botões de ocorrência usam a mesma lista de tipos?

**Não.** Achado que mudou o desenho de D1 (registrado na spec):

- **"Registrar ocorrência" por nota** (`onDocumentOccurrence`,
  `DriverStopCard.component.tsx:832-889`) usa `occurrenceTypes.types` — vindo de `GET
/me/trips/current/occurrence-types` (T0.2), o catálogo configurável de verdade
  (`company_occurrence_types`, com `id`/`name`/`attachmentMode`). A mesma variável é passada para
  `DriverNotDeliveredForm` (linha 898) — "Não entreguei" (spec 179) e "Registrar ocorrência" (spec 079) compartilham a mesma fonte.
- **"Deu problema" por parada** (`DriverStopOccurrenceForm.component.tsx` +
  `useStopOccurrenceForm.hook.ts`) **não usa `occurrenceTypes` em nenhum momento**. Usa
  `DRIVER_OCCURRENCE_KINDS`, constante fixa
  (`apps/frontend-driver/src/modules/driver-trip/shared/driverTrip.types.ts:169-176`):
  `['unexpected_charge', 'long_wait', 'dock_closed', 'appointment_required', 'other']`, cópia por
  valor de `TRIP_STOP_OCCURRENCE_KINDS`
  (`apps/api-transportada/src/database/trip.schema.ts:1265-1272`) — enum fixo em código, gravado em
  `trip_stop_occurrences.kind`, sem nenhum conceito de `attachmentMode`.

**Conclusão:** não é "falta uma regra de roteamento" — são dois modelos de dado incompatíveis (um
configurável com FK para o catálogo, outro fixo em código sem `attachmentMode`). Levado ao usuário
em 29/09/2026; decisão: migrar o enum fixo para dentro do catálogo, com um campo novo `flow`
(`document | stop`) editável na mesma tela de cadastro (`OccurrenceTypeCatalogPanel`). Ver `spec.md`
D1 e RF-B5, `plan.md` "Backend — RF-B5".

## Pendências para a próxima evidência

- Rótulo exato de cada `DRIVER_OCCURRENCE_KINDS` (para nomear os 5 tipos novos do catálogo sem
  inventar texto) — confirmar em `driverTrip.locale.json` na Fase 2.
- Confirmar se o `PUT`/criação de `company_occurrence_types` é a mesma rota (upsert) ou duas
  diferentes, antes de decidir se `flow` é obrigatório só na criação.

## Fase 4 (T16–T20) — app do motorista, 29/09/2026

### T16 — extração de `ProofCaptureFields` (refatoração pura)

`DeliveryProofSection` (`DriverStopCard.component.tsx`, que estava na linha 997 como o plano dizia)
virou `DeliveryProofSection` (estado `concludedAt`, `handleComplete`, botão "Concluir") +
`ProofCaptureFields` (toda a captura: botões, miniaturas, campos, recorte, assinatura, lightbox),
com dois pontos de extensão: `renderFooter(capture)` e `summary` (ocupa o lugar dos campos com o
estado montado por baixo — é o "Comprovante concluído às HH:MM"/"Editar"). O código ficou **no mesmo
arquivo** de propósito: ~15 contratos leem `DriverStopCard.component.tsx` como texto e fatiam por
`export function DeliveryProofSection(` até o fim do arquivo; mover para outro arquivo quebraria os
contratos sem mudar comportamento.

Gate, antes × depois da extração (`bun test` dos três entrypoints, relatório junit comparado por
nome de teste): **762 pass / 0 fail / 1523 expects × 762 pass / 0 fail / 1523 expects, mesma lista
de 762 nomes** (`diff` vazio). Lint, typecheck e build verdes. Commit `227b8b83b`.

### T17 — contratos antes, vistos falhar

`test/driver-trip/pre-delivery-proof-gate.contract.ts` (comportamento) e
`test/driver-trip/pre-delivery-proof-gate-wiring.contract.ts` (ligação no cartão, fila, textos),
registrados em `test/driver-trip.contract.test.ts`. Vistos falhar: o primeiro não carregava
(`Export named 'awaitingDeliveryAttachmentKey' not found`), o segundo 0 pass / 9 fail. Casos: nada
`required` (padrão, tudo opcional/off, e `receivedBy` sozinho em `required` — nunca bloqueia) mantém
o "Entreguei" de sempre; cada campo que bloqueia em `required` abre o gate; "Confirmar entrega" só
habilita com `listMissingProofFields` vazia; lançamento tardio sem exceção (a decisão só recebe o
plano); **nota em aberto** — viagem `dispatched` e `in_transit`, nota `loaded`, `photo: required`
vindo do snapshot liga o gate, e a mesma nota lida antes e depois da configuração existir muda de
comportamento na leitura seguinte. Commit `57056ce5d`.

### T18 — o gate

- `requiresProofBeforeDelivery(plan)` (`proofFormPlan.service.ts`): `listMissingProofFields` do
  formulário vazio não vazia. `DocumentRow` decide com
  `requiresProofBeforeDelivery(resolveProofFormPlan(proofSettings))`: sem obrigatório, "Entreguei"
  entrega no primeiro toque (regressão zero); com obrigatório, o toque abre `PreDeliveryProofGate`
  ali mesmo (P1) — a mesma `ProofCaptureFields` + "Confirmar entrega" (desabilitado, com "Para
  confirmar, falta: …" em `role="status"`) + "Cancelar". Entregar é um caminho só
  (`confirmDelivery`), usado pelo toque direto e pelo gate.
- **Divergência do plano (RF-A3):** o plano supunha que enfileirar o anexo na hora "preserva a mesma
  ordem de fila". Não preserva: sem `deliver` na fila, o anexo entrava em `document:<id>`, que drena
  sozinho 3 s depois da foto (`PROOF_AUTO_DRAIN_GRACE_MS`), e a API recusa canhoto de nota sem
  entrega registrada (`attachDeliveryProof` → `findDeliveryEventId` nulo →
  `TRIP_DOCUMENT_NOT_REACHABLE`) — o canhoto ficaria recusado na fila, e a drenagem automática pula
  recusado. Correção: o anexo do gate (`awaitingDelivery: true`) entra na chave
  `awaiting-delivery:<id>`, que nenhuma drenagem leva (nem o envio manual) e que conta como pendente
  sem ligar o relógio de 30 s; quando o `deliver` entra na fila (`reportWithLocation`),
  `releaseAttachmentsAwaitingDelivery` passa o grupo para a chave do evento — "evento primeiro", como
  qualquer anexo. A foto continua no IndexedDB desde o toque (spec 203).
- `.deliveryGate` sem quadro de `fieldset`: com `fieldset` (`min-inline-size: min-content` + borda e
  recuo) a página medida ia a 388 px em 375 — o smoke `canhoto:` reprovou por isso antes da correção.
- Gates: `bun run check` (lint + typecheck + 789 testes + build) verde; `bun run smoke` verde —
  service worker 2/2, app 24/24, incluindo o novo "comprovante obrigatório: Confirmar entrega só com
  a foto, e o canhoto sobe depois da entrega" (desabilitado sem foto; 4 s depois da foto nenhum
  `/proof` saiu; depois do confirmar, `/deliver` antes de `/proof`; sem rolagem horizontal; alvos ≥
  44 px). Rodado local, Playwright na origem sintética 53112. Commit `5dbf1761c`.

### T19 — o app só lê

Nenhum arquivo de `src/` reimplementa a precedência — o único `??` é `document.deliveryProof ??
stopProofSettings` (documento → parada, o shape antigo da spec 082, não uma camada de exceção). O
comentário de `DriverTripDocument.deliveryProof` diz agora que o valor chega resolvido em três
camadas; contrato novo reprova qualquer `contractorOverride`/`recipientOverride`/
`resolveWithOverrides` em `src/` (provado por mutação). O `attachmentMode` de ocorrência só resolve
por nota quando o app mandar `contractorId`/`recipientTaxId` (T9) — isso é da Fase 4b. Commit
`da4be2632`.

### T20 — revisão de design (web.md §15)

Prints em 375 px (Playwright, mesmo mock do smoke, foto obrigatória, assinatura opcional):
`prints/t20-antes-da-entrega-vazio-375.png`, `prints/t20-antes-da-entrega-anexada-375.png` e
`prints/t20-depois-da-entrega-anexada-375.png`. Antes e depois, a captura tem a mesma geometria
medida (item da nota de 33 a 356 px nos dois; controles de 46 a 343 px) — o mesmo componente. O
gate acrescenta só o título "Comprovante da entrega", uma linha de orientação e, no lugar de
"Concluir", "Confirmar entrega" (desabilitado em cobre esmaecido) + "Cancelar", com o aviso do que
falta em cobre, o mesmo tom do "Não entreguei".

Achado anterior a esta spec, não corrigido aqui: com a foto anexada, a linha miniatura + "Foto do
canhoto anexada" + "Ver"/"Remover" tem min-content de ~297 px, maior que o conteúdo do cartão da
parada em 375 px (283 px). O item da nota cresce 14 px para dentro do recuo do cartão — nos dois
formulários, antes e depois da entrega, igual. Não chega a rolar a página (o smoke confere), mas em
aparelho de 320 px chegaria.

### Pendências e limites conhecidos

- Legado `/minha-viagem` (`frontend-transportada`) sem o gate — Fase 5 (T24).
- Depois que o canhoto **sobe** (sai da fila) antes de o snapshot confirmar a entrega — o caso
  comum com rede —, a seção de depois da entrega ainda nasce vazia: a correção abaixo lê a fila, e
  a fila já não tem o anexo. O servidor tem (`proofPending` cai para `false`), mas a tela não mostra
  "anexada" sem o arquivo local. Mesmo comportamento de antes depois de recarregar a página.
- Fechar o gate tocando "Entreguei" de novo (o botão alterna) não descarta a foto: é "volto depois",
  e reabrir o gate mostra a foto anexada (lida da fila). Se o motorista nunca voltar nem devolver a
  nota, o anexo segue esperando até o descarte de 7 dias.
- O aviso novo de fila cheia (abaixo) reusa o mesmo primitivo do "Preencha este campo"
  (`proofFieldError`, `role="status"`), sem print próprio: forçar o teto de 30 itens / 50 MB no
  Playwright pede um arnês que o smoke não tem.

### Resolvido depois da Fase 4 (29/09/2026)

As três lacunas acima, cada uma com contrato visto falhar antes e commit próprio. Base antes de
começar: `bun run check` 790 pass / 0 fail / 1601 expects (+ `dist` 6/6).

1. **Fila cheia marcava a foto como anexada** (`3ba6c6762`). `onProof` passa a devolver
   `Promise<boolean>` (se o anexo entrou na fila); `handleProof` da página devolve
   `outcome === 'queued'`, e `false` também na falha. `attach()` só marca anexada, grava a chave e
   mostra a miniatura depois do aceite; recusado, mostra no formulário "Fila cheia: não deu para
   salvar a foto agora…" (`proofCapture.refused.photo`/`.signature`, pt-BR e en). Com isso o gate
   não habilita "Confirmar entrega" sem canhoto na fila. Contrato
   `test/driver-trip/proof-queue-refused.contract.ts` (0/5 antes; 795 pass depois).
2. **A seção de depois da entrega nascia vazia com o canhoto na fila** (`013ca9350`).
   `EventQueueItemView` leva `proofAttachments` (chave, kind, arquivo) de cada grupo, e
   `resolveQueuedProofAttachments` devolve o último anexo por kind de uma nota — no grupo de espera,
   no da entrega enfileirada ou no órfão. `ProofCaptureFields` lê isso uma vez, ao montar
   (`useState` preguiçoso): anexada, chave e miniatura (`usePhotoPreviewUrl(initialBlob)`) nascem
   dali. Lida uma vez de propósito — o anexo que sobe sai da fila, e a tela não volta a "Tirar
   foto" por isso. Contrato `test/driver-trip/proof-queued-at-mount.contract.ts` (não carregava
   antes: `resolveQueuedProofAttachments` inexistente). Duas asserções antigas mudaram de forma, sem
   mudar o que guardam: `event-queue.contract.ts` (as duas visões com anexo ganham
   `proofAttachments`) e `proof-two-attachments.contract.ts` (as duas `usePhotoPreviewUrl(` e o
   `attachedKey` por kind agora nascem da fila). 801 pass.
3. **Cancelar o gate ou "Não entreguei" deixava a foto órfã** (`65791ed98`).
   `discardAttachmentsAwaitingDelivery` apaga só `awaiting-delivery:<id>` daquela nota — o que já
   foi solto para o grupo da entrega fica. "Cancelar" do gate chama o descarte
   (`discardProofAwaitingDelivery` do hook); a devolução aceita na fila descarta a espera da nota
   devolvida dentro de `reportNotDelivered` (recusada pela fila, a foto fica — a entrega ainda pode
   acontecer); confirmar "Não entreguei" também fecha o gate aberto da mesma nota. Contrato
   `test/driver-trip/proof-awaiting-delivery-discard.contract.ts` (não carregava antes). 808 pass.

Gates no fim: `bun run check` (lint + typecheck + 808 testes / 1671 expects + build + `dist` 6/6)
verde; `bun run smoke` verde — service worker 2/2, app 24/24, incluindo "comprovante obrigatório:
Confirmar entrega só com a foto, e o canhoto sobe depois da entrega". Rodado local, Playwright na
origem sintética 53112.

## Fase 4b — decisões de produto, resolvidas em conversa (29/09/2026)

A execução da Fase 4b parou antes de escrever código, achou 3 lacunas reais entre spec/plan e o
código (a Fase 2 não fechou a escrita de `occurrenceTypeId` na rota de parada; `ProofCaptureFields`
não serve para foto de ocorrência; ocorrência de nota com foto não cabe na chamada direta), e uma
pergunta de onde o botão único mora. As decisões (D2, D3, D4 do `spec.md`, seção "Decisões"):

- **D2** — `company_occurrence_types` ganha `stop_kind` (nullable, só em `flow: stop`); a rota de
  parada aceita `occurrenceTypeId`, deriva `kind`/`stop_kind` da coluna do tipo, nunca do nome.
- **D3** — Ocorrência de nota sem foto: chamada direta de sempre. Com foto: item `documentOccurrence`
  da fila (o mesmo do "Não entreguei", spec 179) — nunca upload dentro da chamada direta.
- **D4** — Botão por nota, sempre visível (não mais escondido atrás do "Cheguei", e não mais um
  painel único por parada). Rótulo curto "Ocorrência", ícone + tooltip. Tipo `flow: stop` escolhido
  ali registra a ocorrência da **parada** (não da nota onde o toque aconteceu); tipo
  `flow: document` registra na nota escolhida.

Limite registrado pela execução, sem decisão pendente (é trabalho futuro, não bloqueio): o snapshot
do motorista não traz `contractorId`/`recipientTaxId` da nota, então a exceção de ocorrência por
contratante/destinatário (História P3 do `spec.md`) não chega ao app nesta spec — só o
`attachmentMode` geral do tipo. Requer mudança no snapshot (`GET /me/trips/current`) numa spec
futura.

Fase 4b retomada com estas decisões — ver o registro dela mais abaixo quando terminar.

## Fase 5 — dispensada por decisão do usuário (29/09/2026)

`VITE_DRIVER_APP_URL` já está ligada em produção; o legado `/minha-viagem`
(`apps/frontend-transportada/src/modules/driver-trip/`) não serve mais nenhum motorista. O usuário
confirmou: "pelo menos após essa correção vamos apenas utilizar o app novo". A Fase 5 do `tasks.md`
não roda — nenhuma réplica por cópia de valor no painel antigo.

## Fase 4b (T21–T23) — botão único de ocorrência, 29/09/2026

Base conferida antes de começar: os 5 tipos `flow: stop` existem por empresa (migration
`20260929131715_occurrence_stop_flow`, stage `delivery`, `attachment_mode: optional`) e `GET
/me/trips/current/occurrence-types` já devolvia `flow` (T9). App do motorista: 808 pass / 0 fail.

### D2 no backend — `stop_kind` e `occurrenceTypeId` na rota de parada

- **Contratos antes** (`a6092990b`), vistos falhar 7: `test/trip-occurrence/stop-occurrence-type.contract.ts`
  (corpo com `occurrenceTypeId` ou `kind`, nunca os dois nem nenhum; o kind sai do `stop_kind`, e a
  sugestão de cobrança e o aviso leem esse kind; tipo sem `stop_kind` vale `other`; tipo que não é de
  parada ativo desta empresa é 422 `OCCURRENCE_TYPE_NOT_STOP` sem gravar nada; o corpo antigo com
  `kind` grava sem tipo; o catálogo do motorista leva `stopKind`) e a coluna em
  `test/trip-schema/occurrence-type-flow.contract.ts`.
- **Implementação** (`e0a73b41b`): migration `20260929144801_occurrence_type_stop_kind` (coluna
  nullable + CHECK no vocabulário fixo; backfill em três passos — o `kind` das ocorrências já
  amarradas ao tipo, que sobrevive ao tipo renomeado; o rótulo semeado; `other` para o resto dos
  tipos de parada; rollback só tira a coluna). `reportStopOccurrence` aceita `kind` **ou**
  `occurrenceTypeId`; com o tipo, confere empresa + `flow: stop` + ativo
  (`findStopOccurrenceType`), grava `occurrence_type_id` e usa o kind derivado para a sugestão de
  cobrança (060) e o template do aviso. O cadastro grava `stop_kind: other` num tipo que vira de
  parada sem valor (e preserva o que já tinha). `GET /me/trips/current/occurrence-types` expõe
  `stopKind`; a tela de verificação (RF-E1) continua com o shape dela (mapeamento explícito).
- **Não mudou:** a rota do escritório em nome do motorista (`trip-field-office`) segue mandando só
  `kind` — grava sem `occurrence_type_id`, como antes. O corpo antigo com `kind` continua aceito na
  rota do motorista, porque a fila do aparelho guarda itens de antes da troca.
- **Gates:** contratos da API 8272 pass / 0 fail (23 skip, os de banco); `db:test` contra o Postgres
  de teste (`make migration-test` equivalente, `.env.test`) 112 pass / 0 fail — inclui a asserção
  nova `occurrence-stop-kind.assertion.ts` (tipo renomeado, tipo do operador, tipo de nota, nenhum
  tipo de parada sem `stop_kind`); integração `stop-occurrence-photo` (+3 casos D2: grava tipo e
  kind; tipo de outra empresa/de nota/aposentado recusado; cadastro grava `other` e preserva) e
  vizinhas 60 pass / 0 fail; typecheck, lint e `db:check` verdes.

### T21 — contratos antes, vistos falhar (`83449e0d9`)

`test/driver-trip/occurrence-registration.contract.ts` (comportamento) e
`test/driver-trip/occurrence-registration-wiring.contract.ts` (ligação). Vistos falhar: o entrypoint
não carregava (`occurrenceRegistration.service` inexistente) e a ligação saiu 0 pass / 11 fail.
Casos: a lista traz tipos de nota e de parada juntos, cada um com o `attachmentMode`; `required` sem
foto não habilita "Registrar" e habilita ao capturar, sem nenhuma entrada de upload na decisão (P5);
confirmar chama uma rota só, pelo `flow` (nota sem foto → chamada direta; nota com foto → item
`documentOccurrence`; parada → fila da parada com `occurrenceTypeId`, sem a nota) — nunca duas,
nunca nenhuma; o item antigo da fila com `occurrenceKind` continua saindo com `kind`; "Não entreguei"
oferece só tipos de nota.

Três asserções da ligação mudaram de forma na T22, sem mudar o que guardam: a dica passou de
`title` para o `Tooltip` do design system (o `title` nativo demora e o próprio componente registra
por quê); gate e rota passaram a ser lidos no hook (`web.md` §4, estado e submit no hook); e "fora
do Cheguei" virou "presente nas duas ramificações da nota", com o antes-do-Cheguei provado no smoke.

### T22 — o componente único (`8b705e800`)

- `DriverOccurrenceRegistrationForm.component.tsx` + `useOccurrenceRegistrationForm.hook.ts` +
  `shared/occurrenceRegistration.service.ts` substituem o painel inline de `onDocumentOccurrence` e
  `DriverStopOccurrenceForm`/`useStopOccurrenceForm` (apagados). Botão "Ocorrência" (ícone `alert`,
  `Tooltip` "Registrar um problema desta nota ou da parada") em cada nota: na nota em aberto, antes
  e depois do "Cheguei", e na nota já resolvida (cobrança inesperada acontece depois da entrega). O
  "Deu problema" da parada saiu do cartão.
- **Divergência do plano (registrada com o coordenador antes de implementar):** `ProofCaptureFields`
  **não** é reaproveitado — é a captura do canhoto (`attach()` vai sempre para a fila de comprovante,
  e o campo "Documento de quem recebeu" aparece sempre); usá-lo recriaria o defeito que a spec 209
  corrigiu. O formulário usa o bloco de foto de ocorrência que já existia
  (`reduceOccurrencePhotoToJpeg`, "Tirar foto"/"Anexar") e o gate reaproveita
  `listMissingProofFields`/`resolveProofFormPlan` com um plano de campo único (`photo =
attachmentMode`).
- Foto obrigatória de parada nunca é derrubada pela fila cheia: vai por `reportAllOrNothing` (o mesmo
  caminho tudo-ou-nada do "Não entreguei"), e a tela mostra o aviso de teto de bytes. Opcional segue
  a regra da 209 (fila cheia derruba a foto, nunca o relato).
- A prévia do aviso da parada sai do `stopKind` do tipo e cita a nota tocada.
  `findOccurrencePhotoDocument` saiu (sem uso) com os dois testes dele.
- Chaves de locale mortas removidas (`occurrence`, `documentOccurrence`, `occurrenceKind`); chaves
  novas em `occurrenceRegistration.*` (pt-BR e en).
- **Gates:** `bun run check` (lint + typecheck + 832 testes + build + `dist` 6/6) verde; `bun run
smoke` verde — service worker 2/2, app 25/25, incluindo os novos "ocorrência de parada com foto
  obrigatória: habilita ao capturar, e nunca vira canhoto" (Registrar desabilitado com "Para
  registrar, falta: a foto."; nenhum upload antes do toque; corpo com `occurrenceTypeId`) e
  "ocorrência de nota com foto" (upload, confirm e só então o `POST` com `attachmentObjectId`). O
  smoke do tipo lista agora abre "Ocorrência" **sem** tocar "Cheguei" — prova D4 na tela.

### T23 — revisão de design (web.md §15)

Prints em 375 px, Playwright com o mock do smoke (`test/spec-218-prints.smoke.spec.ts`, fora da CI,
`animations: 'disabled'` e ponteiro fora do gatilho):

- `prints/t23-obrigatoria-sem-foto-375-{light,dark}.png` — lista única com os 4 tipos ("Cliente
  ausente · Sem foto", "Avaria na carga · Foto obrigatória", "Doca interditada · Foto opcional",
  "Cobrança inesperada · Foto obrigatória"), o obrigatório escolhido: captura da foto visível,
  "Tirar foto \*", "Para registrar, falta: a foto." em cobre e "Registrar" esmaecido — o mesmo par do
  "Confirmar entrega" do gate (T20).
- `prints/t23-obrigatoria-com-foto-375-{light,dark}.png` — miniatura + "Foto da ocorrência anexada",
  "Refazer"/"Anexar", "Registrar" habilitado.
- `prints/t23-sem-foto-375-{light,dark}.png` — tipo `off` escolhido na mesma lista: sem bloco de
  foto, "Registrar" habilitado.
- `prints/t23-nota-antes-do-cheguei-375-dark.png` e `prints/t23-nota-depois-do-cheguei-375-dark.png`
  — "Ocorrência" sozinho antes do "Cheguei" e abaixo de "Entreguei"/"Não entreguei" depois, no mesmo
  estilo `ghost` de "Não entreguei". Sem rolagem horizontal nos três cenários (medido).

Achados da revisão: o primeiro print saiu com os chips "esmaecidos" — era a transição de cor do botão
capturada no meio (o chip recém-desmarcado e o recém-marcado a meio caminho), não o estado final;
com `animations: 'disabled'` o selecionado é cobre cheio com texto escuro legível. A app mantém o
tema escuro também com `prefers-color-scheme: light` (os dois prints são iguais), mesmo
comportamento do resto da app. Em 375 px os três botões da nota empilham, como já empilhavam antes
("Registrar ocorrência" era o terceiro) — o rótulo curto não os põe lado a lado nessa largura. A
caixa de "O que aconteceu" não ocupa a largura toda do formulário; é o mesmo `textarea` do antigo
"Deu problema", não corrigido aqui.

### Limites que ficam

- A exceção de ocorrência por contratante/destinatário (P3) não chega ao app: o snapshot não traz
  `contractorId`/`recipientTaxId` da nota, e o app lê o `attachmentMode` geral do tipo (registrado
  acima, fora desta spec).
- A rota de ocorrência **de nota** (`POST .../documents/:id/occurrences`) não recusa um tipo de
  `flow: stop` — o app nunca manda, mas o servidor não barra.
- A rota do escritório em nome do motorista segue por `kind`; ocorrência de parada registrada pelo
  escritório grava sem `occurrence_type_id`.
