import { createApp } from './app.js';
import { PORT } from './config.js';

// Boot order: schema -> loader -> listen (schema and loader are added once we have the data files).
async function main() {
  const app = createApp();
  app.listen(PORT, () => console.log(`api listening on :${PORT}`));
}

main().catch((err) => {
  console.error('boot failed', err);
  process.exit(1);
});
