# Feature 271 — O modelo do e-mail à contratante vem do módulo de notificação

> Pedido do dono no chat de 2026-10-17 ([`evidence.md`](evidence.md) § Decisões do dono). Decisão de arquitetura:
> [ADR-0108](../../docs/adr/0108-o-modelo-do-email-a-contratante-vem-do-modulo-de-notificacao.md), que **substitui a
> decisão de cadastro de modelos da ADR-0106** (§1 e §2: tipo `occurrence` no catálogo da 150 e modelo na exceção por
> contratante) e **mantém** o resto dela (sem modelo não sai e-mail, nem à mão; reenvio da 248 isento; assunto
> saneado e truncado; automático só para ocorrência registrada depois da escolha; aviso só com o e-mail ligado).
>
> ⚠️ **Ordem:** a 269 e a 270 estão em `staging` e **nenhuma das duas está em produção**. A 271 vai a `main` **junto**
> com elas (nunca a API da 269 sozinha): ver `plan.md` § Publicação.

## Specs do mesmo assunto (lidas contra o código em `origin/staging`, 84c05c96b, 2026-10-17)

| Spec      | O que já decidiu e esta spec **usa sem refazer** (ou emenda, quando dito)                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 034       | Módulo de notificação no produto: `notification.templates` por empresa (`key`/`channel`/`locale`/`version`/`subject`/`body`), versão ativa mais alta vale, "remover" desativa a identidade. Tela Notificações → Preferências (`/notificacoes/preferencias`, `NotificationSettingsWorkspace`). **Usa** a tabela e o renderizador `{{campo}}`; **não** usa o envio (`sendNotification`).                                                                                    |
| 079 / 246 | `company_occurrence_types.email_template_key`: o **aviso interno** do tipo (modelo do módulo), validado por `hasActiveEmailTemplate`. **Fica como está.** O campo novo é outro, ao lado dele.                                                                                                                                                                                                                                                                             |
| 143 / 183 | Contatos da contratante com `receives_occurrences` e `occurrence_stages`; o automático manda aos contatos da etapa; o diálogo pré-marca os da etapa; conversa por (ocorrência, participante), `Reply-To` com token, fio de resposta. **Emenda (RF6):** num tipo de contratantes com destinatários escolhidos, o `To` vem da escolha.                                                                                                                                      |
| 150       | Cadastro "E-mail com contratantes → Modelos" (`contractor_mail_templates`, `{snake_case}`). **Continua** para a correção de endereço; deixa de ter o tipo `occurrence`. `contractor_mail_messages.template_id` continua para a correção de endereço. Teto `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`.                                                                                                                                                                          |
| 248       | Reenvio do pedido de resposta (`contractorReplyResend`) reusa os contatos do envio original e **não** passa pelo bloqueio de modelo. Fica.                                                                                                                                                                                                                                                                                                                                |
| 267       | Responsáveis em cópia: lista da empresa (`company_occurrence_watchers`) e da contratante (`contractor_occurrence_watchers`), "lista com algum ativo vence, sem ativo herda", operador só remove chip, teto 50 em `To`+`Cc`, impressão digital com os removidos, auditoria. **Emenda (RF5):** o tipo ganha uma terceira lista, que vence as outras duas. A 267 tinha "responsáveis por tipo de ocorrência" fora do escopo; o dono pediu agora.                             |
| 268       | Remetente: Resend da empresa, ou o Mailpit do ambiente fora de produção. Não muda.                                                                                                                                                                                                                                                                                                                                                                                        |
| 269       | (em `staging`, não em produção) O e-mail sai de um modelo escolhido; sem modelo não sai, nem à mão (409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`); aviso "Tipo sem modelo de notificação"; carimbo da escolha e "só as registradas depois"; assunto saneado. **Muda a origem do modelo** (`contractor_mail_templates` → `notification.templates`) e **tira** o modelo da exceção por contratante. Staging tem **zero** modelos `occurrence` e **zero** escolhas: nada se perde. |
| 270       | (em `staging`, não em produção) Escopo do tipo `all`/`listed` (`company_occurrence_type_contractors`). **Usa:** o texto próprio de uma contratante se faz com um tipo só dela, e os destinatários escolhidos (RF6) só existem num tipo `listed`.                                                                                                                                                                                                                          |

## Problema e resultado

A 269 pôs o texto do e-mail à contratante num segundo cadastro de modelos (o da correção de endereço, `{snake_case}`), e
deixou a exceção por contratante trocar o modelo. O dono quer **um lugar só para escrever modelos**: o módulo de
notificação, que a empresa já usa para os avisos internos. E quer que o cadastro do tipo diga, num bloco só, **o que
sai, para quem e com quem em cópia**.

**Resultado:** o modelo do e-mail à contratante é criado e editado **só** em Notificações → Preferências. O cadastro do
tipo (Ocorrências → Tipos) ganha o bloco **"E-mail à contratante"** com três escolhas: o **modelo** (um modelo de e-mail
do módulo), quem vai **em cópia** (responsáveis da empresa) e, só nos tipos de contratantes, os **destinatários**
(contatos das contratantes do tipo). A exceção por contratante perde a escolha de modelo: texto próprio de uma
contratante é um tipo só dela (270). A entrega não muda: mesmo remetente, mesmos contatos, mesma cópia, mesma conversa.

## Requisitos funcionais

- **RF1 — O modelo nasce no módulo de notificação.** O texto do e-mail à contratante é um modelo de e-mail (canal
  `email`, idioma `pt-BR`) da empresa em `notification.templates`, criado e editado em Notificações → Preferências. O
  cadastro "E-mail com contratantes → Modelos" deixa de oferecer o tipo "Ocorrência" (fica só a correção de endereço).
- **RF2 — A escolha é no tipo.** No editor do tipo, o bloco "E-mail à contratante" tem o campo **Modelo**, separado do
  campo de aviso interno (`email_template_key`, que não muda). A lista mostra os modelos de e-mail ativos da empresa,
  **menos** as chaves de aviso do sistema (`NOTIFICATION_TEMPLATE_KEY`), por nome/chave com o assunto, mais "Nenhum" e o
  link **"Criar modelo em Notificações"** (`/notificacoes/preferencias`). Ao escolher, o editor mostra a prévia com
  valores de exemplo e a lista de variáveis (RF4).
- **RF3 — Modelo válido.** Gravar o tipo com um modelo que não é da empresa, não está ativo, não é de e-mail `pt-BR`, é
  chave de aviso do sistema, tem corpo HTML ou usa variável fora da lista do RF4 → 400 com **todos** os problemas de uma
  vez (`plan.md` § Contratos). Ausente no `PUT` não altera; `null` limpa.
- **RF4 — Variáveis.** O modelo usa `{{campo}}` (a sintaxe do módulo). A lista fechada, no `plan.md` § Variáveis:
  `{{numeroNota}}`, `{{numeroNotaSemSerie}}`, `{{razaoSocial}}`, `{{valorNota}}`, `{{contratante}}`, `{{motorista}}`,
  `{{parada}}`, `{{data}}`, `{{observacao}}`, `{{tipoOcorrencia}}`, `{{numeroReferencia}}`, `{{somaItens}}`,
  `{{valorDeclarado}}`, `{{itens}}`, `{{codigosItens}}`, `{{quantidadesItens}}` e `{{linhasItens}}` (uma linha por
  item, no formato fixo do `plan.md`). Variável ausente na ocorrência sai vazia.
- **RF5 — Em cópia.** O bloco tem **Em cópia**: seleção múltipla dos **responsáveis da empresa** (lista da 267). Mostra
  os ativos e elegíveis; quem está inativo na lista da empresa, perdeu `occurrences.resolve` ou não tem e-mail aparece
  marcado e não recebe. Até 10 por tipo. **Cópia efetiva = escolha do tipo (se tiver algum ativo) ?? lista da
  contratante da nota ?? lista da empresa** — mesma regra "com algum ativo vence, sem ativo herda" da 267. Escolha vazia
  = comportamento de hoje. Continua valendo da 267: teto de 50 em `To`+`Cc`, o operador só remove chip no envio manual,
  impressão digital com os removidos, quem já está no `To` não repete. Vale no envio manual, no automático e no reenvio
  da 248; a correção de endereço (sem tipo) não muda.
- **RF6 — Destinatários (só tipo de contratantes).** No tipo `listed` (270), o bloco tem **Destinatários**: seleção
  múltipla dos contatos ativos que recebem ocorrências das contratantes do tipo, agrupados por contratante. No envio,
  `To` = os contatos escolhidos **da contratante da nota**, ativos e com `receives_occurrences`; se nenhum escolhido da
  contratante da nota sobrar, vale o automático de hoje (contatos da contratante da nota que recebem ocorrência daquela
  etapa). No tipo `all` o campo **não aparece** e o `To` é sempre o automático. No envio manual, os escolhidos vêm
  **pré-marcados** no diálogo (no lugar da regra da etapa) e o operador continua podendo mudar a marcação, como hoje.
- **RF7 — Destinatário segue o escopo.** Tirar uma contratante da lista do tipo remove, na mesma gravação, os contatos
  dela da seleção; trocar o tipo para `all` limpa a seleção. Contato que fica inativo ou deixa de receber ocorrências
  continua na seleção, marcado, e não recebe.
- **RF8 — A exceção por contratante perde o modelo.** O editor da exceção não tem mais a escolha de modelo; a API não
  aceita mais `contractorMailTemplateId` na exceção (400 por `.strict()`, depois do painel novo — `plan.md` §
  Publicação). Modelo efetivo = modelo do tipo.
- **RF9 — Sem modelo, sem e-mail (mantido da 269).** Sem modelo escolhido, ou com o modelo escolhido desativado,
  apagado do módulo, virado HTML ou fora de `pt-BR`: o automático pula, o diálogo fica com o envio desabilitado e a API
  recusa o envio manual com 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`. O reenvio da 248 não passa pelo bloqueio. Com
  `emails_contractor` ligado e sem modelo utilizável, o aviso **"Tipo sem modelo de notificação"** aparece no editor do
  tipo, no feed, no detalhe e no diálogo; com o e-mail desligado, não aparece.
- **RF10 — Só as registradas depois (mantido da 269).** O automático só manda e-mail de ocorrência registrada depois da
  escolha do modelo no tipo. Trocar de modelo carimba de novo; editar o texto no módulo (versão nova da mesma chave) não
  carimba.
- **RF11 — Rastreio.** Cada e-mail de ocorrência grava a chave e a versão do modelo que saiu
  (`contractor_mail_messages.notification_template_key`/`_version`). O reenvio da 248 grava as do envio original (ou
  nulo).
- **RF11 (nota):** grava a versão ativa **no momento do envio**; no envio manual o corpo é o texto do operador.
- **RF12 — Auditoria.** Trocar o modelo, a cópia ou os destinatários do tipo grava `audit_logs` com ator, tipo e ids
  antes e depois (nunca endereço).

## Requisitos não funcionais

- **Isolamento:** `companyId` do token. Modelo, responsável ou contato de outra empresa → mesmo erro de inexistente, sem
  revelar existência. FK composta com `company_id` em toda tabela nova.
- **Servidor decide:** o servidor resolve modelo, `To` e `Cc` no envio; o cliente nunca manda modelo nem endereço.
- **Sem PII em log:** contagens e ids; nenhum endereço, nome ou texto renderizado.
- **Sem N+1:** a leitura dos tipos traz cópia e destinatários em uma consulta por lista; o aviso do feed é calculado na
  mesma consulta.
- **O módulo é só depósito e renderizador:** a 271 lê `notification.templates` e usa `interpolateTemplate`; não chama
  `sendNotification` (exige usuário do sistema, não tem `cc`, usa remetente global).
- **Publicação em etapas (ADR-0081 §9):** painel tolerante → API (migration aditiva A) → telas → migration destrutiva B
  com aprovação humana.

## Notas da revisão (T0.2)

- Responsável removido da lista da empresa por cascata de membership deixa o tipo sem entrada de auditoria: aceito.

## Fora do escopo

- Mudar o pacote do módulo de notificação (catálogo de variáveis por prefixo de chave, bloqueio de "remover" modelo em
  uso). Ficam como pergunta (`evidence.md` Q2/Q3).
- Corpo HTML no e-mail à contratante (o caminho é texto; RF3 recusa).
- Modelo, cópia ou destinatário por **exceção** de contratante ou por destinatário.
- Endereço digitado em cópia ou destinatário (267/150: só usuário da empresa e contato cadastrado).
- O aviso interno (`email_template_key`), a correção de endereço e o encaminhamento a terceiro (248).
- Semear modelo: começa do zero, como a 269.

## Critérios de aceite

1. Em Notificações, a empresa cria o modelo de e-mail `ocorrencia.avaria` com `{{numeroNota}}` e `{{linhasItens}}`; no
   tipo "Avaria", "Modelo" lista `ocorrencia.avaria` e não lista `trip.delivery-occurrence`; salvar e recarregar mostra a
   escolha e a prévia.
2. `PUT` do tipo com modelo de outra empresa, inativo, chave do sistema, corpo HTML ou `{{foo}}` → 400 com os problemas
   juntos; sem a chave nova → o modelo guardado não muda.
3. Ocorrência registrada depois da escolha: o automático sai com o assunto e o corpo renderizados do modelo (uma linha
   por item), pelo mesmo remetente e com `notification_template_key`/`_version` gravados.
4. Desativar o modelo no módulo: o próximo envio manual → 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`, o automático pula, e
   o aviso "Tipo sem modelo de notificação" aparece (só com `emails_contractor` ligado).
5. Cópia: empresa {Ana, Bruno}, contratante X {Carla}, tipo "Avaria" {Davi}: o e-mail de "Avaria" para X sai com Davi em
   `Cc`; com o tipo vazio, sai com Carla; contratante sem lista, sai com Ana e Bruno. Davi inativo na lista da empresa →
   o tipo herda (Carla).
6. Destinatários: tipo `listed` = [X, Y] com {x1 (de X), y1 (de Y)}: na nota de X o `To` é só x1; na nota de Y, só y1;
   x1 inativo → na nota de X vale o automático da etapa. Tipo `all`: o editor não mostra o campo e o `PUT` com
   destinatários → 400.
7. Tirar Y da lista do tipo remove y1 da seleção na mesma gravação; trocar para `all` limpa a seleção.
8. A exceção por contratante não mostra mais o modelo; o `PUT` da exceção com `contractorMailTemplateId` → 400 (depois
   da etapa das telas).
9. "E-mail com contratantes → Modelos" não oferece "Ocorrência".
10. O painel publicado antes da API continua abrindo a aba Tipos, o feed, o detalhe e o diálogo com as chaves novas.
11. Trocar modelo, cópia ou destinatários grava `audit_logs` com ids antes e depois.
12. Migration B (com aprovação): as colunas da 269 saem, a CHECK de `contractor_mail_templates` volta a
    `address_correction`, e o rollback recria a forma.
