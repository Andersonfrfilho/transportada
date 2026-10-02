# Feature 224 — O comprovante junta fotos da mercadoria

- **Origem:** pedido do usuário em 2026-09-26, no comprovante de entrega da app do motorista: "em vez
  de adicionar mais foto, fico sempre substituindo". A escolha dele: "até 5 fotos, contando uma do
  canhoto e outras dos produtos, opcionais". No mesmo dia ele acrescentou que **toda foto precisa de
  "abrir imagem" (tela cheia) e "remover"**, e decidiu que a foto de produto removida é **apagada de
  verdade**, com o risco registrado na ADR-0089.
- **Revisão 1 (2026-09-26):** a crítica (opus) reprovou a primeira versão (REVISE). Esta versão
  responde aos pontos C1, M2 e M4 a M8 e aos menores, e aplica a decisão do usuário sobre a remoção.
  O M1/Q1 (canhoto sem redução) foi resolvido pela spec 212.
- **Numeração:** era 211 quando escrita (2026-09-26, com a 211 livre). **Renumerada para 224 em
  2026-10-02**: staging publicou `211-o-nucleo-de-conversa-ganha-o-e-mail` nesse intervalo, e 223
  era o maior número lá. A ADR é a 0089 — conferido contra `origin/staging`, que tem 0085, 0088 e
  0090, deixando 0086, 0087 e 0089 livres para este lote.

## Specs do mesmo assunto e coordenação

Lidas antes de escrever, e conferidas contra o código:

| Spec / ADR          | O que decidiu                                                                                                                                                                                                                                                         | Efeito aqui                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 184                 | criou `kind = 'cargo'` (foto da mercadoria), com o índice único parcial `where kind <> 'cargo'` e o teto de 5 por evento, contado no caso de uso sem trava (`office-delivery-proof.service.ts:137-141`). Hoje só o escritório grava `cargo`                           | a foto de produto é `cargo` (D1). O teto passa ao banco e fica por canal (D3)                                                                                                   |
| 159 / ADR-0070      | só a `photo` do canal do motorista é classificada (`attach-delivery-proof.use-case.ts:324-325`), e a nota e as pendentes filtram `photo`                                                                                                                              | a foto de produto não pesa (D4)                                                                                                                                                 |
| 193                 | quem recebeu. `cargo` nunca leva recebedor (CHECKs)                                                                                                                                                                                                                   | `applyAttachmentReceiverFields` e `detectReceiverDrift` passam a ignorar `cargo` (D7)                                                                                           |
| 194                 | a verificação do canhoto roda antes do `attach`, e a T1.3 (`replaceQueuedProof`) substitui por nota e `kind`                                                                                                                                                          | a substituição nunca apaga `cargo`. A verificação não roda na foto de produto                                                                                                   |
| 203                 | o attach nunca descarta                                                                                                                                                                                                                                               | a foto de produto também entra na fila antes de qualquer validação                                                                                                              |
| 205                 | o registro tardio pesa só em `photo`                                                                                                                                                                                                                                  | o servidor descarta `lateRegistration` em `cargo`                                                                                                                               |
| 206 e 207           | mexem em `DriverStopCard.component.tsx`                                                                                                                                                                                                                               | a galeria é componente próprio, e o cartão só ganha a montagem. A T4.0 confere o `git log`                                                                                      |
| `8f01f00e8`         | o comprovante ganhou "Concluir", "Ver" e "Remover": o visualizador `ProofImageLightbox.component.tsx`, `removeQueuedAttachmentByKey` e a `attachmentKey` gerada em `attach()`                                                                                         | reaproveitados. Não se cria outro visualizador nem outra remoção da fila (D10)                                                                                                  |
| 212                 | o canhoto cabe no teto: redução no aparelho a 2000 px e ~900 KiB com teto de 960 KiB, `pendingReduction`, recuperação no boot, 413 e `DELIVERY_PROOF_MAX_BYTES` = 960 KiB (`0bf0b57e4`, `ae6ea9977`, `fb063406d`)                                                     | a foto de produto usa a mesma esteira (`pendingReduction` e recuperação) com a régua dela: 1600 px, ~400 KiB e teto de 512 KiB (D5). A recuperação passa a ler o teto do `kind` |
| 220 ⚠️              | **publicada em staging depois desta spec**: separa `cargo` de `photo` nas três tabelas de configuração (modo `required`/`optional`/`off` e `cargo_minimum_count`), estende `thumbnail_object_id` da 161 (D12/D13) aos três `kind`, e dá veredito à foto da mercadoria | tira desta spec a configuração e a miniatura (§A, §B, §C, §E da 220). **Conflita no teto** — ver D3                                                                             |
| 209                 | a foto da ocorrência não vira canhoto. Regra "fila cheia derruba a foto, nunca o relato"                                                                                                                                                                              | molde da D6                                                                                                                                                                     |
| 204                 | recibo da cobrança da parada, pela rota de upload por parada da 209                                                                                                                                                                                                   | só divide o arquivo do cartão                                                                                                                                                   |
| ADR-0069 e ADR-0075 | o número do canhoto se lê no aparelho e nunca decide. A app do motorista é separada, e o legado só drena                                                                                                                                                              | não há leitura na foto de produto. O legado fica fora                                                                                                                           |

## Problema e resultado

O comprovante do motorista guarda **uma foto por nota**. A segunda substitui a primeira no servidor,
pelo upsert em `(company, stop_event, kind)` (`drizzle-delivery-proof.repository.ts:342`). O motorista
que quer registrar a mercadoria entregue fotografa por cima do canhoto e perde a prova nº 1.

Resultado:

- O **canhoto continua sendo uma foto só**: a que conta para a pontualidade (ADR-0070), para a
  verificação da 194 e para o `required`.
- Somam-se **até 4 fotos opcionais dos produtos** por nota, gravadas como `kind = 'cargo'` pelo canal
  `driver_app`. Nenhuma substitui outra nem o canhoto.
- Toda foto da seção tem **"Ver"** (tela cheia, também depois de recarregar a app) e uma saída:
  - **foto de produto:** "Remover", na fila e enviada. Enviada, ela é apagada do bucket;
  - **canhoto e assinatura na fila:** "Remover" (já existe, `8f01f00e8`);
  - **canhoto e assinatura enviados:** "Substituir", que é a recaptura e substitui no servidor. Eles
    nunca são removidos pelo servidor.
- A foto de produto **nunca** entra na pontualidade, na nota do motorista, no `proofPending` nem nas
  fotos pendentes.
- O painel mostra as fotos de produto no comprovante, separadas do canhoto e com a origem.

## Fora do escopo

- **Remover o canhoto ou a assinatura no servidor.** Continuam com "Substituir".
- **Remoção da foto de produto pelo escritório.** O motorista nunca remove foto do escritório.
- **Legado `/minha-viagem`:** não ganha fotos de produto (ADR-0075; decisão de 2026-09-24 de que o
  trabalho novo do motorista entra na app nova).
- **Portal do contratante:** não mostra comprovante (193 D9).
- **OCR ou verificação de qualquer tipo na foto de produto.**
- **Exigir foto de produto por configuração.** Era fora do escopo aqui, e a **spec 220 §A/§B**
  (publicada depois) decidiu: modo por campo nas três tabelas e `cargo_minimum_count` lido só
  quando o modo é `required`. Esta spec não redecide — o formulário do motorista passa a ler o
  modo de `cargo` em vez de assumir "sempre opcional".
- **Várias fotos numa escolha só da galeria (`multiple`).** É uma foto por toque.

## Histórias priorizadas

### P1 — O motorista soma fotos da mercadoria sem perder o canhoto

**Given** a nota entregue, com o canhoto já fotografado **When** o motorista toca em "Adicionar foto"
três vezes na seção "Fotos dos produtos (opcional)" **Then** aparecem três miniaturas, o canhoto
continua o mesmo, e chegam ao servidor um `photo` e três `cargo`.

### P2 — Ver e remover

**Given** uma foto de produto na fila **When** o motorista toca em "Remover" e confirma **Then** ela
sai da fila e nada sobe. **Given** uma foto de produto já enviada **When** ele remove **Then** o
servidor grava a lápide e a auditoria, apaga os bytes do bucket, e o painel deixa de mostrá-la.
**Given** a app recarregada **When** ele toca em "Ver" num canhoto ou numa foto de produto já enviados
**Then** a foto abre em tela cheia, baixada pela API.

### P3 — Fila cheia nunca barra o canhoto

**Given** a fila perto do teto **When** o motorista tenta uma foto de produto **Then** ela é recusada
na hora, com aviso, e o lugar do canhoto fica intacto. **Given** uma falha de rede numa foto de
produto **Then** os canhotos de todas as notas já foram antes, e nenhum fica preso atrás dela.

### P4 — O escritório vê a mercadoria

**Given** um comprovante com canhoto e duas fotos de produto do motorista **When** o operador o abre no
painel **Then** vê o canhoto e, num grupo próprio, "Fotos dos produtos", com a origem de cada foto. A
removida não aparece.

> ⚠️ **A 220 §D já é dona desta tela** (e §E do visualizador com miniatura, anterior e próxima,
> cujo molde é o `ProofImageLightbox` que já existe na app do motorista). Esta história fica
> aqui só pelo que é desta spec: o **grupo próprio** e a **origem** de cada foto. Layout,
> miniatura e navegação saem da 220 — não se decide de novo aqui.

## Requisitos funcionais

- **RF1** `POST /me/trips/current/documents/:documentId/proof` passa a aceitar `kind = 'cargo'`.
  - Grava uma linha nova e nunca substitui outra (D2).
  - Exige `attachmentKey` não vazia em `cargo`. Sem ela: 400.
  - Recusa a quinta foto do canal `driver_app` na mesma entrega com 422
    `TRIP_DELIVERY_PROOF_CARGO_LIMIT` (D3).
  - Aceita até `DRIVER_CARGO_PHOTO_MAX_BYTES` (512 KiB), com a checagem de assinatura de bytes JPEG,
    PNG ou WebP. Fora disso: 422 `TRIP_DELIVERY_PROOF_TOO_LARGE` ou
    `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`.
  - Descarta nome, documento, `receivedBy`, `receivedByDetail`, posição, `capturedAt` e
    `lateRegistration`, sem recusar. Grava `punctuality = 'not_required'`.
  - O upload roda em `runWithStoredObjectCleanup`: se a transação desfizer, o objeto some.
  - O mesmo `attachmentKey` da mesma entrega devolve a linha já gravada (201), **inclusive a
    removida**. É a lápide que impede o reenvio de ressuscitar a foto.
- **RF2** `GET /me/trips/current/documents/:documentId/proofs` devolve as fotos **deste motorista**
  naquela nota:

  ```text
  { data: { items: [{ id, kind, attachmentKey, createdAt }], cargo: { used, limit } } }
  ```

  - `items`: `photo`, `signature` e `cargo` com `channel = 'driver_app'` e `actor_user_id` do token,
    sem removidas e sem objeto `deleted`.
  - `cargo.used` conta **todas** as `cargo` ativas do canal `driver_app` no evento, de qualquer
    motorista da viagem. É o "N de 4" da tela.

- **RF3** `GET /me/trips/current/documents/:documentId/proofs/:proofId/content` devolve os bytes da
  foto do próprio motorista, com `Content-Type` do objeto e `Cache-Control: private, no-store`. A app
  baixa com `fetch` e o Bearer, e mostra como `blob:`. Nenhum pedido sai do aparelho para o bucket
  (D11).
- **RF4** `DELETE /me/trips/current/documents/:documentId/proof/cargo/:attachmentKey` remove a foto
  de produto (D8).
  - Vai **só com `Authorization`**. A idempotência vem da chave no caminho, e `Idempotency-Key` não é
    enviada: o CORS da API não a libera em método sem corpo (`cors.service.ts:20-21,74`).
  - Responde 204 se removeu, se já estava removida, se a chave não existe e se a foto é de outro
    motorista. A última resposta não revela se a foto existe.
  - Só alcança `cargo` do canal `driver_app` do próprio motorista. Nota fora do alcance: 404
    `TRIP_DOCUMENT_NOT_REACHABLE`, o mesmo portão da `POST .../proof`.
  - Na transação: `removed_at`, `removed_by_user_id`, `audit_logs` e `retention_until = now()` no
    objeto. Depois do commit: `deleteObject` no bucket e `stored_objects.status = 'deleted'`. Se o
    bucket falhar, o expurgo do worker apaga no ciclo seguinte (RF6).
  - Remoção repetida não grava auditoria de novo.
- **RF5** O teto vive no banco (D3): um trigger conta as `cargo` ativas por
  `(company, stop_event, channel)` e recusa acima de 4 para `driver_app` e de 5 para `office`. A
  pré-contagem do caso de uso só evita upload inútil.
- **RF6** A foto de produto nasce com `stored_objects.purpose = 'delivery_proof_cargo'` e
  `retention_until = created_at + OCCURRENCE_ATTACHMENT_RETENTION_YEARS` (5 anos), nos dois canais, a
  partir desta spec. O expurgo do worker (`trip.occurrence-attachment.purge`) passa a considerar esse
  purpose. As linhas antigas da 184 ficam como estão.
- **RF7** A leitura do painel (`GET /trips/:id/documents/:documentId/proof`, `listDeliveryProofs`)
  deixa de devolver linha removida e objeto `deleted`, e ganha `channel` em cada item. O painel tolera
  `channel` **antes** de a API mandá-lo (molde de `694de05b5`).
- **RF8** App do motorista: a seção "Fotos dos produtos (opcional)" fica no `DeliveryProofSection`,
  abaixo do bloco "Quem recebeu" e acima do "Concluir".
  - Miniaturas das fotos na fila e das enviadas, estas sem as removidas que ainda estão na fila.
  - "Adicionar foto" (câmera) e "Anexar" (galeria), enquanto `cargo.used` + fila < 4. Depois, "4 de
    4" e os botões somem.
  - Cada miniatura tem "Ver" (o toque na miniatura também abre) e "Remover", com confirmação.
  - A mesma seção aparece em `DriverPendingProofs`, porque é o mesmo `DeliveryProofSection`: quem
    completa o canhoto pendente pode somar fotos de produto ali.
- **RF9** Fila offline (D5, D6 e D7):
  - cada foto de produto é um `QueuedAttachment` com `kind: 'cargo'`, sem posição e sem recebedor;
  - a drenagem é feita em duas passagens globais: primeiro `photo` e `signature` de todos os grupos,
    depois `cargo`;
  - a foto de produto é recusada na hora, com aviso, quando ocuparia a reserva do canhoto;
  - remover uma foto enviada vira o evento `cargoPhotoRemoval` na fila de eventos.
- **RF10** O canhoto e a assinatura enviados ganham "Ver" (pela RF3, também depois de recarregar) e
  "Substituir" (a recaptura de hoje).

## Requisitos não funcionais

- **RNF1** Nenhuma imagem sai do bucket privado para o aparelho. A app lê os bytes pela API (RF3) e os
  mostra como `blob:`. A CSP da app tem `img-src 'self' blob: <origem da API>`
  (`contentSecurityPolicy.service.ts:66`), e nenhuma origem nova é acrescentada. O `PUT` de upload
  continua como está.
- **RNF2** Nada da foto de produto vai para log: nem nome, nem posição, nem bytes. A auditoria
  registra ator, alvo (`proofId`), IP e hora, nunca a imagem.
- **RNF3** A seção funciona em 375 px sem rolagem horizontal. Alvos com pelo menos 44 px
  (`touch-target.contract.ts`), sem `--control-height-compact`.
- **RNF4** Câmera, galeria e visualizador abrem e fecham no `captureRegistry`.
- **RNF5** O precache continua dentro de 1,5 MiB, e não entra nenhuma dependência nova.

## Decisões

- **D1 — `cargo` serve, e a foto de produto é `cargo`.** A 184 criou `cargo` para a foto da
  mercadoria: sem recebedor, fora do índice único e fora da pontualidade. Um `kind` novo duplicaria
  essas regras. O canal diz quem tirou.
- **D2 — Unicidade.** Não existe `(document, kind, channel)`. O que existe é
  `(company, stop_event, kind) where kind <> 'cargo'`, e continua igual: canhoto e assinatura seguem
  "o segundo substitui", nos dois canais. Para `cargo` entra o índice único parcial
  `(company, stop_event, attachment_key) where kind = 'cargo'`. `attachment_key` vazia deixa de ser
  aceita em `cargo`: um CHECK garante isso para as linhas novas, sem validar as antigas da 184.
- **D3 — Teto por canal, no banco.** Um CHECK não conta linhas, então o teto fica num trigger
  `BEFORE INSERT` de `cargo`, numa função `VOLATILE` sob `READ COMMITTED`.
  - **Comandos separados, nesta ordem:**
    1. `pg_advisory_xact_lock` pelo evento;
    2. se já existe `cargo` com a mesma `(company, stop_event, attachment_key)`, sai com `NEW`, sem
       contar, e o índice único decide (23505, que o repositório converte em "releia pela chave");
    3. `count` das ativas do canal, num comando próprio, depois da trava. Cada comando tira snapshot
       novo, então vê o que a transação anterior já confirmou.
  - Acima do teto: `SQLSTATE 23514`, `CONSTRAINT = 'trip_delivery_proofs_cargo_limit'`. O repositório
    traduz pelo **nome** da constraint para 422 `TRIP_DELIVERY_PROOF_CARGO_LIMIT`. Ao receber 23514,
    antes de traduzir, ele relê pela chave: se a linha existe, é reenvio e devolve 201. Assim duas
    requisições com a mesma chave na quarta foto nunca produzem um 422 falso.
  - É 422, e não 409: o pedido está bem formado e passa de uma regra de negócio, como na 184.
  - **Por canal:** 4 do motorista (esta spec) e 5 do escritório (184). Uma entrega chega, no máximo,
    a **9 fotos de produto**. Isso é deliberado: são dois autores, e um não pode comer a vaga do outro.
    A contagem do escritório passa a filtrar o canal.
  - ⚠️ **[NEEDS CLARIFICATION] Conflita com a spec 220 RF08**, publicada depois desta: lá "o teto
    continua **5 por entrega** (spec 184 D3)", e o mínimo configurável (`cargo_minimum_count`) é
    recusado na fronteira quando passa desse teto. As duas regras não coexistem: 9 por entrega
    (aqui, por canal) ou 5 por entrega (lá, somando os canais). Enquanto não decidido, **esta spec
    não tem prompt de execução** e a Fase do trigger não começa — um trigger de 4+5 faria o
    `cargo_minimum_count` da 220 validar contra um teto que o banco não aplica.
  - O número mora na constante TS e no SQL. Um contrato lê o `migration.sql` e confere os dois.
- **D4 — A foto de produto não pesa.** A nota, `proofPending` e `pendingProofs` filtram `photo`.
  Contratos de regressão fixam isso: entrega só com `cargo` e `photo = 'required'` continua
  `proofPending: true`.
- **D5 — A esteira da 212, com a régua do produto.** A foto de produto nasce com
  `pendingReduction: true`, e a drenagem espera. A redução roda com a régua da ocorrência (1600 px,
  ~400 KiB, teto de 512 KiB). Não usa a do canhoto: a foto de produto não passa por OCR. A
  recuperação no boot passa a ler o teto do `kind` (512 KiB em `cargo`, 960 KiB no canhoto).
  - **HEIC** (o Chrome no Android não decodifica no canvas): a redução falha, a marca sai e o original
    sobe, como na 212 D2. Se passar de 512 KiB, a API recusa e a causa aparece na `/fila`, com
    "Remover".
- **D6 — Fila cheia recusa a foto de produto na hora.** O teto geral (30 itens e 50 MB,
  `offlineAttachments.service.ts:14-17`) continua valendo para o canhoto como hoje. A foto de produto
  só entra se:
  - houver no máximo 8 `cargo` na fila (`CARGO_QUEUE_MAX_COUNT`);
  - depois dela, sobrarem 10 itens de folga (`CARGO_QUEUE_RESERVE_COUNT`);
  - e sobrarem 20 MiB de folga (`CARGO_QUEUE_RESERVE_BYTES`), contando o tamanho original.

  Fora disso, a foto é recusada antes de qualquer escrita, com o aviso `cargoPhotoQueueFull`. Nada é
  despejado. Os números são de partida.

- **D7 — A foto de produto não carrega posição nem recebedor, nem no aparelho.**
  - O hook não lê GPS para `cargo`.
  - `applyAttachmentReceiverFields` e `detectReceiverDrift` (`offlineAttachments.service.ts:154-209`)
    pulam `kind === 'cargo'`. Sem isso, o CPF seria copiado para a foto de produto e um PATCH
    `proofReceiver` voltaria 404.
  - Toda operação sobre um item `cargo` casa pela `attachmentKey`, nunca pela nota.
  - No servidor, os campos que vierem são descartados (RF1).
- **D8 — Remover é apagar (decisão do usuário, 2026-09-26).**
  - **Na fila:** confirmação, e depois `removeQueuedAttachmentByKey` (`8f01f00e8`). Se o item está em
    envio ou já saiu da fila, também enfileira `cargoPhotoRemoval`: o `DELETE` é idempotente.
  - **Enviada:** confirmação, e depois `cargoPhotoRemoval` → `DELETE`. A miniatura some na hora, e a
    `/fila` mostra "remoção pendente" até o 204.
  - **Os bytes saem do bucket** logo depois do commit, com o expurgo como rede de segurança. A linha
    fica como **lápide** (`removed_at` e `removed_by_user_id`), de mão única e só em `cargo` do canal
    `driver_app`. Sem ela, um reenvio atrasado com a mesma chave recriaria a foto.
  - **Risco aceito:** quem pode ser cobrado pela avaria consegue apagar a prova da avaria. O usuário
    decidiu sabendo disso. A auditoria guarda quem removeu e quando, mas não a imagem. Está na
    ADR-0089.
  - **Portão:** o mesmo da `POST .../proof`. O motorista remove enquanto pode enviar.
- **D9 — Retenção de 5 anos** (`OCCURRENCE_ATTACHMENT_RETENTION_YEARS`), a mesma dos anexos de
  ocorrência: é imagem de mercadoria, que pode pegar pessoas e placas, e serve à mesma disputa. O
  purpose próprio `delivery_proof_cargo` isola esse corte do canhoto, que continua sem prazo.
- **D10 — Reaproveitar o que já existe.** "Ver" usa o `ProofImageLightbox`, e "Remover" na fila usa o
  `removeQueuedAttachmentByKey`, os dois do `8f01f00e8`. A redução e a recuperação são as da 212.
- **D11 — Os bytes vêm pela API, não do bucket.** A leitura por URL assinada exigiria CORS de `GET`
  no bucket para `motorista.<zona>` em staging e produção, e isso nunca foi conferido. Se falhasse, a
  foto ficaria quebrada sem erro visível. Repassar pela API custa no máximo 960 KiB por foto e usa a
  origem que a CSP já permite. A T2.4 registra a escolha com evidência.
- **D12 — Vocabulário.** "Fotos dos produtos" na app e no painel. O rótulo "fotos da carga" da 184
  passa a "Fotos dos produtos", com a origem: "Motorista" ou "Escritório".

## Casos extremos e falhas

- Offline depois de recarregar: a tela usa o último `cargo.used` que leu, mais a fila. O excesso volta
  422 e aparece na `/fila` como "recusada: limite de 4", com "Remover".
- Viagem com dois motoristas: o "N de 4" vem do servidor e conta o canal. Cada motorista só vê e
  remove as próprias fotos.
- Duas abas mandando a quinta foto: o trigger serializa pelo evento, e uma recebe 422. Duas abas
  mandando a **mesma** quarta foto: uma grava e a outra recebe 201 com a mesma linha.
- A substituição da 194 (`replaceQueuedProof`) casa por nota e `kind`, e nunca apaga `cargo`.
- Remoção da foto de outra conta no mesmo aparelho: o item nem aparece (`subHash`). No servidor, 204
  sem efeito.
- Bucket fora do ar na remoção: a lápide e a auditoria ficam, a resposta é 204, e o expurgo apaga
  depois.
- Rollback da migration depois do primeiro uso: recusa (lápide ou objeto `delivery_proof_cargo`). A
  correção a partir daí é **para frente**, com migration nova (plan.md).

## Critérios de aceite

- **CA01** Duas `cargo` do motorista na mesma entrega gravam duas linhas. O `photo` do mesmo evento
  continua intacto, com a mesma pontualidade.
- **CA02** A quinta `cargo` do motorista recebe 422. O escritório ainda grava as 5 dele no mesmo
  evento: o total chega a 9.
- **CA03** Na quinta foto, duas transações concorrentes com chaves diferentes: exatamente uma passa.
  Na quarta, duas com a mesma chave: uma linha só, e as duas respostas são 201.
- **CA04** Depois da remoção, o reenvio com a mesma chave devolve a lápide e não recria a foto.
- **CA05** `cargo` sem `attachmentKey` dá 400. Acima de 512 KiB, ou com cabeçalho falso, é recusada.
  Nome, posição e `receivedBy` são descartados, e a linha grava vazio e `not_required`.
- **CA06** Entrega só com `cargo` e `photo = 'required'` continua `proofPending: true`, fica fora da
  nota e aparece em `pendingProofs`.
- **CA07** `DELETE` responde 204 três vezes e grava uma auditoria só. A foto some das leituras do
  motorista e do painel, o objeto fica `deleted` e o storage (dublê em memória na integração) já não tem os bytes.
- **CA08** `DELETE` nunca alcança `photo`, `signature`, `cargo` do escritório nem `cargo` de outro
  motorista.
- **CA09** O preflight de `DELETE` sem `Idempotency-Key` passa, e o cliente não manda esse header no
  `DELETE`.
- **CA10** O expurgo apaga `delivery_proof_cargo` vencido e nunca toca `delivery_proof`.
- **CA11** Fila: com 8 `cargo`, a nona é recusada; com a fila a 21 itens, a foto de produto é
  recusada e o canhoto entra. A drenagem manda os canhotos de todas as notas antes de qualquer
  `cargo`. Uma falha de rede numa `cargo` não deixa canhoto para trás.
- **CA12** `applyAttachmentReceiverFields` e `detectReceiverDrift` nunca tocam item `cargo`.
- **CA13** Tela: 4 miniaturas, "4 de 4", sem "Adicionar". Substituir o canhoto não mexe nas fotos de
  produto. Remover uma não mexe nas outras. "Ver" funciona depois de recarregar.
- **CA14** O painel mostra "Fotos dos produtos" com a origem. Com a API antiga, sem `channel`, a lista
  continua aparecendo.
- **CA15** `make migration-test` sobe e desce, com o assert da migration. O rollback recusa depois do
  primeiro uso.
- **CA16** Preview em 375 e 768 px, com o "pode subir" do usuário.

## Preview

O desenho da tela, em ~40 colunas, está no `tasks.md` (§ Preview). É ele que a T4.4 mostra ao
usuário.

## Dúvidas

Nenhum `[NEEDS CLARIFICATION]` aberto. As perguntas que não bloqueiam estão no `plan.md` (§ Perguntas
registradas).
