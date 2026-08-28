# Central de Demonstrativos ASA

Base local para automatizar a captura, processamento, validacao pre-ASA e conferencia manual de demonstrativos de pagamento de convenios medicos.

## Stack

- Node.js + TypeScript strict
- Fastify para API/agente local
- React + Vite para interface web
- Playwright encapsulado por `BrowserAgent`
- Persistencia local em arquivos dentro de `storage/`
- Vitest, ESLint e Prettier

## Estrutura principal

```text
apps/
  server/   API local, scheduler, orquestracao do fluxo
  web/      Interface React
packages/
  asa/      Geracao e validacao do XLSX ASA
  browser/  Abstracao de navegador e implementacao Playwright
  convenios/ contratos e adapter DEMO
  domain/   Modelos, enums, ids e utilitarios monetarios
  storage/  Persistencia local e historico de arquivos
  tuss/     Repositorio e servico de mapeamento TUSS
storage/
  originais/
  processados/
  asa/
  runtime/
tests/
  support/
```

## Instalacao

```bash
npm install
```

## Configuracao

1. Crie um `.env` a partir de `.env.example`.
2. Ajuste portas e `ASA_STORAGE_ROOT` se necessario.
3. Para convenios reais, preencha as credenciais com `PORTAL_<CONVENIO>_USERNAME` e `PORTAL_<CONVENIO>_PASSWORD`.

## Executar em desenvolvimento

```bash
npm run dev
```

- Web: `http://localhost:3000`
- API local: `http://localhost:3333`

## Rodar testes e lint

```bash
npm run test
npm run lint
```

## Fluxo DEMO

O sistema inicializa com um convenio `DEMO` que:

1. localiza um pagamento ficticio;
2. preserva um CSV original em `storage/originais`;
3. normaliza os dados;
4. aplica um mapeamento TUSS de exemplo;
5. gera o XLSX ASA em `storage/asa`;
6. valida totais antes do ASA;
7. publica o demonstrativo na interface.

O botao `Executar agora` repete esse fluxo e atualiza o demonstrativo DEMO.

## Comandos uteis

```bash
npm run dev --workspace @asa/server
npm run dev --workspace @asa/web
npm run build
```
