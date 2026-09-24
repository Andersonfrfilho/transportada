# ADR-0067 — O escritório dá baixa em nome do motorista

- **Status:** aceita
- **Data:** 2026-09-18
- **Decisores:** usuário (D1, D3 e D6 decididas na conversa da spec; perfis de D1 confirmados em
  2026-09-18) e revisão Opus
- **Fecha:** a T2 da spec 156 (`specs/156-o-escritorio-da-baixa-pelo-motorista/`)
- **Revisa:** ADR-0058 §4. A máquina de estados e o ranking anti-regressão **não mudam**. A única
  diferença é que o escritório, com a permissão nova, também pode disparar os dois toques (conferir a
  carga e iniciar o trajeto).
- **Emendada:** 2026-09-18, depois da validação do architect (baixa repetida, vários motoristas,
  idempotência, isolamento, exceção à ADR-0057 e leitura do `finance`), e de novo em 2026-09-18
  pela revisão de código e segurança da T15 (prefixo `office.`, auditoria na transação, canhoto do
  motorista preservado, documento selado, hora da chegada, piso da janela e limites do upload). E de
  novo em 2026-09-20 (T8c, achado da T8b): `POST /trips/:id/close` também é do escritório.

## Contexto

O motorista registra cada etapa da entrega pelo PWA (`/minha-viagem`, rotas `/me/trips/current/...`):
conferir a carga, iniciar o trajeto, chegar na parada, registrar ocorrência, anexar o canhoto e marcar
a nota como entregue ou devolvida. Na prática, muitos não fazem isso. Eles voltam com os canhotos na
mão, e a viagem fica `in_transit` para sempre.

Quem resolve é o administrativo, dias depois, com o maço de canhotos na mesa. Hoje a tela da viagem
não deixa: as ações de campo só existem sob `trip.report`, que é do motorista, e só alcançam a viagem
**atual do motorista** que está logado.

Três perguntas precisavam de resposta antes de qualquer rota nova. Quem pode dar essa baixa? Como o
registro diz que não foi o motorista quem clicou? E como se registra uma entrega que aconteceu na
terça, mas foi digitada na sexta? Uma quarta pergunta vem da entrega em massa: como a foto de um
canhoto vai parar na nota certa.

## Decisão

### 1. Permissão própria: `trip.report-on-behalf` (spec 156 D1)

A baixa do escritório tem permissão própria, `trip.report-on-behalf`. Ela vai para `company-admin`,
`operator` e `finance`. O `finance` entra porque o canhoto às vezes chega junto da cobrança, e quem
cobra é quem está com ele na mão. Os perfis foram confirmados pelo usuário em 2026-09-18.

Nenhum outro papel a recebe: `separator`, `driver`, `aggregate`, `viewer`, `fiscal`, `contractor` e
`automation` ficam fora. Ela não é permissão de serviço: um grupo da empresa pode concedê-la, como
qualquer permissão de pessoa. Por isso o contrato "o separador não a tem" vale **por papel**: um
separador que receba a permissão por grupo passa a tê-la, por decisão de quem administra os grupos.

**Por que não reusar `trip.manage`.** O `separator` tem `trip.manage` para montar a viagem do celular,
e ele **não reporta entrega**. Essa linha entre galpão e campo já está na ADR-0043, no próprio
`authorization.policy.ts` e em `test/separator-role.contract.test.ts`. Pendurar a baixa em
`trip.manage` daria ao separador, de carona, o poder de encerrar a entrega da carga que ele mesmo
separou.

**Emenda 2026-09-18 (T8b), achado B2 da validação da T7.** O caminho antigo — `POST
.../documents/:documentId/deliver`, `.../return` e as ações `deliver`/`return` do lote
(`batch-status`), todos atrás de `trip.manage`, sem gravar `channel`/`on_behalf_of_driver_id` — saiu.
Ele era exatamente a brecha que este parágrafo descreve: o `separator` o alcançava de carona, e
nenhum registro dizia quem realmente deu a baixa. Os botões "Entregar"/"Devolver" da tela passam a
chamar `field-delivery`/`field-return` (com autoria), mostrados só quando `allowedActions` os lista.
`separate`/`load` continuam nas rotas antigas — são do galpão, nunca do campo.

**Por que não reusar `trip.report`.** `trip.report` abre as rotas `/me` do motorista, que acham a
viagem pelo **vínculo de motorista** de quem está logado. Dar essa permissão ao escritório misturaria
dois modos de achar a viagem sob um nome só. Também faria `isFieldOnlyUser`
(`driverWorkspace.service.ts`: `trip.report` sem `trip.manage`) confundir um usuário do `finance`
com um motorista, e mandá-lo para `/minha-viagem`.

As rotas do escritório (T5–T7) espelham as do motorista com o `tripId` no caminho e os mesmos casos
de uso (D2). O que muda é **como a viagem é encontrada**: pela empresa do contexto, nunca pelo
motorista. A política de estados (`trip-state.policy.ts`) vale igual para os dois caminhos.

### 2. Autoria: quem clicou e em nome de quem (spec 156 D3)

Todo registro de campo passa a gravar o **canal**, `channel` (`driver_app | office | whatsapp`,
`varchar`, sem ENUM nativo). Quando o canal é `office`, grava também `on_behalf_of_driver_id`, o
motorista da viagem. `actor_user_id` **continua sendo quem clicou**. Ele não é trocado pelo motorista
para a linha do tempo "parecer" do campo: a trilha que mente sobre o autor é pior que nenhuma.

**Qual motorista, quando a viagem tem mais de um.** Por padrão, `on_behalf_of_driver_id` é o motorista
de `position = 1` em `trip_drivers`. O payload pode trazer um `driverId` escolhido entre os
`trip_drivers` da viagem. Ele é validado: motorista fora da viagem responde 422 `DRIVER_NOT_ON_TRIP`.
Viagem sem motorista vinculado responde 422 `TRIP_WITHOUT_DRIVER`. O alvo da viagem (`FieldTripTarget`,
T3) carrega esse `driverId` opcional. A tela só mostra o seletor de motorista quando a viagem tem mais
de um (T8, T11).

A migration (T4) é aditiva nas seis tabelas de campo (`trip_document_events`, `trip_stop_events`,
`trip_stop_occurrences`, `trip_field_reports`, `trip_delivery_proofs`,
`trip_document_occurrences`). O default é `'driver_app'`, que já descreve o histórico, então não tem
backfill. Um CHECK exige `on_behalf_of_driver_id` quando `channel = 'office'`. A chave estrangeira é
**composta**, `(company_id, on_behalf_of_driver_id)`, para que o registro nunca aponte para motorista
de outra empresa. O fluxo do WhatsApp passa a gravar `whatsapp`.

**Isolamento.** A viagem é achada pela empresa do contexto. Viagem de outra empresa responde **404,
não 403**: a resposta não pode confirmar que a viagem existe.

**Idempotência.** O escritório usa a mesma tabela do motorista, `trip_field_reports`, com
`operation` própria prefixada `office.`: `office.document.deliver`, `office.document.return`,
`office.document.proof`, `office.stop.arrive` e `office.stop.occurrence` (o lote de ocorrências usa
`office.document.occurrence-batch…`). _(Emenda T15, M8: até a T15 só `field-proof` e o lote tinham o
prefixo; as outras quatro reusavam a `operation` do motorista.)_ A mesma chave
enviada por **outro ator** responde **409 `TRIP_FIELD_REPORT_KEY_REUSED`** — o mesmo código que já
existia para operação diferente, estendido para também comparar o ator (`withFieldReport`, T6).
_(Emenda 2026-09-18, decisão do líder na T3/T6: fica o código de hoje, não o 422
`IDEMPOTENCY_KEY_REUSED` que este parágrafo previa antes.)_ Ela nunca devolve o resultado de outra
pessoa.

**Baixa repetida.** No canal `office`, nota já `delivered` ou `returned` responde **409
`DOCUMENT_ALREADY_SETTLED`** e não grava evento novo. Hoje `report-document-delivery.use-case.ts`
grava `recordEvent` mesmo quando pula o `settle` (nota já baixada). O canal do motorista mantém esse
comportamento, que é idempotente para quem repete o toque na rua. O escritório não pode herdar isso:
dias depois, uma segunda baixa sobre a mesma nota criaria uma entrega fantasma na linha do tempo. O
caso real, "a entrega já foi feita e falta o canhoto", tem ação própria:
`POST /trips/:id/documents/:documentId/field-proof`. Ela anexa o comprovante ao evento `delivered`
que já existe. Se já houver comprovante daquele tipo **do próprio escritório**, ele é substituído
pelo unique `(company, stop_event, kind)`, como manda a ADR-0057, e a auditoria guarda o `objectId`
anterior (`metadata.replacedObjectId`). A ação não cria evento e não muda `delivered_at`.

_(Emenda T15, M1/M2.)_ O comprovante que o **motorista** colheu (`driver_app` ou `whatsapp`) não é
substituído: `field-proof` responde **409 `TRIP_DELIVERY_PROOF_ALREADY_CAPTURED`** — a foto da rua,
com posição e hora, é a prova mais forte da entrega. E a reserva da chave, a leitura do evento, o
upload e o comprovante correm numa transação só (antes, o comprovante gravava pelo pool, fora da
transação que reservava a chave).

A linha do tempo mostra os dois: "registrado por <usuária> (escritório) pelo motorista <nome>". Cada
registro do escritório também grava em `audit_logs`, com ator, alvo, IP e horário (`security.md`
§10). É ação sensível: encerra entrega que outra pessoa fez.

_(Emenda T15, M11.)_ A linha de `audit_logs` nasce **na transação da ação**, no caso de uso — não
depois, na rota —, com os alvos por id opaco em `metadata` (`documentId`, `stopId`, `documentIds` do
lote, `replacedObjectId`). O reenvio idempotente e o toque repetido (`changed: false`) não gravam
linha nova. O IP vem de `x-forwarded-for` e é declarado pelo cliente quando a API não está atrás do
proxy — registrado em `docs/SECURITY.md`.

### 3. A hora da entrega é informada (spec 156 D4)

A baixa do escritório registra quando a entrega **aconteceu**, não quando foi digitada. O campo
"Entregue em" (`deliveredAt`) vem preenchido com agora e pode ser mudado. Ele tem duas travas, com
códigos estáveis (classes de `ApiError` em `trips/domain/trip.error.ts` e
`trip-field-office.error.ts` — o produto não tem `shared/errors/codes.ts`):

- não aceita hora no futuro (`DELIVERED_AT_IN_FUTURE`);
- não aceita hora anterior ao despacho da viagem (`DELIVERED_AT_BEFORE_DISPATCH`). A fonte do
  despacho é `trip_dispatch_snapshots.dispatched_at`, o registro congelado no momento do despacho.
  _(Emenda T15, M9.)_ Viagem legada sem esse registro usa `trips.created_at` como piso — antes,
  qualquer data passava.

_(Emenda T15.)_ "Devolvido em" (`returnedAt`) responde com `RETURNED_AT_IN_FUTURE` /
`RETURNED_AT_BEFORE_DISPATCH`, e a chegada do escritório (`POST …/stops/:stopId/arrive`) ganhou
`arrivedAt` opcional, na mesma janela, com `ARRIVED_AT_*`. A chegada retroativa **não** desloca a
previsão das paradas pendentes (spec 109 D3 é para a chegada ao vivo), e o `in_transit` que ela
provoca leva a hora informada. A parada que o escritório fecha sem chegada registrada ganha
`arrived_at` = a primeira hora de entrega/devolução dela (C1), e parada e viagem fecham com a maior
hora das notas, não com a da última digitada (M3).

A hora informada vai para `trip_documents.delivered_at` e para o `occurred_at` do evento. A hora em
que o registro foi gravado fica à parte, em `recorded_at`. Essa coluna **ainda não existe**: hoje o
`occurred_at` dos eventos é `defaultNow()` e faz os dois papéis. A migration de autoria (T4) a cria
junto com `channel`, com default `now()`. Uma coluna não substitui a outra: `delivered_at` responde
quando a carga chegou, e `recorded_at` responde quando alguém contou isso ao sistema. O motorista
continua sem mandar o campo, e para ele as duas horas coincidem.

### 4. A foto identifica a nota, mas quem confirma é a pessoa (spec 156 D6)

Na entrega com canhoto, o sistema tenta descobrir de qual nota é a foto, nesta ordem:

1. **Código de barras da chave de acesso** (Code128, 44 posições), com o leitor que já existe
   (`@zxing/library`, `barcodeDecoder.service.ts`). Só funciona quando a foto pega o corpo do DANFE,
   não só o canhoto destacado.
2. **Número da nota por OCR**, comparado apenas com as notas daquela viagem. É **experimental**,
   desligado por padrão e com interruptor por empresa, no padrão da spec 152 e da ADR-0065. O
   candidato só vale se bater com **exatamente uma** nota da viagem. A dependência nova ganha ADR
   própria (T13, code-standart §13).
3. **Escolha manual** entre as notas selecionadas. É sempre possível, e é o caminho garantido.

A identificação **sugere e nunca decide**. Nenhuma foto é gravada numa nota sem a pessoa confirmar o
passo. Se a nota lida for outra nota da seleção, o assistente oferece trocar. Se a nota lida **não
pertencer à viagem**, o assistente bloqueia com "este canhoto é da nota X, que não está nesta
viagem". É a mesma régua da ADR-0065: a máquina lê, a pessoa grava.

### 5. Exceção à ADR-0057 §1: assinatura exigida (spec 156 D8)

O comprovante segue a configuração da empresa. Se a empresa exige foto, o escritório não conclui a
entrega sem ela. A assinatura é a exceção, e ela é **explícita**: com assinatura `required`, o
escritório não colhe assinatura, porque quem assina é o recebedor, e ele não está no escritório. O
escritório cumpre a exigência com a **foto do canhoto assinado** mais o **nome do recebedor**. Isso
fica registrado como comprovante do canal `office`, nunca como assinatura digital. Se o escritório
digitar o documento do recebedor, ele passa pelo mesmo envelope e pela mesma máscara da ADR-0057 §3.

_(Emenda T15, A2.)_ Com assinatura `required`, o canal `office` exige a foto (422
`TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`) **e** o nome de quem recebeu, não vazio (422
`TRIP_DELIVERY_PROOF_RECEIVER_NAME_REQUIRED`). O documento digitado, que a T6 descartava, agora é
selado (`sealDocument`) e mascarado (`maskTaxId`) no mesmo envelope do motorista; com a configuração
`off` é recusado como no motorista. A migration aditiva
`20260918170550_delivery_proof_office_receiver_document` relaxa
`trip_delivery_proofs_receiver_document_check` para `channel = 'office'`, no mesmo molde da emenda 1
abaixo. O arquivo do escritório tem teto próprio, `OFFICE_PROOF_MAX_BYTES` = 960 KiB, abaixo do
corpo máximo da API (1 MiB, 413 antes da rota) — o `DELIVERY_PROOF_MAX_BYTES` de 2 MB nunca era
alcançável —, e os primeiros bytes precisam bater com a imagem declarada (JPEG, PNG ou WebP).

**Emendas 2026-09-18 (T6), decididas pelo líder:**

1. **O `CHECK` de `trip_delivery_proofs` que travava `receiver_name` à assinatura foi relaxado por
   migration aditiva.** `trip_delivery_proofs_receiver_check` era
   `kind = 'signature' or length(receiver_name) = 0` — e bloquearia exatamente o caso que este
   parágrafo pede: canhoto `kind: 'photo'` do canal `office` com o nome do recebedor. A migration da
   T6 (`20260918070043_delivery_proof_office_receiver_name`) troca para
   `kind = 'signature' or channel = 'office' or length(receiver_name) = 0` — puro relaxamento, sem
   perda de dado; o `rollback.sql` recria o `CHECK` antigo e **falha** (sem apagar nada) se já
   existir uma linha `office`+`photo` com `receiver_name` preenchido. `attachDeliveryProof`
   (`application/attach-delivery-proof.use-case.ts`) só carrega `receiverName` quando `isSignature`
   **ou** `authorship.channel === 'office'` — o motorista continua exatamente como antes.
2. **Nasce `TRIP_DELIVERY_PROOF_PHOTO_REQUIRED` (422)**, no padrão de
   `TripDeliveryProofDocumentRequiredError`, para `settings.photo === 'required'` sem foto. Aplicado
   **só ao canal `office`** nesta T6 — o motorista hoje não tem essa verificação no backend (a
   exigência de foto só existe hoje na configuração e no front do motorista, nunca checada no
   `attachDeliveryProof`/`report-document-delivery` dele). Estender ao motorista é decisão fora da
   spec 156, registrada como pendência no `evidence.md` da T6.

## Alternativas rejeitadas

**Dar `trip.manage` para as ações de campo.** Rejeitada: o separador a tem, e ele não reporta entrega
(§1).

**Dar `trip.report` ao escritório.** Rejeitada: ela é a chave das rotas `/me`, que acham a viagem
pelo motorista logado. Também mudaria a detecção do espaço do motorista no frontend (§1).

**Gravar o motorista como `actor_user_id` quando o escritório registra.** Rejeitada: a trilha passaria
a dizer que o motorista fez algo que ele não fez. O motorista entra como `on_behalf_of_driver_id`, e
o ator continua sendo quem clicou.

**Usar a hora da gravação como hora da entrega.** Rejeitada: a baixa do escritório chega dias depois.
Carimbar a sexta numa entrega de terça falsearia o SLA e o relatório de pontualidade.

**Dar `fleet.read` ao `finance` para ele abrir a viagem.** Rejeitada: `fleet.read` abre o cadastro
de todos os motoristas, com CPF, CNH, PIX e endereço. Quem cobra não precisa disso (`security.md` §1,
LGPD).

**Ler a viagem por `trip.read`.** Rejeitada: `trip.read` é do motorista e do agregado, e as rotas de
leitura da empresa não recortam pelo vínculo. Seria BOLA (API1): o motorista leria qualquer viagem
da empresa.

**Aceitar a identificação automática sem confirmação**, quando o código de barras é lido com
certeza. Rejeitada: o código lido prova de qual nota é o DANFE fotografado, mas não prova que aquele
papel é o canhoto da entrega que se está registrando. A confirmação custa um toque, e um canhoto na
nota errada custa uma cobrança contestada.

## Consequências

- `trip.report-on-behalf` entra no catálogo (`authorization.policy.ts`) e nos três papéis. O
  contrato `test/authorization.contract.test.ts` prende os perfis positivos e os negativos, incluindo
  o separador, que tem `trip.manage` e continua sem ela.
- O frontend espelha o catálogo em `useAuthMe.query.ts`, na matriz de permissões
  (`permissionGroups.constant.ts`) e nos rótulos (`identity*.locale.json`). Os contratos de paridade
  (`frontend-contract.test.ts`, `permission-matrix.contract.ts`) falham se a API mudar sozinha. Sem
  isso, o `/auth/me` de um `operator` seria recusado pela allowlist, e a tela cairia em
  "Indisponível".
- **Leitura da viagem para o `finance`.** A leitura da viagem é `fleet.read` (`TRIP_READ_POLICY`), e
  o `finance` não a tem. A saída escolhida é restrita. Nasce uma variante de política "qualquer uma
  de" (`anyPermission`), aplicada **só** a cinco rotas, com `['fleet.read', 'trip.report-on-behalf']`:
  `GET /trips`, `GET /trips/:id`, `GET /trips/:id/stops`,
  `GET /trips/:id/documents/:documentId/proof` e `GET /trips/:id/documents/:documentId/occurrences`.
  Para quem não tem `fleet.read`, `driverTaxId`, `driverEmail` e `driverPhone` vêm nulos, e
  `driverName` continua. `/fleet/drivers`, o feed e a geometria continuam só com `fleet.read`. Isso
  entra na T7, que passa a ser 🧠. No frontend, a T8 troca `TRIP_READ_PERMISSION` por
  `canReadTrip(permissions)`, e o detalhe funciona sem `useFleet`.
  - **Emenda da T7 (2026-09-18).** O recorte fica no serializador do detalhe: `canReadDriverContact`
    é obrigatório e vem de `fleet.read`. Os nulos só chegam a quem antes recebia 403, então nenhum
    leitor antigo quebra. Mesmo assim, o validador do frontend passou a aceitar `null` nos três
    campos, no mesmo commit. A variante `anyPermission` só existe em `GET`: o roteador derruba o
    boot se ela aparecer em outro método.
  - **A lista de ações permitidas não entra no detalhe (spec 156 D10).** Ela é uma rota própria,
    `GET /trips/:id/allowed-actions`, com a mesma `anyPermission`. O validador do detalhe no
    frontend recusa chave desconhecida, e uma aba com bundle antigo cairia em "Indisponível" se o
    detalhe ganhasse uma chave nova. A rota nova não tem esse risco, e dispensa a promoção em duas
    etapas.
- O relatório de pontualidade passa a usar `delivered_at`, não `recorded_at`. É o número certo, mas
  ele muda para as viagens com baixa retroativa, e a mudança é registrada no `evidence.md` da spec.
- Nenhum log leva a imagem do canhoto, o documento de quem recebeu ou o nome do destinatário
  (`security.md` §1).

## Emenda 2026-09-20 (T8c) — encerrar também é do escritório, e com motivo

Achado da revisão da T8b: `POST /trips/:id/close` pedia `trip.manage`. Isso deixava o `separator`
encerrar a viagem — o mesmo galpão que este ADR já tira de perto da baixa — sem confirmação e sem
olhar as notas em aberto. Pior: `completed` trava toda baixa (`checkTripDocumentTransition` →
`tripCompleted`), então um toque sem querer congelava nota sem entrega nem devolução, sem nenhum
registro de quem fez isso nem por quê.

**Decisão do usuário: "escritório, com motivo".** A rota passa a exigir `trip.report-on-behalf`, a
mesma permissão do resto deste ADR — nada de papel novo. Encerrar com nota em aberto (nem
`delivered`, nem `returned`, nem liberada) exige um motivo em texto; com todas as notas fechadas, o
motivo é opcional. Sem ele quando exigido, `422 TRIP_CLOSE_REASON_REQUIRED`
(`trip-close.policy.ts`, pura — só decide se o motivo é obrigatório, olhando as notas já carregadas).

**Trilha.** `trips` ganha `closed_at`, `closed_by_user_id` (FK composta por empresa, como
`requires_mdfe_actor_user_id`) e `close_reason`, todas aditivas. ⚠️ **As três colunas registram o
encerramento manual pelo escritório — nunca "quando a viagem terminou".** `trips.status` também
chega a `completed` sozinho, derivado (`deriveTripStatus`, quando todas as notas fecham), sem passar
por `POST /trips/:id/close`; nesse caminho as três colunas continuam `null`. Ler `closed_at` como
data de fim da viagem erra em silêncio para toda viagem que nunca precisou do botão. Uma linha em
`audit_logs` nasce na
mesma transação do fechamento (`office.trip.close`), com a contagem de notas que ficaram em aberto e
os ids opacos delas em `metadata` — nunca o motivo, que é dado de negócio, não trilha de segurança.
**Este registro não é "em nome do motorista"**: encerrar a viagem não é uma ação atribuída a um
motorista específico, então `insertTripFieldOfficeAudit` (que exige `onBehalfOfDriverId` como alvo)
não se aplica aqui — o alvo da auditoria é a própria viagem (`targetId = targetType = tripId`),
seguindo o mesmo desenho que rotinas sem "em nome de alguém" já usam neste código (ex.: recarga do
catálogo de pedágio).

**Código morto removido junto.** `deliverDocument` (porta, caso de uso e repositório) gravava
`delivered_at` sem tocar em `separation_status` e sem autoria, e não tinha mais chamador desde que a
entrega passou para `field-delivery`/`field-return` (spec 156 T8b). Ver
`test/trip-delivery-proof/orphan-deliver.contract.ts`.

**Frontend.** O botão "Encerrar viagem" só aparece para quem tem `trip.report-on-behalf`. O clique
abre um diálogo que diz quantas notas ficarão sem baixa e pede o motivo (obrigatório só quando há
nota em aberto), no mesmo padrão visual dos outros diálogos de confirmação do escritório.

## O que reabriria esta decisão

- Um papel novo de "atendimento de entrega" separado do `operator`. A permissão iria para ele, e
  sairia de quem não dá baixa.
- O motorista passar a registrar tudo pelo aplicativo, e a baixa do escritório virar exceção rara.
  Nesse caso, restringir a `company-admin`.
- O OCR (D6.2) provar acerto alto o bastante para dispensar a confirmação. Isso exige medição
  registrada, não impressão, e a mesma régua da ADR-0065.
