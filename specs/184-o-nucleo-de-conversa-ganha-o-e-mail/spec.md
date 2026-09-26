# Feature 184 — O núcleo de conversa vira pacote, e o e-mail é um canal dele

> Decisão de arquitetura: **ADR-0075** (o núcleo de conversa é um pacote próprio, e o assunto da
> conversa é do produto). Cumpre a condição escrita na **ADR-0072** e revê dois pontos dela.
> Continua valendo a **ADR-0051** (a tela vem do pacote, o Tailwind não) e a **ADR-0073** (o portal
> conversa).
>
> ⚠️ **Esta spec mexe em dois repositórios**: `adatechnology-packages` (o pacote novo) e
> `transportada` (o consumidor). Publicar é **parada que exige o usuário** — ADR-0054, ADR-0065.

## Specs do mesmo assunto (lidas contra o código em 2026-09-26)

Conversa já tem spec. Esta não recria decisão nenhuma delas; o que ela usa de cada uma:

| Spec    | O que ela já decidiu e esta spec **usa sem refazer**                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 062     | o WhatsApp modelado, a inbox, e **texto livre nunca muda estado** (D4)                                                                          |
| 143     | o trilho de e-mail: token de resposta derivado, threading, MIME bruto, DKIM, webhook, outbox — **é a origem do canal `email`**                  |
| 144     | os fluxos de comando do motorista pelo WhatsApp — o ramo que **fica no produto** na atribuição                                                  |
| 150     | contatos da contratante e a prévia do e-mail                                                                                                    |
| **164** | a tratativa da ocorrência. **Nenhuma decisão muda de lugar** — nem para o pacote (ADR-0075 §6)                                                  |
| **183** | **o núcleo inteiro que esta spec move**: conversa, mensagem com canal, anexo, status, leitura, não atribuídas, respostas rápidas, janela de 24h |

⚠️ **A 183 é a fonte, não um vizinho.** Esta spec não projeta um núcleo novo: ela **tira do
TransportAdA** o que a 183 já escreveu e exercitou, e o publica. O que não estiver funcionando na
183 não entra aqui — vira achado da 183.

## Problema e resultado

O ecossistema tem **três** implementações de conversa, e nenhuma serve a outra:

| Onde                                              | O que tem                                            | Quem usa                                   |
| ------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `meta_whatsapp` (`meta-whatsapp-module`)          | conversa, mensagem, status, janela — **só WhatsApp** | transportada, quickcart, financiamento-bot |
| `contractor_mail_*` (spec 143, no produto)        | conversa por assunto, token, DKIM — **só e-mail**    | transportada                               |
| `occurrence_conversation*` (spec 183, no produto) | conversa multicanal de verdade                       | transportada                               |

A terceira é a que funciona, e é a única que não é reutilizável: mora dentro do TMS. O `quickcart`,
que já usa os três pacotes de conversa do SDK, **não tem como conversar por e-mail** — teria de
reescrever o que a 183 escreveu.

E há um custo dentro do próprio TransportAdA: a conversa da ocorrência, a conversa do e-mail da 143
e a conversa do WhatsApp são três tabelas que falam do mesmo, ligadas por id opaco.

**Resultado:** nasce `@adatechnology/conversation-{contracts,module}`. Ele é dono da conversa — com
canais, status, anexo, leitura, não atribuídas e respostas rápidas — e **não sabe o que é uma
ocorrência**: o assunto chega como o par opaco `subject_type`/`subject_id`, ou vem nulo para a
conversa simples por pessoa. O canal `email` vira canal de primeira classe, com o transporte da 143
exigido por porta. O TransportAdA passa a consumir o pacote, mantendo o que é dele: quem é a
contratante, quem é o motorista, a permissão, o `companyId` e a ligação com a ocorrência.

## Fora do escopo

- **Decidir qualquer coisa pela conversa.** Continua a 183 D4 e a ADR-0075 §6: nenhuma mensagem, de
  canal nenhum, muda tratativa, taxa ou acerto. O núcleo não tem conceito de aprovação.
- **Interpretar texto livre**, com ou sem IA (spec 062 D4).
- **Mover o envio de e-mail que não é conversa.** `email-provider` e `notification-module` ficam
  onde estão; fatura, relatório e aviso seguem por eles (ADR-0075 §5).
- **Mover a conversa do `meta_whatsapp`.** O módulo da Meta continua dono da conversa dele; o núcleo
  referencia o id da mensagem opacamente, como já é.
- **Funcionalidade nova de conversa.** Esta spec move e publica o que existe. Canal novo, recurso
  novo e tela nova são outra spec.
- **Adotar o núcleo no `quickcart`.** Usar o canal de e-mail é opcional (D5), então ele já é servido
  pelo pacote sem migrar nada. A adoção é spec do repositório dele.
- **Reescrever o `MessageBubble`, o `AudioPlayer` e o `AudioRecorderButton`** do `conversations-ui`.
  O defeito de empacotamento deles (Tailwind, sem `className`) está registrado na 183 e continua
  aberto — esta spec só acrescenta o canal `email` e a tabela de capacidades (RF10).
- **Resolver as tasks abertas da 143** (T019–T022, decisão da taxa por e-mail, em revisão de validade
  contra a 164). O transporte que elas usam muda de dono; a decisão que elas propõem, não.

## Decisões

### D1 — O assunto é um par opaco, e é o que separa a conversa

O núcleo guarda `subject_type` (texto livre do produto) e `subject_id` (id opaco), ambos
**anuláveis**:

- **preenchidos** — uma conversa por assunto. É o caso do TransportAdA: `subject_type = 'occurrence'`;
- **nulos** — uma conversa por pessoa, sem assunto. É o caso simples, que o `quickcart` tem hoje.

O núcleo **não valida** `subject_type` contra lista nenhuma e **não tem FK** para tabela de produto.
É a forma que a 143 já usa em `contractor_mail_threads`. Sem isso, a ADR-0072 estaria certa em
recusar: seria `occurrence_kind` dentro de um pacote genérico.

### D2 — O canal é da mensagem, não da conversa

Vem da 183 D2, sem mudança. Numa mesma conversa uma mensagem sai por e-mail e a seguinte por
WhatsApp. O status é por mensagem, porque quem entrega é o canal.

### D3 — A capacidade do canal manda na tela

Cada canal declara o que sabe: confirma leitura? tem janela? aceita anexo, de que tamanho? aceita
áudio? aceita resposta rápida? A tela obedece (decisão do dono do projeto, 2026-09-26):

- recurso que o canal **não tem** aparece desabilitado, **com dica dizendo por quê**;
- recurso **específico de um canal** some quando outro canal está escolhido.

Nunca um controle morto sem explicação, nunca um selo que finge. Continua a ADR-0051 §4: a ausência
é declarada, não inferida.

### D4 — "Lida" só onde o canal sabe

Vem da 183 D7. O e-mail **não tem `read`** — o único jeito seria pixel de rastreio, impreciso e
rastreando a contratante sem ela saber. No WhatsApp, contato com confirmação desligada para em
`delivered`. A tabela de capacidades (D3) é o que faz a tela não mentir.

### D5 — Canal é opcional; o que se liga, se equipa

Decisão do dono do projeto (2026-09-26): **usar o canal de e-mail é opcional.** Cada produto liga só
os canais que quer, e o núcleo serve igual a quem usa um e a quem usa quatro. É por isso que o mesmo
pacote atende o TransportAdA (`email`, `whatsapp`, `app`, `portal`) e o `quickcart` (hoje só
WhatsApp) sem obrigar nenhum dos dois a carregar o do outro.

O que **não** é opcional é equipar o canal que se ligou (ADR-0075 §5). Ligar `email` sem fornecer
`ConversationEmailTransportPort` é **erro na subida**, nomeando a peça que falta — porque um canal
que aceita mensagem e perde a resposta é pior que um canal desligado. Canal desligado simplesmente
não aparece na tela (D3).

### D6 — O status só avança

Vem da 183 RF14. Cada transição guarda horário; evento repetido do provedor é idempotente por
`(canal, id da mensagem do provedor)`; estado nunca retrocede. Já é assim no produto, e vira regra
do pacote.

### D7 — A atribuição genérica é do pacote; o que sabe o que é uma viagem é do produto

- **pacote**: pela referência de resposta; sem ela, à conversa aberta mais recente daquele
  identificador; com mais de uma candidata, **fila de não atribuídas**. "Nunca se atribui por
  palpite" (183 RF9) vira regra do pacote;
- **produto**: o ramo do motorista (mensagem que não responde a nada segue para os fluxos de comando
  da 144) e qualquer regra que dependa do domínio.

### D8 — A migração é direta, porque a base está vazia

A pergunta que sobrou da primeira versão desta spec era o tamanho da migração dos dados da 183.
**Respondida pelo dono do projeto em 2026-09-26: a base de produção está vazia ou quase** — a 183 é
entrega recente e ainda não acumulou conversa.

Com isso a migração é `create table` no schema do núcleo, cópia do que houver, e `drop` das tabelas
da 183. **Some a leitura pelas duas formas** que a primeira versão desta spec exigia: não há o que
ler duas vezes, e manter o caminho duplo seria complexidade paga por um risco que não existe.

⚠️ **A primeira task da fase conta as linhas antes de migrar.** Se o número contrariar a premissa,
a fase para e o plano volta ao caminho duplo — "base vazia" é medição, não suposição, e quem executa
confere em vez de confiar nesta linha.

## Histórias priorizadas

### P1 — O núcleo existe e é publicado

**Given** o TransportAdA com a conversa da 183 funcionando
**When** o núcleo é extraído para `@adatechnology/conversation-{contracts,module}`
**Then** o pacote sobe com conversa, mensagem, canal, status, anexo, leitura, não atribuídas e
respostas rápidas, **sem nenhum conceito de ocorrência, contratante ou motorista dentro**, e sem
estilo.

### P2 — A conversa por assunto e a conversa por pessoa cabem no mesmo núcleo

**Given** o pacote instalado
**When** o produto cria uma conversa com `subject_type = 'occurrence'` e outra sem assunto
**Then** as duas funcionam, e o núcleo trata as duas pelo mesmo caminho — a segunda é o caso do
`quickcart`.

### P3 — O canal e-mail é canal de primeira classe

**Given** uma conversa com o canal `email` ligado e o transporte fornecido
**When** o operador manda e a contratante responde da caixa dela
**Then** a resposta volta **para a conversa certa** (token derivado), com `In-Reply-To`/`References`,
o MIME bruto gravado com `sha256` antes de qualquer interpretação, e o resultado de DKIM na
mensagem — e o selo de lida **não aparece**, porque o e-mail não sabe dizer.

### P4 — O canal que não sabe fazer não finge

**Given** a conversa aberta no canal `email`
**When** o operador olha os controles
**Then** o que o e-mail não suporta está desabilitado **com dica dizendo por quê**, e o que é só de
outro canal não aparece.

### P5 — A ocorrência continua funcionando depois da troca

**Given** o TransportAdA com a conversa da 183 e a base de conversas vazia ou quase (D8)
**When** o produto passa a consumir o núcleo e a migração roda
**Then** o que houver vira conversa do núcleo com `subject_type = 'occurrence'`, com mensagens,
anexos, status e leituras, e a tela da ocorrência funciona como antes — provado pelos testes da 183
seguirem verdes (CA09).

## Requisitos funcionais

### No pacote

- **RF1** `conversation-contracts`: vocabulário de canal (`email`, `whatsapp`, `app`, `portal`,
  `webchat`), direção, status de entrega, resultado de DKIM, tipo de anexo. Zero runtime, única
  dependência `zod`.
- **RF2** Tabela de **capacidades por canal**: confirma leitura, tem janela (e de quantas horas),
  aceita anexo (e o teto), aceita áudio, aceita resposta rápida, precisa de transporte próprio.
- **RF3** Máquina de status que **só avança**, com horário por transição e idempotência por
  `(canal, id do provedor)` (D6).
- **RF4** Portas: `ConversationChannelPort` (enviar por um canal), `ConversationEmailTransportPort`
  (D5), `ClockPort`, `ObjectStoragePort`, `TranscriberPort` (opcional — ausente é anexo sem texto,
  nunca texto fingido, ADR-0074).
- **RF5** `conversation-module`: schema e migrations de conversa, participante, mensagem, anexo,
  leitura, não atribuída e resposta rápida. `subject_type`/`subject_id` anuláveis (D1), sem FK para
  produto e sem FK para o schema `meta_whatsapp`.
- **RF6** Casos de uso: abrir conversa, enviar, receber, atualizar status, atribuir, marcar lido,
  listar. Todos atrás de porta, injetados por `createConversationModule(...)`.
- **RF7** **Atribuição genérica** (D7): por referência de resposta; sem ela, conversa aberta mais
  recente do identificador; ambígua, fila de não atribuídas.
- **RF8** Anexo com `sha256`, tipo conferido **pelo conteúdo** (não pela extensão), teto **por
  canal** (RF2), URL temporária. Nenhum byte no banco.
- **RF9** Respostas rápidas por público, com posição e ativo.
- **RF10** `conversations-ui` ganha `email` no vocabulário de canal e passa a **ler a tabela de
  capacidades** (D3) para desabilitar com dica ou esconder.

### No TransportAdA

- **RF11** O produto passa a consumir o pacote, mandando `subject_type = 'occurrence'` e
  `subject_id` = o id da ocorrência.
- **RF12** O produto mantém o que é dele: quem é a contratante (143 RF3), quem é o motorista, os
  contatos e tipos, o aceite de WhatsApp, o telefone verificado, as permissões, o `companyId`, o
  recorte do portal e a LGPD.
- **RF13** O produto mantém o **ramo do motorista** na atribuição (D7): mensagem que não responde a
  nada segue para os fluxos de comando da 144.
- **RF14** O transporte de e-mail da 143 passa a implementar `ConversationEmailTransportPort`, sem
  mudar comportamento: mesmo token derivado, mesmo threading, mesmo MIME, mesmo DKIM.
- **RF15** Migração aditiva (D8), com leitura pelas duas formas até virar.

## Requisitos não funcionais

- **RNF1** O pacote **não carrega estilo** nem Tailwind (ADR-0051, ADR-0075 §6).
- **RNF2** O pacote **nunca lê `process.env`** — configuração por parâmetro, como o
  `audio-transcription-provider` exige no CLAUDE.md dele.
- **RNF3** `companyId` **nunca** em schema de corpo de requisição — vem do contexto autenticado. É
  invariante escrita do `notification-contracts`, e vale igual aqui.
- **RNF4** **Nenhuma PII em tipo persistido do pacote** além do identificador que o canal exige para
  entregar. Log leva id, nunca endereço, corpo nem segredo (143 RNF).
- **RNF5** TypeScript estrito, sem `any` (AGENTS.md do `adatechnology-packages`).
- **RNF6** Migração sem janela de indisponibilidade (D8, P5).
- **RNF7** A API do núcleo é contrato: nome de canal, de status e de capacidade não se renomeia sem
  quebrar host (ADR-0051, ADR-0075).

## Casos extremos e falhas

- **Canal `email` ligado sem transporte** → erro na subida nomeando a peça que falta (D5). Nunca
  aceitar mensagem e perder a resposta.
- **`subject_type` que o núcleo nunca viu** → aceito. O núcleo não valida (D1); é rótulo do produto.
- **Dois produtos com o mesmo `subject_type`** → sem conflito: o recorte é por empresa e por
  produto, nunca global.
- **Evento de status repetido do provedor** → idempotente por `(canal, id do provedor)` (D6).
- **Evento de status fora de ordem** (chega `read` antes de `delivered`) → o estado só avança; o
  horário do intermediário fica em branco, e a tela não inventa.
- **Mensagem recebida com mais de uma conversa candidata** → fila de não atribuídas; **nunca
  palpite** (D7).
- **DKIM indisponível** (DNS fora do ar) → `unverifiable`, e **a verificação não se refaz depois**:
  a chave pode ter girado, e o resultado de agora não é prova do que valia então (143).
- **Migração interrompida no meio** → a cópia é idempotente por id, então retomar é seguro. Com a
  base vazia (D8), o caso é quase teórico — mas a cópia não depende disso para ser retomável.
- **A contagem da primeira task contrariar a premissa da base vazia** → a fase **para** e volta ao
  caminho duplo (D8). Migrar base cheia com plano de base vazia é perder conversa.
- **Anexo com extensão mentindo sobre o conteúdo** → tipo conferido pelo conteúdo (RF8).
- **Transcrição desligada** → anexo sem texto, marcado "não avaliado". Nunca texto fingido
  (ADR-0074).

## Critérios de aceite

- **CA01** O pacote sobe e passa nos testes dele **sem nenhuma ocorrência da palavra `occurrence`,
  `contractor` ou `driver`** no código do núcleo — contrato que falha se aparecer.
- **CA02** Uma conversa com assunto e uma sem assunto funcionam pelo mesmo caminho (P2).
- **CA03** Ligar o canal `email` sem transporte falha na subida, nomeando a peça (D5).
- **CA04** O selo de lida não aparece no canal `email`, e o controle que o canal não suporta está
  desabilitado com dica (D3, D4, P4).
- **CA05** O status só avança, e evento repetido não muda nada (D6).
- **CA06** Mensagem recebida ambígua cai na fila de não atribuídas (D7).
- **CA07** A resposta da contratante volta para a conversa certa, com threading, MIME com `sha256` e
  DKIM (P3) — comportamento **idêntico** ao de hoje.
- **CA08** A contagem antecede a migração, e o número medido entra na evidência. Com a base vazia, a
  migração roda de uma vez; com base cheia, a fase para (D8).
- **CA09** O TransportAdA continua com todos os testes da 183 verdes depois de passar a consumir o
  pacote.
- **CA10** Nenhuma decisão de negócio muda de lugar: a tratativa da 164 continua onde está
  (ADR-0075 §6).

## Dúvidas

Nenhuma aberta. As duas que a primeira versão desta spec carregava foram respondidas pelo dono do
projeto em 2026-09-26:

- **o tamanho da migração** — a base está vazia ou quase, e a migração é direta (D8), com a
  contagem antes de migrar;
- **o `quickcart` como segundo consumidor** — não entra nesta spec. Usar o canal de e-mail é
  opcional (D5), e é isso que faz o núcleo já servir a ele sem migrá-lo: ele liga o WhatsApp e
  ignora o resto. A adoção dele é spec do repositório dele.

⚠️ Com isso o núcleo nasce com **um consumidor de verdade**. O risco está assumido por escrito na
ADR-0075 § "Consequências", e a mitigação é o CA01: contrato que falha se palavra de domínio do TMS
aparecer no núcleo.
