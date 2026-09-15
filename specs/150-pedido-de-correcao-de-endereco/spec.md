# 150 — Pedido de correção de endereço à contratante

Realiza a T20 da `specs/084-agenda-de-enderecos`. O envio usa o trilho de e-mail da
`specs/143-a-contratante-responde-por-e-mail`.

## Problema

A aba "Clientes a atualizar" do Workspace NF-e lista os endereços de destinatário que a geocodificação
não achou. Nesses casos, a entrega aponta para o centro do município. Hoje a tela só informa: o
operador não tem como registrar o endereço certo nem avisar a contratante (emitente da nota). Por
isso, a próxima nota chega com o mesmo cadastro errado.

Um pino no mapa (084 T19) conserta **onde** fica uma entrega. A correção do texto conserta **como o
endereço se chama** e só chega à origem se a contratante corrigir o cadastro dela. É isso que faz as
próximas notas casarem.

## Histórias

- **H1** — Como operador, em cada endereço da aba, abro "Informar endereço correto" e preencho os
  campos de endereço da nota: logradouro, número, complemento, bairro, município, UF e CEP. O
  formulário vem preenchido com o endereço como chegou.
- **H2** — Como operador, envio à contratante um e-mail de correção com o endereço como veio, o
  endereço correto e o motivo da suspeita.
- **H3** — Como operador, vejo em cada endereço se o pedido já foi enviado, quando e para quem.

## Requisitos

- **RF1** — A correção é **um pedido**, não uma edição da nota. O XML e `nfe_addresses` continuam
  intactos, porque o XML fiscal original é preservado.
- **RF2** — O pedido guarda o endereço **como veio**, o **proposto** e o **motivo** (nível de
  casamento e distância). Um pedido sem dizer o que está errado recebe de volta o mesmo endereço
  (084 T20).
- **RF3** — Validação na fronteira: CEP com 8 dígitos, UF válida e município pelo código IBGE. A
  recusa lista **todos** os campos em `details[]`, e a tela ancora cada erro no seu campo.
- **RF4** — A contratante é resolvida no servidor pelo CNPJ do emitente (`contractors.tax_id`)
  dentro da `companyId` do token, nunca pelo payload.
- **RF5** — O e-mail vai para os contatos ativos da contratante (`contractor_contacts`). O operador
  vê a lista e confirma antes de enviar. Se a contratante não tiver cadastro ou contato ativo, o envio
  é recusado com código estável e a tela diz o motivo.
- **RF5a** — Os destinatários são escolhidos **a cada envio** (decidido pelo usuário em 2026-09-15).
  A confirmação lista todos os contatos ativos da contratante, e o operador marca quem recebe. Não
  existe marcação fixa no contato, e nenhuma coluna nova em `contractor_contacts`. É preciso marcar
  pelo menos um contato, e os escolhidos ficam gravados na mensagem enviada.
- **RF6** — O envio passa pelo outbox do `contractor-mail`, na mesma transação do registro, com
  `Idempotency-Key`. O histórico fica numa conversa `contractor_mail_threads` com um tipo novo
  (`address_correction`).
- **RF6a** — Os dois formatos convivem (decidido pelo usuário em 2026-09-15): **unitário**, enviado a
  partir de um endereço e levando só ele, e **completo**, enviado a partir da contratante e levando
  todos os rascunhos dela. O mesmo modelo de e-mail serve aos dois: a lista tem um ou N itens. Um
  pedido já enviado não entra de novo num envio completo.
- **RF7** — A permissão é `settings.manage`, a mesma do `GET /address-report`.
- **RF8** — Nenhum endereço, CEP ou e-mail aparece em log (`security.md` §1).

## Fora do escopo

- Mudar a coordenada de entrega: isso é a 084 T19 (pino no mapa). As duas ações se somam.
- A contratante responder e o sistema aplicar a resposta: fica para a Fase 3 da 143 ou para uma spec
  futura.
- O portal do contratante corrigir por conta própria (084 T13/T14).

## O e-mail

Texto aprovado pelo usuário em 2026-09-15. O desenho de referência está em `email-template.html`,
com dados fictícios.

- **RF9** — O e-mail sai em **HTML com texto puro de reserva** (multipart): layout em tabela, estilo
  inline, 600 px e as cores do produto. Os dois formatos saem da mesma função pura, a partir dos
  mesmos dados.
- **RF10** — Assunto: `Correção de endereço de entrega — {n} cliente(s)`. Abertura para a equipe da
  contratante, depois um bloco por endereço, a assinatura com o nome do operador e da transportadora,
  e o rodapé dizendo que as notas não foram alteradas.
- **RF11** — Cada bloco traz o **nome do destinatário**, o endereço **como veio**, o **correto**
  (destacado em verde) e o **motivo**, escrito para leigo: "endereço não localizado" ou "localizado
  a X km do endereço informado". Para isso o relatório passa a expor o nome do destinatário da nota
  mais recente de cada endereço.
- **RF12** — Todo valor interpolado no HTML é escapado. Nome e endereço vêm de XML de terceiro.

Nenhum `[NEEDS CLARIFICATION]` aberto.
