# Feature 274 — O chat da contratante envia por e-mail

> Pedido do dono em 2026-10-19 ([`evidence.md`](evidence.md) § Decisões do dono). Decisão de arquitetura:
> [ADR-0111](../../docs/adr/0111-o-chat-da-contratante-envia-por-email.md) (aceita na T0.2). Revoga a
> **183 D7** ("no e-mail não existe lida").
>
> ⚠️ **Mudança do dono no mesmo dia (substitui a decisão 3 do pedido):** a mensagem do chat **não** usa o modelo do tipo
> nem o HTML completo da 272. Sai num **corpo de e-mail padrão** do pacote de notificação, com o texto, os anexos, a
> identidade da transportadora, a assinatura do operador e o rodapé de marcas.
>
> ⚠️ **Ajustado em 2026-10-19 (dono):** o "corpo padrão" **não** é layout fixo em código. É um **modelo padrão
> configurável para envio sem modelo** (`notification.standard-email`, `email`, `pt-BR`), **cadastrado** no banco de
> modelos pelo SDK (semente idempotente no pré-deploy), com identidade, assinante e rodapé **dentro do modelo**;
> conteúdo padrão, cadastro, resolução (versão ativa da empresa; o embutido só como rede de segurança) e renderização
> ficam **no SDK**; a API só monta os valores e chama (plan D3/D4). A linha do e-mail usa o `message_id` que o Resend devolve no `email.sent` (plan D7).
>
> ⚠️ **Ordem:** a 272 está em `staging` e não em produção; a 274 vai a `main` **depois** da 272 (e de 269–271). Depende
> de uma versão nova de `@adatechnology/notification-contracts`/`-module` (Fase 1, repositório de pacotes).

## Specs do mesmo assunto (lidas contra o código em `origin/staging` 2483d6e6f, 2026-10-19)

| Spec     | O que já decidiu e esta spec **usa sem refazer** (ou emenda/revoga, marcado)                                                                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 183      | Duas conversas; **D2** canal por mensagem (usa: a mensagem do chat é canal `email`); **D9** o portal mostra toda a conversa da contratante, por qualquer canal (usa: é assim que a mensagem chega ao portal). **Revoga D7** (e-mail sem "lida") e **emenda RF14** (escada do e-mail ganha `read`). T407 (diálogo de e-mail) e T654 (canal portal + aviso sem corpo) ficam. |
| ADR-0073 | Portal com a conversa; aviso de mensagem nova **sem corpo**. **Emenda:** o aviso não vai a quem já recebe o e-mail com o corpo; a leitura no portal marca também as mensagens de e-mail.                                                                                                                                                                                   |
| 263      | T5.2-C: thread do SDK `ConversationThread` com composer **só-portal** (`b7d214a1c`). **Emenda:** o composer da contratante envia por e-mail.                                                                                                                                                                                                                               |
| 248      | Reenvio do pedido e encaminhamento a terceiro. Não muda.                                                                                                                                                                                                                                                                                                                   |
| 267      | Cópia aos responsáveis (teto 50 em `To`+`Cc`, operador só remove). **Usa:** a cópia efetiva entra no e-mail do chat como no diálogo.                                                                                                                                                                                                                                       |
| 268      | Sandbox (Mailpit, global, sem `Reply-To`, sem webhook). **Usa:** no sandbox a mensagem para em "Enviada".                                                                                                                                                                                                                                                                  |
| 269/271  | Modelo obrigatório (`OCCURRENCE_MAIL_TEMPLATE_MISSING`, 409), modelo do módulo escolhido no tipo, destinatários do tipo. **Não vale para o chat** (o chat não usa modelo); continua no automático e no diálogo. **Usa:** a resolução de destinatários pré-marcados.                                                                                                        |
| 272      | HTML do modelo, área `<!-- mensagem -->`, prefixo do assunto, "De" com o nome de exibição, assinatura com cargo, logo `cid:`. **Usa** prefixo, "De", assinante e `has_inline_logo`. **Move ao SDK** (ajustado 2026-10-19, dono) escape, `htmlToPlainText`, regra de HTML inseguro, interpolação e logo/marcas; o renderer do modelo do tipo fica (plan D4).                |

## Problema e resultado

O composer da aba Contratante só escreve pelo portal e fica fechado quando a contratante não tem usuário no portal — o
caso comum. Para falar com ela o operador abre um diálogo de e-mail por mensagem, escolhe contatos, confere a prévia e
depende do modelo do tipo. A conversa não parece conversa, e o operador não sabe se a contratante leu.

**Resultado:** o composer fica **sempre aberto** (há nota, contratante e permissão). Cada mensagem — texto, anexos e
áudio — sai por **e-mail** no modelo padrão do sistema com a identidade da transportadora, a assinatura do operador e o rodapé da
plataforma, na mesma linha do e-mail da ocorrência, aos contatos pré-marcados com os responsáveis em cópia. Na conversa
ela aparece como chat, com os selos **Enviada**, **Entregue** e **Lida** (pixel de abertura ou leitura no portal). Com o
portal aberto, a mesma mensagem está no portal.

## Requisitos funcionais

- **RF1 — Composer sempre aberto.** Na aba Contratante o composer abre quando há nota, contratante (`contractorId`) e
  `occurrences.resolve`, independente do portal. Sem nota ou sem contratante fica fechado como hoje, com o texto de hoje
  para esses casos; o texto `thread.closed.noPortal` deixa de ser usado.
- **RF2 — Enviar é e-mail.** Enviar grava **uma** mensagem de canal `email` na conversa da contratante, que nasce
  `queued`, e um e-mail de saída (`contractor_mail_messages`) na linha (`contractor_mail_threads`) da ocorrência. O
  envio usa o Resend da transportadora ou o sandbox (268), pelas regras de prontidão de hoje.
- **RF3 — Modelo padrão, sem modelo do tipo.** _Ajustado em 2026-10-19 (dono)._ O e-mail sai no **modelo padrão** do
  SDK de notificação (`notification.standard-email`): a versão ativa da empresa, editada na tela de Notificações, ou,
  sem ela (rede de segurança), o conteúdo embutido no SDK. O modelo traz identidade (logo `cid:` ou iniciais, nome de exibição), o texto do
  operador escapado em parágrafos, a lista dos anexos (nome), a assinatura do operador (nome e cargo, regra da 272) e o
  rodapé de marcas da plataforma (obrigatório); parte `text/plain` gerada do HTML pelo SDK. O chat **não** exige modelo
  do tipo: nunca responde 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`.
- **RF4 — Para quem.** `To` = os contatos pré-marcados que a prévia de hoje resolve (escolhidos no tipo, senão os da
  etapa), ativos, que recebem ocorrências e com e-mail. `Cc` = a cópia efetiva da 267/271 (e o dono da 273, quando
  publicada). Sem nenhum pré-marcado → 409 `OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS`; o composer mostra o erro com o atalho
  "Enviar por e-mail" (escolher contatos no diálogo).
- **RF5 — Assunto e linha.** Assunto = o da linha (último e-mail de saída da ocorrência); sem e-mail anterior, o assunto
  padrão do plan D6 com o prefixo da 272 (idempotente). `In-Reply-To` = último `Message-ID` conhecido da linha
  (entrada, ou saída com o `message_id` devolvido pelo Resend no `email.sent` — ajustado em 2026-10-19, dono);
  `References` = a cadeia, até 20.
- **RF6 — Anexos e áudio.** O composer anexa arquivos e grava áudio pelas regras do e-mail
  (`conversation-attachment.policy.ts`: pdf, planilhas, csv, imagens e áudio mp4/mpeg/ogg/webm; 10 MB por arquivo, 25 MB
  no total, 5 por mensagem). Os arquivos vão como anexos do e-mail e listados no corpo.
- **RF7 — Lida.** O webhook do Resend leva `email.opened` a `read`. A escada do e-mail passa a
  `queued → sent → delivered → read`; `bounced`/`failed` continuam terminais. Quando a contratante abre a conversa no
  portal, as mensagens de saída de canal `email` também passam a `read`. Vale para toda mensagem de e-mail da
  conversa (chat, diálogo e automático).
- **RF8 — Selo honesto.** O selo "Lida" do e-mail tem a dica "Aberta pela contratante (pode não aparecer se o e-mail
  bloquear imagens)". Sem rastreio ligado o selo para em "Entregue". No sandbox para em "Enviada".
- **RF9 — Portal aberto.** Com usuário do portal, a mensagem aparece no portal (a listagem já mostra todos os canais) e
  o aviso sem corpo da ADR-0073 vai **só** aos usuários do portal cujo e-mail não está em `To`/`Cc`. Uma ação do
  operador = uma mensagem na tela, em qualquer lado.
- **RF10 — Diálogo continua.** "Enviar por e-mail" segue igual (contatos, prévia, modelo, anexos) e é o caminho para
  reenviar uma mensagem que falhou e para escrever quando não há pré-marcado.
- **RF11 — Ligar o rastreio.** Roteiro em `plan.md` § Ligar a confirmação de leitura: no Resend da transportadora,
  `open_tracking` ligado, `click_tracking` desligado, subdomínio de rastreio verificado (CNAME) e `email.opened` no
  webhook. Executado por quem administra a conta e o DNS, com aprovação humana; a aplicação não altera o domínio.
- **RF12 — Modelo padrão no SDK.** _Ajustado em 2026-10-19 (dono)._ O SDK de notificação fornece o conteúdo padrão
  (arquivo `.html` no pacote), o **cadastro** (`standardEmail.ensureTemplate`, chamado pela API no pré-deploy para toda
  empresa: grava a v1 só se a chave não tem linha, nunca sobrescreve), a resolução (versão ativa da empresa; embutido
  como rede de segurança) e a renderização (`renderStandardEmail` puro em `notification-contracts`;
  `standardEmail.render` no `notification-module`). Identidade (logo, nome de exibição), assinante (iniciais, nome,
  cargo) e rodapé são marcação do modelo, com variáveis. A tela de Notificações lista e edita o modelo como os outros
  (selo "Modelo do sistema"), "Restaurar padrão" grava uma versão nova com o conteúdo embutido e "Remover" não existe
  para ele. Versão sem as variáveis obrigatórias (`corpoMensagem`, `logoEmpresa`, `nomeEmpresa`, `nomeAssinante`,
  `rodapePlataforma`) ou com HTML inseguro é recusada ao salvar. Publicado pelo fluxo do repositório de pacotes e
  consumido com versão fixa.

## Requisitos não funcionais

- **Segurança:** nenhuma variável de texto do modelo padrão aceita HTML; texto, nomes de anexo, nome e cargo saem escapados. Sem
  `script`, sem `on*`, sem link reescrito (`click_tracking` desligado).
- **Isolamento:** `companyId` do token; contatos e cópia só da empresa e da contratante da nota; contrato negativo de
  BOLA (outra empresa → 404) na rota.
- **Sem PII em log:** ids, contagens e códigos; nunca endereço, nome, assunto ou corpo.
- **Compatível com cliente de e-mail:** tabelas e estilos inline, 620 px, sem grid/flex/`var(`/CSS externo; HTML abaixo
  de 100 KB com 8000 caracteres de texto e 5 anexos listados.
- **Idempotência:** reenvio da mesma chave (`email-message:<id da mensagem do composer>`) devolve a mesma mensagem;
  mesma chave com conteúdo diferente → 409 de chave reutilizada.
- **Publicação em etapas** (ADR-0081 §9): pacote publicado → painel tolerante → API + worker no mesmo run → telas →
  rastreio no Resend (aprovação humana).

## Fora do escopo

- Prévia do e-mail do chat antes de enviar.
- Escolher contatos ou assunto no composer (é o diálogo).
- Resumo da nota ou tabela de itens no e-mail do chat (fica no primeiro aviso, pelo modelo do tipo).
- Rastreio de clique; leitura por destinatário (o selo é por mensagem).
- WhatsApp (183 T503/T506) e o app do motorista.
- Mudar o aviso automático, o diálogo, o reenvio da 248 ou o modelo do tipo.
- Configurar o domínio do Resend pela aplicação.

## Critérios de aceite

1. Contratante sem portal, tipo com dois contatos pré-marcados e um responsável em cópia: o composer está aberto;
   "Chegou com avaria, segue foto" + uma foto → uma mensagem `email` `queued` na conversa e um e-mail com `To` dos dois,
   `Cc` do responsável, a foto anexa e listada no corpo, assinatura do operador, logo `cid:` e rodapé de marcas.
2. O mesmo envio com o tipo **sem modelo** → sai normalmente (nada de 409 de modelo).
3. Nenhum contato pré-marcado → 409 `OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS`, nada gravado; o composer mostra o erro e o
   atalho "Enviar por e-mail".
4. Texto `<b>oi</b> & {{tabelaItens}}` → sai escapado e literal no HTML; a parte texto tem o texto como digitado.
5. Webhook `email.sent` → "Enviada"; `email.delivered` → "Entregue"; `email.opened` → "Lida". `email.opened` antes de
   `email.delivered` → "Lida", e o `delivered` atrasado só preenche o horário. `email.bounced` depois de `delivered`
   não muda; `email.opened` depois de `bounced` não muda.
6. Contratante com portal: a mensagem aparece uma vez no painel e uma vez no portal; o usuário do portal que também é
   contato em `To` não recebe o aviso sem corpo; o outro usuário recebe. Abrir a conversa no portal leva a mensagem a
   "Lida" sem webhook.
7. Segunda mensagem do chat na mesma ocorrência: mesmo assunto da primeira; `In-Reply-To` = `message_id` da primeira
   (devolvido pelo Resend no `email.sent` e gravado pelo webhook) ou da última resposta da contratante, o que for mais
   recente; sem `email.sent` da primeira ainda, ela fica fora de `References`.
8. Mesma chave de idempotência duas vezes → uma mensagem; mesma chave com outro texto → 409.
9. Sandbox (268): a mensagem chega ao Mailpit com logo inline e fica em "Enviada".
10. Áudio gravado no composer (webm) → anexo do e-mail; arquivo de 11 MB → 400 antes de gravar.
11. Usuário de outra empresa na rota → 404; sem `occurrences.resolve` → 403.
12. O SDK: `renderStandardEmail` com o padrão embutido, texto de 8000 caracteres e 5 anexos → HTML < 100 KB, sem
    `<script`, `on*=`, `display:flex`, `var(`; os slots aparecem escapados; `text` sem tags.
13. _Ajustado em 2026-10-19 (dono):_ depois do pré-deploy, cada empresa tem a v1 de `notification.standard-email`; a
    segunda execução grava zero; a tela de Notificações a mostra com o selo "Modelo do sistema" e sem "Remover". A
    empresa edita a cor do cabeçalho e salva → o próximo envio usa a versão dela (grava chave e versão); "Restaurar
    padrão" → nova versão com o conteúdo embutido. Salvar sem `{{rodapePlataforma}}` → recusado. Sem linha ativa (rede
    de segurança) → sai no embutido, grava versão `0` e loga `standard_email_template_fallback`. O modelo padrão não
    aparece na escolha de modelo do tipo.
