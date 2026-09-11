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

`login_identifiers` já tem `kind='phone'`, `is_whatsapp` e `source='whatsapp'`, mas a unicidade é
`(user_id, kind, value)`: **o mesmo telefone pode estar em dois usuários**. Se essa colisão
aparecer numa mensagem que emite documento fiscal, a ação vai para uma conta que ninguém escolheu.

- O número só opera depois de **verificado por código** enviado pelo template de código que a 062
  T005 já usa. Declarar o número no cadastro não basta.
- Unicidade parcial e **global na instalação**: um número verificado pertence a **um usuário só**.
  `login_identifiers` não tem `company_id` — o usuário é da instalação, e cada instalação é uma
  transportadora (ADR-0021). A empresa vem do `phone_number_id` do canal, e a membership ativa do
  usuário **nessa** empresa é o que autoriza.
- Canonicalização única: E.164 sem `+` (`5516…`). O banco guarda sem o `55` e a Meta manda com; a
  conversão fica numa função só, com contrato.
- Número desconhecido, não verificado ou de membership suspensa recebe **uma resposta neutra** ("Este
  número não está habilitado. Fale com o administrador.") e nenhum menu. A resposta é igual nos três
  casos, pela mesma razão do `204` invariável da recuperação de senha.

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

A classificação de cada nota tem quatro saídas: `cte`, `nfse`, `blocked` (motivo de
`checkDocumentEligibility` / `checkSharedEligibility`) e `no_profile`. **Nota sem perfil não cai em
CT-e por padrão**: ela aparece na volumetria como sem perfil e não é emitida. Escolher o documento
fiscal por omissão é inventar regra.

⚠️ `municipal_service_policy = 'block'` continua valendo e **vence**: a nota do mesmo município num
perfil `cte` com portão ligado sai como `blocked`, não é desviada para NFS-e. Desviar sozinho seria
uma segunda regra fiscal escondida dentro da primeira.

A classificação é um serviço puro de domínio, usado **também pelo painel**. Assim a volumetria do
bot e a tela nunca discordam sobre a mesma nota.

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

- Confirmar recalcula a classificação. Se o hash mudou, o bot **não emite**: mostra a volumetria nova
  e pede nova confirmação.
- Confirmar duas vezes, que acontece com rede ruim, converge: a chave de idempotência dos casos de uso
  sai do id do pedido, nunca do id da mensagem.
- O pedido expira em 15 minutos. Botão de pedido vencido responde "Prévia expirada" e oferece refazer.

### D6 — A emissão é assíncrona, e a fatura espera a autorização

1. Na confirmação saem, na mesma transação do pedido, **um lote de CT-e por perfil** e **uma NFS-e por
   (perfil de NFS-e, tomador)**, pelos casos de uso que já existem. O `period` da NFS-e é perguntado
   antes da confirmação, com botão "Pular", e em branco é omitido como na tela.
2. O bot responde na hora: "Enviado. Aviso quando a SEFAZ e a prefeitura responderem."
3. Quando **todos** os documentos do pedido chegam a estado final (autorizado ou rejeitado), o worker
   gera **uma fatura por tomador** só com os autorizados e manda o resumo: autorizados, rejeitados com
   o motivo e as faturas criadas.
4. Documento rejeitado **não trava a fatura dos outros**, e fica listado para o painel resolver. O bot
   não reprocessa.

⚠️ Quem assina a fatura é quem confirmou: `actor_user_id` do pedido, e nunca um usuário de sistema.

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
- **RF2** Verificação do número por código, unicidade por empresa e resposta neutra (D1).
- **RF3** Menu raiz montado pelas permissões da membership (D2).
- **RF4** Classificação CT-e × NFS-e × bloqueada × sem perfil pelo perfil (D3), compartilhada com o
  painel.
- **RF5** Seleção por critério, com volumetria e confirmação congelada (D4, D5).
- **RF6** Emissão, espera pela autorização, fatura e resumo de volta (D6).
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
6. Com 38 CT-e autorizados e 1 rejeitado, sai a fatura dos 38, e o resumo nomeia o rejeitado com o
   motivo da SEFAZ.
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

- ⚠️ **Não existe rate limit nesta API** (`docs/SECURITY.md`). O webhook é público e cada ação emite
  documento com custo externo. Esta spec acrescenta um teto por número e por janela **no despachante**,
  e isso não substitui o limitador global.
- ⚠️ **Upgrade do módulo.** O transportada está na 0.1.0; a 0.2.0-rc.22 muda
  `runMetaWhatsAppMigrations(db)` para `{ db, migrate }` e quebra
  `meta-whatsapp-migration.service.ts:46`.
- A 062 D3 é "um número por empresa". Uma instalação com vários CNPJs tem um número só, então a
  membership é o que diz em nome de qual empresa o operador age.
