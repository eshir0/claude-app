import "server-only";
import bcrypt from "bcryptjs";

export async function verifyPassword(input: string): Promise<boolean> {
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!hash) return false; // assertAuthSecretsConfigured() should have already thrown at boot
  return bcrypt.compare(input, hash);
}
