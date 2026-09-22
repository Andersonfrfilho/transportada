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

## Modelos de e-mail e liberação do envio

Decidido pelo usuário em 2026-09-15, depois da revisão final: a revisão mostrou que o envio exigia
`contractor_mail_settings.status = 'active'`, e nada no sistema grava esse valor, então todo envio
era recusado.

- **RF13** — **Vários modelos por tipo de e-mail.** A página "E-mail com contratantes" ganha uma
  seção "Modelos", onde se cadastram modelos por tipo. O catálogo de tipos é uma constante que hoje
  tem só `address_correction`; ocorrência (spec 143) entra depois, pelo mesmo cadastro. Cada modelo
  tem nome, assunto, abertura e assinatura. O layout visual (`email-template.html`) e os blocos de
  endereço são fixos, porque o modelo edita texto, não estrutura.
- **RF14** — **Variáveis por tipo**, de uma lista fechada. A página lista as variáveis do tipo, cada
  uma com descrição e botão de inserir. Há dois níveis:
  - **Do e-mail**, usadas em assunto, abertura e assinatura. Para `address_correction`:
    `{contratante}`, `{quantidade}`, `{clientes}` (o mesmo número, já com a palavra no singular ou
    plural — "1 cliente"/"3 clientes", para o assunto aprovado, que precisa da concordância),
    `{transportadora}` e `{operador}`.
  - **De cada item enviado**, usadas no campo "Texto de cada endereço", que se repete uma vez por
    endereço. Para `address_correction`: `{cliente}`, `{endereco_como_veio}`, `{endereco_correto}`,
    `{motivo}`, `{cep_como_veio}`, `{cep_correto}`, `{municipio}` e `{uf}`.

  Usar variável de item fora do texto do item, ou uma variável desconhecida, é recusado ao salvar
  (`400`, `details[]` no campo). Os valores são escapados na renderização (RF12). O modelo padrão
  oferecido reproduz o texto aprovado usando essas variáveis.

- **RF15** — **Um modelo padrão por tipo**, escolhido na página. Na confirmação de envio, o operador
  usa o padrão ou escolhe outro modelo ativo do mesmo tipo, e a prévia acompanha a escolha. Modelo é
  arquivado, nunca apagado, porque a mensagem enviada aponta para ele.
- **RF16** — **O envio é liberado** quando a chave do Resend foi aceita, o domínio do remetente está
  verificado (a lista de verificação que a página já faz) e existe um modelo ativo do tipo. Receber
  respostas (MX, webhook, 143 T012) **não** é exigido para enviar. O `status = 'active'` da 143
  continua significando "ida e volta completas" e deixa de bloquear o envio.
- **RF17** — Sem liberação, a recusa tem código estável por motivo (sem chave aceita, domínio não
  verificado, sem modelo do tipo). A tela diz qual é o motivo e leva à página de configuração.
- **RF18** — **Limitador de taxa** (M1 da revisão de segurança, decidido pelo usuário: completo
  agora). Janela fixa com estado no Postgres, compartilhado entre instâncias, por empresa e por
  usuário, aplicado a toda rota que dispara e-mail (`POST /address-correction-requests/mail` e
  `POST /contractor-mail-settings/test-email`). Estourado, responde `429` com `Retry-After` e código
  estável. Os tetos vêm de variáveis de ambiente validadas no boot.
- **RF19** — A trilha de auditoria do envio e dos contatos (M2) fica registrada em `docs/SECURITY.md`
  como pendente antes de produção. O usuário não a incluiu nesta rodada.

Nenhum `[NEEDS CLARIFICATION]` aberto.
