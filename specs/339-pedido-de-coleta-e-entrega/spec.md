# Feature 339 — Pedido de coleta e entrega pelo cliente

> Status: **rascunho para revisão** (design curto, sem código). Relacionadas: 063 (portal do cliente), 326 (orçamento
> pelo custo), 338 (orçamento público), 321 (coleta de canhoto, que **não** é esta), 150 (pedido de correção, mesmo
> padrão de pedido → decisão do escritório).

## Problema e resultado

Hoje a carga só entra no sistema pela NF-e. O cliente que quer **coletar** ou **entregar** algo precisa ligar ou mandar
mensagem, e o escritório digita o pedido por conta própria. Em 15/11/2026 o Anderson perguntou se o cliente consegue
solicitar a coleta/entrega e ser **avisado se aceitarmos**, e se, aceito, o sistema cadastra o cliente e cria a viagem
ou acrescenta numa existente.

Resultado: o cliente (contratante com portal, ou quem veio do orçamento público da 338) **solicita** a coleta/entrega;
o escritório **aceita ou recusa com motivo**; o cliente é **avisado** da decisão e, depois, de quando a coleta entra numa
viagem. Aceitar **gera uma sugestão** (entrar numa viagem existente ou criar uma nova) que o escritório confirma; a viagem não nasce sozinha.

## Fora do escopo

- Pagamento, contrato eletrônico e cobrança do pedido (a fatura segue o fluxo atual depois da NF-e/CT-e).
- Emissão fiscal automática: o pedido não é NF-e nem CT-e; o documento fiscal segue o fluxo normal.
- Roteirização automática da coleta (a sugestão de viagem compatível é só sugestão).
- Rastreamento ao vivo da coleta (D7 da 063 continua valendo).
- Coleta de **canhoto** (321): outro objeto, outra tabela.

## Decisões

- **D1 — O pedido é um registro próprio, nunca uma viagem.** Tabela nova `pickup_requests` (aditiva): `company_id` (do
  contexto, nunca do payload), `contractor_id`, `kind` (`pickup` | `delivery`), endereço de origem e de destino
  (estruturados como em `nfe_addresses`), janela desejada (data inicial e final), descrição da carga, volumes, peso
  estimado, observação, `quote_id` opcional (326/338), `status` e o ator que decidiu. Estados: `requested` →
  `accepted` | `refused` | `canceled` (pelo cliente, só antes de aceito) → `scheduled` (entrou numa viagem) → `done`.
- **D2 — Quem pede é o ator externo do portal.** Rotas `/client/me/pickup-requests` (padrão ADR-0050 §4, 063 D3): sem id
  de cliente no payload; o servidor resolve o contratante pela sessão. O cliente só vê os pedidos dele. Recusa de
  campos fora do contrato (`.strict()`).
- **D3 — O escritório decide, com motivo.** Fila "Pedidos de coleta" no painel (permissão nova `pickup.manage`, no
  `company-admin` e `operator`). Recusar exige motivo; aceitar pode confirmar a janela e anexar o preço do orçamento.
  Decisão grava ator e hora e entra em `audit_logs`.
- **D4 — Cliente é cadastrado na aceitação, não na solicitação.** Pedido vindo do portal já tem contratante. Pedido
  vindo do orçamento público (338) só tem CNPJ/CPF e contato: ao **aceitar**, o servidor procura o documento dentro da
  `companyId`; se existe, reaproveita; se não, cria o contratante marcado "novo, a conferir" (aparece em `/pendencias`).
  Nunca cria cliente antes de aceitar, para o formulário público não virar porta de spam no cadastro.
- **D5 — Aceitar gera uma sugestão de viagem, nunca a viagem.** Decidido pelo Anderson em 15/11/2026: ao aceitar, o
  sistema cria uma **sugestão** com duas saídas — **entrar numa viagem existente** (as viagens abertas com rota e
  ocupação compatíveis, ordenadas, usando a ocupação da 326) ou **criar viagem nova** com a coleta como parada. A
  sugestão aparece na fila "Coletas aceitas" e **só vira viagem quando o escritório confirma**: veículo, motorista e
  data continuam decisão do despachante. A sugestão é recalculada se a viagem escolhida mudar ou fechar, e some se o
  pedido for cancelado. A mecânica de parada de coleta reaproveita `trip_stops` — a T0 confirma se há `kind` de coleta ou
  se precisa de uma coluna.
- **D6 — O aviso ao cliente.** Dois momentos: **decisão** (aceito/recusado, com motivo na recusa) e **agendamento**
  (entrou na viagem, com a data prevista). Canal: portal (sempre) + e-mail pelo modelo do módulo de notificação (272:
  nenhum layout de e-mail em código; chave de modelo própria, publicada pelo script de modelos). WhatsApp só se a
  contratante já tem o canal configurado (fase 2). A aceitação **não** promete data de coleta, só a janela.
- **D7 — Pedido anônimo (338) exige a mesma prova.** Captcha (Turnstile) + limite por IP (já existentes) e, antes de
  qualquer aviso, confirmação do contato por código. Sem isso o pedido não entra na fila do escritório.
- **D8 — Preço.** Se há orçamento, o pedido guarda a referência e o total que o cliente viu (e a validade); a decisão do
  escritório pode divergir, e a divergência fica registrada. O cliente nunca vê custo nem margem (decisão da 338).

## Histórias

- **H1** — Como cliente do portal, abro "Solicitar coleta/entrega", informo origem, destino, janela, carga e envio;
  vejo o pedido como "aguardando resposta".
- **H2** — Como cliente, recebo e-mail e aviso no portal quando o pedido é aceito ou recusado (com motivo).
- **H3** — Como cliente, cancelo o pedido enquanto não foi aceito.
- **H4** — Como operador, vejo a fila, abro o pedido, aceito (confirmando janela e preço) ou recuso com motivo.
- **H5** — Como operador, de um pedido aceito, acrescento a uma viagem sugerida ou crio viagem nova.
- **H6** — Como cliente, sou avisado quando a coleta entra numa viagem, com a data prevista.

## Requisitos

- **RF1** — Criar pedido: `POST /client/me/pickup-requests` (idempotente por `Idempotency-Key`); valida CEP, UF, IBGE,
  janela futura e peso/volumes positivos; recusa lista todos os campos em `details[]`.
- **RF2** — Decidir: `POST /pickup-requests/:id/accept` e `/refuse` (`pickup.manage`); transição inválida → 409 com
  código estável; recusa sem motivo → 400.
- **RF3** — Acrescentar à viagem: reaproveita a rota existente de parada manual da viagem, gravando o vínculo
  `pickup_requests.trip_id`/`trip_stop_id`; um pedido entra em no máximo uma viagem aberta.
- **RF4** — Notificação pelo outbox, na mesma transação da decisão, com chave de idempotência; falha de e-mail não desfaz
  a decisão e é reenviável.
- **RF5** — Nenhum dado pessoal (endereço, documento, contato) em log (`security.md` §1).
- **RF6** — Isolamento multiempresa: todo acesso por `companyId`; contrato negativo de pedido de outra empresa e de
  outro contratante.

## Casos extremos

- Dois cliques em "aceitar" → um só efeito (estado + idempotência).
- Cliente cancela enquanto o operador aceita → vence quem gravar primeiro; o outro recebe 409.
- Pedido aceito e viagem cancelada → volta a `accepted` e reaparece na fila, e o cliente é avisado do novo prazo.
- Documento de pedido anônimo já existe como contratante inativo → a aceitação pede reativação explícita.

## Critérios de aceite

- **CA01** — Pedido do portal chega à fila com status `requested`; outro contratante não o vê.
- **CA02** — Aceitar de pedido anônimo cria o contratante "a conferir" uma única vez (segunda aceitação do mesmo documento
  reaproveita).
- **CA03** — Recusar sem motivo é recusado; com motivo, o cliente recebe e-mail e vê o motivo no portal.
- **CA04** — Aceitar cria só a sugestão (viagem existente ou nova), sem viagem; ao confirmar, a parada é criada e o cliente é avisado com a data prevista.
- **CA05** — E-mail sai do modelo do módulo de notificação; sem modelo utilizável não sai (padrão 271).

## Dúvidas (precisam do Anderson)

1. **Quem pode pedir no portal:** só contratantes cadastrados, ou também destinatários (clientes finais) das notas?
2. **Prazo de resposta:** queremos um prazo (ex.: pedido some/expira se ninguém responder em N dias) e um alerta ao
   escritório?
3. **Canal de aviso:** e-mail + portal basta na primeira fase, ou WhatsApp já entra?
