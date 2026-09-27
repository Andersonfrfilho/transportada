# ADR-0085 — O núcleo de conversa é um pacote próprio, e o assunto da conversa é do produto

- **Status:** proposto (2026-09-26)
- **Data:** 2026-09-26
- **Contexto:** spec 211. Cumpre a condição que a **ADR-0072** deixou escrita ("se um núcleo de
  conversa comum aos canais se provar necessário, ele nasce como pacote próprio, com ADR própria") e
  **revê duas decisões dela** — ver § "O que esta ADR muda na ADR-0072". Depende da ADR-0051 (a tela
  vem do pacote, o Tailwind não) e da ADR-0073 (o portal conversa).

## Contexto

A spec 183 entregou a conversa da ocorrência com quatro canais — `email`, `whatsapp`, `app`,
`portal` — e, para isso, escreveu **dentro do TransportAdA** um núcleo de conversa inteiro:
conversa, mensagem com canal e direção, anexo com `sha256`, máquina de status de entrega que só
avança, leitura por usuário, fila de não atribuídas, respostas rápidas e a janela de 24 horas do
WhatsApp.

A ADR-0072 decidiu isso de propósito, e a decisão estava certa para o que se sabia então: o pacote
publicado não trazia essas peças, e a 183 não podia parar para construí-las. O que ela não previu é
quanto do que foi escrito **não tem nada de TMS dentro**.

Medido na entrega da 183:

| Peça escrita na 183                                              | Tem conceito de transportadora dentro? |
| ---------------------------------------------------------------- | -------------------------------------- |
| máquina de status (`queued → sent → delivered → read`, `failed`) | não                                    |
| capacidade por canal (quem sabe dizer "lida", quem tem janela)   | não                                    |
| anexo com `sha256`, tipo conferido pelo conteúdo, teto por canal | não                                    |
| leitura por usuário                                              | não                                    |
| respostas rápidas por público                                    | não                                    |
| fila de mensagem recebida sem conversa certa                     | não                                    |
| threading do e-mail (token derivado, `In-Reply-To`, MIME, DKIM)  | não                                    |
| **quem é a contratante, o motorista, a ocorrência**              | **sim**                                |
| **a permissão, o `companyId`, o recorte do portal**              | **sim**                                |

A última linha e a penúltima são o TMS. Todo o resto é conversa, e já existe **em triplicata** no
ecossistema: o `meta-whatsapp-module` tem a sua (no schema `meta_whatsapp`), o `contractor-mail` da
spec 143 tem a sua (`contractor_mail_threads`), e a 183 fez a terceira (`occurrence_conversations`).
Três fontes de verdade para "uma conversa com mensagens que têm status".

E há segundo consumidor, que é o teste que a ADR-0065 exige antes de criar pacote: o `quickcart`
já usa `meta-whatsapp-{contracts,module,provider}`, `conversations-ui` e `email-provider`; o
`financiamento-imobiliario-bot` é o terceiro. O que falta a eles é exatamente o que a 183 escreveu:
uma conversa que não seja só do WhatsApp.

## Decisão

### 1. Nasce o núcleo, como pacote próprio

Um **pacote novo** no `adatechnology-packages`, no padrão "trio" do repositório:

- `@adatechnology/conversation-contracts` — só tipos, zod e portas. Zero runtime, única dependência
  `zod`, como o `notification-contracts`.
- `@adatechnology/conversation-module` — stateful: schema, migrations, repositórios e casos de uso
  atrás de portas, injetados por `createConversationModule({ config, features, providers })`.

**O núcleo é dono da conversa**: conversa, mensagem, anexo, status de entrega, leitura, respostas
rápidas e a fila de não atribuídas saem do TransportAdA e passam a morar nele.

### 2. O assunto da conversa é do produto, e chega como par opaco

⚠️ **Esta é a decisão que faz o resto funcionar.** O núcleo **nunca aprende o que é uma
ocorrência**. O que a conversa é _sobre_ chega como um par genérico:

```
subject_type  text    -- rótulo do produto: 'occurrence', 'order', 'ticket', …
subject_id    text    -- id no produto, opaco para o núcleo
```

- com par preenchido, a conversa é **por assunto** — uma por ocorrência, que é o caso do
  TransportAdA;
- com par nulo, a conversa é **por pessoa** — o caso simples, que o `quickcart` já tem hoje.

Não é invenção: é a forma que a spec 143 já usa em `contractor_mail_threads`
(`subject_type` + `subject_id`, com `unique(company_id, subject_type, subject_id)`). O núcleo
**não valida** `subject_type` contra lista fechada nenhuma, e **não tem FK** para tabela de produto.
Quem sabe que `'occurrence'` existe é o TransportAdA.

Com isso, a objeção da ADR-0072 ("os outros produtos herdariam conceitos que não têm") deixa de
valer: o que vai para o pacote é _conversa sobre um assunto_, não _conversa sobre ocorrência_.

### 3. Participante é genérico; quem ele é, é do produto

A conversa tem participantes, e cada participante tem um **identificador por canal** (endereço de
e-mail, telefone, id de usuário). O núcleo guarda o par `(canal, identificador)` e nada mais.

**Fica no produto**: que aquele participante é _a contratante emitente da nota_ (143 RF3) ou _o
motorista da viagem_, os tipos de contato, o aceite de WhatsApp, o telefone verificado (ADR-0063),
as permissões, o `companyId` e a LGPD.

### 4. Capacidade por canal manda na tela

Cada canal declara o que sabe fazer: confirma leitura? tem janela de atendimento? aceita anexo, e de
que tamanho? aceita áudio? O núcleo publica essa tabela, e a tela **obedece a ela**:

- recurso que o canal não tem aparece **desabilitado, com dica dizendo por quê** — nunca sem
  explicação;
- recurso que só existe num canal **some** quando outro canal está escolhido.

Decisão do dono do projeto (2026-09-26). É a continuação da ADR-0051 §4 ("capacidade opcional por
ausência de prop, nunca por flag `hasX`"): aqui a ausência é declarada pelo canal, não pelo host.

O `read` do e-mail é o primeiro caso: e-mail não sabe dizer "lida" (183 D7 — o único jeito seria
pixel de rastreio, que é impreciso e rastreia a contratante sem ela saber), então o selo de lida não
aparece nesse canal, e a tela não finge.

### 5. O canal e-mail exige o próprio transporte

Decisão do dono do projeto (2026-09-26): **o SDK exige o transporte se o canal for usado.**

Usar o canal `email` do núcleo obriga a fornecer uma implementação de `ConversationEmailTransportPort`,
com o que a spec 143 provou ser necessário para uma conversa por e-mail funcionar:

- endereço de resposta com token **derivado** (HMAC), nunca sorteado — é o que faz a resposta voltar
  para a conversa certa (143 RF2);
- `In-Reply-To` e `References` da última mensagem recebida (143 RF7);
- MIME bruto gravado com `sha256` **antes de qualquer interpretação** (143 RF4);
- resultado de DKIM na mensagem (`aligned | not_aligned | unverifiable | absent`), porque o provedor
  não o entrega pronto (143, ADR-0063 §3).

Sem porta fornecida, o canal `email` **não liga** — e o erro diz qual peça falta. Um canal que
aceita mensagem mas perde a resposta é pior que um canal desligado.

⚠️ **Isto não é o envio de e-mail do produto.** `@adatechnology/email-provider` e o
`notification-module` continuam como estão, e o TransportAdA segue mandando e-mail por eles em todo
lugar que não é conversa (avisos, faturas, relatórios). A porta acima é só para o e-mail **que
espera resposta**.

### 6. O que o núcleo não faz

- **Não decide nada.** Continua valendo a 183 D4: nenhuma mensagem, de canal nenhum, muda estado de
  negócio. O núcleo não tem conceito de aprovação, taxa nem tratativa.
- **Não interpreta texto livre**, com ou sem IA (spec 062 D4).
- **Não cria FK para o schema do `meta_whatsapp`** nem para tabela de produto nenhuma. O id da
  mensagem do provedor continua referência **opaca**, como já é hoje (ADR-0072).
- **Não carrega estilo.** Segue a ADR-0051 e a revisão da ADR-0072: o SDK é genérico e todo estilo
  customizável fica do lado do produto.

## O que esta ADR muda na ADR-0072

A ADR-0072 continua valendo inteira, **menos** dois pontos, que esta revê por decisão do dono do
projeto (2026-09-26):

| ADR-0072 dizia                                                                                | Passa a valer                                                                                                                           |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| "a conversa por (ocorrência, participante) e as mensagens com canal — **tabelas do produto**" | As tabelas são do **núcleo**. O produto guarda o que é dele: quem é a contratante, o motorista, a permissão, a ligação com a ocorrência |
| "**o e-mail da 143 não muda de lugar**"                                                       | O **transporte** vira porta do núcleo (§5). O envio de e-mail que não espera resposta não muda de lugar nenhum                          |

O que ela decidiu e **não muda**: a atribuição concreta, quem é a contratante e o motorista, a regra
da taxa, as permissões, o `companyId`, a LGPD, o estilo no produto, o envio por WhatsApp pelo
`SendMessageUseCase` do módulo, e a referência opaca ao id da Meta.

Sobre a **atribuição** (183 RF9), a divisão fica assim, e é a mesma régua de sempre — o genérico é
do pacote, o que sabe o que é uma viagem é do produto:

- **no núcleo**: atribuir pela referência de resposta; na falta dela, à conversa aberta mais recente
  daquele identificador; com mais de uma candidata, **fila de não atribuídas**. "Nunca se atribui
  por palpite" vira regra do pacote;
- **no produto**: o ramo do motorista (mensagem que não responde a nada segue para os fluxos de
  comando da spec 144) e qualquer outra regra que dependa de saber o que é uma viagem.

## Consequências

- **É mudança em dois repositórios com um `changeset` no meio**, e a publicação é **parada que exige
  o usuário** (precedente da ADR-0054 e da ADR-0065). A fase que depende do pacote não fecha antes de
  a versão estar publicada e instalada.
- **A 183 migra.** As tabelas `occurrence_conversation*` passam a ser as do núcleo, com
  `subject_type = 'occurrence'`. É migração de dados de uma entrega recém-feita, e por isso a spec 211
  a trata em fase própria, aditiva, com o produto lendo pelas duas formas até virar.
- **Passam a existir duas conversas no banco, não três.** O `meta_whatsapp` continua com a sua (é do
  módulo da Meta, e o núcleo referencia o id dela opacamente); a do `contractor-mail` vira transporte
  do canal `email`; a da 183 vira a do núcleo.
- **A API do núcleo vira contrato**, como os `.cv-*` da ADR-0051: nome de canal, nome de status e
  nome de capacidade não se renomeiam sem quebrar host.
- **O `conversations-ui` ganha o canal `email`** no vocabulário dele (hoje é
  `whatsapp|messenger|instagram|webchat`) e a tabela de capacidades passa a alimentar a tela (§4).
- Risco assumido: o núcleo nasce com **um** consumidor de verdade (TransportAdA) e dois candidatos
  (`quickcart`, `financiamento-imobiliario-bot`). Se o segundo consumidor não vier, o pacote é custo
  de publicação sem ganho de reuso. Mitigação: o núcleo sai do código **já escrito e exercitado** pela
  183, não de projeto especulativo.

## Alternativas descartadas

**Deixar como está, no produto.** É o que a ADR-0072 decidiu, e o que o `AGENTS.md` proíbe para
biblioteca reutilizável ("não crie bibliotecas reutilizáveis neste repositório"). Hoje o custo já
apareceu: três implementações de conversa no ecossistema, e o `quickcart` sem como conversar por
e-mail.

**Pôr a ocorrência no pacote.** Resolveria a spec 211 em menos tempo e é exatamente o que a ADR-0072
recusou: os outros produtos herdariam `occurrence_kind`, `contractor` e `driver`, conceitos que eles
não têm. O par `subject_type`/`subject_id` (§2) dá o mesmo resultado sem o vocabulário.

**Só contratos, sem módulo.** Levaria o vocabulário e a máquina de status, e deixaria cada produto
reescrevendo tabela, repositório e caso de uso — que é a duplicação que motivou esta ADR. Foi a
opção recomendada na consulta ao dono do projeto, e ele escolheu o módulo inteiro: "tudo deve ficar
no módulo sdk conversation".

**Misturar no `meta-whatsapp-module`.** Já recusado pela ADR-0072, pelo mesmo motivo de sempre: o
módulo é da Meta por nome e por contrato, e um pacote que muda por dois motivos não tem dono claro.

**Mover também o envio de e-mail do `notification-module`.** O núcleo passaria a ser responsável por
e-mail que não é conversa (fatura, relatório, aviso), e cresceria para fora do assunto. O §5 separa:
o núcleo exige o transporte **da conversa**; o resto do e-mail segue onde está.
