// src/app/server.ts
// Express web server for Interra AI.
// Serves API endpoints and static web application assets.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { config } from "../config";
import { jobsRouter } from "../api/jobs";

const app = express();

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend assets
const publicDir = path.resolve(process.cwd(), "public");
app.use(express.static(publicDir));

// API Routes
app.use("/api/jobs", jobsRouter);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    product: "Interra AI",
    environment: config.server.env,
    roles: {
      analyst: { provider: config.roles.analyst.provider, model: config.roles.analyst.model },
      prep: { provider: config.roles.prep.provider, model: config.roles.prep.model },
    },
  });
});

// Dashboard route for authenticated experience
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

// Fallback to index.html for client-side navigation
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`[App] Interra AI server listening at http://localhost:${PORT}`);
});

export default app;
