import argon2 from 'argon2';

const passwordHashOptions = {
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
  type: argon2.argon2id,
} as const;

export const dummyPasswordHash =
  '$argon2id$v=19$m=19456,p=1,t=2$sYKOcZcTaJB6R3noDVZm1A$NiCtv1c/b32K6Ne3LoMFTlFLug9CICul1nXRMVpiaxI';

export const hashPassword = (password: string) => argon2.hash(password, passwordHashOptions);

export const verifyPassword = async (passwordHash: string, password: string) => {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
};
