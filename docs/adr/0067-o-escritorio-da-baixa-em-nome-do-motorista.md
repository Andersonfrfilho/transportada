# ADR-0067 — O escritório dá baixa em nome do motorista

- **Status:** aceita
- **Data:** 2026-09-18
- **Decisores:** usuário (D1, D3 e D6 decididas na conversa da spec; perfis de D1 confirmados em
  2026-09-18) e revisão Opus
- **Fecha:** a T2 da spec 156 (`specs/156-o-escritorio-da-baixa-pelo-motorista/`)

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
qualquer permissão de pessoa.

**Por que não reusar `trip.manage`.** O `separator` tem `trip.manage` para montar a viagem do celular,
e ele **não reporta entrega**. Essa linha entre galpão e campo já está na ADR-0043, no próprio
`authorization.policy.ts` e em `test/separator-role.contract.test.ts`. Pendurar a baixa em
`trip.manage` daria ao separador, de carona, o poder de encerrar a entrega da carga que ele mesmo
separou.

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

A migration (T4) é aditiva nas seis tabelas de campo (`trip_document_events`, `trip_stop_events`,
`trip_stop_occurrences`, `trip_field_reports`, `trip_delivery_proofs`,
`trip_document_occurrences`). O default é `'driver_app'`, que já descreve o histórico, então não tem
backfill. Um CHECK exige `on_behalf_of_driver_id` quando `channel = 'office'`. O fluxo do WhatsApp
passa a gravar `whatsapp`.

A linha do tempo mostra os dois: "registrado por <usuária> (escritório) pelo motorista <nome>". Cada
registro do escritório também grava em `audit_logs`, com ator, alvo, IP e horário (`security.md`
§10). É ação sensível: encerra entrega que outra pessoa fez.

### 3. A hora da entrega é informada (spec 156 D4)

A baixa do escritório registra quando a entrega **aconteceu**, não quando foi digitada. O campo
"Entregue em" (`deliveredAt`) vem preenchido com agora e pode ser mudado. Ele tem duas travas, com
códigos estáveis em `shared/errors/codes.ts`:

- não aceita hora no futuro (`DELIVERED_AT_IN_FUTURE`);
- não aceita hora anterior ao despacho da viagem, `trips.dispatched_at`
  (`DELIVERED_AT_BEFORE_DISPATCH`).

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
- ⚠️ **O `finance` recebe a permissão, mas hoje não abre a viagem.** A leitura da viagem é
  `fleet.read` (`TRIP_READ_POLICY`), e o `finance` não tem `fleet.read`. A permissão sozinha não
  resolve a tela dele. Isso tem de ser decidido antes da T8: ou o `finance` ganha a leitura da viagem,
  ou a tela do escritório lê por outra permissão. Esta ADR não decide isso.
- O relatório de pontualidade passa a usar `delivered_at`, não `recorded_at`. É o número certo, mas
  ele muda para as viagens com baixa retroativa, e a mudança é registrada no `evidence.md` da spec.
- Nenhum log leva a imagem do canhoto, o documento de quem recebeu ou o nome do destinatário
  (`security.md` §1).

## O que reabriria esta decisão

- Um papel novo de "atendimento de entrega" separado do `operator`. A permissão iria para ele, e
  sairia de quem não dá baixa.
- O motorista passar a registrar tudo pelo aplicativo, e a baixa do escritório virar exceção rara.
  Nesse caso, restringir a `company-admin`.
- O OCR (D6.2) provar acerto alto o bastante para dispensar a confirmação. Isso exige medição
  registrada, não impressão, e a mesma régua da ADR-0065.
