# ADR 0106 — O e-mail da ocorrência usa o modelo do cadastro, escolhido no tipo

- **Status:** proposta (2026-10-16) — a validar pelo architect na T0.2 da spec 269. Escopo decidido pelo Anderson no chat
  do projeto em 2026-10-16.
- **Data:** 2026-10-16
- **Nasce da spec 269:** o e-mail de ocorrência à contratante passa a sair dos modelos de "E-mail com contratantes →
  Modelos" (spec 150), não do texto fixo do tipo de ocorrência.
- **Emenda:** a decisão de desenho da spec 183 (`specs/183-a-ocorrencia-tem-duas-conversas/evidence.md:529-532`): "o
  modelo do diálogo é o texto do tipo da ocorrência (`email_subject`/`email_body`, spec 079), que a 143 T015 já mandava
  reaproveitar — não um `contractor_mail_templates` da 150". Também a 143 T015 e o editor de texto da 247 (RF do editor
  na aba Tipos). A 150 RF13 ("ocorrência entra depois, pelo mesmo cadastro") passa a valer.

## Contexto

- Há dois editores de e-mail para a contratante, com duas sintaxes: o texto do tipo (`{{camelCase}}`, spec 079/247,
  `occurrence-template.policy.ts`) e o cadastro de modelos (`{snake_case}`, spec 150, `mail-template-render.policy.ts`),
  que já tem vários modelos por tipo de e-mail, padrão, arquivamento, prévia, limite e rastreio por mensagem
  (`contractor_mail_messages.template_id`).
- A 183 escolheu o texto do tipo para não abrir um tipo novo no catálogo da 150. O dono decidiu o contrário: um lugar só
  para escrever e-mail à contratante, com o tipo de ocorrência **apontando** para um modelo.
- O texto do tipo e a máquina `{{camelCase}}` (`occurrence-template*.ts`, `src/shared/occurrence-template.constant.ts`,
  prévia do tipo) servem **só** ao e-mail à contratante e à cópia dele na resposta do registro (`email`, "e-mail pronto"
  no painel). Os textos da 248 (`driver_reply_template`, `forward_email_*`) são texto fixo, sem marcadores, e não os usam.

## Decisão

1. **Tipo de e-mail `occurrence` no catálogo da 150.** Variáveis de e-mail (assunto, abertura, encerramento e item) e de
   item (só no `item_text`, que se repete por item) — lista fechada no `plan.md` da 269. A renderização é a da 150
   (`renderMailTemplate`, HTML escapado). A CHECK `contractor_mail_templates_mail_type_check` muda por migration aditiva.
2. **O tipo aponta para o modelo.** `company_occurrence_types.email_template_id uuid NULL`, FK composta
   `(company_id, email_template_id) → contractor_mail_templates (company_id, id)` `ON DELETE RESTRICT`. A gravação do tipo
   confere, na mesma transação, que o modelo é da empresa, do tipo `occurrence` e ativo. Um modelo escolhido por algum
   tipo **não se arquiva** (409 `CONTRACTOR_MAIL_TEMPLATE_IN_USE`). Alternativa rejeitada: arquivar e limpar o tipo em
   silêncio — o tipo pararia de enviar sem ninguém saber.
3. **Sem modelo, sem e-mail.** O modelo nulo não cai em padrão nenhum (nem no `is_default` do tipo `occurrence`, nem no
   texto antigo): o envio automático pula com `no_template_selected` e o diálogo abre em branco. Quando o tipo tem
   `emails_contractor` ligado e modelo nulo, a API expõe `missingNotificationTemplate: true` e o painel mostra "Tipo sem
   modelo de notificação". Alternativa rejeitada: usar o modelo padrão do tipo `occurrence` — o dono quer a escolha
   explícita por tipo.
4. **Começa do zero.** O texto antigo não é migrado. No deploy da API, todo tipo com `emails_contractor` fica sem e-mail
   até alguém escolher um modelo; o aviso mostra onde.
5. **Sem lixo, em duas etapas.** Etapa A (junto da feature): o código que só servia ao texto do tipo sai — leitor da
   sugestão pelo texto, `email` na resposta do registro, a máquina `{{camelCase}}` inteira (renderizador, marcadores,
   schemas, prévia do tipo e a rota de prévia), campos e ajuda do editor, e seus testes. **Fica** só a leitura dos
   valores da nota e dos itens, que passa a alimentar as variáveis `{snake_case}` do modelo. Etapa B (depois da A em produção, com aprovação humana): migration
   destrutiva remove `email_subject`, `email_body` e `email_item_line_template`, com rollback escrito (recria as colunas
   `NOT NULL DEFAULT ''`; o dado é descartado de propósito).
6. **Publicação em etapas** (molde da 247/266): painel tolerante a tipo de e-mail desconhecido e a campo novo no tipo →
   API → telas → etapa B.

## Consequências

- Um editor só, uma sintaxe só (`{snake_case}`) para o que vai à contratante. O tipo de ocorrência fica com a política
  (quando avisar); o modelo, com o texto.
- O rastreio passa a dizer qual modelo saiu em cada e-mail de ocorrência (`template_id`), como na correção de endereço.
- No dia do deploy, os tipos que enviavam e-mail param até alguém escolher modelo. É intencional (decisão do dono) e
  visível (aviso no tipo e na ocorrência). A T5.4 mede quantos tipos ficam nessa situação por empresa antes de ir a
  `main`.
- Uma sintaxe só de marcador no produto (`{snake_case}`); a `{{camelCase}}` deixa de existir.
- O envio automático deixa de reprocessar ocorrência sem modelo: a varredura do worker passa a exigir modelo escolhido
  (hoje um pulo `no_template` não grava idempotência e a varredura pede a mesma ocorrência a cada rodada).
- O drop das colunas é irreversível quanto ao dado; o rollback só devolve a forma.
