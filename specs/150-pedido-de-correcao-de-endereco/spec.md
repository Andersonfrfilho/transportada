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
- **RF6** — O envio passa pelo outbox do `contractor-mail`, na mesma transação do registro, com
  `Idempotency-Key`. O histórico fica numa conversa `contractor_mail_threads` com um tipo novo
  (`address_correction`).
- **RF7** — A permissão é `settings.manage`, a mesma do `GET /address-report`.
- **RF8** — Nenhum endereço, CEP ou e-mail aparece em log (`security.md` §1).

## Fora do escopo

- Mudar a coordenada de entrega: isso é a 084 T19 (pino no mapa). As duas ações se somam.
- A contratante responder e o sistema aplicar a resposta: fica para a Fase 3 da 143 ou para uma spec
  futura.
- O portal do contratante corrigir por conta própria (084 T13/T14).

## [NEEDS CLARIFICATION]

- **P1** — O modelo do e-mail: assunto, abertura, como a lista de endereços aparece (tabela ou
  blocos "como veio → correto") e assinatura. O usuário vai definir.
- **P2** — Agrupamento: um e-mail por contratante com todos os endereços pendentes dela, ou um por
  endereço?
- **P3** — Recebem todos os contatos ativos, ou é preciso uma marcação nova no contato (ao lado de
  `receives_occurrences`) para correção de cadastro?
