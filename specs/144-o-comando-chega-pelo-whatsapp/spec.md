# Feature 144 — O comando chega pelo WhatsApp

## Problema e resultado

O operador e o motorista hoje só agem pelo painel e pelo PWA. A spec 062 deixou o canal pronto: há
um número por empresa, envio de template e webhook assinado com anti-replay. Ainda assim, **nenhuma
mensagem recebida vira ação**. `whatsapp-webhook.routes.ts` chama
`module.webhook.receive.execute`, grava a mensagem e registra `whatsapp.webhook.received`, e para
aí. O motor de fluxo do `@adatechnology/meta-whatsapp-module` está ligado e ninguém o chama.

O resultado desta feature são três trabalhos feitos por conversa, **pelos mesmos casos de uso que o
painel e o PWA já chamam**, sem nenhum caminho paralelo:

1. **Emitir documentos fiscais a partir de uma seleção de notas.** O bot oferece os critérios por
   menu, mostra a volumetria (quantas notas vão para CT-e, quantas para NFS-e e quantas estão
   bloqueadas e por quê) e, depois da confirmação, emite. Quando os documentos são autorizados, a
   fatura é gerada e o resultado volta para a conversa.
2. **Mudar o estado da entrega por menu.** O motorista entrega ou devolve com motivo; o operador
   separa, carrega e despacha.
3. **Registrar ocorrência** pelo catálogo da empresa (`company_occurrence_types`).

Esta spec fecha T009 e T011 da 062. A T010 (o cliente agenda) continua lá.

## O que já existe e não se refaz

| peça                                                          | onde                                                    | estado               |
| ------------------------------------------------------------- | ------------------------------------------------------- | -------------------- |
| Canal por empresa, token selado, webhook HMAC + nonce         | `src/whatsapp/` (062 T001–T006)                         | pronto               |
| Motor de fluxo em grafo + `registerFlowAction(kind, handler)` | `@adatechnology/meta-whatsapp-module`                   | pronto, sem chamador |
| Sessão por `(companyId, whatsappNumber)` com `context` jsonb  | schema `meta_whatsapp.sessions`                         | pronto               |
| Envio de botão (≤3) e de lista                                | `meta-whatsapp-provider`                                | pronto               |
| Máquina de estado da nota na viagem, idempotente              | `trips/domain/trip-state.policy.ts`                     | pronto               |
| Rotas do motorista, canal-agnósticas (057 D2)                 | `trips/presentation/me-trip.routes.ts`                  | pronto               |
| Ocorrência de separação e de entrega + catálogo               | `trip_document_occurrences`, `company_occurrence_types` | pronto               |
| Lote de CT-e com prévia, assíncrono por outbox                | `cte-batches/`, `cte-issuance/`                         | pronto               |
| NFS-e por seleção de notas                                    | `nfse-invoices/`                                        | pronto               |
| Fatura por tomador                                            | `billing/` (ADR-0028)                                   | pronto               |

⚠️ **O pacote não identifica ninguém.** A chave da sessão é o telefone; o pacote não sabe de
usuário, membership nem permissão. `SubjectResolverInterface` devolve nome e empresa, não
autorização. **Quem é o dono do número é trabalho nosso**, e é a parte crítica desta spec.

## Decisões

### D1 — O telefone só vira credencial depois de verificado, e é único na instalação

`login_identifiers` tem `kind='phone'` e `is_whatsapp`, mas **não serve de credencial**, por três
razões conferidas no código (revisão de arquitetura de 2026-09-11):

- é **projeção**: `rebuildLoginIdentifiers` apaga e reinsere as linhas `source='profile'` a cada
  gravação da ficha, e um `verified_at` ali some na próxima edição do cadastro, sem erro;
- **não é única por desenho** (`(user_id, kind, value)`; o schema documenta telefone compartilhado):
  o mesmo número pode estar em dois usuários;
- **não é canônica**: o convite e o backfill de 31/08 gravam o contato cru, com máscara.

Por isso o vínculo de WhatsApp é **tabela própria**, `user_whatsapp_phones`, e `login_identifiers`
fica intocada, com o login por telefone igual.

- **Verificação de entrada.** O painel mostra um código de uso único, e o usuário o **envia do próprio
  WhatsApp** para o número da empresa. A confirmação exige as duas coisas: o `from` que a Meta assina
  é o número declarado, **e** o código confere. Isso prova a posse da conta de WhatsApp, e não só do
  chip; dispensa template pago e aprovado; e grava o número exatamente como a Meta o vê, sem a
  dúvida do nono dígito. Sem casar o `from`, quem chutasse códigos vincularia o próprio número à conta
  de outra pessoa.
- Unicidade parcial e **global na instalação**: um número verificado pertence a **um usuário só**, e
  um usuário tem um número. O usuário é da instalação, e cada instalação é uma transportadora
  (ADR-0021). A empresa vem do `phone_number_id` do canal, e a membership ativa do usuário **nessa**
  empresa é o que autoriza.
- Canonicalização única: `55` + DDD + número (`^55[1-9][0-9]{9,10}$`), gravada canônica desde o
  primeiro dia, numa função só, com contrato. O caminho validado do cadastro guarda sem o `55`, e a
  Meta manda com.
- **O vínculo envelhece.** A verificação vale 90 dias. Depois disso o número volta a ser tratado como
  não verificado, porque a operadora recicla chip, e o novo dono herdaria a conta. Suspender a membership
  em todas as empresas desfaz o vínculo. O admin (`users.manage`) **só desfaz**, nunca verifica.
  Verificar, desfazer e colidir ficam registrados em `audit_logs`.
- Os quatro casos de recusa (número desconhecido, número não verificado ou vencido, sem membership
  ativa na empresa do canal, membership ou empresa suspensa) recebem **a mesma resposta neutra**
  ("Este número não está habilitado. Fale com o administrador."), no máximo **uma vez por janela**
  por número, e nenhum menu. É a mesma razão do `204` invariável da recuperação de senha, e a
  resposta repetida a cada mensagem viraria custo e laço.

### D2 — A permissão é a da membership, conferida a cada ação

O bot não tem papel próprio. Cada `FlowAction` resolve telefone → membership → permissões e chama o
use-case com o mesmo `authorize` do router: `cte.submit`, `nfse.issue`, `billing.create`,
`trip.manage`, `trip.report`. **O menu só oferece o que a membership alcança**, mas a ação confere
de novo. Menu escondido não é autorização (security.md §8).

### D3 — CT-e ou NFS-e: quem decide é o perfil de emissão

`cte_emission_profiles` já escolhe a qual nota se aplica (`match_mode`, `priority`) e é resolvido
por `findEmissionProfile`, que não lança. Ele ganha:

- `output_document`: `cte` (padrão, é o comportamento de sempre) ou `nfse`;
- `nfse_emission_profile_id`: obrigatório quando `output_document = 'nfse'` e nulo caso contrário.
  A regra fica no CHECK do banco.

A classificação de cada nota tem quatro saídas: `cte`, `nfse`, `blocked` e `no_profile`. **Nota sem
perfil não cai em CT-e por padrão**: ela aparece na volumetria como sem perfil e não é emitida.
Escolher o documento fiscal por omissão é inventar regra.

**A classificação deriva dos vereditos que a listagem já calcula, e não refaz a elegibilidade**
(revisão do critic, 2026-09-11): perfil `cte` → `blocked` com o `cteBlockReason` de
`resolveDocumentBlock` (que inclui vínculo, peso e portão municipal), senão `cte`; perfil `nfse` →
`blocked` com o `nfseBlockReason` de `resolveNfseDocumentBlock` (parte compartilhada, sem peso),
senão `nfse`. Os motivos são os que já existem (`ALREADY_LINKED`, `LINKED_TO_NFSE`, `NOT_AUTHORIZED`,
`SUMMARY_ONLY`, `MISSING_TOTAL`, `MISSING_PARTY`, `MISSING_MUNICIPALITY`, e só no ramo `cte`
`MUNICIPAL_SERVICE` e `MISSING_WEIGHT`), mais dois novos:

- `CTE_BATCH_DOCUMENT_OUTPUT_NFSE` — a nota que o perfil manda para NFS-e **também é recusada na
  seleção do lote de CT-e e no `cteBlockReason` da listagem**. Sem isso a tela mostraria "vai para
  NFS-e" e o botão de CT-e continuaria aceitando a nota, que é a regra fiscal escondida no sentido
  inverso. Com o padrão `cte`, nenhuma instalação muda.
- `CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE` — a FK impede apontar para perfil de outra empresa, não para
  um perfil `draft`/`inactive`.

`no_profile` carrega o motivo, porque o `null` de `findEmissionProfile` junta situações que o
operador precisa distinguir: `unmatched` (nenhum perfil casa), `ambiguous` (empate de prioridade) e
`not_cnpj` (emitente ou destinatário pessoa física). **Perfil `match_mode='manual'` nunca
classifica** — a tela o alcança por escolha explícita, o bot não.

Em `nfse`, **taker, regra de frete, CFOP e ICMS do perfil de CT-e não se aplicam**: vale o perfil
NFS-e apontado, que tem `taker` e `freight_rule_id` próprios. O formulário esconde esses campos.

⚠️ `municipal_service_policy = 'block'` continua valendo e **vence** no ramo `cte`: a nota do mesmo
município sai como `blocked`, não é desviada para NFS-e. Com `output_document='nfse'` o portão não
tem efeito, e um CHECK proíbe a combinação para ninguém achar que ligou um portão que não faz nada.

A classificação é função pura em `cte-profiles/domain/document-output.policy.ts`, usada **pelo bot e
pela listagem**, e o contrato de paridade roda os dois consumidores sobre as mesmas notas.

### D4 — A seleção de notas é por critério oferecido pelo bot

O número da NF-e só é único por **emitente e série**, então "da 1200 à 1250" sozinho é ambíguo. O
bot oferece os critérios em lista:

| critério        | parâmetros pedidos, um por mensagem                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Faixa de número | emitente (lista dos que têm nota pendente) → série, se houver mais de uma → número inicial → número final |
| Viagem          | viagem (lista das abertas ou despachadas recentes)                                                        |
| Data de emissão | data inicial → data final (e emitente, se houver mais de um)                                              |
| Remetente       | remetente (lista)                                                                                         |

Cada lista de escolha respeita o teto do canal: até 10 linhas, com 24 caracteres cada. Passou de 10,
a lista pagina com "➡️ Mais". A seleção tem teto `CTE_BATCH_MAX_DOCUMENTS`; faixa acima dele é
recusada **na prévia**, com o número achado, e não truncada em silêncio.

### D5 — Confirmar é confirmar a prévia que foi mostrada

Entre a prévia e o toque em ✅ Confirmar a base pode mudar: uma nota entra em outro lote, outra
chega. A prévia é **congelada** num pedido (`whatsapp_command_requests`) com a lista de notas, a
classificação e um `preview_sha256`. O botão de confirmação carrega o id do pedido.

- O hash cobre **o que o usuário viu**, não só os ids: JSON canônico de `[documentId, classificação,
profileId, nfseProfileId?, takerTaxId, valor calculado]` ordenado por documento, mais `period`,
  `dueDate` e a versão de cada perfil usado. Mudar a regra de frete entre a prévia e o toque produz
  o mesmo conjunto de ids e outro valor — e emitir um número que ninguém viu é o que isto impede.
- Confirmar recalcula a classificação. Se o hash mudou, o bot **não emite**: mostra a volumetria nova
  e pede nova confirmação.
- Confirmar duas vezes, que acontece com rede ruim, converge: a chave de idempotência dos casos de uso
  sai do id do pedido, nunca do id da mensagem. Tudo o que entra na digital de idempotência dos
  use-cases (`name` do lote, `period` da NFS-e) sai **só** do pedido congelado, senão a repetição
  vira conflito.
- O pedido expira em 15 minutos. Botão de pedido vencido responde "Prévia expirada" e oferece refazer.

### D6 — A emissão é assíncrona, e a fatura de CT-e espera a autorização

Revista em 2026-09-11 depois da revisão do critic, que reprovou a primeira versão por três premissas
falsas: cada use-case abre a própria transação; criar lote não emite; e o faturamento só conhece CT-e.

1. **Na prévia** o bot pergunta o **vencimento da fatura** (7, 15 ou 30 dias) e o `period` da NFS-e
   (com "Pular"; em branco é omitido como na tela). Os dois ficam congelados no pedido.
2. **Na confirmação não há transação única.** O pedido passa a `confirming` numa transação curta, com
   o **diário de passos** (uma linha por grupo), e cada grupo é executado em sequência pelos casos de
   uso que já existem, com a chave de idempotência derivada do pedido: CT-e é **criar o lote e
   emiti-lo** (`create` → `issue`, que já faz o submit), um lote por perfil; NFS-e é uma por
   (perfil de NFS-e, tomador). Um grupo que falha fica `failed` com o código e não derruba os outros.
   Pedido parado em `confirming` é retomado pelo mesmo caminho — a idempotência faz a repetição
   convergir.
3. O bot responde na hora: "Enviado. Aviso quando a SEFAZ e a prefeitura responderem."
4. **Estado final** é declarado numa policy: sucesso é `authorized`; falha é `rejected`, `failed`,
   `cancelled` ou `discarded`; o resto é pendente, inclusive `reconciliation_required`. Quando todos
   os documentos do pedido chegam a estado final, ou depois de 2 horas, o pedido é liquidado.
5. **A fatura é só de CT-e** — decisão do usuário, 2026-09-11. Uma por tomador, só com os CT-e
   autorizados, com o vencimento congelado. A NFS-e aparece no resumo como "autorizada, sem fatura":
   o faturamento de hoje só conhece CT-e (`billing_invoice_items.cte_document_id not null`), e
   faturar NFS-e é mudança de modelo com spec própria.
6. O resumo diz autorizados, rejeitados com o motivo, pendentes que passaram das 2 horas e as faturas
   criadas. Documento rejeitado **não trava a fatura dos outros**; o bot não reprocessa.

⚠️ **A fatura sai em nome de quem confirmou, por procuração.** Quem detecta a liquidação é o worker,
e o worker não fatura (faturamento é da API, e apps não importam código uma da outra). Ele chama uma
rota da API com token de máquina — papel `automation`, permissão nova `whatsapp.settle`, o molde do
`mdfe-auto-issue` —, e a API fatura com `actor_user_id` do pedido **depois de revalidar** que aquela
membership ainda está ativa e ainda tem a permissão de faturar. Sem a revalidação, um usuário
suspenso entre a confirmação e a liquidação faturaria por procuração. Agir em nome do usuário é
conceito novo no produto, e ganha ADR.

### D7 — Estado da entrega e ocorrência por menu, sobre a viagem certa

- **Motorista**: a viagem é a de `find-current-driver-trip`. O menu é: 📦 Entregar · ↩️ Devolver ·
  ⚠️ Ocorrência. Escolhida a ação, vem a lista das notas pendentes da parada (destinatário e número).
  Devolver pede o motivo, que é o catálogo de `driver-return-reason.policy.ts`, em lista.
- **Operador**: escolhe a viagem em lista e depois a ação que o portão permite naquele estado
  (`separate` e `load` antes do despacho; `dispatch`). Ele recebe **só** as ações que
  `checkTripAcceptsDocumentWork` aceitaria, para não repetir o erro da T016 (oferecer "Devolver"
  exatamente quando dá `409`).
- **Ocorrência**: vem do catálogo ativo da empresa, filtrado pelo `stage` (`delivery` para o motorista,
  `separation` para o operador), com observação opcional em texto livre. `actor_user_id` é a
  membership do telefone.
- Prova de entrega com foto **fica fora** desta spec (mídia recebida → `proof`). Ver § Fora do escopo.

### D8 — Texto livre não vira estado

Cumpre a 062 D4 e `conversation-flow.md` §5. Só resposta a botão ou a linha de lista muda estado.
Texto digitado fora do menu recebe `fallbackMessage`; depois de duas vezes, o bot oferece
🙋 Falar com pessoa, que faz handoff para o atendimento (T008 da 062). O único texto livre aceito é
**parâmetro pedido** (número, data, observação), validado na hora.

## Requisitos funcionais

- **RF1** Webhook → despachante: toda mensagem de número habilitado entra no interpretador de fluxo
  pelo hook `onMessageReceived`, e cada ação é um `registerFlowAction`.
- **RF2** Vínculo em `user_whatsapp_phones`, verificação de entrada (código enviado do próprio
  WhatsApp, com o `from` casado), unicidade global na instalação, validade de 90 dias e resposta
  neutra única para os quatro casos de recusa (D1).
- **RF3** Menu raiz montado pelas permissões da membership (D2).
- **RF4** Classificação CT-e × NFS-e × bloqueada × sem perfil pelo perfil (D3), compartilhada com o
  painel.
- **RF5** Seleção por critério, com volumetria e confirmação congelada (D4, D5).
- **RF6** Emissão por diário de passos (criar e emitir o lote de CT-e; NFS-e por perfil e tomador),
  liquidação quando tudo chega a estado final ou em 2 horas, **fatura só de CT-e** por procuração
  revalidada, e resumo de volta ao número (D6).
- **RF7** Estado da entrega e ocorrência por menu, com os portões atuais (D7).
- **RF8** Todo grafo é republicável de forma versionada a partir do código (`conversation-flow.md` §1),
  validando o tamanho dos títulos na publicação.

## Critérios de aceite

1. Número não verificado recebe a mesma resposta neutra que um número desconhecido, e nenhum menu.
2. Um operador sem `nfse.issue` não vê "Emitir" com saída NFS-e, e a ação recusa se for chamada.
3. Faixa 1200–1250 de um emitente devolve: _"51 notas · 38 CT-e · 11 NFS-e · 2 bloqueadas (sem
   peso: 1201, 1233)"_. O mesmo conjunto no painel classifica igual (contrato de paridade).
4. Nota que entra em outro lote entre a prévia e a confirmação faz a confirmação pedir nova prévia.
5. Dois toques em ✅ Confirmar produzem um lote só.
6. Com 38 CT-e autorizados e 1 rejeitado, sai a fatura dos 38 por tomador, em nome de quem
   confirmou e com o vencimento escolhido na prévia; o resumo nomeia o rejeitado com o motivo da
   SEFAZ e lista a NFS-e como "autorizada, sem fatura". Com a membership de quem confirmou suspensa
   antes da liquidação, **nenhuma fatura sai** e o resumo diz por quê.
7. O motorista entrega a nota pelo WhatsApp e o PWA mostra a mesma nota entregue. O evento gravado é
   o mesmo, com a mesma idempotência.
8. Nenhum título de opção passa do teto, e toda escolha com ≤3 opções sai como botão com emoji.
9. Nenhum corpo de mensagem, telefone completo ou CNPJ de destinatário vai para log.

## Fora do escopo

- Foto de canhoto como prova de entrega (mídia → `proof`). É spec própria, com storage e LGPD.
- O cliente agendando entrega (062 T010).
- Inbox humana no painel (062 T007/T008); aqui o handoff só **marca** a sessão como `human`.
- Cancelar CT-e, NFS-e ou fatura pelo WhatsApp. Ação irreversível de efeito fiscal fica no painel.
- Linguagem natural ou IA interpretando pedido.

## Riscos conhecidos

- ⚠️ **O limitador desta API é em memória e opt-in por rota** (`http/rate-limiter.service.ts`,
  `router.service.ts:175,279-293`): o despachante o reusa para o teto por número, mas o achado
  global de `docs/SECURITY.md` continua valendo para as rotas autenticadas. O webhook é público e cada ação emite
  documento com custo externo. Esta spec acrescenta um teto por número e por janela **no despachante**,
  e isso não substitui o limitador global.
- ⚠️ **Upgrade do módulo.** O transportada está na 0.1.0; a 0.2.0-rc.22 muda
  `runMetaWhatsAppMigrations(db)` para `{ db, migrate }` e quebra
  `meta-whatsapp-migration.service.ts:46`.
- A 062 D3 é "um número por empresa". Uma instalação com vários CNPJs tem um número só, então a
  membership é o que diz em nome de qual empresa o operador age.
