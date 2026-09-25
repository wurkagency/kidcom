import { createApp } from "./app";
import { config } from "./config";
import { ensureSystemCategories } from "./lib/categories";

// Reference data the app relies on, reconciled before serving requests.
ensureSystemCategories()
  .then(() => {
    const app = createApp();
    const listening = () => {
      // eslint-disable-next-line no-console
      console.log(`Kinnd API listening on ${config.host ?? "all interfaces"}, port ${config.port} (${config.nodeEnv})`);
    };
    // Production: loopback only, behind nginx (config.host).
    if (config.host) app.listen(config.port, config.host, listening);
    else app.listen(config.port, listening);
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Startup failed while ensuring system categories:", err);
    process.exit(1);
  });
