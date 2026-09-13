# ADR-0063 — A contratante conversa por e-mail, e a resposta dela decide a taxa

- **Data:** 2026-09-13
- **Estado:** proposta
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

1. **O sistema envia o e-mail da ocorrência e o da taxa**, com um `Reply-To` que é único por
   conversa e opaco (`r+<token>@<domínio de resposta>`). A resposta da contratante volta ao sistema
   por webhook do provedor e vira mensagem na conversa. O operador responde de dentro do app, e a
   resposta sai na mesma conversa da caixa dela.
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
   - **Autenticação do domínio aprovada** (DKIM alinhado ou SPF), segundo o resultado que o provedor
     anexa. Sem esse resultado, **nada decide por e-mail** (fail-closed), e a resposta vira mensagem.
   - **Token da conversa válido, e a taxa ainda `submitted`.** Resposta que chega depois de a taxa
     ser decidida vira mensagem marcada "chegou depois da decisão".
4. **Texto livre nunca decide, nem com a ajuda do operador.** Quando a resposta é ambígua, quem
   decide é o operador, pelo caminho que já existe, e a decisão dele cita a mensagem. A decisão
   continua sendo dele e fica registrada com o nome dele, não "interpretada".
5. **O e-mail recebido é evidência.** O original bruto fica no bucket privado, com `sha256`, e a
   linha de `delivery_charge_events` aponta para a mensagem que decidiu. É isso que transforma
   "fulano disse" em "está aqui o e-mail dela, com a assinatura do domínio".
6. **Provedor: Postmark**, nos dois sentidos, pela API HTTP. O Railway não recebe e-mail, e nos
   planos Free, Trial e Hobby bloqueia SMTP de saída. Enviar por HTTP tira a dependência do plano.

## Consequências

- Surge a **terceira superfície anônima** do produto (depois do postback da NFS-e e do lote da
  0048). O webhook do Postmark **não assina a requisição**: a guarda é Basic Auth na URL, comparada
  com `timingSafeEqual`, mais a lista de IPs do provedor. Isso vira achado datado em
  `docs/SECURITY.md`.
- O corpo da mensagem da contratante é dado pessoal em repouso, sem prazo de descarte (pelo mesmo
  motivo do rascunho da 070: é comprovante). Nunca entra em log.
- A contratante ganha uma **lista de contatos**. O `report_email` único continua para o relatório de
  fechamento; a migration só copia o valor dele para a lista.
- O motorista passa a ser avisado da decisão pela inbox do app. Hoje ele não é avisado de nada.
- Qualquer taxa pode ser decidida por qualquer um dos três caminhos (lote, portal, e-mail). Quem
  chegar primeiro vence, porque a transição já é idempotente e os outros dois recebem `unchanged`.

## Alternativas descartadas

| Alternativa                                    | Por que não                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Só portal, com e-mail avisando                 | A contratante não entra; o registro precisa estar na caixa dela                                    |
| Botões "Aprovar/Recusar" com link no e-mail    | Um link encaminhado decide por quem o recebeu, e o clique não deixa rastro na caixa da contratante |
| Interpretar texto livre ("pode aprovar, mas…") | Decisão financeira por palpite; o erro só aparece no fechamento, contra o cliente                  |
| Amazon SES                                     | Mais barato por volume, mas o recebimento passa por S3 + SNS, com mais peças a partir do Railway   |
| Cloudflare Email Workers                       | Parsing, remoção de citação e retentativa ficariam por nossa conta                                 |
| Caixa IMAP consultada pelo cron                | Senha de caixa como segredo, polling, e a ordem das mensagens deixa de ser do provedor             |
