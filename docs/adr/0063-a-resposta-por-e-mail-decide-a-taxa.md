# ADR-0063 — A contratante conversa por e-mail, e a resposta dela decide a taxa

- **Data:** 2026-09-13
- **Estado:** aceita (2026-09-13), com emenda no mesmo dia: o provedor passou de Postmark a Resend
- **Contexto:** **revoga uma linha** da tabela de alternativas descartadas da **ADR-0048** —
  _"Relatório por e-mail e alguém marca aprovado"_. Mantém tudo o mais da 0048: o lote com token
  anônimo, a máquina de estados de `delivery_charges` e o portal da **ADR-0050** continuam existindo.
  Habilita a **spec 143**.

## Contexto

A 0048 recusou o e-mail porque, nele, _"a decisão fica fora do sistema, e a trilha vira 'fulano disse
que o cliente aprovou'"_. O diagnóstico estava certo sobre o e-mail **lido por uma pessoa**. O que
não se sustentou foi a premissa por trás da recusa: a de que a contratante entraria num lugar nosso,
seja o link do lote ou o portal, para decidir.

Ela não entra. O e-mail é o **registro de atividade do lado dela**: é na caixa de entrada que a
operação da contratante guarda o que combinou com cada transportadora, e um link que abre uma tela
nossa não deixa rastro nenhum ali. Hoje o produto já admite isso pela metade. A spec 079 renderiza o
"e-mail ao embarcador" (`register-trip-occurrence.use-case.ts:187`) e o devolve ao operador, que o
envia **da própria caixa**. A resposta volta para essa caixa pessoal e nunca chega ao sistema. É
exatamente a trilha "fulano disse" que a 0048 quis evitar, e ela já existe; só não é nossa.

## Decisão

1. **O sistema envia o e-mail da ocorrência e o da taxa**, com um `Reply-To` único por conversa e
   opaco (`<token>@<subdomínio de resposta>`). A resposta da contratante volta ao sistema por webhook
   do provedor e vira mensagem na conversa. O operador responde de dentro do app, e a resposta sai na
   mesma conversa da caixa dela.
2. **A resposta decide a taxa**, e só a taxa. A decisão é a mesma transição `submitted → approved` ou
   `submitted → rejected` que o lote e o portal já fazem (`delivery-charge-state.policy.ts`). Não
   existe estado novo, só um terceiro autor da decisão.
3. **Uma resposta decide só se passar por quatro portões**, e a falha em qualquer um deles
   rebaixa a resposta a mensagem. Ela nunca é descartada e nunca decide pela metade:
   - **Palavra-chave na primeira linha não vazia:** `APROVADO`, ou `RECUSADO` seguido de um motivo
     opcional. Sem distinguir caixa nem acento. Qualquer outro texto não decide, por mais claro que
     pareça a uma pessoa.
   - **Remetente na lista da contratante**, marcado como quem pode decidir. Estar na lista não
     basta: quem só acompanha a operação recebe o e-mail e não decide.
   - **DKIM válido e alinhado ao domínio do `From`, verificado por nós** sobre o MIME bruto, com a
     `mailauth`, no momento em que o e-mail chega. A prova não depende do provedor: é a chave
     pública publicada no DNS da contratante conferindo a assinatura do e-mail que ela mandou.
     **SPF não entra.** Ele confere o remetente do envelope, não o `From`, e só pode ser avaliado
     por quem recebeu a conexão, que é o provedor, não nós. Sem DKIM alinhado, **nada decide por
     e-mail** (fail-closed), e a resposta vira mensagem.
   - **Token da conversa válido, e a taxa ainda `submitted`.** Resposta que chega depois de a taxa
     ser decidida vira mensagem marcada "chegou depois da decisão".
4. **Texto livre nunca decide, nem com a ajuda do operador.** Quando a resposta é ambígua, quem
   decide é o operador, pelo caminho que já existe, e a decisão dele cita a mensagem. A decisão
   continua sendo dele e fica registrada com o nome dele, não "interpretada".
5. **O e-mail recebido é evidência.** O original bruto fica no bucket privado, com `sha256` e o
   resultado da verificação de DKIM, e a linha de `delivery_charge_events` aponta para a mensagem
   que decidiu. É isso que transforma "fulano disse" em "está aqui o e-mail dela, com a assinatura do
   domínio".
6. **Provedor: Resend, nos dois sentidos, pela API HTTP. A Cloudflare continua só como DNS.** O
   Resend já envia pelo domínio da transportadora (`resend._domainkey` e o subdomínio `send.`
   publicados), então o envio não pede DNS novo. O recebimento pede um MX, no subdomínio de
   resposta, sem tocar no MX raiz, que é do Zoho. O Railway não recebe e-mail, e enviar por HTTP
   tira a dependência do plano dele.
7. **A configuração é uma página do produto, não variável de ambiente.** Cada instalação usa o
   subdomínio da própria transportadora (ADR-0021), e quem configura é o administrador dela. A chave
   de API do Resend e o segredo de assinatura do webhook ficam selados por empresa, no mesmo padrão
   da credencial da Nota RP: envelope A256GCM, o `ENCRYPTION_KEYRING_JSON` que já existe, e a API
   nunca os devolve. A página mostra a URL do webhook para colar no painel do Resend e confere o
   que der para conferir (chave, domínio, MX, teste de ida e volta).

## Consequências

- Surge a **terceira superfície anônima** do produto (depois do postback da NFS-e e do lote da
  0048). Diferente das duas, **ela é assinada**: o Resend assina o webhook por Svix (HMAC-SHA256
  sobre `id.timestamp.corpo`), e a rota confere a assinatura com `timingSafeEqual`, com janela de
  tempo e sem aceitar o mesmo `svix-id` duas vezes.
- O webhook traz **só metadados**. O corpo, os anexos e o MIME bruto são buscados pelo worker na
  API do Resend, então a rota pública nunca recebe corpo grande, e o limite de 1 MiB da API continua
  valendo para ela.
- **Dependência nova: `mailauth`** (MIT, postalsys, mantida ativamente). Verificação de DKIM à mão é
  o tipo de código que diverge calado. Ela declara Node ≥ 22.19, e a compatibilidade com o Bun é
  spike antes de ela entrar.
- A chave do Resend que lê e-mails recebidos alcança **toda a caixa de entrada da conta**. Ela fica
  selada e nunca sai da API e do worker, e isso vira achado datado em `docs/SECURITY.md`.
- O corpo da mensagem da contratante é dado pessoal em repouso, sem prazo de descarte (pelo mesmo
  motivo do rascunho da 070: é comprovante). Nunca entra em log.
- A contratante ganha uma **lista de contatos**. O `report_email` único continua para o relatório de
  fechamento; a migration só copia o valor dele para a lista.
- O motorista passa a ser avisado da decisão pela inbox do app. Hoje ele não é avisado de nada.
- Qualquer taxa pode ser decidida por qualquer um dos três caminhos (lote, portal, e-mail). Quem
  chegar primeiro vence, porque a transição já é idempotente e os outros dois recebem `unchanged`.

## Alternativas descartadas

| Alternativa                                    | Por que não                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Só portal, com e-mail avisando                 | A contratante não entra; o registro precisa estar na caixa dela                                                                                                               |
| Botões "Aprovar/Recusar" com link no e-mail    | Um link encaminhado decide por quem o recebeu, e o clique não deixa rastro na caixa da contratante                                                                            |
| Interpretar texto livre ("pode aprovar, mas…") | Decisão financeira por palpite; o erro só aparece no fechamento, contra o cliente                                                                                             |
| Postmark                                       | Foi a primeira versão desta ADR. Trocado no mesmo dia: o webhook dele não é assinado, o domínio teria de ser configurado do zero, e o Resend já envia por esta transportadora |
| Cloudflare Email Service                       | O envio está em beta e pede o plano pago de Workers; o recebimento por Email Worker deixaria parsing e retentativa por nossa conta                                            |
| Amazon SES                                     | O recebimento passa por S3 + SNS, com mais peças a partir do Railway                                                                                                          |
| Caixa IMAP consultada pelo cron                | Senha de caixa como segredo, polling, e a ordem das mensagens deixa de ser do provedor                                                                                        |
