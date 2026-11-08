import { env } from './infrastructure/config/env.js';
import { buildContainer } from './infrastructure/config/container.js';
import { startIngestionScheduler } from './infrastructure/scraping/IngestionScheduler.js';
import { createApp } from './presentation/http/app.js';

const container = buildContainer();
const app = createApp(container);

app.listen(env.port, '0.0.0.0', () => {
  console.log(`Atalaya API listening on http://localhost:${env.port}/api`);
});

if (env.ingestionEnabled) startIngestionScheduler(container.ingestionJobs);
