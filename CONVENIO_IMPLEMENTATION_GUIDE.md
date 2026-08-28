# Guia de Implementacao de Convenio

Cada convenio deve entrar como modulo isolado dentro de `packages/convenios/src/<nome-do-convenio>`.

## Contrato obrigatorio

Implemente `ConvenioAdapter` com estas responsabilidades:

1. `openPortal`
2. `performLogin`
3. `locatePendingPayments`
4. `downloadArtifacts`
5. `interpretArtifacts`
6. `normalizeData`

## Regras de isolamento

- Nao colocar regras especificas do convenio no `ProcessingService`.
- Nao espalhar mapeamento TUSS dentro do parser.
- Nao escrever arquivos diretamente fora de `FileStorageService`.
- Nao acoplar o convenio a uma implementacao concreta de navegador.

## Passo a passo sugerido

1. Crie a pasta do convenio e os fixtures iniciais de teste.
2. Implemente `locatePendingPayments` com os metadados minimos do pagamento.
3. Implemente `downloadArtifacts` preservando o arquivo bruto.
4. Implemente `interpretArtifacts` apenas para leitura do layout do convenio.
5. Implemente `normalizeData` convertendo tudo para o modelo interno.
6. Registre os mapeamentos TUSS necessarios no repositorio apropriado.
7. Cubra o modulo com testes unitarios e fixtures pequenas.

## Modelagem esperada

O adapter deve entregar ao nucleo:

- `payment`
- `portalAmountCents`
- `procedures`
- `sourceMetadata`

Cada procedimento deve sair com:

- `guideNumber`
- `patientName`
- `serviceDate`
- `codigoOriginal`
- `description`
- `quantity`
- `amountCents`
- `glosaCents`
- `auxValuesCents`
- `institutionalAmountCents`
- `film`
- `codGlosa`
- `originalData`

## Checklist antes de integrar

- parser nao perde zeros a esquerda;
- valores monetarios estao em centavos inteiros;
- dados originais e transformados permanecem separados;
- validacao pre-ASA passa com fixture controlada;
- screenshots e erros de portal podem ser registrados no futuro `BrowserAgent`.
