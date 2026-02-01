/**
 * Convex Configuration
 * 
 * Configures the RAG component for knowledge base operations.
 */

import { defineApp } from "convex/server";
import rag from "@convex-dev/rag/convex.config";

const app = defineApp();
app.use(rag);

export default app;
