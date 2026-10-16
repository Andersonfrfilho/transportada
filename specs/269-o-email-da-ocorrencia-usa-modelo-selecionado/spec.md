# Feature 269 — O e-mail da ocorrência usa o modelo selecionado no tipo

> Pedido e decisões do dono no chat de 2026-10-16. Decisão de arquitetura:
> [ADR-0106](../../docs/adr/0106-o-email-da-ocorrencia-usa-modelo-do-cadastro.md), que **emenda a decisão de desenho da
> spec 183** (`evidence.md:529-532`: "o modelo do diálogo é o texto do tipo, não um `contractor_mail_templates` da 150").

## Specs do mesmo assunto (lidas contra o código em `origin/staging`, 2026-10-16)

| Spec | O que já decidiu e esta spec **usa sem refazer** (ou emenda, quando dito)                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 079  | O tipo de ocorrência ganhou texto próprio de e-mail (`email_subject`/`email_body`) com marcadores `{{camelCase}}`, e o aviso interno (`notifies` + `email_template_key`). **O aviso interno não muda.** O texto próprio deixa de ser usado (esta spec).                                                                                                                                    |
| 143  | Canal de e-mail com a contratante (Resend por empresa, `contractor_mail_messages`, conversa e respostas). A T015 mandava reaproveitar o texto do tipo — **emendado** aqui.                                                                                                                                                                                                                 |
| 150  | Cadastro "E-mail com contratantes → Modelos" (`contractor_mail_templates`): vários modelos por tipo de e-mail, catálogo fechado de variáveis `{snake_case}` em dois níveis (e-mail e item), até 50 ativos por tipo, um padrão por tipo, arquivado nunca apagado, `contractor_mail_messages.template_id`. **RF13: "ocorrência entra depois, pelo mesmo cadastro"** — é o que esta spec faz. |
| 183  | Duas conversas por ocorrência; o e-mail à contratante (manual pelo diálogo "Enviar à contratante" e automático pelo `emails_contractor` do tipo). **D (evidence.md:529-532) decidiu o contrário desta spec** — emendado pela ADR-0106. O resto (montagem com assinatura, idempotência, contatos por etapa, D4) fica.                                                                       |
| 242  | O editor de tipos (`PUT /company-settings/occurrence-types`, schema `.strict()`) grava a política. O campo novo entra no mesmo schema.                                                                                                                                                                                                                                                     |
| 247  | Editor de `email_subject`/`email_body` na aba Tipos, `email_item_line_template` e `{{linhasItens}}`, somas por item. **O editor desse texto sai**; somas, valor pago e `reference_number_mode` ficam (são do registro, não do e-mail).                                                                                                                                                     |
| 248  | Retorno da contratante: `contractor_reply_mode` exige `emails_contractor` (CHECK `company_occurrence_types_contractor_reply_requires_mail_check`). `driver_reply_template` e `forward_email_subject`/`forward_email_body` são **texto fixo** (só aparado e escapado), sem marcadores — não usam a máquina `{{camelCase}}`. **Ficam como estão**, e `emails_contractor` fica.               |
| 268  | (em andamento em `work/spec-268`, ainda não em `staging`) O e-mail de ocorrência à contratante cai no Mailpit fora de produção (`transport = 'sandbox_smtp'`) e os contatos aparecem na ficha da contratante. Mexe no mesmo `send-occurrence-mail`/`recordMail`. **A implementação da 269 é rebaseada sobre a 268** (`plan.md` § Ordem com a 268).                                         |

## Problema e resultado

O e-mail de ocorrência para a contratante sai de um texto fixo escrito em cada tipo de ocorrência (`email_subject`,
`email_body`, `email_item_line_template`), com marcadores `{{camelCase}}` próprios. A empresa já tem um cadastro de
modelos de e-mail com variáveis e prévia ("E-mail com contratantes → Modelos", spec 150), e ele não serve à ocorrência.
São dois editores de e-mail, com duas sintaxes, e o da ocorrência fica escondido dentro do tipo.

**Resultado:** o e-mail de ocorrência usa um modelo do cadastro "Modelos", do tipo de e-mail novo **Ocorrência**
(`occurrence`). Cada tipo de ocorrência escolhe o seu modelo num seletor na aba Tipos, e a exceção por contratante do
tipo pode trocar o modelo para aquela contratante. Sem modelo efetivo **não sai e-mail** — nem automático, nem à mão — e, quando o tipo está marcado para enviar e-mail à contratante, a
ocorrência mostra o aviso "Tipo sem modelo de notificação". O texto antigo do tipo não é migrado: começa do zero, e o
código e as colunas que só serviam a ele são removidos (as colunas em uma etapa separada, com aprovação humana).

## Requisitos funcionais

- **RF1 — Tipo de e-mail "Ocorrência" no cadastro de modelos.** O catálogo da 150 ganha `occurrence`, com rótulo
  "Ocorrência", variáveis de e-mail e de item (lista fechada em `plan.md` § Catálogo), e um modelo sugerido (ponto de
  partida, nunca semeado). Criar, editar, arquivar, padrão, prévia e limite de 50 ativos funcionam como no tipo
  `address_correction`.
- **RF2 — O item se repete.** O texto do item (`item_text`) do modelo se repete uma vez por item da ocorrência (o que
  hoje é `{{linhasItens}}`), com o mesmo teto de 200 linhas e o "e mais N itens". Ocorrência sem item: a seção some.
  `item_text` vazio: nenhuma linha de item.
- **RF3 — O tipo escolhe o modelo.** Na aba Tipos de `/ocorrencias`, o editor do tipo troca os campos de assunto, corpo
  e linha de item por um **seletor** com os modelos ativos do tipo `occurrence`, com "Nenhum" e uma prévia renderizada
  com valores de exemplo. O link "Gerenciar modelos" leva a "E-mail com contratantes → Modelos".
- **RF3b — A exceção da contratante pode trocar o modelo.** A exceção por contratante do tipo
  (`company_occurrence_type_contractor_overrides`, specs 218/246/247/248) ganha o mesmo seletor, com "Herdar do tipo".
  **Modelo efetivo = modelo da exceção da contratante da nota ?? modelo do tipo**, campo a campo como as colunas irmãs.
  Não há exceção por destinatário, e o tipo continua geral (não é restrito a uma contratante).
- **RF4 — Sem modelo efetivo, sem e-mail — nem à mão.**
  - o envio automático não sai (motivo `no_template_selected`, contado no resultado, sem falha);
  - no diálogo "Enviar à contratante" o envio fica **desabilitado**, com o aviso do RF5;
  - a API recusa o envio manual com 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`.
- **RF5 — Aviso "Tipo sem modelo de notificação".** Quando o tipo tem "envia e-mail à contratante" ligado
  (`emails_contractor`) e não há modelo efetivo para a contratante da nota:
  - o detalhe e a linha da ocorrência no painel mostram o aviso, com link para o editor do tipo/exceção;
  - o diálogo "Enviar à contratante" mostra o mesmo aviso, com o envio desabilitado;
  - o editor do tipo mostra o aviso junto do seletor quando o tipo não tem modelo (as contratantes sem exceção ficam sem
    e-mail).
- **RF6 — O envio registra o modelo.** A mensagem gravada (`contractor_mail_messages.template_id`) aponta para o modelo
  efetivo, no envio automático e no manual (o servidor o resolve; o operador pode editar o texto sugerido).
- **RF7 — Modelo em uso não se arquiva.** Arquivar um modelo `occurrence` escolhido por algum tipo **ativo ou inativo**
  ou por alguma **exceção de contratante** responde 409 `CONTRACTOR_MAIL_TEMPLATE_IN_USE`, com os nomes dos tipos e os
  pares tipo/contratante que o usam. O painel mostra a lista.
- **RF8 — Começa do zero.** O texto antigo de cada tipo **não** é migrado para modelos. Desde o deploy da API, nenhum
  tipo envia e-mail à contratante até alguém criar um modelo e escolhê-lo (o aviso do RF5 aparece nos tipos com
  `emails_contractor` ligado).
- **RF9 — Sem lixo.** O código que só servia ao texto do tipo sai na mesma entrega (etapa A); as colunas
  `email_subject`, `email_body` e `email_item_line_template` saem numa migration destrutiva separada (etapa B), só depois
  da etapa A em produção e com aprovação humana. Inventário em `plan.md`.

## Requisitos não funcionais

- **Isolamento:** o modelo escolhido é da mesma empresa do tipo (FK composta `company_id`); outra empresa → 404.
  `companyId` vem do token.
- **Sem PII em log:** o envio loga só ids e motivo; nunca assunto, corpo ou endereço.
- **HTML escapado:** o valor da nota vem de XML de terceiro; a renderização HTML continua escapando (política da 150).
- **Assunto sem quebra de linha** (CHECK da 150, injeção de cabeçalho) vale para o modelo de ocorrência.
- **Publicação em etapas:** painel tolerante ao tipo de e-mail e ao campo novos → API → telas novas → (depois) drop das
  colunas.

## Fora do escopo

- Modelo por **destinatário** (a exceção é só por contratante) e tipo restrito a uma contratante.
- Os textos da 248 (`driver_reply_template`, `forward_email_subject`/`forward_email_body`), o interruptor
  `emails_contractor` e o aviso interno da 079 (`notifies` + `email_template_key`): continuam como estão.
- Migrar o texto antigo dos tipos para modelos (decisão do dono: começa do zero).
- E-mail de ocorrência de **parada** (hoje não existe; continua não existindo).
- O Mailpit fora de produção e os contatos na ficha (spec 268).

## Critérios de aceite

1. O catálogo `GET /contractor-mail-templates/catalog` traz `occurrence` com as variáveis do `plan.md`; criar um modelo
   `occurrence` com `{numero_nota}` no assunto e `{codigo_item}` no item salva; `{codigo_item}` no assunto responde 400.
2. Um tipo com `emails_contractor` e modelo escolhido: registrar a ocorrência com dois itens envia o e-mail com o assunto
   do modelo, a abertura, duas linhas de item e o encerramento; a mensagem gravada tem `template_id` do modelo.
3. O mesmo tipo sem modelo: nenhum e-mail sai (`skipped`/`no_template_selected`), e o painel mostra "Tipo sem modelo de
   notificação" no detalhe, na linha e no diálogo.
4. O diálogo "Enviar à contratante" de um tipo com modelo abre preenchido pelo modelo; sem modelo efetivo, o envio fica
   desabilitado com o aviso, e um `POST` manual direto na API responde 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`.
   4b. A contratante com exceção que escolhe outro modelo recebe o e-mail desse modelo; a exceção com "Herdar do tipo"
   recebe o do tipo; um tipo sem modelo com exceção que escolhe modelo envia só para aquela contratante.
5. Arquivar o modelo escolhido por um tipo ou por uma exceção responde 409 com os nomes; depois de trocar os dois para
   "Nenhum"/"Herdar do tipo", arquivar funciona.
6. O modelo de outra empresa não pode ser escolhido (404) nem um modelo `address_correction` (400).
7. O painel publicado antes da API continua abrindo "Modelos" e a aba Tipos quando a API passa a mandar o tipo de e-mail
   `occurrence` e o campo `emailTemplateId`.
8. Etapa A: nenhuma linha de código de produção lê ou escreve `email_subject`, `email_body` ou `email_item_line_template`
   (conferido por `grep`), a máquina `{{camelCase}}` (renderizador, marcadores, schemas, prévia do tipo e a rota
   `POST /company-settings/occurrence-types/email-preview`) não existe mais, a resposta do registro não traz `email`, e
   os testes do código removido saem junto.
9. Etapa B (com aprovação humana): a migration remove as três colunas; aplicada, revertida e reaplicada num banco
   descartável; `db:generate` dá `no_changes`.
