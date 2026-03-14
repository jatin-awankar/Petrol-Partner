import bcrypt from "bcrypt";

export function hashPassword(plainTextPassword: string) {
  return bcrypt.hash(plainTextPassword, 12);
}

export function verifyPassword(plainTextPassword: string, passwordHash: string) {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
