require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('ethereumjs-util');
const { PrismaClient } = require('@prisma/client');
const { ethers } = require('ethers');

const app = express();
const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

app.use(cors());

const PORT = process.env.PORT || 3000;

let merkleTree;
let rootHash;

// Update the hashToken function
function hashToken(token, citizenId) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [token, citizenId]
    )
  );
}

async function fetchTokensBatch(lastId, batchSize, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await prisma.citizenTokens.findMany({
        take: batchSize,
        where: {
          id: { gt: lastId }
        },
        select: { id: true, token: true, citizenId: true },
        orderBy: { id: 'asc' },
      });
    } catch (error) {
      console.error(`Database fetch attempt ${attempt} failed:`, error);
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000 * attempt)); // Exponential backoff
    }
  }
}

async function generateMerkleTree() {
  console.log("Starting Merkle tree generation...");
  const batchSize = 100000; // Increased batch size for faster processing
  let lastId = 0;
  let processedCount = 0;
  const totalTokens = await prisma.citizenTokens.count();
  console.log(`Total tokens to process: ${totalTokens}`);

  console.time("Tree Generation");

  let treeBuilder = new MerkleTree([], keccak256, { sortPairs: true });

  while (processedCount < totalTokens) {
    try {
      console.time(`Batch ${Math.floor(processedCount / batchSize) + 1}`);
      const tokens = await fetchTokensBatch(lastId, Math.min(batchSize, totalTokens - processedCount));
      console.timeEnd(`Batch ${Math.floor(processedCount / batchSize) + 1}`);

      if (tokens.length === 0) break;

      const leaves = tokens.map(token => 
        hashToken(token.token.toString(), token.citizenId.toString())
      );
      treeBuilder.addLeaves(leaves);

      processedCount += tokens.length;
      lastId = tokens[tokens.length - 1].id;

      console.log(`Processed ${processedCount}/${totalTokens} tokens.`);
      console.log(`Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);

      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between batches
    } catch (error) {
      console.error("Error processing batch:", error);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retrying
    }
  }

  console.timeEnd("Tree Generation");

  console.log("Finalizing Merkle tree...");
  merkleTree = treeBuilder;
  rootHash = merkleTree.getHexRoot();
  console.log("Merkle tree generated. Root:", rootHash);
}

app.get('/proof/:citizenId/:token', async (req, res) => {
  const { citizenId, token } = req.params;

  if (!merkleTree) {
    return res.status(503).json({ error: "Merkle tree not yet generated" });
  }

  const leaf = hashToken(token, citizenId);
  const proof = merkleTree.getHexProof(leaf);

  res.json({
    token,
    merkleProof: proof,
    rootHash
  });
});

app.get('/rootHash', (req, res) => {
  if (!rootHash) {
    return res.status(503).json({ error: "Root hash not yet generated" });
  }
  res.json({ rootHash });
});

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Server is healthy' });
});


async function startServer() {
  try {
    console.log("Starting server initialization...");
    await generateMerkleTree();
    app.listen(PORT, () => {
      console.log(`Merkle proof server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await prisma.$disconnect();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await prisma.$disconnect();
  process.exit(1);
});

startServer();
