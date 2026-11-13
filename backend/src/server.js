import { createApp } from './app.js';
import { PORT, DATA_DIR } from './config.js';
import { applySchema } from './db.js';
import { loadData } from './loader.js';

// Boot order: schema -> loader -> listen.
async function main() {
  await applySchema();
  console.log('schema ready');
  const { skipped } = await loadData();
  console.log(`data loaded from ${DATA_DIR} (${skipped.length} seed rows skipped)`);
  const app = createApp();
  app.listen(PORT, () => console.log(`api listening on :${PORT}`));
}

main().catch((err) => {
  console.error('boot failed', err);
  process.exit(1);
});
