# ADR 0111 — O chat da contratante envia por e-mail

- **Status:** aceita
- **Validada** em 2026-10-19 pelo `architect` (T0.2 da spec 274): APROVADO COM AJUSTES, marcados "Ajustado na T0.2".
- **Data:** 2026-10-19
- **Nasce da spec 274:** o composer da conversa com a contratante fica sempre aberto e cada mensagem sai por e-mail no
  **modelo padrão de envio do sistema**, configurável e cadastrado pelo SDK de notificação (ajustado em 2026-10-19,
  dono), com as confirmações de envio, entrega e **leitura** na conversa.
- **Revoga:** a [spec 183](../../specs/183-a-ocorrencia-tem-duas-conversas/spec.md) **D7** ("no e-mail não existe
  'lida' — o selo para em 'entregue'") e, com ela, a CHECK `occurrence_conversation_messages_email_never_read_check`.
- **Emenda:** a 183 **RF14** (escada do e-mail ganha `read`); a [ADR-0073](0073-o-portal-ganha-a-conversa-da-ocorrencia.md)
  §Consequências (o aviso sem corpo do portal deixa de ir a quem já recebe o e-mail com o corpo; a leitura no portal
  passa a marcar também as mensagens de e-mail); a 263 T5.2-C (composer só-portal); a regra global
  `email-templates.md` §2 (o modelo padrão é semeado pelo SDK, não por script do produto — §3 abaixo; a regra é de
  outro repositório e o dono a atualiza).
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
3. **O envio sem modelo usa o modelo padrão do sistema, cadastrado pelo SDK.** _Ajustado em 2026-10-19 (dono):
   substitui o "layout único em código no pacote" desta ADR proposta._ É um **modelo** do módulo de notificação
   (`notification.standard-email`, canal `email`, `pt-BR`), editável na tela de Notificações como os outros. O SDK
   (`@adatechnology/notification-*`) é dono de tudo o que é dele:
   - **Conteúdo padrão:** um `.html` versionado no `notification-contracts` (tabelas e estilos inline, 620 px, cores
     da plataforma). **Identidade (logo `cid:` ou iniciais, nome de exibição), assinante (iniciais, nome, cargo) e
     rodapé de marcas são marcação do modelo**, com variáveis; HTML do sistema só onde `{{x}}` não expressa a forma
     (`logoEmpresa`, `corpoMensagem`, `listaAnexos`, `faixaResposta`, `marcasRodape`), decidido pelo nome; o resto é texto escapado por
     valor. Obrigatórias: `corpoMensagem`, `logoEmpresa`, `nomeEmpresa`, `nomeAssinante`, `rodapePlataforma`, `marcasRodape`. Nenhuma variável vai em atributo ou `style` (cores literais no `.html`). _Ajustado na T0.2._ Sem
     assunto editável (o assunto é a linha da conversa).
   - **Cadastro:** `standardEmail.ensureTemplate` grava a v1 só se a chave não tem linha, nunca sobrescreve; a API o
     chama no pré-deploy (passo de semente de modelos que já existe), para toda empresa (passo próprio, depois do provisionamento; sem gancho no provisionamento). _Ajustado na T0.2._
   - **Resolução:** versão ativa usável da empresa; sem ela, o conteúdo embutido como **rede de segurança** (versão
     `0`, log). A chave não pode ser desativada; "Restaurar padrão" grava versão nova com o embutido.
   - **Renderização:** `renderStandardEmail` (puro, também na prévia da tela) e `standardEmail.render` (resolve e
     renderiza): devolve `html`, `text/plain`, tamanho e a chave/versão usada, que a mensagem grava.
     O app só monta os valores (texto, anexos, assinante, identidade, frase do rodapé) e chama; não guarda layout nem
     envia pelo módulo: o transporte continua no outbox da TMS. O chat **não exige modelo do tipo** (sem 409 de modelo);
     o modelo do tipo continua obrigatório no aviso automático e no diálogo.
4. **O que vai ao SDK e o que fica (uma cópia de cada regra).** Vai: escape, `htmlToPlainText`, a regra de HTML
   inseguro, a interpolação "valor escapado, HTML do sistema pelo nome", o desenho do logo/iniciais e as cores — o
   renderer da 272 passa a delegar. Fica no app: o renderer do **modelo do tipo** (vocabulário da ocorrência: tabela de
   itens, área `<!-- mensagem -->`, marcas do rodapé da 272, leitura transacional do modelo), prefixo do assunto, "De",
   resolução do assinante e cargo, `APP_BASE_URL` e o `cid` do logo. Critério: vai ao SDK o que é regra genérica de
   e-mail HTML ou o que o envio sem modelo precisa; o resto não ganha nada mudando de lugar nesta spec. A chave
   `notification.standard-email` sai da lista de modelos escolhíveis no tipo.
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

## Alternativas recusadas (§3, ajustado em 2026-10-19)

- **Layout fixo em código no pacote** (a versão proposta desta ADR): mudar uma cor exigiria publicar o SDK e subir a
  dependência; a transportadora não poderia ajustar o próprio e-mail; e criaria um segundo lugar para o visual de
  e-mail, ao lado dos modelos que a tela já edita — o que a regra `email-templates.md` existe para evitar.
- **Padrão só embutido, sem linha no banco** (entrada virtual na tela): a tela listaria o que não existe na tabela, e
  "Remover"/versões precisariam de semântica especial. O dono quer o modelo cadastrado; o embutido fica só como rede.
- **Cadastro no boot do servidor:** proibido nesta base (semente nunca no startup) e N réplicas disputariam a v1.
- **Cadastro por migration do pacote:** migration do módulo é schema, não conhece empresas, e congelaria o conteúdo
  em SQL.
- **Cadastro por script manual:** esquecido por ambiente e por empresa nova; o script avulso existente fica para
  reparo.
- **`sendWithStandardTemplate` no SDK:** o chat não envia pelo módulo — o transporte é o outbox da TMS (Resend da
  transportadora, webhook, idempotência, cabeçalhos de linha).

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

O dono aceitou os cinco em 2026-10-19 (_ajustado na T0.2:_ aceito também que a leitura no portal leve a `read` uma mensagem de e-mail ainda `queued`, e que uma falha posterior do worker fique `stale`): "Lida" é um indício útil para o operador, não prova. A tela não promete mais
que isso (texto do selo e dica, spec RF8).

## Consequências

- O operador conversa com qualquer contratante que tenha contato que recebe ocorrências, com ou sem portal.
- Toda mensagem do chat vira e-mail: mais volume pelo Resend da transportadora (limite de taxa da rota: 30 em 5 min).
- O e-mail de chat não tem resumo da nota nem tabela de itens: o resumo fica no primeiro aviso (modelo do tipo).
- _Ajustado em 2026-10-19 (dono):_ mudar o visual do e-mail do chat é editar o modelo padrão na tela de
  Notificações, sem deploy. Um padrão novo do SDK **não** reescreve a linha cadastrada; chega pelo "Restaurar padrão"
  (perde as edições da empresa).
- O pré-deploy grava uma linha de modelo por empresa (só se ausente): mudança de dados que sai com o deploy, com
  aprovação humana em produção.
- A linha do e-mail usa o `message_id` que o Resend devolve no `email.sent`, gravado pelo webhook; não geramos
  `Message-ID` (spec 274 plan D7).
- `sandbox_smtp` (268) para em "Enviada": sem webhook, sem pixel.
- O "Lida" do e-mail passa a existir em mensagens antigas do diálogo e do automático também, a partir da configuração.

## Follow-ups

- Dono: atualizar `email-templates.md` (repositório `ia`): o modelo padrão de envio sem modelo é do SDK e semeado por
  ele (§3).
- Atualizar sozinha a linha do modelo padrão nunca editada quando o SDK trouxer padrão novo (evidence Q4).
- Envio de teste que prove se o Resend preserva `Message-ID` próprio (condição opcional; só então outra spec pode
  dispensar a espera pelo webhook).
- Prévia do e-mail do chat no composer (o renderizador é importável pelo front; fora desta spec).
- Medir em produção, depois de 30 dias, a fração de mensagens que chega a `read` (contagem, sem PII).
