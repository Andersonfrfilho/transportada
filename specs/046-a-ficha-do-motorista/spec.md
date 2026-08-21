# 046 — A ficha do motorista

> ⚠️ **Esta spec é registro posterior.** O código descrito abaixo já está em `main`..`HEAD`, escrito
> a partir de auditoria de tela em conversa, não de um `tasks.md`. Isso viola a regra "uma task por
> vez, tirada do `tasks.md` da feature" — e o remédio não é apagar o desvio, é deixá-lo legível: as
> tasks vêm marcadas com o commit que as fechou, e o que **não** foi feito continua aberto, com o
> motivo. A alternativa (seguir sem spec) apagaria as três decisões abertas ao fim deste documento,
> que são justamente as caras.

## Problema e resultado

O cadastro de motorista sabia nome, CPF, telefone e veículos. Não sabia onde a pessoa mora, quando a
CNH vence, nem quantos anos ela tem — e o MDF-e, o contrato de agregado e a conferência de
habilitação pedem essas três coisas fora do produto, no papel ou no WhatsApp.

Três campos do formulário também eram digitação livre onde existe lista fechada: cidade, usuário
vinculado e as duas datas. Digitação livre em lista fechada não erra na hora; erra no relatório, seis
meses depois, quando "Sao Paulo", "S. Paulo" e "SÃO PAULO" são três cidades.

**Resultado:** a ficha guarda endereço, nascimento e validade da CNH; cidade vem do IBGE, usuário
vinculado vem da lista de vínculos da empresa, data vem do calendário do produto. O CEP preenche o
resto do endereço.

## Fora do escopo

- **Aviso de CNH a vencer.** `NOTIFICATION_TEMPLATE_KEY` tem três chaves e nenhuma é de habilitação.
  Chave nova + agendamento + cron é feature própria, e prometer o aviso no texto de ajuda sem ele
  existir foi defeito corrigido em `87d1067`.
- **Consumo dos campos novos.** Nada além do próprio CRUD lê `birth_date`, `license_number`,
  `license_expires_at` ou endereço. O MDF-e não passou a levá-los.
- **Criptografia em repouso.** Decidida pela ADR-0039, **não executada** aqui — ver a decisão 3.

## Histórias priorizadas

### P1 — O endereço se preenche pelo CEP

**Given** um motorista sendo cadastrado
**When** o operador digita os oito dígitos do CEP
**Then** logradouro, bairro, cidade e UF chegam preenchidos, e o operador completa número e
complemento.

### P1 — A cidade é lista, não texto

**Given** a UF já escolhida
**When** o operador abre o campo de cidade
**Then** a lista traz os municípios daquela UF, com busca; sem UF, ou com o provedor fora do ar, o
campo volta a ser digitável — cadastro não para por causa de lista.

### P1 — O usuário vinculado é lista, não UUID

**Given** um operador com `users.manage`
**When** ele abre o campo de usuário vinculado
**Then** ele escolhe a pessoa pelo nome, e o que é gravado é o `membershipId` dela; sem a permissão o
campo volta a ser digitável, porque quem cuida da frota sem administrar usuários ainda precisa
cadastrar motorista.

### P2 — Data é calendário do produto

**Given** os campos de nascimento e validade da CNH
**When** o operador clica neles
**Then** abre o `DatePicker` do design system, nunca o campo nativo do navegador.

## Requisitos funcionais

- `fleet_drivers` guarda `birth_date`, `license_expires_at` e o endereço em sete colunas
  (`postal_code`, `street`, `number`, `complement`, `district`, `city`, `state`).
- CNH é única por empresa **quando preenchida** — índice parcial, porque o campo é opcional e string
  vazia não é colisão.
- CEP guardado sem máscara, oito dígitos; UF em duas letras maiúsculas; a canonicalização é do lado
  de quem grava, não do formulário.
- Cidade e usuário vinculado degradam para digitação quando a lista não existe (sem UF, sem
  permissão, provedor fora do ar, empresa recém-instalada).
- O que já está gravado continua escolhível, mesmo fora da lista de hoje — vínculo suspenso, cidade
  que o IBGE deixou de listar.

## Requisitos não funcionais

- Nenhum dado de motorista em log, em nenhum nível.
- Busca externa com debounce, mínimo de caracteres e `AbortSignal` por tecla — provedor público não é
  nosso, e rajada de requisição por tecla digitada é abuso.
- Provedor fora do ar entrega menos resultado, nunca erro de tela.

## Casos extremos e falhas

| Caso                                     | Comportamento                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| CEP que nenhum provedor conhece          | campo fica como digitado, endereço em branco, sem erro                           |
| Um dos dois provedores de CEP fora do ar | o outro responde (`Promise.any`)                                                 |
| Photon e Nominatim discordam             | as duas listas aparecem (`Promise.allSettled`)                                   |
| UF fora das 27                           | nem sai requisição — o provedor responderia 404 e o campo carregaria para sempre |
| Vínculo suspenso já gravado na ficha     | continua na lista, senão salvar sem tocar no campo o apagaria                    |
| Data digitada com século errado          | `fleet_drivers_dates_check` recusa antes de 1900                                 |

## Critérios de aceite

- `test/fleet-schema/drivers.contract.ts` e `test/fleet-http/drivers.contract.ts` cobrem as colunas,
  os CHECKs e o índice parcial.
- `test/fleet/driver-city-select.contract.ts` e `test/fleet/driver-membership-select.contract.ts`
  cobrem as duas listas e as duas degradações.
- `test/design-system/date-picker.contract.ts` falha se um campo de data nativo reaparecer.
- Gates de API e frontend verdes.

## Decisões abertas

Nenhuma bloqueia o que já está em produção; todas três precisam de ADR antes de virar código.

1. ~~**Consulta externa: navegador ou proxy na API?**~~ Decidida pela **ADR-0037** (status `aceito`)
   e executada em T007-A: o que mandava o endereço inteiro era a geocodificação que alimentava o
   mapa, não o preenchimento — o mapa saiu, o Nominatim saiu por política que o navegador não deixa
   cumprir, a consulta de CEP (oito dígitos, sem identificador) ficou, e **não** há proxy, porque
   hoje o endereço não passa pela nossa infraestrutura e o proxy nos daria essa passagem de graça.
2. ~~**CSP.**~~ Publicada em T008, requisito autônomo do §3 do baseline. Ela nasce no **build**, e não
   no runtime, porque as origens da API e do Keycloak são inlinadas no bundle e não existem no
   contêiner que serve o `dist`; o `server.ts` lê o arquivo emitido e se recusa a subir sem ele.
   `connect-src` fecha em `brasilapi.com.br`, `viacep.com.br`, `photon.komoot.io`, a API e o Keycloak,
   com `frame-src 'none'`. A lista de municípios do IBGE **já estava coberta**: ela anda pela
   BrasilAPI, e foi a varredura de origens do contrato que mostrou isso — não a lista escrita à mão.
3. ~~**Criptografia em repouso.**~~ Decidida pela **ADR-0039** (status `aceito`): `birth_date`,
   `license_number`, endereço e telefone vão para um envelope A256GCM **porque não têm leitor** — é o
   momento mais barato que vai existir, e a leitura coluna por coluna mostrou que a tabela não tem uma
   resposta só. `tax_id` fica em claro por decisão registrada: ele **já tem leitor** (o MDF-e), e o
   mesmo CPF está em claro no payload congelado, comprometido por hash, e no XML preservado —
   criptografá-lo protegeria o motorista que nunca rodou e cobraria a unicidade, o CHECK e o caminho
   de outra app. `name` e `license_expires_at` ficam em claro por serem o que se consulta. Executar é
   spec própria: a contração é destrutiva.
