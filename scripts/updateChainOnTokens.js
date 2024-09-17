const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CHAINS = ['ETH', 'ARB', 'BASE', 'POL', 'AVAX'];
const TOKENS_PER_CHAIN = 100;

async function addChainsToTokens() {
  try {
    for (let citizenId = 1; citizenId <= 20000; citizenId++) {
      for (const chain of CHAINS) {
        // Get 100 tokens for this citizen that don't have a chain assigned
        const tokens = await prisma.citizenTokens.findMany({
          where: {
            citizenId: citizenId,
            // chain: null,
          },
          take: TOKENS_PER_CHAIN,
        });

        // Update these tokens with the current chain
        await prisma.citizenTokens.updateMany({
          where: {
            id: {
              in: tokens.map(token => token.id),
            },
          },
          data: {
            chain: chain,
          },
        });

        console.log(`Updated ${tokens.length} tokens for citizen ${citizenId} with chain ${chain}`);
      }
    }

    console.log('Chain assignment complete');
  } catch (error) {
    console.error('Error assigning chains:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addChainsToTokens();