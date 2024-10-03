// scripts/generateCitizenTokens.js

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const CHAINS = ['ETH', 'ARB', 'BASE', 'POL'];
const TOKENS_PER_CHAIN = 100;

function generateRandomInteger() {
  // Generate a random integer between 0 and 2^48 - 1 (281,474,976,710,655)
  const buffer = crypto.randomBytes(6); // 6 bytes = 48 bits
  return parseInt(buffer.toString('hex'), 16);
}

async function main() {
  for (let citizenId = 1; citizenId <= 20000; citizenId++) {
    for (const chain of CHAINS) {
      const tokens = [];

      for (let i = 0; i < TOKENS_PER_CHAIN; i++) {
        const token = generateRandomInteger();

        tokens.push({
          citizenId: citizenId,
          token: token.toString(), // Store as string in the database
          chain: chain,
          used: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Insert tokens into the database
      await prisma.citizenTokens.createMany({
        data: tokens,
        skipDuplicates: true,
      });

      console.log(`Generated ${TOKENS_PER_CHAIN} tokens for citizen ${citizenId} on chain ${chain}`);
    }
  }

  console.log('Token generation complete');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());