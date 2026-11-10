# Feature 316 — O vendedor da contratante e o chat com ele

> Pedido do dono (Anderson), 2026-11-10, na conversa dos tipos de ocorrência a validar em staging.
> Status: **rascunho aguardando resposta às dúvidas** (seção "Dúvidas"). Nada aqui está implementado.
> Lida contra `origin/staging` em 2026-11-10.

## Specs do mesmo assunto (lidas)

| Spec            | O que já decidiu e esta spec **usa sem refazer**                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 150, 195, 113   | "Endereço incorreto": correção de endereço, e-mail que pede à contratante que atualize o cadastro. **Esta spec muda só o destinatário** (D5).       |
| 183, 211        | A ocorrência tem conversas por participante; o núcleo multicanal (mensagem com canal, anexo, status, leitura, não atribuídas).                      |
| 270             | Tipo com escopo de contratantes (`all` / `listed`). A regra de roteamento por tipo (D5) segue o mesmo desenho: dado no tipo, nunca nome de tipo.    |
| 274, 287        | O composer envia por e-mail (modelo padrão `notification.standard-email`) e escolhe o canal; catálogo de canais por participante é **dado** (RF6b). |
| 281, 283        | WhatsApp pelo Evolution e o terceiro participante `client` na tela da ocorrência: é o molde da coluna "Vendedor".                                   |
| 308             | O chat direto: o bot reconhece o telefone e trata o 1:1 como "grupo de um só". O vendedor é mais um número reconhecido (D2.3 da 308).               |
| ADR-0050 / 0073 | A contratante é usuário (mesmo Keycloak, papel `contractor`, vínculo em `contractor_portal_bindings`) e usa app separada, `frontend-client`.        |

## Problema e resultado

Hoje o aviso de "Endereço incorreto" vai à **contratante** (e-mail pedindo que atualize o endereço). Quem de fato conhece o
cliente final e consegue corrigir o cadastro é o **vendedor** da contratante, que a transportadora não conhece nem tem como
chamar: o escritório vai ao telefone pessoal. O sistema também não sabe que um mesmo vendedor atende mais de uma
contratante, nem quais clientes são dele.

**Resultado:**

1. A transportadora **cadastra vendedores** de cada contratante. Um vendedor pode estar ligado a **mais de uma
   contratante** e, em cada uma, atende **vários clientes** (clientes de entrega, `delivery_clients`).
2. O vendedor tem **uma área própria** (login, lista de ocorrências dos clientes dele, chat).
3. Cada ocorrência cujo tipo é "roteado ao vendedor" (a começar por **Endereço incorreto**) abre uma **conversa com o
   vendedor do cliente**, por **WhatsApp e e-mail**, no molde do chat da contratante/cliente (183/274/283/287). O aviso
   **não vai mais à contratante** nesse tipo.
4. Cliente sem vendedor cadastrado cai num destino definido (D6), nunca num buraco silencioso.

## Fora do escopo

- **Espera longa** (liberação manual pelo escritório, bloqueio e contador no app/WhatsApp) e **Cobrança no recebimento**
  (foto da placa e do comprovante → página de cobranças extras/acertos): são outras duas decisões da mesma conversa e ganham
  spec própria. Esta spec não toca nelas.
- Comissão, carteira de vendas, pedido, qualquer coisa comercial do vendedor além de receber e responder avisos.
- Canais novos além de WhatsApp e e-mail (o app do vendedor entra pelo catálogo de canais, RF6b da 287, mas o canal "app"
  é a Fase 3, depois de aprovada a D4).

## Decisões de desenho (propostas — o Anderson confirma nas dúvidas)

**D1 — Vendedor é entidade própria, não contato.** Tabela `contractor_salespeople` (pessoa: nome, e-mail, WhatsApp E.164,
status) por empresa; **ligação N:N com contratantes** (`contractor_salesperson_links`: vendedor × contratante) e
**carteira** por ligação (`contractor_salesperson_clients`: ligação × cliente de entrega, `tax_id`). Um cliente tem **no
máximo um vendedor titular por contratante** (índice único), com a possibilidade de um **substituto** (Dúvida 3). Não
reaproveitar `contractor_contacts` (150): contato é endereço de e-mail por finalidade, sem pessoa, sem carteira, sem login.

**D2 — A área do vendedor mora em `frontend-client`.** Mesmo Keycloak e convite (ADR-0050), papel novo `salesperson`
(distinto de `contractor`, nunca herda), vínculo por membership. App nova só se a Dúvida 1 pedir. O vendedor **só enxerga**
ocorrências de clientes da carteira dele, das contratantes a que está ligado (guarda no servidor, contrato negativo: vendedor
A não lê cliente do vendedor B; vendedor da contratante X não lê a Y).

**D3 — O chat é a conversa `salesperson` da ocorrência.** Quarto participante ao lado de `contractor`, `driver`, `client` e
`operator` (183/283): cor, ícone e nome próprios (nunca só a cor). Uma conversa por ocorrência e vendedor. Canais pelo
catálogo de canais por participante (287 RF6b): **WhatsApp e e-mail**, no seletor "Enviar por". E-mail sai pelo modelo
padrão (274); WhatsApp pelo Evolution (281), com a resposta entrando na conversa por citação ou, sem citação, na conversa
mais recente do número (regra D5 da 283). Número do vendedor cadastrado é **reconhecido** pelo bot (D2.3 da 308 ganha o item
"vendedor") e **só** pode conversar sobre a ocorrência, nunca receber o menu do motorista.

**D4 — Roteamento é coluna do tipo.** O tipo de ocorrência ganha `notify_salesperson` (boolean; `false` = hoje). Com `true`,
o aviso e a conversa abrem com o vendedor do cliente da nota (carteira da contratante da nota). Em "Endereço incorreto" fica
`true` e o e-mail à contratante (150) **deixa de sair**. Nada de regra por nome de tipo (convenção 270/246).

**D5 — O texto do aviso é o modelo de e-mail do módulo de notificação (272), com a chave própria** (`salesperson_mail_template_key`
no tipo, sem FK, como a 269). Sem modelo utilizável, não sai e-mail (mesma regra da 271).

**D6 — Cliente sem vendedor.** Nunca silencia: a ocorrência fica **"sem vendedor"** no painel, com chip e ação "Escolher
vendedor" (grava a carteira e abre a conversa); se a Dúvida 4 for "cai na contratante", o aviso volta ao caminho antigo.

## Histórias priorizadas

### P1 — Cadastrar vendedor e carteira

**Given** a contratante X e dois clientes dela **When** o escritório cadastra a vendedora Ana (e-mail e WhatsApp), liga a X e
marca os dois clientes **Then** a Ana aparece em X com 2 clientes; ligar a Ana também à contratante Y, com outros clientes, não
altera a carteira em X.

### P1 — Endereço incorreto vai ao vendedor

**Given** uma ocorrência "Endereço incorreto" numa nota de cliente da carteira da Ana **When** o motorista registra **Then** a
Ana recebe o aviso por WhatsApp e e-mail com cliente, endereço informado e observação do motorista, a conversa abre no painel
com o canal de cada entrega, e **nenhum** e-mail sai à contratante.

### P1 — O vendedor responde

**Given** o aviso enviado **When** a Ana responde no WhatsApp (citando ou não) ou no e-mail **Then** a resposta entra na
conversa do vendedor da ocorrência, o escritório vê no painel, e o bot **não** abre o menu do motorista para ela.

### P1 — Área do vendedor

**Given** a Ana autenticada **When** abre a área **Then** vê só as ocorrências dos clientes da carteira dela (das duas
contratantes), filtra por contratante, abre o chat e responde; não vê nada de outro vendedor nem de cliente fora da carteira.

### P2 — O escritório conversa no lugar

**Given** a conversa "Vendedor" aberta **When** o operador envia pelo painel **Then** sai pelo canal escolhido e o balão
mostra o canal e o estado (fila, enviado, entregue, lido, respondeu, falhou), como nas demais abas.

### P2 — Cliente sem vendedor

**Given** ocorrência de cliente sem vendedor **When** é registrada **Then** aparece "sem vendedor" com a ação de escolher
(D6), e nada sai até alguém escolher (ou o comportamento da Dúvida 4).

### P3 — Vendedor sai da carteira

**Given** a Ana inativada **When** nova ocorrência de cliente dela é registrada **Then** segue o substituto (Dúvida 3) ou
"sem vendedor"; conversas antigas continuam legíveis.

## Requisitos funcionais

- **RF1** Cadastro de vendedor por empresa (nome, e-mail, WhatsApp, status), com busca; e-mail e telefone únicos por empresa
  (telefone na forma canônica `toWhatsAppPhoneKey`).
- **RF2** Ligação vendedor × contratante (N:N) e carteira por ligação (cliente de entrega por `tax_id`); no máximo um titular
  por (contratante, cliente). Mudar a carteira não reescreve ocorrência já aberta.
- **RF3** Tela do escritório "Vendedores" (design system padrão: rótulo em cima, campo/seletor na altura padrão, botões
  padrão; nenhum input ou botão com estilo próprio). Seletor de contratantes e de clientes com busca por nome e CNPJ.
- **RF4** Convite de acesso do vendedor (mesmo fluxo da contratante, ADR-0050), papel `salesperson` com permissões próprias
  (`salesperson.read`, `salesperson.reply`), nunca `trip.*` nem `occurrences.resolve`.
- **RF5** Coluna `notify_salesperson` e `salesperson_mail_template_key` no tipo de ocorrência; editor da aba Tipos com
  o campo; `PUT` segue `.strict()` e **campo ausente não altera** (242 RF2).
- **RF6** Registro de ocorrência de tipo roteado resolve o vendedor **no servidor** (contratante e cliente da nota), nunca do
  payload, e abre a conversa `salesperson`; falta de vendedor é D6.
- **RF7** Conversa `salesperson` na tela da ocorrência (aba/coluna), seletor "Enviar por" com WhatsApp e e-mail, selo de
  estado por entrega, canal em todo balão.
- **RF8** O bot reconhece o telefone do vendedor (308 D2) e só encaminha à conversa; nunca menu do motorista nem XML.
- **RF9** Área do vendedor em `frontend-client`: lista das ocorrências da carteira, filtro por contratante e por estado, chat,
  anexos nos dois sentidos, PWA/celular.
- **RF10** "Endereço incorreto" deixa de enviar à contratante quando o tipo está roteado ao vendedor (150/195 intactos nos
  demais casos).
- **RF11** Auditoria: quem cadastrou, ligou, tirou da carteira e quando; histórico por cliente de quem foi o vendedor.

## Requisitos não funcionais

- `companyId` do contexto autenticado; ligação cruzando empresas é impossível por FK composta (padrão `contractor_portal_bindings`).
- Dados do vendedor (e-mail, telefone) mascarados em resposta de lista, log e evento; claro só no corpo do cadastro.
- Idempotência de envio pela chave da mensagem, como a 274/287. Limite por número no balde do Evolution.
- Migration aditiva (colunas com padrão `false`, tabelas novas), com rollback; nenhuma migration destrutiva automática.
- Publicar em etapas (ADR-0081 §9): painel tolerante → API → telas. Entrega por PR em **staging**; `main` só com pedido.
- Telas validadas em tema claro e escuro, desktop e celular, comparadas com outra tela do painel antes do PR.

## Casos extremos e falhas

- Vendedor com WhatsApp inválido ou sem e-mail: cadastro exige ao menos um canal; o envio usa só o que existe e mostra falha por canal.
- Dois vendedores reivindicando o mesmo cliente na mesma contratante: bloqueado por índice único (409 com o nome do outro).
- Mesmo telefone como motorista e como vendedor: o bot segue D2.3 da 308 (motorista primeiro); aviso no cadastro.
- Cliente que muda de vendedor com ocorrência aberta: a aberta fica com o vendedor original; a nova segue a carteira.
- Resposta de número desconhecido: continua em "não atribuídas" (281).
- Contratante inativada: ligações ficam, aviso vai ao fluxo antigo (D6).

## Critérios de aceite

Contratos primeiro (vendedor A não lê cliente do B; vendedor da contratante X não lê Y; roteamento só com `notify_salesperson`;
carteira única por cliente; sem vendedor não silencia; "Endereço incorreto" não envia à contratante). Integração com
Postgres do roteamento e do webhook do WhatsApp. Prova em staging com número e e-mail do Anderson como vendedor de teste,
roteiro em `roteiro-teste-staging.md`. Prints claro/escuro, desktop/celular das telas novas.

## Dúvidas

1. [NEEDS CLARIFICATION: A área do vendedor é uma **aba/papel dentro do `frontend-client`** (recomendado: mesmo login e
   componentes, custo menor) ou uma **app separada** como `frontend-driver`?]
2. [NEEDS CLARIFICATION: Quem cadastra o vendedor e a carteira: só o escritório da transportadora, ou a **contratante** também
   cadastra os vendedores dela pelo portal? Recomendado: começar só pelo escritório.]
3. [NEEDS CLARIFICATION: Cada cliente tem **um** vendedor por contratante ou pode ter titular + substituto/vários recebendo o
   aviso juntos? Recomendado: um titular e um substituto opcional.]
4. [NEEDS CLARIFICATION: Cliente **sem vendedor**: o aviso fica parado em "sem vendedor" até o escritório escolher (recomendado,
   D6) ou cai na contratante como hoje?]
5. [NEEDS CLARIFICATION: Quais outros tipos de ocorrência, além de "Endereço incorreto", seguem ao vendedor? Pela decisão do
   Anderson, "Espera longa" e "Cobrança no recebimento" **não** vão (nem à Spani); fica só o endereço incorreto?]
6. [NEEDS CLARIFICATION: O vendedor responde só por mensagem ou também **corrige o endereço** dele mesmo na área (liga com a
   150, pedido de correção)? Recomendado: Fase 1 só conversa; correção pela área em spec seguinte.]
7. [NEEDS CLARIFICATION: Como o escritório hoje sabe quem é o vendedor de cada cliente? Há planilha/lista para **importar a
   carteira** em lote? (muda a T4).]
8. [NEEDS CLARIFICATION: O vendedor deve receber o aviso mesmo fora do horário? Janela de 24h do WhatsApp não vale no Evolution,
   mas há horário comercial desejado?]
