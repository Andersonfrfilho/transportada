# ADR 0111 — O chat da contratante envia por e-mail

- **Status:** proposta (2026-10-19) — a validar com `architect` na T0.2 da spec 274.
- **Data:** 2026-10-19
- **Nasce da spec 274:** o composer da conversa com a contratante fica sempre aberto e cada mensagem sai por e-mail num
  **corpo de e-mail padrão** do pacote de notificação, com as confirmações de envio, entrega e **leitura** na conversa.
- **Revoga:** a [spec 183](../../specs/183-a-ocorrencia-tem-duas-conversas/spec.md) **D7** ("no e-mail não existe
  'lida' — o selo para em 'entregue'") e, com ela, a CHECK `occurrence_conversation_messages_email_never_read_check`.
- **Emenda:** a 183 **RF14** (escada do e-mail ganha `read`); a [ADR-0073](0073-o-portal-ganha-a-conversa-da-ocorrencia.md)
  §Consequências (o aviso sem corpo do portal deixa de ir a quem já recebe o e-mail com o corpo; a leitura no portal
  passa a marcar também as mensagens de e-mail); a 263 T5.2-C (composer só-portal); a regra global
  `email-templates.md` no ponto "envio sem modelo" (§3 abaixo; a regra é de outro repositório e o dono a atualiza).
- **Mantém:** a 183 D2 (canal por mensagem), D9 (o portal mostra toda a conversa), a [ADR-0108](0108-o-modelo-do-email-a-contratante-vem-do-modulo-de-notificacao.md)
  e a [ADR-0110](0110-o-email-da-ocorrencia-sai-em-html.md) para o aviso automático e o diálogo "Enviar por e-mail".
- **Base factual:** `specs/274-o-chat-da-contratante-envia-por-email/evidence.md` § Levantamento.

## Contexto

- Hoje o composer da aba Contratante só escreve pelo **portal** e fecha quando a contratante não tem usuário no portal
  (`OccurrenceConversations.component.tsx:259,344`; texto `thread.closed.noPortal`). E-mail só sai pelo diálogo
  "Enviar por e-mail", que exige modelo do tipo (409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`, ADR-0106 §3/ADR-0108).
- A maioria das contratantes não usa o portal. Para elas o operador não tem chat: tem um formulário de e-mail por
  mensagem.
- A 183 D7 recusou "lida" no e-mail. Os motivos continuam verdadeiros e estão registrados abaixo; o dono decidiu
  aceitá-los em 2026-10-19.
- O e-mail da conversa sai pelo Resend **da transportadora** (`contractor_mail_settings`, chave cifrada por empresa);
  o webhook Svix por empresa (`/public/inbound-emails/:webhookId`) já atualiza `sent`/`delivered`/`bounced`/`failed`
  e ignora `email.opened` de propósito (`process-inbound-email-webhook.use-case.ts:25-35`).
- No Resend, rastreio de abertura é **configuração do domínio** (`open_tracking`), desligado por padrão, e só funciona
  com um **subdomínio de rastreio** verificado por CNAME. O evento `email.opened` precisa estar assinado no webhook.
  Só a parte HTML do e-mail carrega o pixel.
- A regra global `email-templates.md` proíbe layout de e-mail montado em código **no produto** para e-mail que o
  módulo pode carregar. A mensagem do chat não tem modelo (o texto é do operador, mensagem a mensagem).

## Decisão

1. **O composer da contratante envia por e-mail, sempre.** Aberto quando há nota, contratante e `occurrences.resolve`
   (o `canWrite` de hoje), com ou sem portal. Cada envio grava **uma** mensagem na conversa, canal `email`, que nasce
   `queued` e sobe `sent → delivered → read`.
2. **Uma mensagem, um canal de transporte; o portal é vitrine.** Com o portal aberto, a mesma mensagem aparece no
   portal (a listagem do portal já não filtra canal — 183 D9) e os usuários do portal que **não** estão em `To`/`Cc`
   recebem o aviso sem corpo da ADR-0073. Não se gravam duas mensagens: a tela não duplica, o status é um só e a
   idempotência também. Considerado e recusado: duas mensagens (`email` + `portal`) agrupadas na tela — duas escadas
   de status para o mesmo texto, agrupamento novo no SDK e dois registros para auditar.
3. **O corpo padrão mora no pacote de notificação, não no produto.** Envio sem modelo usa um layout único, versionado
   no pacote `@adatechnology/notification-contracts` (função pura, sem dependência de runtime, re-exportada por
   `@adatechnology/notification-module`): tabelas e estilos inline, 620 px, cores fixas da plataforma, com slots de
   identidade (logo por `cid:` ou iniciais, nome de exibição), corpo (texto escapado em parágrafos), lista de anexos,
   assinatura e rodapé de marcas; devolve `html` e `text/plain`. **Nenhum slot aceita HTML cru**: o pacote escapa tudo.
   É um layout só, para o envio que por definição não tem modelo — não um segundo editor nem um segundo lugar para o
   visual de e-mails com modelo. O chat **não exige modelo** do tipo (sem 409 de modelo no chat); o modelo do tipo
   continua obrigatório no aviso automático e no diálogo.
4. **O que vai ao pacote e o que fica.** Vai: o layout padrão, o gerador de `text/plain` (hoje `htmlToPlainText` da
   272, que o produto passa a importar do pacote) e os fragmentos de logo/iniciais e de marcas do rodapé (os
   construtores `logoTransportadora`/`marcasRodape` da 272 passam a delegar a eles: um só desenho). Fica no produto:
   prefixo do assunto, "De", assinante e cargo, validação de HTML de modelo, renderer de modelo, `APP_BASE_URL` e o
   `cid` do logo (dados do produto passados como entrada).
5. **"Lida" pelo pixel de abertura — revoga a 183 D7.** O webhook mapeia `email.opened → read`; a escada do e-mail
   vira `queued → sent → delivered → read` (API, worker e painel); a CHECK que proibia `read` no e-mail sai.
   Falha (`bounced`/`failed`) continua terminal: abertura depois de devolução não muda nada. Abertura antes da entrega
   sobe direto (a política já aceita saltar degraus e preenche o horário que faltar).
6. **Leitura pelo portal também vale.** Quando a contratante abre a conversa no portal, as mensagens de saída de canal
   `email` sobem para `read` junto com as de `portal`.
7. **Ligar o rastreio é configuração, não código.** No Resend da transportadora: domínio com `open_tracking = true`,
   `click_tracking = false` (reescrever links quebraria os links do e-mail e piora entregabilidade), subdomínio de
   rastreio com CNAME verificado e `email.opened` assinado no webhook. Feito por quem administra a conta Resend e o DNS
   da transportadora, com aprovação humana, seguindo o roteiro da spec. A aplicação não altera o domínio. Sem a
   configuração, o selo para em "Entregue" — sem fingir.

## Contras aceitos (os motivos da 183 D7)

- **Impreciso.** Pixel não é leitura: é download de imagem.
- **Cliente que bloqueia imagem nunca marca.** Outlook corporativo, firewall, "não carregar imagens": a mensagem fica
  em "Entregue" mesmo lida.
- **Outros marcam sozinhos.** Apple Mail Privacy Protection e antivírus de servidor baixam a imagem antes de alguém
  abrir: "Lida" pode aparecer sem leitura.
- **Rastreia a contratante sem ela saber.** O e-mail não pede consentimento para o pixel.
- **Entregabilidade.** O próprio Resend recomenda não rastrear abertura em e-mail transacional; o pixel pode pesar no
  filtro de spam. E o rastreio é **do domínio**: vale para todo e-mail que a transportadora manda por ele (aviso
  automático, diálogo, reenvio da 248), não só o chat.

O dono aceitou os cinco em 2026-10-19: "Lida" é um indício útil para o operador, não prova. A tela não promete mais
que isso (texto do selo e dica, spec RF8).

## Consequências

- O operador conversa com qualquer contratante que tenha contato que recebe ocorrências, com ou sem portal.
- Toda mensagem do chat vira e-mail: mais volume pelo Resend da transportadora (limite de taxa da rota: 30 em 5 min).
- O e-mail de chat não tem resumo da nota nem tabela de itens: o resumo fica no primeiro aviso (modelo do tipo).
- Mudar o visual do corpo padrão é publicar versão do pacote e subir a dependência na API — de propósito: é o visual
  da plataforma, não da transportadora.
- `sandbox_smtp` (268) para em "Enviada": sem webhook, sem pixel.
- O "Lida" do e-mail passa a existir em mensagens antigas do diálogo e do automático também, a partir da configuração.

## Follow-ups

- Dono: atualizar `email-templates.md` (repositório `ia`) com a exceção do envio sem modelo (§3).
- Prévia do e-mail do chat no painel (o pacote é importável pelo front; fora desta spec).
- Medir em produção, depois de 30 dias, a fração de mensagens que chega a `read` (contagem, sem PII).
