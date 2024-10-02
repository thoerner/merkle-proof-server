const { parentPort } = require('worker_threads');
const { PrismaClient } = require('@prisma/client');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('ethereumjs-util');
const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const util = require('util');

const gzip = util.promisify(zlib.gzip);

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

const CHAINS = ['ETH', 'ARB', 'BASE', 'POL'];
let progress = {
  overall: 0,
  currentChain: '',
  chainsCompleted: 0,
  chainProgress: {}
};

function hashToken(token, citizenId) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [token, citizenId]
    )
  );
}

async function generateMerkleTreesByChain() {
  console.log('Starting Merkle tree regeneration for each chain...');
  const merkleTreePaths = {};
  const rootHashes = {};

  for (let i = 0; i < CHAINS.length; i++) {
    const chain = CHAINS[i];
    progress.currentChain = chain;
    progress.chainProgress[chain] = 0;
    console.log(`Regenerating Merkle tree for chain: ${chain}`);
    const batchSize = 100000;
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

      progress.chainProgress[chain] = Math.floor((processedCount / totalTokens) * 100);
      progress.overall = Math.floor(((i + progress.chainProgress[chain] / 100) / CHAINS.length) * 100);
      parentPort.postMessage({ type: 'progress', progress });

      if (global.gc) {
        global.gc();
      }
    }

    const rootHash = treeBuilder.getHexRoot();

    // Save the MerkleTree leaves and options to a compressed file
    const treePath = path.join(__dirname, 'merkle_trees', `${chain}_tree.json.gz`);
    await fs.mkdir(path.dirname(treePath), { recursive: true });
    const treeData = {
      leaves: treeBuilder.getHexLeaves(),
      options: { hashLeaves: false, sortPairs: true }
    };
    const compressedData = await gzip(JSON.stringify(treeData));
    await fs.writeFile(treePath, compressedData);

    merkleTreePaths[chain] = treePath;
    rootHashes[chain] = rootHash;

    progress.chainsCompleted++;
    console.log(`Merkle tree for ${chain} regenerated. Root hash: ${rootHash}`);
  }

  return { merkleTreePaths, rootHashes };
}

async function cleanupOldFiles() {
  const directory = path.join(__dirname, 'merkle_trees');
  try {
    const files = await fs.readdir(directory);
    for (const file of files) {
      await fs.unlink(path.join(directory, file));
    }
    console.log('Old Merkle tree files cleaned up');
  } catch (error) {
    console.error('Error cleaning up old files:', error);
  }
}

parentPort.on('message', async (message) => {
  if (message.type === 'getProgress') {
    parentPort.postMessage({ type: 'progress', progress });
  }
});

(async () => {
  try {
    const result = await generateMerkleTreesByChain();
    parentPort.postMessage({ type: 'complete', ...result });
  } catch (error) {
    console.error('Error generating Merkle trees:', error);
    parentPort.postMessage({ type: 'error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
})();