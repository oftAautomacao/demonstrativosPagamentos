import { buildApp } from './app';

const { app, config } = await buildApp();

await app.listen({
  port: config.port,
  host: '0.0.0.0',
});

console.log(`Central de Demonstrativos ASA server em http://localhost:${config.port}`);
