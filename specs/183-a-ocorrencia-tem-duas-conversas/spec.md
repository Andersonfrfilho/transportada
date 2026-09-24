# Feature 183 — A ocorrência tem duas conversas

> Decisões de arquitetura: **ADR-0072** (a conversa multicanal vem do pacote) e **ADR-0073** (o
> portal ganha a conversa da ocorrência). Continua a spec 143 e
> absorve dela a parte de ocorrência (T014, T015, T016, T018, T024, T025 — ver `tasks.md` da 143).
> Prévia das telas (protótipo navegável, privado do dono do projeto):
> https://claude.ai/artifact/WnJBKYDc3eRt2QJGxizh7h

## Specs do mesmo assunto (lidas contra o código de staging em 2026-09-24)

Ocorrência já tem várias specs. Esta não recria nenhuma decisão delas; o que ela usa de cada uma:

| Spec     | O que ela já decidiu e esta spec **usa sem refazer**                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 079, 157 | tipos de ocorrência por etapa e o aviso interno                                                                                                                                                                                      |
| 143      | trilho de e-mail com a contratante (conversa, token, webhook, worker)                                                                                                                                                                |
| 144, 161 | WhatsApp da empresa, fluxos de comando do motorista e download de mídia da Meta                                                                                                                                                      |
| 150      | contatos da contratante e a prévia do e-mail (precedente do RF7)                                                                                                                                                                     |
| 156      | registro "em nome do motorista" (autoria do escritório)                                                                                                                                                                              |
| **164**  | **a tratativa da ocorrência**: decisão no painel (`occurrences.resolve`) e no portal (`occurrences.decide`), acerto que gera `delivery_charges`, e o e-mail que só **anuncia** a decisão pendente. **Toda decisão continua lá** (D4) |
| 166, 172 | quantidade e unidade do item na ocorrência (o detalhe só mostra)                                                                                                                                                                     |
| 171, 180 | linha do tempo da viagem; o link da ocorrência para o detalhe (180 RF15) é feito aqui                                                                                                                                                |
| 173      | marcador de ocorrência aberta na viagem                                                                                                                                                                                              |

As divergências encontradas entre a primeira versão desta spec e o código estão em `evidence.md`
§ "Divergências", com a correção aplicada a cada uma.

## Problema e resultado

`/ocorrencias` lista o que aconteceu, mas não leva a lugar nenhum. A linha não abre nada; o botão
"Detalhar" só expande a descrição e as fotos. Não existe `GET` de uma ocorrência, não existe rota
`/ocorrencias/:id`, e a tabela não mostra de quem é a carga, para onde ia nem quanto vale.

Quando alguma coisa precisa ser resolvida, a conversa acontece fora do produto: o operador liga para
o motorista, manda WhatsApp do celular pessoal, e escreve à contratante da própria caixa de e-mail.
A spec 143 montou o trilho de e-mail (conversa, token de resposta, webhook, worker), mas ele ainda
não está ligado à ocorrência, e o WhatsApp da empresa (spec 144, `meta-whatsapp-*`) só fala com
usuário interno verificado.

**Resultado:** a linha da ocorrência abre uma página de detalhe com a nota (contratante, endereço de
entrega, valor), o contato do motorista, as fotos e a linha do tempo. Nela ficam **duas conversas**,
cada uma com os próprios canais:

- **Contratante** — por **e-mail**, por **WhatsApp** e pelo **portal da contratante**
  (`apps/frontend-client`), com os contatos dela cadastrados por tipo;
- **Motorista** — pelo **app do motorista** e por **WhatsApp**.

Nas duas: respostas rápidas, anexos nos dois sentidos, e o mesmo desenho no celular (PWA).

## Fora do escopo

- **Decidir qualquer coisa pela conversa.** A decisão da ocorrência é da tratativa da spec 164, e
  nenhuma mensagem — de canal nenhum — muda a tratativa, a taxa ou o acerto (D4).
- Interpretar texto livre, inclusive com IA. Texto livre nunca muda estado (spec 062 D4). A
  transcrição de áudio (RF18) só converte fala em texto para leitura; ela não interpreta nem decide.
- Push nativo para o motorista: o PWA não tem service worker de push (143, fora do escopo). O canal
  "app" chega pela inbox do `notification-module` e pela tela da conversa no PWA.
- Conversa com o **destinatário** (o recebedor da carga). A contratante é o emitente (143 RF3).
- Uma inbox geral de WhatsApp (`/conversas`, spec 062 T007). Esta spec usa as mesmas peças do pacote,
  mas a conversa vive na ocorrência.
- Configurar o canal de WhatsApp da empresa pela tela. A rota `/company-settings/whatsapp-channel`
  existe e continua sendo o caminho; a tela é da spec 062.
- Ligação telefônica pelo produto. "Ligar" é `tel:` e "WhatsApp" do contato do motorista é `wa.me`,
  fora do produto.

## Decisões

### D1 — Duas conversas por ocorrência, uma por participante

A conversa pertence ao par (ocorrência, participante), não ao canal. A contratante e o motorista
nunca veem a conversa um do outro; o operador vê as duas em abas. O que liga as duas é a própria
ocorrência: um marco de uma aparece na outra ("Contratante aprovou a taxa · 14:41") e um anexo pode
ser encaminhado de uma para a outra por ação explícita do operador — nunca automaticamente.

### D2 — O canal é da mensagem, não da conversa

Numa mesma conversa, uma mensagem sai por e-mail e a seguinte por WhatsApp. Cada mensagem guarda o
canal por onde passou e mostra o selo dele. A conversa de e-mail da 143 (`contractor_mail_threads`,
token de resposta, `In-Reply-To`) continua existindo por baixo: é o transporte do canal e-mail, não
a conversa que o operador vê.

### D3 — O que é genérico vai para o pacote; o que é do TMS fica aqui

Regra do repositório (`AGENTS.md`: bibliotecas reutilizáveis vivem em `adatechnology-packages`) e
ADR-0051 (a tela de conversa vem do pacote). **O SDK é genérico, e todo estilo customizável fica do
nosso lado** (decisão do dono do projeto, 2026-09-24). Do pacote vêm as peças: `ConversationPane`,
`MessageBubble`, compositor com respostas rápidas e anexos, `AudioPlayer`, `AudioRecorderButton`,
`AudioTranscription`, `StatusTicks`, `windowOf`/`WindowExpiredNotice`, o envio de mídia e os
eventos de status do WhatsApp. **No TransportAdA ficam** a composição do que é do produto — as abas
por participante, o selo de canal por mensagem (`email`, `whatsapp`, `app`, `portal`), o seletor de
canal — e **todo o estilo**, aplicado pelos `className`/`classNames` que as peças aceitam e por
`*.module.css` sobre a camada `.cv-*`, com os nossos tokens, **sem Tailwind** (ADR-0051). Também
ficam aqui: quem é a contratante, os contatos e os tipos deles, o motorista da viagem, a ligação com
a ocorrência, permissões, `companyId` e LGPD. Detalhe na ADR-0072.

### D4 — A conversa não decide; a tratativa da 164 decide

Nenhuma mensagem — e-mail, WhatsApp (texto, botão ou áudio), app, portal ou transcrição — muda a
tratativa, a taxa ou o acerto. A spec 164 já fixou onde se decide: no painel, pelo painel da
tratativa (`occurrences.resolve`), e no portal, pelo formulário de decisão (`occurrences.decide`); e
fixou que o e-mail só **anuncia** a decisão pendente, nunca é um segundo caminho. Esta spec mantém
isso: a conversa é para combinar, e quem decide usa a tratativa, que fica na mesma página. A decisão
por e-mail que a 143 previa (T019–T022) fica fora desta spec e precisa ser revista contra a 164 à
parte.

### D5 — A janela de 24 horas manda no WhatsApp

Fora da janela de atendimento de 24h aberta pela última mensagem do contato, a Meta só aceita
**modelo aprovado**. O produto não tenta mandar texto livre fora da janela: o seletor mostra o
estado da janela e, fechada, oferece só os modelos aprovados da empresa. Vale para a contratante e
para o motorista: iniciar conversa pelo WhatsApp é sempre por modelo.

Quando a janela está para fechar, o produto **avisa e troca de canal** em vez de deixar a conversa
morrer (RF20): com o motorista, a conversa segue pelo **app (PWA)**; com a contratante, pelo
**portal** (quando a ocorrência está visível lá) ou pelo **e-mail** do contato. O operador vê o aviso antes, e a pessoa do outro lado recebe, ainda dentro da
janela, uma mensagem dizendo por onde a conversa continua.

### D6 — O WhatsApp da contratante é de quem aceitou

Só recebe WhatsApp o contato com telefone e **aceite registrado** (`whatsapp_opt_in_at`, com quem
registrou). A mensagem que chega de um número de contato com aceite é aceita no webhook; qualquer
outro número externo continua recusado como hoje (`unknown_phone`). O motorista usa o telefone
**verificado** dele (ADR-0063); sem telefone verificado, o canal WhatsApp do motorista não aparece.
O motorista já fala com o número da empresa pelos fluxos de comando da spec 144; a conversa da
ocorrência não pode sequestrar esses fluxos nem ser sequestrada por eles (RF9, ramo do motorista).

### D7 — "Lida" só onde o canal sabe

O WhatsApp informa entregue e lida (a lida some se o contato desligou a confirmação de leitura — aí
fica em entregue, e a tela não finge). O app do motorista é nosso e sabe as duas. O e-mail sabe
**entregue** ao servidor de destino e **devolvido**, mas não sabe "lida": o único jeito seria pixel
de rastreio, que é impreciso (clientes de e-mail carregam imagens sozinhos ou bloqueiam) e é
rastrear a contratante sem ela saber. Então no e-mail não existe "lida" — o selo para em "entregue".

### D8 — Áudio é mensagem, transcrição é ajuda de leitura

Áudio entra e sai pelo WhatsApp (contratante e motorista) e pelo app do motorista. Ele é guardado
como anexo, com `sha256`, como qualquer outro (RF10). A transcrição é gerada por máquina e aparece
**marcada como tal**, embaixo do player. Ela nunca decide nada, nunca vira sugestão de decisão e
nunca substitui o áudio, que continua sendo o registro. Transcrever manda a voz de terceiros a um
provedor, e isso exige ADR própria antes de entrar no produto (RF18).

### D9 — A contratante também conversa pelo portal

O portal (ADR-0050) ganha a tela da ocorrência com a conversa, e `portal` vira o terceiro canal da
conversa com a contratante. Decisão de crescer o portal registrada na **ADR-0073**. O que vale lá:

- a contratante vê **toda** a conversa dela, por qualquer canal (o que um colega respondeu por e-mail
  ou WhatsApp aparece no portal), e **nunca** a conversa com o motorista (D1);
- o motorista não aparece no portal: nem nome, nem telefone, nem foto (ADR-0050: o cliente vê onde a
  carga está, nunca quem dirige). Eventos de sistema que citariam o motorista saem neutros;
- a transportadora aparece como a empresa, não como o funcionário que escreveu;
- a cor segue o **participante**, não o lado: transportadora sempre cobre, contratante sempre azul.
  No portal a contratante fica à direita, porque é ela quem está lendo;
- câmera e microfone continuam **negados** na `Permissions-Policy` do portal: dá para anexar arquivo
  e ouvir áudio, mas não gravar áudio nem tirar foto por lá;
- a conversa aparece **só nas ocorrências que o portal já mostra**: a regra da spec 164 D5 (tratativa
  aguardando a contratante, decidida ou fechada) vale para ela também (decisão do dono do projeto,
  2026-09-24). Antes disso a contratante conversa por e-mail e WhatsApp, e o que ela escreveu
  aparece no portal quando a ocorrência chega lá;
- a conversa entra na tela "Ocorrências" **que o portal já tem** (spec 164), ao lado do formulário de
  decisão dela, que continua sendo o único jeito de decidir pelo portal (`occurrences.decide`, D4);
- as rotas novas do portal não recebem id interno: a conversa é nomeada por uma referência opaca
  (`public_ref`), e o recorte vem de `resolveContractorScope`. (A rota de decisão da 164 recebe o id
  interno da ocorrência; essa divergência com a regra do portal é da 164 e fica registrada em
  `evidence.md`, fora desta spec.)

## Histórias priorizadas

### P1 — A linha abre o detalhe, e a tabela mostra a nota

**Given** um usuário com `fleet.read` (a mesma permissão da lista hoje), **When** ele clica numa linha
de `/ocorrencias`, **Then** abre `/ocorrencias/:id` com: tipo, grupo, origem e autoria (inclusive "em
nome do motorista"); a nota (número/série, contratante com CNPJ, endereço de entrega, valor, volumes
e peso) e, quando houver, item, quantidade e unidade (166/172); o motorista (foto quando houver,
iniciais quando não; "sem motorista" quando a viagem não tem); a descrição; as fotos; o **painel da
tratativa e o do acerto da spec 164**, com as mesmas permissões de lá; e a linha do tempo. **And** o
evento de ocorrência na linha do tempo da viagem vira link para este detalhe (180 RF15). **And** a tabela ganha as colunas Contratante, Endereço de
entrega, Valor NF-e e Conversa, respeitando `docs/frontend/data-tables.md`. **And** a URL do detalhe
abre direto (recarregar, colar o link).

### P2 — O contato do motorista está à mão

**Given** a ocorrência de uma viagem com motorista, **Then** o detalhe mostra foto (ou iniciais),
telefone (com o selo WhatsApp quando verificado) e e-mail, com "Ligar", "WhatsApp", "Escrever e-mail"
e "Copiar telefone". **Nada da CNH**: validade e número são dados que a ADR-0039 manda criptografar,
e o módulo `trip` não os lê (`test/trip/privacy.contract.ts`, spec 079 T015). A página inteira já exige `fleet.read`, a mesma permissão que abre a ficha do motorista.
**And** sem motorista na viagem, o bloco não aparece.

### P3 — Os contatos da contratante têm nome, tipos e canais

**Given** um usuário com `settings.manage` na aba Contatos da contratante, **When** ele cria ou edita
um contato, **Then** informa nome, setor, e-mail, telefone, os **tipos** (Ocorrências, Aprova
cobranças, Agendamento, Faturas, CT-e/XML), os **grupos de ocorrência** que recebe (Separação,
Entrega, Parada), os **canais** (e-mail, WhatsApp com aceite) e o canal preferido.

### P4 — O operador fala com a contratante por e-mail

**Given** uma ocorrência com nota e contatos do tipo Ocorrências, **When** o operador clica em
"Enviar à contratante" e escolhe e-mail, **Then** vê destinatários, modelo, assunto, mensagem,
anexos e a **prévia de como o e-mail chega**. **And** ao enviar, a mensagem sai pelo trilho da 143
com `Reply-To` único; a resposta aparece na aba Contratante, com anexos; a resposta do operador sai
na mesma conversa da caixa dela.

### P5 — O operador fala com a contratante por WhatsApp

**Given** a empresa com canal de WhatsApp configurado e um contato com aceite, **When** o operador
escolhe WhatsApp, **Then** a conversa começa por modelo aprovado com a prévia da mensagem; a resposta
do contato aparece na mesma aba, com selo WhatsApp, inclusive mídia; e dentro da janela de 24h o
operador responde em texto livre com anexos. **And** nada que chegue por WhatsApp muda a tratativa
(D4).

### P6 — A contratante conversa pelo portal

**Given** um usuário do portal com vínculo com a contratante da nota, **When** ele abre uma ocorrência
na tela "Ocorrências" que o portal já tem (só as que a spec 164 D5 mostra), **Then** vê a conversa
inteira (todos os canais), anexos e áudios para ouvir, e responde com texto e arquivo. **And** o
formulário de decisão da 164 continua ao lado, como hoje. **And** a mensagem que ele envia aparece
para o operador com o selo Portal e o nome da conta dele.

### P7 — O operador fala com o motorista

**Given** uma ocorrência de uma viagem com motorista (sem motorista, a aba não aparece; registrada pelo
escritório em nome dele, a conversa é com ele mesmo assim), **When** o operador abre a aba Motorista,
**Then** conversa pelo **app** (a mensagem chega na inbox e na tela da conversa no PWA do motorista,
que responde de lá, com foto) ou pelo **WhatsApp** do telefone verificado. **And** uma foto recebida
pode ser anexada à ocorrência ou encaminhada à conversa da contratante com um toque.

### P8 — O operador vê se chegou e se leram

**Given** uma mensagem enviada, **Then** o selo dela mostra enviada, entregue ou lida conforme o
canal (RF14), e muda sozinho quando o status chega. **And** a mensagem que falhou ou voltou aparece
em destaque, com o motivo e a ação "Reenviar por outro canal".

### P9 — Áudio e transcrição

**Given** um áudio recebido pelo WhatsApp ou pelo app, **Then** a conversa mostra um player (tocar,
posição, duração; velocidade 1×/1,5×/2× quando o `AudioPlayer` do pacote tiver — T101) e, quando a transcrição estiver pronta, o texto embaixo com
o aviso "gerada por máquina". **And** o operador grava um áudio na caixa de envio, ouve antes e envia
ou descarta.

### P10 — Respostas rápidas

**Given** respostas rápidas cadastradas pela empresa para cada público (contratante, motorista),
**When** o operador toca numa, **Then** o texto entra na caixa de mensagem para ser revisado antes
de enviar — nunca sai sozinho.

### P11 — Tudo isso cabe no celular

**Given** o PWA num celular, **Then** a lista vira cartões com contratante, valor, endereço e
motorista; o detalhe vira abas Resumo, Contratante e Motorista, com a caixa de envio fixa no rodapé,
câmera e anexo; e "Ligar"/"WhatsApp" abrem o discador e o app do aparelho.

## Requisitos funcionais

- **RF1** `GET /trip-occurrences/:id`, com `fleet.read` (a permissão da listagem e dos anexos hoje —
  `trip.read` é do motorista e do agregado e alargaria o acesso), devolve os dois tipos de ocorrência
  (de parada e de nota) numa forma só, filtrada por `companyId`, com o mesmo `id` que a listagem e as
  rotas `/:id/attachments`, `/:id/case/*` e `/:id/case/settlement` já usam. Traz a tratativa no
  mesmo formato da listagem (`case`). Ocorrência de outra empresa responde 404, igual a inexistente.
- **RF2** A listagem e o detalhe trazem da nota ligada: número, série, contratante (emitente, pelo
  `findChargeParties` da 143 RF3), valor total (`nfe_documents.total_value`, `numeric`, serializado
  como string decimal) e endereço de entrega. O endereço é o do **destinatário da nota**
  (`nfe_participants` + `nfe_addresses`), a mesma fonte de que a parada nasce (ADR-0043 §3 — a
  parada guarda só `address_key` e `label`, não o endereço). Ocorrência de parada sem nota traz nota,
  contratante e valor vazios, mostra o `label` da parada no lugar do endereço, e a UI diz "Sem nota".
- **RF3** A listagem e o detalhe trazem do motorista: nome e se há foto; o detalhe traz também
  telefone da ficha, o telefone **verificado** do WhatsApp (outro formato, com `55`) e e-mail — nada
  da CNH (ADR-0039). Sem motorista na viagem, o
  bloco vem nulo. A foto usa o endpoint de foto de usuário que já existe.
- **RF4** A listagem traz o estado da conversa com a contratante (`none`, `awaiting`, `replied`) e a
  quantidade de mensagens do motorista não lidas pelo operador, sem N+1. A decisão (aprovada,
  recusada) **não** é estado de conversa: a coluna mostra a da tratativa, que a listagem já traz em
  `case`.
- **RF5** `contractor_contacts` ganha: `name`, `role_label`, `phone` (E.164), `types` (conjunto
  fechado: `occurrences`, `approves_charges`, `scheduling`, `invoices`, `cte_xml`),
  `occurrence_stages` (`separation`, `delivery`, `stop`), `whatsapp_opt_in_at`,
  `whatsapp_opt_in_by_user_id`, `preferred_channel` (`email` | `whatsapp`). Os campos atuais
  `receives_occurrences` e `can_decide` passam a ser **derivados** dos tipos na escrita (mantidos por
  compatibilidade com a 143 e a 150) e a migration preenche `types` a partir deles.
- **RF6** Existe **uma** conversa por (ocorrência, participante), com participante `contractor` ou
  `driver`. Toda mensagem tem `channel` (`email`, `whatsapp`, `app`), direção, autor, corpo, anexos,
  estado de entrega e a referência ao registro do transporte (mensagem da 143, mensagem do
  `meta_whatsapp`). Na conversa com a contratante vale também `portal` (D9), cujo autor, quando é a
  contratante, é o usuário do portal.
- **RF7** O envio por e-mail usa os casos de uso da 143 (thread por objeto, token derivado,
  outbox na mesma transação, `Idempotency-Key`). O corpo tem texto e HTML, e a prévia do diálogo é
  renderizada **pelo mesmo** template que o envio usa.
- **RF8** O envio por WhatsApp usa o canal da empresa **pelo `SendMessageUseCase` do
  `meta-whatsapp-module`** (texto, modelo e `sendMedia`), não pelo provider direto: é o módulo que
  guarda a mensagem, aplica a janela e devolve o status — mensagem enviada por fora dele nunca recebe
  o `onStatusUpdate` (conferido na T101). Modelo aprovado fora da janela, texto livre dentro. A
  janela é calculada da última mensagem **recebida** daquele número na conversa.
- **RF9** O webhook do WhatsApp aceita mensagem de número que seja telefone de contato de contratante
  com aceite (D6). A mensagem é atribuída à conversa pela referência de resposta (`context.id`)
  quando houver; sem ela, à conversa aberta mais recente daquele contato; com mais de uma candidata
  aberta, vai para "não atribuída" e o operador escolhe. Nunca se atribui por palpite.
  **Ramo do motorista:** a mensagem do motorista pelo WhatsApp só entra na conversa da ocorrência
  quando responde (`context.id`) a uma mensagem que essa conversa enviou; qualquer outra continua
  indo para os fluxos de comando da spec 144, exatamente como hoje. A primeira mensagem da conversa ao
  motorista diz isso a ele ("responda a esta mensagem").
- **RF10** Anexo que sai: guardado no bucket privado com `sha256`, tamanho e tipo conferidos antes do
  envio (PDF, imagem, planilha; limite por canal validado no gateway). Anexo que chega: extraído do
  MIME bruto (e-mail, já gravado pela 143 RF4) ou baixado da Meta (WhatsApp) pelo worker —
  reaproveitando o caminho que a spec 161 já usa (`fetchMediaAsBase64` / `ingestInboundMedia`) —,
  gravado com `sha256`, servido por URL temporária. O compositor do pacote não aplica limite de
  tamanho: o produto confere antes (`resolveMaxAttachmentSizeBytes` como base).
- **RF11** O canal `app` do motorista (o PWA): a mensagem do operador vira aviso na inbox (`notification.v1`,
  `dedupeKey` = id da mensagem) e aparece na tela da conversa do PWA; a resposta do motorista é
  `POST /me/trips/current/occurrences/:id/messages`, com foto.
- **RF12** Respostas rápidas por empresa e público (`contractor` | `driver`), ordenáveis, ativáveis,
  com teto de 500 caracteres; CRUD com `settings.manage`.
- **RF13** O marco de uma conversa aparece na outra só como evento de sistema (texto fixo e link),
  nunca com o corpo da mensagem da outra parte.
- **RF14** Toda mensagem que sai mostra a **confirmação** que o canal consegue dar — e só ela (D7):

  | Canal    | Estados                                                | De onde vem                                                 |
  | -------- | ------------------------------------------------------ | ----------------------------------------------------------- |
  | WhatsApp | `queued` → `sent` → `delivered` → `read`, ou `failed`  | webhook de status da Meta, pelo id da mensagem              |
  | E-mail   | `queued` → `sent` → `delivered`, ou `bounced`/`failed` | eventos de entrega do Resend (`delivery_status` da 143)     |
  | App      | `queued` → `delivered` → `read`                        | o PWA do motorista: baixou a mensagem / abriu a conversa    |
  | Portal   | `delivered` → `read`                                   | gravada = disponível; lida quando um usuário do portal abre |

  O estado só avança (um `delivered` atrasado não desfaz um `read`), cada transição guarda o horário,
  e o toque no selo mostra os horários. O evento de status é idempotente pelo id do provedor.

- **RF15** Do lado do operador, mensagem recebida fica **não lida** até alguém com acesso abrir a aba
  daquela conversa; é isso que alimenta o contador da aba e a coluna Conversa da listagem (RF4). O
  registro é por usuário, e abrir a aba não manda nenhuma confirmação de volta à contratante nem ao
  motorista.
- **RF16** Toda mensagem recebida da contratante mostra **quem respondeu**, puxado do cadastro:
  - o remetente (e-mail sem diferença de caixa; telefone em E.164) é casado com os contatos **daquela
    contratante**; achando, a mensagem mostra nome, setor, tipos (destaque para "Aprova cobranças") e
    o canal, e o toque no nome abre o cartão do contato (e-mail, telefone, canais, aceite);
  - o casamento é feito na leitura, então editar o contato atualiza as mensagens antigas; o endereço
    ou número **como chegou** fica gravado e aparece no cartão (histórico imutável);
  - no e-mail, remetente fora dos contatos aparece com o nome do cabeçalho `From` e o endereço,
    marcado "Fora dos contatos", com a ação "Adicionar aos contatos" já preenchida (nome, e-mail).
    O contato nunca é criado sozinho;
  - no WhatsApp o remetente sempre é contato (D6); se o nome do perfil do WhatsApp for diferente do
    cadastrado, o cartão mostra os dois;
  - o cabeçalho da aba Contratante lista quem já participou da conversa.

- **RF17** Áudio: recebido do WhatsApp (mensagem de voz ou arquivo de áudio) e do app do motorista;
  enviado pelo WhatsApp (pelo método de mídia do provider, ADR-0072) e pelo app. O navegador grava
  com `MediaRecorder`; o formato que cada navegador grava nem sempre é um que o WhatsApp aceita, então
  o worker converte quando precisar, e a lista de formatos aceitos se confere na versão da API em uso
  (T705) — não se presume. A duração máxima e o tamanho são conferidos antes de subir. No e-mail, áudio
  só vai como anexo comum.
- **RF18** Transcrição: o worker transcreve o áudio recebido **depois** de gravá-lo, por uma porta de
  aplicação (`speech-to-text.port.ts`) com um provedor ainda a decidir. O texto fica ligado ao anexo,
  com o provedor, o idioma e o horário, e **nunca** passa pela política de decisão (D4) nem pela de
  interpretação da 143. Falha de transcrição não falha a mensagem: o player aparece sem o texto.
  Uma empresa pode desligar a transcrição. O `meta-whatsapp-module` já tem a porta
  (`AudioTranscriber`, modos `auto`/`onDemand`, política por empresa) e a UI já mostra o texto
  (`AudioTranscription`); falta só o motor, que é a dúvida em aberto.
- **RF19** A linha do tempo da ocorrência junta os eventos da ocorrência, os **da tratativa**
  (`trip_occurrence_case_events`, spec 164) e os das duas conversas em ordem, cada um com o ator (motorista, operação, contratante, sistema) em cor própria, as mesmas dos
  balões. Mostra o intervalo desde o evento anterior e marca os eventos-chave (registro, decisão).
  No topo ficam três tempos: há quanto tempo a ocorrência está aberta, quanto a contratante levou
  para responder e quanto o motorista levou para ser liberado. Filtros: Tudo, Contratante e
  Motorista.

- **RF20** Expiração da janela do WhatsApp, por conversa:
  - **fechando** é a última hora da janela: a caixa de envio mostra "a janela fecha em N min (HH:MM)"
    e para onde a conversa vai depois, com as ações "Avisar agora" e "Mudar agora";
  - **aviso automático:** 30 minutos antes de fechar (antecedência configurável por empresa), o
    sistema manda pelo WhatsApp, ainda dentro da janela, um texto fixo dizendo que a conversa
    continua pelo app (motorista) ou pelo portal/e-mail (contratante). Sai **uma vez por janela** (chave
    idempotente: conversa + início da janela), só se houve mensagem pelo WhatsApp naquela janela, e é
    cancelado se a pessoa responder antes (a janela reabre). Ligado por padrão para o motorista e
    desligado por padrão para a contratante; a empresa muda os dois;
  - **fechou:** o canal padrão da conversa passa para o app (motorista) ou, na contratante, para o
    **portal** se ela tiver usuário ativo no portal e a ocorrência estiver visível lá (D9), senão
    para o **e-mail** do contato, e sem e-mail
    só modelo aprovado. O aviso automático diz o canal escolhido. Entra um evento de sistema na conversa
    e na linha do tempo; o rascunho não se perde;
  - o motorista sem PWA instalado continua recebendo pela inbox (RF11); a troca nunca deixa a
    mensagem sem destino.

- **RF21** Portal (D9): a resposta de `GET /client/me/occurrences` (que já existe, spec 164) ganha a
  `conversationRef` de cada ocorrência; rotas novas `/client/me/occurrence-conversations/:ref`
  (mensagens, envio, lida, anexo), com o recorte de `resolveContractorScope` e a mesma regra de
  visibilidade da 164 D5. `ref` é opaco e aleatório, nunca o id da conversa. Referência de outra
  contratante, inexistente ou de ocorrência ainda não visível no portal respondem igual. A decisão
  continua na rota da 164; nada nestas rotas decide. Mensagem enviada pelo operador no canal Portal avisa os
  usuários do portal daquela contratante por e-mail (`notification-module`), **sem** o corpo — só
  que há mensagem nova e o link.

## Requisitos não funcionais

- Nenhum log leva e-mail, telefone, corpo, assunto, nome de arquivo ou segredo — só ids, canal e
  resultado (143 RNF; 062 D5).
- A listagem continua em uma consulta por página (keyset de 25) com os campos novos.
- O webhook do WhatsApp continua respondendo sem esperar o worker (assinatura, nonce, outbox).
- As peças da conversa vêm do `@adatechnology/conversations-ui` (ADR-0051, ADR-0072); as abas, o selo
  de canal por mensagem e o seletor de canal são do produto; o estilo é todo nosso, pelos
  `className`/`classNames` das peças e por `*.module.css` sobre `.cv-*`, **sem Tailwind**. O resto da
  página usa `src/components/ui/`.
- PWA: as telas novas funcionam de 360 px de largura para cima, com alvos de toque de pelo menos
  `--touch-target`.
- Os balões se distinguem **pela cor e pela posição**, não só pela posição: operação (enviada, à
  direita) em cobre; contratante (recebida) em azul; motorista (recebida) em verde; evento de sistema
  sem balão, tracejado e centralizado. As cores entram como tokens novos em `src/styles/index.css`
  (`--color-bubble-out`, `--color-bubble-contractor`, `--color-bubble-driver`, com versão para o tema
  claro) e chegam às peças pelos `classNames` delas — o `theme` do pacote é só tipo e nada o aplica
  (conferido na T101). A
  enviada difere das recebidas também em luminosidade, e todo texto dentro do balão fica em 4,5:1 ou
  mais.

## Revisão total de design e usabilidade

A spec só fecha depois de uma **revisão completa de cada página** que ela cria ou muda, feita com as
telas rodando (não com o protótipo), e com os achados bloqueantes corrigidos. Páginas:

| Superfície | Páginas                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Painel     | `/ocorrencias` (lista), `/ocorrencias/:id` (resumo, contato do motorista, fotos, linha do tempo, abas Contratante e Motorista), diálogo "Enviar à contratante" com prévia, contatos da contratante, respostas rápidas em Configurações, fila de não atribuídas |
| PWA        | conversa da ocorrência no app do motorista; lista e detalhe do painel em viewport de celular                                                                                                                                                                   |
| Portal     | "Ocorrências" e a conversa da ocorrência                                                                                                                                                                                                                       |

O que se revisa em cada página:

- **Design:** conformidade com os guias `docs/frontend/` (`layout`, `panels`, `buttons`, `fields`,
  `selects`, `icons`, `tooltips`, `loading`, `mutations`, `responsive`, `data-tables`); só tokens e
  componentes de `src/components/ui/` no painel (nenhuma UI paralela sem ADR); balões, selos de canal
  e de status e linha do tempo com a mesma cor por participante nas três superfícies; comparação com
  a prévia aprovada, e toda diferença justificada ou corrigida.
- **Usabilidade:** a tarefa principal de cada página feita do começo ao fim sem ajuda (abrir a
  ocorrência a partir da lista, responder à contratante, trocar de canal, chegar à tratativa e
  decidir por ela, falar com o motorista, cadastrar um contato); estado vazio, carregando (esqueleto), erro e sucesso em toda
  lista e todo envio; texto longo, nome longo, muitas mensagens e muitos anexos sem quebrar o layout;
  nenhuma ação destrutiva sem confirmação; mensagens de erro que dizem o que fazer.
- **Acessibilidade:** tudo operável por teclado, com foco visível e ordem lógica; nome acessível em
  todo botão só de ícone; player de áudio, selos de status e novas mensagens anunciados a leitor de
  tela (região `aria-live` na conversa); contraste de 4,5:1 no texto, inclusive dentro dos balões;
  alvos de toque de pelo menos `--touch-target`.
- **Responsivo e tema:** 360, 768 e 1280 px; tema escuro e claro no painel e no PWA; o portal no tema
  que ele tem.
- **Idioma:** todo texto vem dos `*.locale.json` (pt-BR e en), sem texto fixo no componente.

**Evidência:** no `evidence.md`, a matriz de capturas (página × largura × tema), a checklist acima
marcada por página e a lista de achados com gravidade (bloqueante, importante, menor) e o destino
de cada um (corrigido no commit X ou aceito com motivo). Achado bloqueante aberto impede fechar a
spec.

## Casos extremos e falhas

- **Ocorrência de parada sem nota:** sem contratante, a aba Contratante mostra o motivo e não oferece
  envio (mesma regra da 143). A aba Motorista funciona.
- **Contratante sem contato do tipo Ocorrências:** o diálogo explica e leva à aba Contatos.
- **Contato perde o aceite de WhatsApp:** envios por WhatsApp a ele param na hora; o histórico fica.
  Mensagem que chegar depois dele é recusada como número desconhecido.
- **Janela de 24h fecha com a mensagem escrita:** o envio devolve `window_closed`, a tela oferece o
  canal seguinte (RF20) ou o modelo, e o rascunho fica.
- **A pessoa responde depois do aviso automático:** a janela reabre, o canal volta a ser WhatsApp, e
  o próximo aviso só sai no fim da nova janela.
- **Modelo não aprovado ou recusado pela Meta:** o envio falha como `template_rejected`, a mensagem
  fica `failed` na conversa com o motivo.
- **Mesmo telefone em contatos de duas contratantes da mesma empresa:** a atribuição por `context.id`
  resolve; sem ela, vai para "não atribuída" (RF9).
- **Motorista trocado na viagem:** a conversa com o motorista é com o motorista **da ocorrência**
  (quem registrou ou o da viagem no momento), e a troca não move a conversa.
- **Viagem sem motorista:** a listagem já aceita (`driverName` vazio); a aba Motorista e o contato
  não aparecem, e a linha do tempo não cita motorista.
- **Ocorrência registrada pelo escritório em nome do motorista (156):** a autoria mostra os dois; a
  conversa é com o motorista.
- **A contratante escreve algo que parece decisão ("aprovo") por qualquer canal:** vira mensagem; a
  tratativa não muda. O operador vê a mensagem ao lado do painel da tratativa e decide por ele.
- **Anexo acima do limite do canal:** recusado antes de subir, com o limite na mensagem.

## Critérios de aceite

- Contrato de tenant: detalhe, conversas, mensagens, anexos, contatos e respostas rápidas são
  filtrados por `companyId`; id de outra empresa responde 404; telefone de contato de outra empresa
  não atribui nada.
- Contrato de permissão: sem `fleet.read` o detalhe responde 403 (e o motorista e o agregado, que só
  têm `trip.read`, não alcançam); sem `trip.manage` não há envio; o separador não alcança as rotas
  de envio (`test/separator-role.contract.test.ts`).
- Política da janela de 24h com teste por tabela (aberta, fechando, fechada, sem mensagem recebida).
- Política de expiração (RF20) com teste por tabela: aviso sai uma vez por janela; não sai sem
  mensagem de WhatsApp na janela; resposta antes do aviso cancela; depois de fechar, o canal padrão é
  app (motorista), e-mail (contratante com e-mail) ou modelo (contratante sem e-mail).
- Integração: o aviso agendado sai uma vez só mesmo com o job rodando duas vezes.
- Política de atribuição do webhook (RF9) com teste para cada ramo, incluindo o do motorista: sem
  `context.id` de mensagem da conversa, a mensagem segue para os fluxos da spec 144.
- A conversa não decide (D4): teste de que mensagem de cada canal — inclusive botão de WhatsApp,
  resposta de e-mail com "APROVADO" e transcrição — não muda a tratativa, a taxa nem o acerto.
- Política de identificação do remetente (RF16) com teste por tabela: e-mail com caixa diferente
  casa; contato de **outra** contratante da mesma empresa não casa; contato inativo casa e aparece
  como inativo; fora dos contatos devolve o nome do `From` e a sugestão de cadastro.
- Política de status (RF14) com teste por tabela: só avança, evento repetido não muda nada,
  `delivered` depois de `read` não regride, e-mail nunca chega a `read`.
- Integração: um webhook de status da Meta leva a mensagem de `sent` a `read`, e o mesmo webhook
  repetido não cria outra transição.
- Contrato de listagem: os campos novos vêm numa consulta, com o valor como string decimal.
- Contrato por texto de fonte: nenhum log em `occurrence-conversation/**` recebe telefone, e-mail,
  corpo ou nome de arquivo.
- Política de transcrição: texto transcrito passado à política de decisão não decide nada (teste
  explícito), e falha do provedor deixa a mensagem `received` com o áudio.
- Smoke Playwright: clicar na linha abre o detalhe; enviar pela aba Contratante mostra a mensagem na
  conversa; a mesma página em viewport de celular mostra as abas.
- Tabela: evidência exigida por `docs/frontend/data-tables.md` § 6 para as colunas novas.
- Revisão total de design e usabilidade (§ acima) feita, com evidência, e sem achado bloqueante
  aberto.
- Portal: contrato por texto de fonte de que nenhuma rota `/client/**` nova aceita id interno e de que
  o recorte só vem de `resolveContractorScope`; contrato de resposta sem nenhum campo do motorista;
  referência de outra contratante e de ocorrência ainda não visível (164 D5) respondem igual a
  inexistente.

## Dúvidas

Resolvidas em 2026-09-24 pelo dono do projeto: respostas rápidas são **cadastradas por empresa**
(RF12), e os **cinco tipos** de contato do RF5 são os da operação.

- [NEEDS CLARIFICATION: qual provedor transcreve o áudio (RF18), e se a voz de contratante e de
  motorista pode sair para ele (LGPD: base legal, retenção no provedor, região)? Decidido, vira
  ADR. Enquanto isso, o áudio funciona sem transcrição.]

Resolvidas em 2026-09-24 (segunda rodada), depois da auditoria contra staging: (1) todas as
correções de divergência de `evidence.md` entram — a conversa não decide, o detalhe hospeda a
tratativa da 164, a permissão é `fleet.read`, e a aba Motorista trata "sem motorista"; (2) o portal
mostra a conversa só das ocorrências que a 164 D5 já mostra; (3) o SDK é genérico e todo estilo
customizável fica do nosso lado (D3); (4) ADR-0072 e ADR-0073 aceitas.

A dúvida que resta bloqueia **só a T706** (transcrição), que já nasce marcada como bloqueada; o
restante da spec pode andar depois da T001.
