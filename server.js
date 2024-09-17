require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('ethereumjs-util');
const { PrismaClient } = require('@prisma/client');
const { ethers } = require('ethers');
const net = require('net');

const app = express();
const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

app.use(cors());

const PORT = process.env.PORT || 3000;

let merkleTrees = {};
let rootHashes = {};

function hashToken(token, citizenId) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [token, citizenId]
    )
  );
}

async function generateMerkleTreesByChain() {
  console.log('Starting Merkle tree generation for each chain...');
  const CHAINS = ['ETH', 'ARB', 'BASE', 'POL', 'AVAX'];
  const merkleTrees = {};
  const rootHashes = {};

  for (const chain of CHAINS) {
    console.log(`Generating Merkle tree for chain: ${chain}`);
    const batchSize = 50000; // Reduced batch size
    let lastId = 0;
    let processedCount = 0;
    const totalTokens = await prisma.citizenTokens.count({
      where: { chain },
    });
    console.log(`Total tokens for ${chain}: ${totalTokens}`);

    const treeBuilder = new MerkleTree([], keccak256, { sortPairs: true });

    while (processedCount < totalTokens) {
      const tokens = await prisma.citizenTokens.findMany({
        take: batchSize,
        where: {
          id: { gt: lastId },
          chain: chain,
        },
        select: { id: true, token: true, citizenId: true },
        orderBy: { id: 'asc' },
      });

      if (tokens.length === 0) break;

      const leaves = tokens.map((token) =>
        hashToken(token.token.toString(), token.citizenId.toString())
      );

      treeBuilder.addLeaves(leaves);

      processedCount += tokens.length;
      lastId = tokens[tokens.length - 1].id;

      console.log(
        `Processed ${processedCount}/${totalTokens} tokens for ${chain}.`
      );

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }

    const rootHash = treeBuilder.getHexRoot();

    merkleTrees[chain] = treeBuilder;
    rootHashes[chain] = rootHash;

    console.log(`Merkle tree for ${chain} generated. Root hash: ${rootHash}`);
  }

  return { merkleTrees, rootHashes };
}

app.get('/proof/:chain/:citizenId/:token', async (req, res) => {
  const { chain, citizenId, token } = req.params;

  if (!merkleTrees[chain]) {
    return res.status(400).json({ error: `Invalid or unsupported chain: ${chain}` });
  }

  const merkleTree = merkleTrees[chain];
  const rootHash = rootHashes[chain];

  const leaf = hashToken(token, citizenId);
  const proof = merkleTree.getHexProof(leaf);

  res.json({
    token,
    merkleProof: proof,
    rootHash,
  });
});

app.get('/rootHash/:chain', (req, res) => {
  const { chain } = req.params;

  if (!rootHashes[chain]) {
    return res.status(400).json({ error: `Invalid or unsupported chain: ${chain}` });
  }

  res.json({ rootHash: rootHashes[chain] });
});

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Server is healthy' });
});

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function startServer() {
  const startTime = Date.now();
  try {
    console.log('Checking if port is available...');
    const portAvailable = await isPortAvailable(PORT);
    if (!portAvailable) {
      throw new Error(`Port ${PORT} is not available. Please choose a different port.`);
    }

    console.log('Starting server initialization...');
    const { merkleTrees: generatedMerkleTrees, rootHashes: generatedRootHashes } = await generateMerkleTreesByChain();
    merkleTrees = generatedMerkleTrees;
    rootHashes = generatedRootHashes;
    app.listen(PORT, () => {
      const endTime = Date.now();
      const startupTime = (endTime - startTime) / 60000; // Convert to minutes
      console.log(`Merkle proof server running on port ${PORT}`);
      console.log(`Server startup took ${startupTime.toFixed(2)} minutes`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
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
