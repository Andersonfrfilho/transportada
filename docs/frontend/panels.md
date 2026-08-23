# Painéis revelados

Regra do design system para **painel que nasce ao clicar**: formulário de edição que só é montado
depois de o operador pedir por ele.

Contrato: `test/design-system/panel-reveal.contract.ts`.

## O defeito que a regra fecha

Os editores inline deste produto são renderizados **depois** da lista que os abre — o deck coloca a
tabela primeiro e o formulário em seguida. Com a tabela cheia, o painel monta duas telas abaixo do
botão, sem rolagem e sem foco. Quem clicou em "Nova zona" vê a tela parada e conclui que o botão não
funciona; o formulário está lá, fora do campo de visão.

Conferir pelo DOM não pega isso: o `<form>` existe. Só quem está na tela vê o nada acontecer.

## A regra

Todo painel montado por ação do operador, que não seja diálogo, chama
`@/modules/shared/useRevealedPanel.hook`:

```tsx
const panelRef = useRevealedPanel<HTMLFormElement>()

return <form className={styles.panel} onSubmit={handleSubmit} ref={panelRef}>
```

Uma linha de import, uma de hook, um `ref`. O hook faz três coisas na montagem:

1. carimba `data-revealed-panel` no elemento — é o gancho da regra global de `scroll-margin`;
2. rola até ele com `block: 'start'`, suave, ou instantâneo se o sistema pedir menos movimento
   (`prefers-reduced-motion: reduce`);
3. foca o primeiro campo habilitado com `preventScroll: true`.

`block: 'nearest'` não serve: painel que nasce logo abaixo da dobra é considerado "perto o
bastante" e a tela não se move — o defeito continua. `preventScroll` não é detalhe: o scroll
síncrono do foco cancela a rolagem suave iniciada na linha de cima.

A margem do topo vem de uma regra global única em `src/styles/index.css`, e não de CSS de módulo:

```css
[data-revealed-panel] {
  scroll-margin-block-start: var(--space-4);
}
```

## Quem usa

Os quatro editores inline do produto: `FreightRegionForm`, `VehicleForm` e `DriverForm` (frota) e
`CteProfileForm`.

**Não se aplica a:**

- painel sempre visível (`CompanySettingsForm`, `NfseCredentialPanel`,
  `NfseEmissionProfilePanel`) — não há revelação, e rolar a tela ao abrir a página seria ruído;
- formulário dentro de diálogo — `useModalDialog` já prende o foco e o diálogo já está na frente.

## O que não foi unificado, e por quê

`revealField`, em `fleet/shared/driverUniqueness.service.ts`, revela **um campo** com erro: foca
primeiro e centraliza em seguida, instantâneo. É a ordem inversa da daqui, e o alvo é outro. Juntar
as duas exigiria um objeto de configuração para escolher entre dois comportamentos que nunca
coincidem — mais indireção do que as duas funções somadas. Ficam separadas de propósito.
