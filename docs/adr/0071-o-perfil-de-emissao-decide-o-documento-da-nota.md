# ADR-0071 — O perfil de emissão decide o documento da nota, e a conta é uma só

- **Status:** aceita
- **Data:** 2026-09-23
- **Decisores:** usuário (escolha da fonte da verdade), na conversa da spec 175
- **Fecha:** a T201 da spec 175 (`specs/175-o-documento-que-a-nota-espera/`)
- **Substitui em parte:** a spec 065 D3 (`resolveFiscalDocumentKind` como resposta autônoma)
- **Complementa:** a spec 144 D3 (`classifyDocumentOutput`) e a ressalva de ADR-0047 sobre o par
  origem→destino

## Contexto

Duas políticas respondem hoje à mesma pergunta — "que documento fiscal esta nota espera?" — e podem
discordar sobre a mesma nota.

`classifyDocumentOutput` (`apps/api-transportada/src/cte-profiles/domain/document-output.policy.ts:40`,
spec 144) decide a partir do **perfil de emissão** que rege a nota, devolve `cte | nfse | blocked |
no_profile` e, quando é `nfse`, devolve junto o `nfseProfileId`. Alimenta a coluna "Documento" da tela
de notas e a volumetria do bot de WhatsApp.

`resolveFiscalDocumentKind` (`apps/api-transportada/src/trips/domain/fiscal-document-kind.policy.ts:38`,
spec 065) decide comparando o **código IBGE** do município de destino com o da transportadora, devolve
`cte | nfse | null` e não sabe nada de perfil. Alimenta o `expectedDocument` da prontidão fiscal da
viagem.

A divergência não é hipotética: um perfil configurado para CT-e numa entrega dentro do próprio
município produz `cte` numa tela e `nfse` na outra. A própria política de 144 registra por que isso é
proibido — _"uma segunda conta ao lado delas faria a tela e o bot discordarem da mesma nota"_ — e a
spec 175 ia consagrar a divergência ao pôr o botão de emissão sob a conta de município.

Há ainda a assimetria de riqueza: só a conta do perfil sabe **qual** perfil de NFS-e rege a nota. A
conta de município diz o tipo e para por aí, e por isso a linha da viagem não teria como levar o
operador direto ao perfil certo.

## Decisão

1. **`classifyDocumentOutput` é a fonte única do documento de saída por nota.** Toda tela, rota e
   automação que precise saber o que a nota espera deriva dela — a tela de notas, a prontidão fiscal
   da viagem, o bot, e o botão da linha.
2. **A regra de município deixa de ser uma conta paralela e vira entrada da conta do perfil.**
   `resolveFiscalDocumentKind` continua existindo como função de domínio, mas nenhum consumidor a
   chama para decidir sozinho: quem decide é a política do perfil, que a consulta quando precisar.
3. **`expectedDocument` da prontidão passa a sair da fonte única**, e a resposta passa a transportar
   o `nfseProfileId` quando o documento esperado for NFS-e. Chave nova e opcional: o bundle aceita
   antes de a API emitir (frontend tolerante primeiro).
4. **Os estados que só a conta do perfil tem (`blocked`, `no_profile`) chegam à viagem** em vez de
   serem achatados em "espera CT-e". Nota sem perfil não ganha ação de emissão — não se emite o que
   não se sabe emitir.
5. **Um contrato prova que existe uma conta só.** Nenhuma tela pode voltar a chamar
   `resolveFiscalDocumentKind` para decidir documento de saída; o teste falha se alguém o fizer.

## Consequências

- A prontidão fiscal da viagem passa a depender do perfil de emissão. Nota cujo perfil ainda não foi
  configurado aparece como `no_profile` em vez de aparecer, errado, como "espera CT-e" — é mudança
  visível de comportamento, e é a correção de um defeito, não uma regressão.
- A linha da viagem passa a saber qual perfil de NFS-e rege a nota, o que resolve sem custo o problema
  que a spec 175 tinha deixado em aberto: como a linha saberia, antes do clique, que falta perfil.
- A conta de município deixa de decidir sozinha, e com isso a ressalva de ADR-0047 (a regra completa é
  o par origem→destino, e `originCityCode` entra na assinatura sem ser usado) deixa de ser urgente:
  ela vira detalhe interno de uma entrada, não a palavra final sobre a nota.
- Quem consome `expectedDocument` hoje continua funcionando: o tipo do campo não muda, só a origem do
  valor e os estados novos que ele passa a admitir.

## Alternativas descartadas

- **Município como fonte única**: mais simples de explicar, mas ignora o perfil que o operador
  configurou e joga fora o `nfseProfileId`. Faria a tela de notas passar a discordar do que o próprio
  cadastro diz.
- **Perfil decide e município alerta a divergência**: mais seguro no papel, mas exige desenhar onde o
  aviso aparece e o que o operador faz com ele. Fica disponível como evolução se a divergência se
  mostrar frequente — o que só se sabe depois de haver uma conta só para comparar.
- **Manter as duas**: é o estado atual, e é o defeito.
