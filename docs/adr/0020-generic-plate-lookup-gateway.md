# ADR-0020: Consulta de veículo por placa é um gateway genérico configurado por env

> **Substituída pela ADR-0032.** O desenho abaixo nunca teve provedor: não existe fonte pública e
> gratuita que combine placa e Renavam, e todo provedor de mercado cobra por consulta. O trilho foi
> removido do produto. Este documento fica como registro do desenho, e é o caminho a retomar se
> alguma instalação passar a contratar um provedor.

## Contexto

O cadastro de veículo tem doze campos e o operador digita todos à mão, olhando o CRLV. Placa,
Renavam, UF, tara, capacidade e os dados do proprietário são exatamente o que qualquer serviço de
consulta veicular devolve a partir da placa — e errar um dígito de Renavam ou de CNPJ do
proprietário só aparece na rejeição do MDF-e, horas depois.

Não existe um serviço único e oficial. O mercado brasileiro tem vários provedores pagos por
consulta, cada um com URL, autenticação e nomes de campo próprios (`placa` ou `plate`, `marcaModelo`
num campo só ou `marca` e `modelo` separados, `anoModelo` como número ou string), e a instalação de
cada transportadora contrata o que quiser — ou nenhum.

Escolher um provedor e escrevê-lo no código amarraria o produto a um contrato comercial que não é
nosso, e violaria a regra de que nenhuma regra ou fornecedor de transportadora específica entra no
código.

## Decisão

### 1. Uma porta de domínio, um gateway HTTP genérico, nenhum provedor no código

`FleetVehicleLookupPort` expõe um método: `lookupByPlate({ plate })` devolve `FleetVehicleLookup` ou
`null`. `createHttpVehicleLookupGateway` é a única implementação e não conhece provedor nenhum: lê
`FLEET_VEHICLE_LOOKUP_URL` e `FLEET_VEHICLE_LOOKUP_TOKEN` do ambiente, monta a chamada e traduz a
resposta.

A placa entra na URL por **placeholder** (`{placa}` ou `{plate}` no template) ou, se o template não
tiver placeholder, como query `?placa=`. O token, quando existe, vai em `Authorization: Bearer`.
Timeout de 8s com `AbortSignal.timeout` — consulta externa não pode segurar o request do operador.

### 2. A tradução do payload é política de domínio, não do gateway

`normalizeVehicleLookupPayload` (em `fleet/domain/`) recebe `unknown` e devolve o nosso formato:

- desembrulha envelope (`data`, `dados`, `resultado`, `result`, `veiculo`, `vehicle`) até 3 níveis;
- compara chaves **sem acento, caixa ou separador**, contra uma tabela de apelidos;
- trata `marcaModelo` combinado, quebrando no `/`;
- normaliza por tipo: só dígitos em Renavam, capacidade, tara, ano e documento do proprietário;
  placa e UF em maiúsculas sem separador;
- **descarta todo campo que não pedimos** — o que o provedor mandar além disso não entra no sistema;
- sem placa no payload, a resposta é `null` (o mesmo que "não encontrei").

Ficar no domínio, e não no gateway, é o que torna a regra testável sem rede: as tabelas de apelidos e
de normalização são o pedaço que muda quando a instalação troca de provedor, e são testadas como
função pura.

### 3. Ausência de configuração é um estado normal, não um erro de boot

Sem `FLEET_VEHICLE_LOOKUP_URL`, ou com a variável declarada e vazia, `vehicleLookup` é `null`: a API
sobe, `GET /fleet/vehicles/lookup` responde **503** `FLEET_VEHICLE_LOOKUP_UNAVAILABLE`, e
`GET /fleet/capabilities` responde `{ vehicleLookup: false }` — que é o que faz o botão "Buscar pela
placa" simplesmente não existir na tela. Variável vazia derrubar o boot seria uma armadilha em
qualquer ambiente que injeta env vazia por padrão.

Falha do provedor no meio da consulta (rede, timeout, status não-ok, JSON ilegível) vira **502**
`FLEET_VEHICLE_LOOKUP_FAILED`; placa desconhecida (404 do provedor, ou payload sem placa) vira
`null`, que o frontend traduz em "nenhum veículo encontrado". Cada um dos três é uma mensagem
diferente para o operador, porque cada um pede uma ação diferente.

### 4. Consultar exige `fleet.manage`, não `fleet.read`

O serviço é pago por consulta. Quem só lê a frota não gasta o saldo da transportadora — a permissão
da rota de lookup é a mesma do cadastro, e o gating é repetido no controller do frontend.

## Consequências

- Trocar de provedor é mudar duas variáveis de ambiente; se o provedor novo usar nomes de campo
  ainda não mapeados, acrescenta-se a linha na tabela de apelidos — sem tocar rota, use case ou tela.
- O token do provedor nunca é logado nem devolvido ao cliente: `/fleet/capabilities` expõe apenas o
  booleano.
- Marca, modelo e ano voltam na consulta mas **não têm campo no formulário** — servem para o operador
  conferir visualmente que a placa é o veículo certo antes de salvar.
- Campo vazio na resposta não apaga o que o operador já digitou: o preenchimento é aditivo.
- Não há cache. Se o custo por consulta virar problema, cachear por placa é a próxima decisão — e
  precisa de ADR próprio, porque dado de RENAVAM muda de dono.
