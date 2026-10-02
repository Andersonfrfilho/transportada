# Feature 193 — O comprovante diz quem recebeu

> Estado: revisada após crítica (2026-09-25). As fases 1 a 3 estão prontas para execução. As fases
> 4 a 6 seguem as respostas do usuário (R1, R3, R4) e a decisão revisável R2. A Fase 4 depende do
> pré-requisito P0.
> ADR: `docs/adr/0079-quem-recebeu-e-o-contato-do-destinatario.md`.

## Problema e resultado

O comprovante guarda o **nome** de quem recebeu e, quando a empresa pede, o **documento**
(ADR-0057, arquivo `0057-o-comprovante-e-configuravel-e-o-documento-entra-com-envelope.md`). Ele não
diz **quem essa pessoa é em relação ao destinatário**. Numa contestação ("ninguém aqui recebeu"),
"Recebido por João" não informa se João é o dono, o porteiro ou o vizinho.

Três defeitos conferidos no código pesam no desenho:

1. **O nome digitado pelo motorista se perde quando ele só fotografa o canhoto.** O app manda
   `receiverName` junto com a foto. O servidor só grava o nome se `kind='signature'` ou se
   `channel='office'` (`attach-delivery-proof.use-case.ts:249`,
   `trip_delivery_proofs_receiver_check`).
2. **O formulário descarta a foto.** O `onConfirm` do recorte limpa `cropFile` e chama `attach`
   (`DriverStopCard.component.tsx:686-693`). O `attach` faz `if (blockedByFields(next)) return`
   antes de enfileirar (`:549-555`). Com o nome `required` e vazio, a foto recortada se perde sem
   aviso. Isso já acontece hoje. Um campo novo que bloqueie terá o mesmo defeito.
3. **A fila de envio fica escondida.** A entrada fixa está só no Perfil (082-campo D7), e o aviso da
   tela da viagem some quando a fila esvazia.

**Resultado:**

1. O comprovante registra **quem recebeu** (a relação com o destinatário) e um **detalhe** curto.
   Por padrão o campo é opcional. A empresa pode desligá-lo ou marcá-lo como obrigatório, no mesmo
   molde `off | optional | required`.
2. Nome, relação e detalhe ficam gravados **também na foto do canhoto do motorista**.
3. **O campo novo nunca impede nem descarta a foto.** A captura vem primeiro na tela. O "quem
   recebeu" pode ser preenchido antes ou depois, e o valor alcança o comprovante já na fila ou já
   enviado.
4. O painel mostra "Recebido por Maria · Vizinho(a) — casa 12".
5. O cabeçalho do app do motorista tem um ícone fixo da **fila de envio** com a contagem pendente.
6. **"O próprio cliente recebeu"** preenche o formulário com um toque.
7. O card da parada mostra o **contato do destinatário** (telefone e e-mail), atrás de "Ver
   contato", com auditoria e com os botões Ligar e WhatsApp.

## Decisões do usuário (2026-09-25)

1. **Quem recebeu** é uma lista fechada, nesta ordem: próprio destinatário; cônjuge; filho(a);
   pai/mãe; irmão(ã); outro familiar; vizinho(a); porteiro/portaria; funcionário(a) do local;
   outro. O campo **detalhes** é texto livre curto. É obrigatório só em "outro" e "outro familiar"
   e não repete o nome, que já tem campo próprio. O campo é opcional por padrão, e a empresa o
   configura como off, optional ou required. Aparece no comprovante do painel.
2. O documento de quem recebeu continua configurável, como já é.
3. **Já entregue fora desta spec.** O canhoto tem três botões iguais: "Tirar foto", "Anexar" e
   "Colher assinatura" (commit `6aef92ab6`). Esta spec não tem task para eles.
4. Ícone fixo da fila de envio no cabeçalho, ao lado do sino, com a contagem de `countPending`. O
   toque abre `/fila`.
5. Botão rápido "O próprio cliente recebeu", o caminho mais curto do comprovante.
6. **Mostrar** ao motorista o contato do cliente (destinatário da entrega): telefone e e-mail. Não
   se coleta contato de quem recebeu.

## Respostas do usuário (2026-09-25) e decisão revisável

- **R1 — Select compacto abaixo da captura (decisão do usuário).** Uma linha, 44 px de altura,
  abaixo dos três botões de captura. É um `<select>` nativo, que abre o seletor do sistema.
- **R2 — Semântica de "obrigatório" (decisão desta spec, revisável; não foi perguntada).** Pela
  regra C1, o campo nunca bloqueia a foto. No motorista, `required` é **pendência visível e não
  bloqueante**: o card mostra "Falta dizer quem recebeu" até o campo ser preenchido, e o painel marca
  "não informado" no comprovante. No escritório, `required` responde 422. Se o usuário quiser outra
  semântica, a mudança fica na D5 e na T4.2.
- **R3 — Ligar e WhatsApp, dois botões (decisão do usuário).** O WhatsApp (`wa.me`) abre no celular
  do motorista e **expõe o número pessoal dele ao cliente**. Ligar também mostra o número do motorista
  ao cliente, salvo se ele o ocultar. O número do cliente fica no aparelho do motorista sem prazo. O
  usuário **aceitou esse risco sabendo** dele, e o aceite fica registrado na ADR-0079 e no
  `docs/SECURITY.md`. Isso revisa a proteção do número do motorista da 079 (`spec.md:211-213`).
- **R4 — Contato atrás de "Ver contato", com auditoria (decisão do usuário).** O card mostra "Ver
  contato". Com um toque, o contato aparece, lido do snapshot, e funciona sem rede. O evento de
  revelação vai pela fila offline para `audit_logs`, com ator, viagem, nota e horário. **Segue a
  079:** o contato fica oculto por padrão e a revelação é auditada.

## Decisões desta spec

- **D1 — Vocabulário.**
  - Constantes com o mesmo nome na API e no app: `RECEIVED_BY_OPTIONS` = `recipient`, `spouse`,
    `child`, `parent`, `sibling`, `other_relative`, `neighbor`, `doorman`, `employee`, `other`, e
    `RECEIVED_BY_OPTIONS_REQUIRING_DETAIL` = `other_relative`, `other`.
  - Rótulos no locale, com a grafia única: "Próprio destinatário", "Cônjuge", "Filho(a)",
    "Pai/Mãe", "Irmão(ã)", "Outro familiar", "Vizinho(a)", "Porteiro/Portaria",
    "Funcionário(a) do local", "Outro".
  - O placeholder do detalhe em "Vizinho(a)" é "Onde a carga ficou (ex.: casa 12)" (082 nativo,
    RF-4.3).
  - No banco: `VARCHAR(16)` com CHECK para a relação, porque ENUM é proibido, e `VARCHAR(120)` para
    o detalhe. Vazio vira `NULL`.
- **D2 — A forma do dado.** A função `normalizeReceivedBy` aplica trim, remove `\p{Cc}` e corta o
  detalhe em 120 caracteres. O detalhe sem relação é descartado. Código fora da lista vira nulo. A
  relação que exige detalhe e veio sem ele é gravada assim mesmo, e a tela marca a falta como
  pendência. Canal por canal:
  - **Motorista:** nunca recebe 400 por essas regras. O servidor normaliza e responde 201. O anexo
    na fila não pode ser recusado por forma (C1). Um 400 viraria `rejectionCause`
    (`offlineAttachments.service.ts:327-341`) e a foto seria descartada em 7 dias.
  - **Escritório:** a forma inválida responde **400** `INVALID_REQUEST` com `details`. O envio é
    síncrono, e a tela mostra o erro no campo.
- **D3 — O dado mora no comprovante.** As colunas `trip_delivery_proofs.received_by` e
  `received_by_detail` valem só para `photo` e `signature`, nunca para `cargo`, garantido por CHECK.
  O painel lê **da mesma linha que deu o nome**: a assinatura, e na falta dela a foto
  (`resolveDeliveryProofView`). Os campos não são resolvidos por precedências independentes.
- **D4 — A foto do motorista passa a carregar nome, relação e detalhe.** O
  `trip_delivery_proofs_receiver_check` vira `kind <> 'cargo' or length(receiver_name) = 0`. Antes,
  a migration verifica que não existe linha `cargo` com nome, e aborta se existir. O documento
  continua só na assinatura (ADR-0057 §3). Isso revisa a emenda de 2026-09-18 da ADR-0067 §5.
- **D5 — A configuração nunca derruba o anexo do motorista.**
  - `off`: o servidor descarta, nos dois canais.
  - `required` no motorista: a falta vira pendência visível, nunca bloqueio nem recusa (R2).
  - `required` no escritório: 422 `TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED`.
    A configuração é resolvida **por nota**: uma exceção por CNPJ vence a geral por inteiro
    (`delivery-proof-settings.policy.ts:88-92`).
- **D6 — Configuração.** A coluna `received_by` entra em `company_delivery_proof_settings` e em
  `delivery_proof_setting_overrides`, com default `optional` e CHECK nos modos. No `PUT` o campo é
  opcional: ausente no geral preserva o gravado, e ausente numa exceção preserva o valor do mesmo
  `taxId` (senão, `optional`). O painel avisa que a exceção vence a configuração geral por inteiro.
  O snapshot do motorista leva o modo resolvido por nota.
- **D7 — Captura primeiro, "quem recebeu" depois.** Na tela, os três botões de captura vêm antes. O
  bloco "Quem recebeu" fica abaixo e reúne o botão rápido, o select compacto (R1), "Detalhes", o nome e o
  documento. O que o motorista escolhe ou digita chega ao comprovante por três caminhos:
  - **Antes da captura:** vai no multipart do anexo, como hoje.
  - **Depois, com o anexo ainda na fila:** atualiza o item pela `attachmentKey`
    (`applyAttachmentReceiver`, mesmo molde de `applyAttachmentLocation`,
    `offlineAttachments.service.ts:122-139`).
  - **Depois, com o anexo já enviado**, ou se a edição correu durante o envio: entra na fila de
    eventos como `proofReceiver`. O item vira
    `PATCH /me/trips/current/documents/:documentId/proof/receiver`, com JSON `{ receiverName?,
receivedBy?, receivedByDetail? }` e `Idempotency-Key`. O PATCH atualiza as linhas `photo` e
    `signature` do motorista naquele evento de entrega, com a mesma normalização da D2 e a mesma
    regra de `off` da D5. Responde 200 `{ changed }`.
  - Na drenagem, ao receber `sent`, o sistema compara os campos gravados no item com os enviados.
    Se diferirem, enfileira o `proofReceiver`.
- **D8 — Pré-requisito P0, fora desta spec: "o attach nunca descarta".** A foto capturada entra na
  fila **antes** de qualquer validação de formulário. A validação vira aviso sobre o que falta,
  nunca `return` antes de enfileirar. O P0 corrige o defeito 2 para o nome e o documento e vale
  também para a verificação da spec 194. É task própria, a ser criada pelo orquestrador, e precisa
  estar no `origin/staging` antes da Fase 4.
- **D9 — Portal do contratante.** Não mostra quem recebeu. Hoje não mostra comprovante nenhum
  (`ContractorDelivery` e `frontend-client/src` não têm campo de prova). Quando mostrar, a relação
  pode ir e o detalhe nunca (ADR-0050 §4).
- **D10 — LGPD de quem recebeu.** Relação e detalhe não vão para log, auditoria, notificação,
  WhatsApp nem para a linha do tempo (spec 158). Não têm busca e morrem com o comprovante. Na fila
  do aparelho, ficam em claro no IndexedDB, como o nome e o documento hoje, com o mesmo `subHash` e
  o mesmo descarte. O `docs/SECURITY.md` registra isso.
- **D11 — Comprovantes antigos.** Ficam `NULL`, sem backfill, e o painel omite a parte que falta.
- **D12 — Idempotência.** O replay do anexo com a mesma `attachmentKey` devolve a linha sem
  reescrever (201, como hoje). A recaptura do mesmo `kind` com chave nova substitui a linha. O PATCH
  segue a idempotência por `Idempotency-Key` das rotas `/me`.
- **D13 — A fila no cabeçalho.**
  - O botão fica entre a marca e o sino, nas seções do workspace: viagem, `/fotos`, `/fila` e
    `/perfil`.
  - `/notificacoes` monta fora do workspace (`main.tsx:201`, sem `DriverShellHeader` nem
    `useDriverTrip`) e **fica fora** desta spec.
  - A contagem vem da função pura `selectPendingTotal`, que chama `countPending(...)` com
    `ownerSubHash` e usa o `total`.
  - Com zero, o ícone aparece sem selo. Acima de 99, o selo mostra "99+".
  - Nome acessível: "Fila de envio, N pendentes". Alvo de toque ≥ 44 px.
  - O Perfil e os avisos da viagem continuam onde estão. Isso estende a 082-campo D7.
- **D14 — O botão rápido.** "O próprio cliente recebeu" fica no topo do bloco "Quem recebeu", com
  largura inteira.
  - Marca `recipient`, se o campo renderiza.
  - Preenche o nome com `recipientDisplayName`, um campo novo do snapshot: nome fantasia, senão
    razão social, a mesma regra de `resolveDeliveryContact`.
  - Para destinatário PJ, o nome preenchido fica **selecionado com o foco no campo**: o motorista
    digita o nome de quem assinou por cima. Para PF, vem o nome da pessoa.
  - Com o nome em `off`, o botão não aparece.
  - Não anexa nada.
- **D15 — Contato do destinatário (ADR-0079, Parte B).**
  - **Fonte do telefone:** `nfe_addresses.phone`, resolvido por `resolveDeliveryContact`, que o
    escritório já usa.
  - **Fonte do e-mail:** entra com o PR `adatechnology-packages#105` (T6.5).
  - **Contrato:** cada nota do snapshot ganha `recipientContact: { phoneDisplay, phoneE164,
email } | null`. O campo só vem em nota pendente de viagem aberta.
  - `phoneE164` só existe com 10 ou 11 dígitos nacionais (`+55…`). Nos outros casos o número aparece
    só como texto, sem link.
  - O e-mail é validado e o link é montado com `mailto:` mais `encodeURIComponent`. E-mail inválido
    não aparece.
  - `https://wa.me` entra em `NON_FETCH_ORIGIN` (R3).
  - O card mostra "Ver contato". O toque revela o contato e enfileira o evento `contactReveal`, que
    vira `POST /me/trips/current/documents/:documentId/contact-reveals` com `Idempotency-Key` e grava
    em `audit_logs` (R4).
  - O snapshot offline carrega o contato (ADR-0079 B3).
- **D16 — Escritório.** A linha da entrega (`TripStopList`, 079 P2) já mostra o telefone e passa a
  mostrar o e-mail. O assistente de baixa (spec 156) **renderiza sempre** o "Quem recebeu", como
  faz com nome e documento, porque o servidor resolve a configuração por nota. O `off` é descartado
  no servidor, e o 422 do `required` aparece no campo.

## Requisitos

- **RF1** Viagens → Comprovante configura "Quem recebeu" (Desligado/Opcional/Obrigatório) no geral
  e em cada exceção, com o aviso de que a exceção vence por inteiro.
- **RF2** O app do motorista mostra o bloco "Quem recebeu" abaixo da captura, na parada e em "Fotos
  pendentes". O modo `off` esconde o campo. O modo `required` mostra a pendência (R2), sem bloquear.
- **RF3** Nome, relação e detalhe chegam ao comprovante por qualquer um dos três caminhos da D7.
- **RF4** O assistente do escritório oferece o campo e mostra 400 e 422 no próprio campo.
- **RF5** `TripDeliveryProof` mostra a relação e o detalhe junto do nome, vindos da mesma linha.
- **RF6** O cabeçalho mostra o ícone da fila (D13).
- **RF7** O botão rápido segue a D14.
- **RF8** O card da parada mostra o contato do destinatário (D15), atrás de "Ver contato", com auditoria (R4), e com Ligar e WhatsApp
  (R3).

## Critérios de aceite

- **CA01** Numa empresa sem linha de configuração, o snapshot e o `GET
/company-settings/delivery-proof` trazem `receivedBy = 'optional'`.
- **CA02** Configuração:
  - um `PUT` geral sem `receivedBy` preserva o valor;
  - um `PUT` de exceção sem o campo preserva o valor do mesmo `taxId`;
  - a exceção vence a geral por inteiro.
- **CA03** A foto do motorista com `neighbor` e "casa 12" grava relação, detalhe e nome na linha
  `photo` e responde 201.
- **CA04** A foto do motorista com relação **inválida**, `other` sem detalhe ou detalhe sem relação
  responde **201**. A linha `photo` é gravada com a forma normalizada da D2.
- **CA05** A foto do motorista com o modo `off` grava a relação `NULL`. Com o modo `required` e sem
  relação, responde 201 com `NULL`. No escritório, `required` sem relação responde 422
  `TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED`, e forma inválida responde 400.
- **CA06** PATCH `.../proof/receiver`:
  - atualiza a relação da linha do motorista e responde 200;
  - repetido com a mesma `Idempotency-Key`, não duplica;
  - sem comprovante do motorista naquela nota, responde 404 `TRIP_DELIVERY_PROOF_NOT_FOUND`;
  - nunca toca linha `office` nem `cargo`.
- **CA07** O replay do anexo com a mesma `attachmentKey` mantém a relação gravada.
- **CA08** O CHECK recusa `cargo` com relação ou com nome. A migration aborta se já existir linha
  `cargo` com nome.
- **CA09** `GET /trips/:id/documents/:documentId/proof` devolve `receivedBy` e `receivedByDetail`
  (`null` nos antigos). O painel mostra a linha com os dados da mesma linha do nome e não quebra com
  o comprovante antigo.
- **CA10** Há um contrato negativo de que o portal não ganha campo.
- **CA11** Há um contrato de que nenhum `logger.*`, `log.*` ou `console.*` aparece em arquivo que
  cite `receivedByDetail` ou `recipientContact`, e de que a auditoria do escritório não leva o
  detalhe.
- **CA12** Fila:
  - o `QueuedAttachment` leva os campos novos;
  - um item antigo drena;
  - editar a relação com o item na fila atualiza o item;
  - editar depois do envio enfileira `proofReceiver`.
- **CA13** O cabeçalho mostra o ícone com a contagem de `selectPendingTotal` em viagem, `/fotos`,
  `/fila` e `/perfil`. O toque abre `/fila`. O contrato de 44 px passa. O smoke cobre o fluxo.
- **CA14** `make migration-test` passa. A asserção `delivery-proof-received-by.assertion.ts` prova
  os CHECKs e mostra que o rollback aborta com dado.
- **CA15** O usuário vê os prints em 375 e 768 px no preview local antes de qualquer push de tela.
- **CA16** O botão rápido marca `recipient` e preenche `recipientDisplayName`. Com PJ, o campo fica
  focado e com o nome selecionado. Editar o nome não desmarca. Com o nome `off`, o botão não aparece.
- **CA17** `recipientContact` só aparece em nota pendente de viagem aberta do próprio motorista.
- **CA18** Links do contato:
  - `tel:` só com `phoneE164`;
  - `wa.me` só com celular de 11 dígitos, e sem `?text=`;
  - `mailto:` codificado, e e-mail inválido não aparece;
  - o contato só aparece depois de "Ver contato", e cada revelação entra na fila e depois em
    `audit_logs` (ator, viagem, nota), também sem rede.
- **CA19** Os contratos de tenant-safety do schema cobrem as colunas e a consulta nova.
- **CA20** Sem o pacote com e-mail, `email` sai `null`. Com o pacote novo e o backfill, as notas já
  importadas passam a ter e-mail (T6.5).

## Fora de escopo

- O portal do contratante (D9).
- O documento do recebedor na foto do motorista.
- `/notificacoes` no cabeçalho (D13).
- `/minha-viagem` legado do painel (módulo `driver-trip` de `frontend-transportada`), em transição
  pela spec 189.
- Texto pré-preenchido no WhatsApp.
- Contato de quem recebeu.
- O app nativo, que consome o contrato definido aqui.

## Relação com outras specs

- **082 nativo, RF-4.2 e RF-4.3:** a lista de papéis e o "vizinho: onde a carga ficou". A 193 fixa
  os dez códigos e o detalhe como contrato da API.
- **082-campo:** D4 e ADR-0057 dão o molde `off/optional/required` e a exceção por CNPJ. A D7 da
  082-campo (entrada pelo Perfil e pelo banner) ganha a entrada no cabeçalho.
- **156 / ADR-0067:** canal `office`. Os campos novos entram na lista fechada do multipart.
- **159 / ADR-0070:** o formulário nunca faz o motorista perder prova, e a D5 e a D8 seguem isso.
- **184:** `cargo` não leva dado de recebedor.
- **079 P2 / T022:** a ADR-0079 Parte B é a ADR que faltava e **revisa** a decisão "oculto por
  padrão + auditoria ao revelar" (`079/spec.md:203-222`) para o motorista:
  o contato continua oculto e auditado (R4), mas o número do motorista passa a ser exposto por
  aceite do usuário (R3). A T022 fecha
  aqui.
- **192 (ordem das paradas):** mexe em `DriverStopCard.component.tsx` e `useDriverTrip.hook.ts`.
  Conferir o `git log` antes das Fases 1, 4 e 6.
- **194 (o canhoto se confere no aparelho, ADR-0078):**
  - Também mexe no `attach` (a verificação roda entre o `ProofCrop` e o `attach`), no snapshot
    (`canhotoOcrEnabled`), no `driverTripResponse.validation.ts` e, na fase 4 dela, numa migration
    de `trip_delivery_proofs`.
  - **Ordem:** P0 (o attach nunca descarta), depois a 194 fases 1–3, depois a 193 Fase 4. A regra
    comum é que **o attach nunca descarta**.
  - **Dono do `attach()`:** a 194 cuida do passo **antes** do attach (verificação da imagem) e a 193
    cuida dos campos que vão **com** o anexo. Nenhuma das duas põe `return` antes de enfileirar.
  - **Migrations das duas em `trip_delivery_proofs`:** a que chegar depois ao `origin/staging`
    regenera a sua, e `db:generate` tem de dar `no_changes`.
- **195 e 196:** a 196 já registrou que não mexe em `/fila` nem no cabeçalho. A 195 não toca o
  comprovante.
- **197 e 198:** não existem em nenhuma branch nem worktree em 2026-09-25. Quem as escrever confere
  esta spec.
