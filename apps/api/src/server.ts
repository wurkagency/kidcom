import { createApp } from "./app";
import { config } from "./config";
import { ensureSystemCategories } from "./lib/categories";

// Reference data the app relies on, reconciled before serving requests.
ensureSystemCategories()
  .then(() => {
    const app = createApp();
    app.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`KidCom API listening on port ${config.port} (${config.nodeEnv})`);
    });
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Startup failed while ensuring system categories:", err);
    process.exit(1);
  });
