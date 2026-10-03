// src/lib/auth.ts
// Documented demo user implementation per AGENTS.md.
// Real auth is out of scope; queries and jobs are scoped by the seeded demo user.
import { prisma } from "./prisma";
import { config } from "../config";

export interface UserSession {
  id: string;
  email: string;
  name: string;
}

export async function getCurrentUser(): Promise<UserSession> {
  const { id, email, name } = config.demoUser;

  // Lazily ensure demo user exists in database when called
  try {
    const user = await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, email, name },
    });
    return { id: user.id, email: user.email, name: user.name ?? name };
  } catch {
    // If DB is not yet migrated or running in offline mode, return demo user configuration
    return { id, email, name };
  }
}
