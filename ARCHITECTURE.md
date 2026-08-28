# Architecture

## Visao geral

O projeto foi separado em `apps` e `packages` para evitar um nucleo monolitico:

- `apps/server` concentra API, scheduler, credenciais e orquestracao.
- `apps/web` apenas consome a API e registra a conferencia manual.
- `packages/*` contem regras de dominio e adapters reutilizaveis.

## Responsabilidades por modulo

### `packages/domain`

- enums de status;
- modelos padronizados (`Payment`, `Demonstrative`, `Guide`, `Procedure`);
- utilitarios monetarios em centavos inteiros;
- geracao de ids.

### `packages/convenios`

- contrato comum `ConvenioAdapter`;
- separacao entre abrir portal, login, localizar pagamentos, baixar arquivos, interpretar e normalizar;
- implementacao inicial `DEMO`.

### `packages/browser`

- interface `BrowserAgent`;
- implementacao `PlaywrightBrowserAgent`;
- stub `ClaudeBrowserAgent` para futura extensao.

### `packages/tuss`

- repositorio e servico de mapeamento TUSS;
- aplicacao centralizada de conversoes;
- rastreio de qual regra foi usada.

### `packages/asa`

- geracao do XLSX na ordem exigida pelo ASA;
- validacao pre-ASA;
- deteccao de duplicidades, divergencias e campos obrigatorios.

### `packages/storage`

- historico de arquivos em `storage/originais`, `storage/processados` e `storage/asa`;
- calculo SHA-256;
- persistencia do estado da aplicacao em JSON.

## Fluxo atual

1. `ProcessingService` executa o `ConvenioAdapter`.
2. O adapter retorna pagamento pendente, artefatos e dados normalizados.
3. O backend aplica TUSS, monta `Guide`/`Procedure`, salva originais e processados.
4. O modulo `asa` gera o XLSX e valida os totais.
5. O demonstrativo fica com status `WAITING_MANUAL_ASA_IMPORT` ou `PRE_ASA_DIVERGENCE`.
6. A interface permite revisar o resultado e registrar a conferencia manual do ASA.

## Evolucao planejada

- adicionar repositorio persistente para mapeamentos TUSS pela interface;
- plugar SQL Server do ASA no futuro modulo de conciliacao;
- implementar adapters reais por convenio sem tocar no nucleo;
- substituir ou complementar o `BrowserAgent` com estrategias baseadas em IA.
