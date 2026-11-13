import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { indexKnowledge, loadSeed, ContentRepo } from "./content.js";
import { Hub } from "./hub.js";
import { HttpError } from "./http.js";
import { mountRoutes } from "./routes.js";
import { createStoreFromEnv, type Store } from "./store.js";

function findDist(name: "web" | "display"): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), name, "dist"),
    path.resolve(process.cwd(), "..", name, "dist"),
    path.resolve(here, "..", "..", name, "dist"),
  ];
  return candidates.find((item) => existsSync(path.join(item, "index.html"))) ?? null;
}

function mountStatic(app: express.Express): void {
  const display = findDist("display");
  if (display) {
    app.use("/display", express.static(display));
    app.get(/^\/display(?:\/.*)?$/, (_req, res) => {
      res.sendFile(path.join(display, "index.html"));
    });
  }
  const web = findDist("web");
  if (web) {
    app.use(express.static(web));
    app.get(/^(?!\/api|\/ws|\/display).*/, (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.sendFile(path.join(web, "index.html"));
    });
  }
}

export async function createApp(options: { store?: Store } = {}) {
  const store = options.store ?? (await createStoreFromEnv());
  await store.ready();
  const seed = loadSeed();
  const content = new ContentRepo(seed, store);
  await indexKnowledge(store, seed);
  const hub = new Hub(store, content);
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "256kb" }));
  mountRoutes(app, { store, content, hub });
  mountStatic(app);
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "伺服器發生錯誤";
    if (!(error instanceof HttpError)) console.error(error);
    res.status(status).json({ error: message });
  });
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  hub.attach(wss);
  return {
    app,
    httpServer,
    wss,
    store,
    hub,
    content,
    close: async () => {
      hub.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
      }
      await store.close();
    },
  };
}
