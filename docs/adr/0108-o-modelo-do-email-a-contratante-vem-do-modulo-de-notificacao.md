# ADR 0108 — O modelo do e-mail à contratante vem do módulo de notificação

- **Status:** proposta (2026-10-17) — a T0.2 da spec 271 valida com o `architect`. Decisões do Anderson no chat do
  projeto em 2026-10-17.
- **Data:** 2026-10-17
- **Nasce da spec 271:** o texto do e-mail de ocorrência à contratante é um modelo do módulo de notificação, escolhido
  no cadastro do tipo, junto com quem vai em cópia e, nos tipos de contratantes, quem recebe.
- **Substitui:** a [ADR-0106](0106-o-email-da-ocorrencia-usa-modelo-do-cadastro.md) §1 (tipo de e-mail `occurrence` no
  catálogo da spec 150) e §2 (o tipo **e a exceção por contratante** apontam para um `contractor_mail_templates` por id;
  modelo efetivo = exceção ?? tipo; arquivar em uso → 409). **Mantém** da ADR-0106: §3 (sem modelo efetivo, sem e-mail —
  nem à mão; 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`; reenvio da 248 isento; aviso "Tipo sem modelo de notificação" só com
  `emails_contractor` ligado), §4 (começa do zero), §5 (a etapa B da 269 para `email_subject`/`email_body`/
  `email_item_line_template` segue dela), §6 (publicação em etapas), o assunto saneado e truncado, e "só as registradas
  depois da escolha".
- **Emenda:** a spec 267 (Fora do escopo: "responsáveis por tipo de ocorrência") e a regra de `To` da 143/183 (contatos
  da etapa) no tipo de contratantes. A [ADR-0107](0107-o-tipo-de-ocorrencia-tem-escopo-de-contratantes.md) não muda.

## Contexto

- A empresa já escreve modelos de e-mail num lugar: o módulo de notificação (`notification.templates`, Notificações →
  Preferências), com versões, prévia e o renderizador `{{campo}}` compartilhado entre servidor e tela
  (`interpolateTemplate`). O tipo de ocorrência já aponta para um deles para o **aviso interno** (`email_template_key`).
- A 269 criou um segundo lugar (o cadastro da 150, `{snake_case}`) e deixou a exceção por contratante trocar o modelo.
  O dono quer um lugar só para escrever e a escolha só no tipo; para uma contratante com texto próprio, um tipo só dela
  (270).
- A 269 está só em `staging`, com zero modelos de ocorrência e zero escolhas: trocar a origem não perde dado.
- O caminho de entrega da 143/183/267/268 (remetente da empresa ou Mailpit, contatos em `To`, responsáveis em `Cc`,
  `Reply-To` com token) é o que a contratante já recebe. O envio do módulo (`sendNotification`) não serve: exige usuário
  do sistema como destinatário, não tem `cc` e usa o remetente global.

## Decisão

1. **O módulo é depósito e renderizador, não carteiro.** O modelo é criado e editado só no módulo. A API lê a versão
   ativa mais alta da chave (canal `email`, `pt-BR`) da tabela `templates` do pacote, na própria transação, renderiza
   com `interpolateTemplate` e entrega pelo `send-occurrence-mail` de sempre.
2. **O tipo aponta pela chave.** `company_occurrence_types.contractor_notification_template_key` (sem FK; a identidade
   do módulo é versionada) e `contractor_notification_template_selected_at` (carimbo da escolha, como na 269). Editar o
   texto no módulo vale no próximo e-mail; trocar a chave carimba de novo. A exceção por contratante **não** escolhe
   modelo.
3. **Modelo utilizável** = versão ativa `email`/`pt-BR` da empresa, chave fora dos avisos do sistema, assunto não vazio,
   corpo **texto** (não HTML) e só variáveis da lista fechada da TMS (`{{camelCase}}`, com `{{linhasItens}}`). A TMS
   valida ao gravar o tipo (todos os problemas de uma vez) e confere de novo no envio: não utilizável ≡ sem modelo
   (ADR-0106 §3). O catálogo de variáveis do módulo é por chave exata e a chave é livre, por isso a TMS mostra as
   variáveis no editor do tipo.
4. **O bloco "E-mail à contratante" do tipo diz o que sai, para quem e com quem:**
   - **Em cópia:** responsáveis escolhidos da lista da empresa (267), em `company_occurrence_type_watchers` com FK para
     a lista da empresa (`CASCADE`). Cópia efetiva = tipo (com algum ativo) ?? contratante ?? empresa; o resto da 267
     (teto 50, operador só remove, impressão digital, sem endereço livre) vale igual.
   - **Destinatários:** só no tipo de contratantes (`listed`), contatos das contratantes do tipo, em
     `company_occurrence_type_recipients`. `To` = escolhidos da contratante da nota, ativos e que recebem ocorrências;
     nenhum → a regra de hoje (etapa). Tirar a contratante do escopo apaga os contatos dela da escolha na mesma
     transação; `all` não tem destinatários.
5. **Rastreio pela chave e versão** (`contractor_mail_messages.notification_template_key`/`_version`);
   `template_id` fica para a correção de endereço.
6. **Sem lixo, em duas etapas.** Etapa A: sai o tipo `occurrence` do catálogo da 150 (prévia, arquivar em uso), a
   resolução exceção ?? tipo, a leitura e escrita das colunas da 269; a chave antiga é aceita e ignorada no `PUT` até as
   telas novas estarem em produção. Etapa B (aprovação humana): `DROP` das colunas `contractor_mail_template_id`/
   `_selected_at` no tipo e na exceção, e a CHECK de `contractor_mail_templates` volta a `address_correction`, com
   rollback escrito e pré-condição medida (zero linhas).
7. **Publicação:** painel tolerante (269 + 270 + 271) → API + worker (as três juntas; a API da 269 nunca sozinha em
   produção) → telas → etapa B.

## Alternativas rejeitadas

- **Manter o cadastro da 150 para ocorrência (ADR-0106):** dois editores e duas sintaxes para o mesmo dono.
- **Mandar pelo `sendNotification`:** perde `cc`, remetente da empresa, contatos da contratante e o fio da conversa.
- **Apontar para o `id` de uma versão:** prenderia o tipo no texto velho a cada edição no módulo.
- **Escolha na exceção por contratante:** o dono recusou; o tipo de contratantes (270) cobre o caso.
- **Catálogo de variáveis no pacote por prefixo / bloquear "remover" modelo em uso no módulo:** exigem release do
  pacote; ficam como perguntas da spec 271 (Q2/Q3).
- **Aceitar HTML e tirar as marcas:** o texto sairia diferente do que o dono viu na prévia.

## Consequências

- Um editor só (o do módulo) e uma sintaxe só (`{{campo}}`) para tudo o que a empresa escreve. O tipo concentra a
  política do e-mail (se sai, qual modelo, cópia, destinatários).
- O módulo não sabe que o tipo usa a chave: desativar o modelo lá para o envio sem erro de gravação. O aviso "Tipo sem
  modelo de notificação" (editor, feed, detalhe, diálogo) é a defesa.
- Variável escrita errada depois da escolha sai vazia no e-mail; o editor do tipo avisa variável desconhecida no modelo
  atual.
- O texto por item deixa de ser configurável (`{{linhasItens}}` tem formato fixo).
- A cópia por tipo vence a da contratante: um tipo com responsáveis escolhidos ignora o atendente fixo da contratante
  naquele tipo — é a precedência que o dono definiu.
- O drop das colunas da 269 é irreversível quanto ao dado (zero linhas medidas); o rollback só devolve a forma.
