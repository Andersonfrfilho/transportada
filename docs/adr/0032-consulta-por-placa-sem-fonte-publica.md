# ADR 0032 — A consulta de veículo por placa sai do produto: não existe fonte pública

- Status: aceito
- Data: 2026-08-14
- Decisores: mantenedor do projeto e revisão Opus
- Substitui a ADR-0020

## Contexto

A ADR-0020 desenhou a consulta por placa como gateway genérico: uma porta de domínio, um cliente
HTTP que não conhece provedor nenhum, e `FLEET_VEHICLE_LOOKUP_URL`/`FLEET_VEHICLE_LOOKUP_TOKEN`
resolvendo quem responde em cada instalação. O desenho estava certo para o problema que ele atacava
— não amarrar o produto a um fornecedor. O que ele não resolvia é que **não há a quem se amarrar de
graça**.

O requisito que veio depois foi explícito: a consulta tem de ser **gratuita**. Levantando o que
existe hoje no Brasil:

- **Não há API pública e gratuita que combine placa e Renavam.** O Denatran/Senatran não publica
  consulta aberta por placa; o que existe de aberto é a consulta de débitos por estado, cada Detran
  com seu portal, com captcha, sem contrato de API e sem os campos do cadastro (tara, capacidade,
  proprietário).
- **Todo provedor de mercado é pago por consulta.** Sem exceção entre os que foram levantados: cobram
  por chamada, exigem contrato comercial, e a divergência de nomes de campo entre eles é exatamente
  o que a ADR-0020 mapeava com uma tabela de apelidos.
- O dado do proprietário é dado pessoal de terceiro. Uma fonte gratuita que o devolvesse sem
  contrato seria, com alta probabilidade, raspagem — o que este produto não faz.

O trilho ficou então em estado permanente de desligado: a variável nunca é preenchida, a capacidade
volta `false`, o botão não é renderizado. Código que só existe para nunca rodar é passivo: aparece
em typecheck, em revisão, em teste, e sugere na tela uma capacidade que não há.

## Decisão

### 1. O trilho de consulta por placa é removido inteiro

Saem da API: `FleetVehicleLookupPort` e `FleetVehicleLookup` da porta, o use case, a política de
tradução de payload, o gateway HTTP, a rota `GET /fleet/vehicles/lookup`, o parser de query, as duas
classes de erro (`FLEET_VEHICLE_LOOKUP_UNAVAILABLE`, `FLEET_VEHICLE_LOOKUP_FAILED`) e as duas
variáveis de ambiente.

Sai do frontend: o hook, o botão, a dica, o método do cliente HTTP, o adaptador de resposta, o
preenchimento aditivo do formulário e as cinco chaves de tradução.

`GET /fleet/capabilities` continua existindo — o catálogo FIPE de marca e modelo é consumidor próprio
dela — e passa a devolver **um** booleano, `vehicleCatalog`. Chave desconhecida na resposta continua
sendo resposta inválida no frontend, e é isso que impede a capacidade removida de voltar por descuido.

### 2. O Renavam continua sendo um campo do cadastro

O Renavam **não é artefato da consulta**: é dado do CRLV, que o operador tem em mãos, e é obrigatório
no MDF-e. Ele fica, digitado, exatamente como a placa.

### 3. Um contrato-guarda substitui as quatro suítes que morreram

`test/fleet-application/plate-lookup-removed.contract.ts` (API) e
`test/fleet/plate-lookup-removed.contract.ts` (frontend) falham se qualquer símbolo do trilho voltar
ao código, se as variáveis reaparecerem no `.env.example`, ou se esta ADR deixar de constar como
substituta da 0020. Reintroduzir a consulta exige, por construção, mexer nesta decisão antes de
mexer no código.

## Consequências

- O cadastro de veículo é inteiramente digitado, conferindo o CRLV. É o que já acontecia em toda
  instalação, porque nenhuma tinha provedor contratado.
- Errar um dígito de Renavam continua aparecendo só na rejeição do MDF-e. A mitigação disponível sem
  provedor é validação de formato e conferência visual, não consulta.
- Se um dia houver fonte gratuita — ou se uma instalação quiser pagar por uma —, o desenho da
  ADR-0020 continua sendo o caminho certo: porta de domínio, gateway genérico por env, capacidade
  booleana. Voltar atrás é reverter esta decisão com ADR nova, não descomentar código morto.
- Menos uma variável de ambiente por deploy e menos um caminho de erro (502/503) na superfície da API.
