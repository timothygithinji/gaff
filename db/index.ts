import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "../src/lib/env";
import * as schema from "./schema";

export function getDb() {
  const sql = neon(env().DATABASE_URL);
  return drizzle(sql, { schema });
}

export * from "./schema";
