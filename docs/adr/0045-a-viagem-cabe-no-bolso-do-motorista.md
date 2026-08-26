# ADR 0045 — A execução da viagem é contrato de domínio, e a posição carimba sem seguir

- Status: aceito
- Data: 2026-08-26
- Decisores: mantenedor do projeto e revisão Opus
- Fecha a decisão da spec 057
- Depende da **ADR-0043** (a nota anda pela viagem: sem `trip_stops` e sem máquina de estados não há o
  que reportar)
- **Nota de numeração:** a spec 057 pede "ADR 0043". Aquele número já era da 056 quando a 057 foi
  escrita; esta ADR é a mesma decisão, com o número livre.

## Contexto

Depois de `dispatched` o produto perde o motorista. O que acontece na rua volta por WhatsApp, foto de
canhoto e ligação — horas depois, para alguém digitar. O escritório descobre a entrega quando o
motorista volta ao barracão.

Isso tem uma consequência que não é só de conveniência: `trip_stops.arrived_at` e `completed_at` são
colunas que **nada no sistema escreve**. A mediana de tempo de serviço da 058 devolve o padrão da
empresa para sempre, e a margem por viagem da 061 não tem custo real. Não é uma tela faltando; é a
fonte de dado faltando.

## Decisão

### 1. As rotas são de domínio, não de tela

O app nativo vem depois, e o WhatsApp talvez venha. Se as rotas nascerem desenhadas para uma tela, os
dois canais seguintes viram tradução — e tradução de regra é onde a regra se bifurca.

Então o contrato é `chegou na parada N`, `entregou o documento X`, `não entregou o documento X por Y`.
Quem chama — PWA hoje, app amanhã, webhook de conversa depois — é irrelevante para o caso de uso.

**O corolário é uma proibição:** nenhuma regra de viagem mora em componente React. O PWA é casca sobre
`/me/trips/*`. E a prova disso não é uma promessa em documento — é a suíte E2E chamando as rotas **sem
browser nenhum**. Se um dia ela precisar de um browser para passar, a regra vazou.

### 2. O motorista não escolhe id, porque quem não escolhe não enumera

`GET /me/trips/current` não tem parâmetro de viagem. O servidor resolve
`membership → fleet_driver → trip_drivers → trip` e devolve a viagem em `dispatched` ou `in_transit`
daquele motorista.

Não existe `GET /trips/:id` para o papel `driver`. Passar id no cliente é convidar a trocar o id, e o
BOLA (OWASP API1) é o campeão de vulnerabilidade em REST justamente aí. A autorização por objeto que
o `security.md` §2 exige fica trivial quando não há objeto a escolher.

`driver` e `aggregate` já têm `['trip.read', 'trip.report']` reservados e sem consumidor. Esta é a
feature que os consome. **Nenhuma permissão nova nasce**, e nenhum dos dois papéis ganha `trip.manage`
ou `fleet.manage`.

O agregado vê a mesma tela do motorista próprio: ele precisa exatamente das mesmas informações para
entregar, e uma segunda variante por causa de vínculo trabalhista seria complexidade sem função.

### 3. A coordenada carimba a entrega e não segue a pessoa

O celular dá a coordenada, e ela vale como prova: é o que separa "entreguei" de "entreguei _lá_".
`Permissions-Policy` passa a `geolocation=(self)`, e a captura é `getCurrentPosition` **uma vez por
confirmação** — nunca `watchPosition`.

Três limites, e nenhum é opcional:

1. **A recusa não bloqueia.** GPS desligado, sem sinal no galpão, permissão negada — a entrega é
   confirmada mesmo assim, com `location: null`. Produto que exige coordenada para aceitar entrega é
   produto que o motorista contorna anotando no papel, e aí não há dado nenhum.
2. **A coordenada é da entrega, não da pessoa.** Ela mora em `trip_stop_events`, presa ao evento, e
   nunca numa tabela de posição do motorista. **Não existe "onde ele está agora"** — só "onde estava
   quando confirmou". Essa ausência é a decisão, não uma etapa futura.
3. **Ela tem prazo: 90 dias**, com expurgo **implementado**, não documentado. Depois disso resta o
   evento sem a coordenada. Dado de localização de pessoa identificada é dado pessoal na LGPD, e reter
   para sempre "por garantia" transforma comprovante em passivo.

Rastreamento contínuo é decisão diferente, com consentimento próprio do motorista, e não está aqui.

### 4. Coordenada ruim é gravada com a precisão, nunca descartada

`0,0` e precisão de 5 km entram no banco com a precisão ao lado, e o escritório vê as duas coisas.
Descartar em silêncio o que parece absurdo é decidir pelo operador com base num palpite do código —
e o galpão de laje com precisão de quilômetro é o caso normal, não o suspeito.

### 5. Offline é requisito, e a tela não mente sobre ele

O motorista entra no subsolo do shopping e sai sem sinal por vinte minutos. Se o toque em "entreguei"
falhar ali, ele para de usar o produto no mesmo dia.

Toda confirmação vai para fila local em IndexedDB, drenada quando a rede volta. Duas coisas fazem
isso funcionar de verdade:

- **Idempotência no servidor**, não no cliente: cada confirmação carrega um id gerado no celular, e o
  servidor o guarda no padrão `*_processed_messages` que os workers já usam. Reenvio da fila não
  duplica entrega, e dois celulares logados no mesmo motorista também não.
- **A tela diz a verdade**: confirmação na fila aparece como "aguardando envio", nunca como enviada.
  Mentir sobre sincronização é pior que não ter offline — o motorista confia uma vez.

### 6. A ocorrência é matéria-prima, não conclusão

Entrega que sai do previsto é rotina, e hoje o motivo volta por WhatsApp e morre lá. O botão de
ocorrência existe em qualquer parada, a qualquer momento, com tipo de lista fechada e foto opcional.

Três regras que fazem isso ser usado em vez de contornado:

1. **Não pede decisão.** O motorista não escolhe valor, não classifica custo, não julga culpa. Ele
   descreve o que viu. Quem decide é o escritório, com a 060 na mão.
2. **É independente da entrega.** Ele esperou duas horas _e_ entregou; os dois fatos convivem. Forçar
   a ocorrência a ser motivo de não-entrega perderia o caso mais comum.
3. **Vai pela mesma fila offline**, com a mesma idempotência. Problema costuma acontecer exatamente
   onde o sinal é ruim.

### 7. A assinatura colhe traço e nome, e não colhe CPF

Puxar CPF de recebedor para dentro do sistema por causa de um comprovante é dado pessoal novo, com
criptografia em repouso, retenção e trilha próprias — desproporcional ao ganho, porque quando a
disputa acontece é o canhoto em papel que a resolve.

Se o valor legal da assinatura digital virar exigência de cliente ou de seguradora, isso é decisão
nova, e ela traz o CPF junto com o custo dele.

O arquivo vai para o bucket privado via `stored_objects`, com entrega por presigned curta e **chave
sem nome de pessoa** (`security.md` §7).

### 8. Navegar é delegar

O botão abre `geo:` / `maps.google.com` com o endereço da parada, no app que a pessoa já usa e já
confia. Construir navegação própria é competir com o Google Maps para entregar uma seta pior.

## Consequências

- A 058 passa a medir tempo de serviço real em vez de devolver o padrão da empresa, sem alterar uma
  linha do solver.
- A 061 ganha o custo real de viagem que hoje ela não teria como calcular.
- A 060 recebe a ocorrência de cobrança como matéria-prima da taxa sugerida.
- Um app nativo futuro é uma casca nova sobre o mesmo contrato — não uma reescrita de regra.
- **O que não se ganha:** posição do motorista em tempo real. Quem quiser isso terá de abrir uma
  decisão nova, com consentimento próprio, e ela não se resolve estendendo esta.

## Alternativas descartadas

| Alternativa                                        | Por que não                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| App nativo primeiro                                | Instalação é a barreira, não o recurso. O PWA entrega hoje, e o contrato da §1 mantém o app barato depois.        |
| `GET /trips/:id` com checagem de vínculo           | Funciona e é frágil: basta um caminho esquecer a checagem. Não ter id a passar é a versão que não se esquece.     |
| Exigir coordenada para aceitar entrega             | Vira papel na mão do motorista, e o dado some inteiro em vez de vir parcial.                                     |
| `watchPosition` durante a viagem                   | É rastreamento de pessoa com outro nome, e pede consentimento que esta spec não colheu.                          |
| Fila offline sem idempotência no servidor          | Duplica entrega no primeiro reenvio, e o segundo celular logado duplica de novo.                                 |
| Ocorrência como motivo de não-entrega              | Perde o caso mais comum, que é o problema **com** entrega feita.                                                 |
