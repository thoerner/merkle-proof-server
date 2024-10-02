require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Worker } = require('worker_threads');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('ethereumjs-util');
const { PrismaClient } = require('@prisma/client');
const { ethers } = require('ethers');
const fs = require('fs').promises;
const zlib = require('zlib');
const util = require('util');

const gunzip = util.promisify(zlib.gunzip);

const app = express();
const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

app.use(cors());

const PORT = process.env.PORT || 3000;

let merkleTrees = {};
let rootHashes = {};
let merkleTreePaths = {};
let regenerationComplete = false;
let isRegenerating = false;
let regenerationWorker = null;

function hashToken(token, citizenId) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [token, citizenId]
    )
  );
}

async function loadMerkleTrees() {
  for (const chain of Object.keys(merkleTreePaths)) {
    console.log(`Loading Merkle tree for ${chain}...`);
    const compressedData = await fs.readFile(merkleTreePaths[chain]);
    const decompressedData = await gunzip(compressedData);
    const treeData = JSON.parse(decompressedData.toString());
    merkleTrees[chain] = new MerkleTree(treeData.leaves, keccak256, treeData.options);
    console.log(`Merkle tree for ${chain} loaded into memory.`);
  }
}

async function generateInitialMerkleTrees() {
  console.log('Starting initial Merkle tree generation...');
  
  return new Promise((resolve, reject) => {
    const initialGenerationWorker = new Worker('./initialGenerationWorker.js');
    
    initialGenerationWorker.on('message', async (message) => {
      if (message.type === 'complete') {
        console.log('Initial Merkle tree generation completed');
        merkleTreePaths = message.merkleTreePaths;
        rootHashes = message.rootHashes;
        
        await loadMerkleTrees();
        
        regenerationComplete = true;
        resolve();
      } else if (message.type === 'progress') {
        console.log(`Initial generation progress: Overall ${message.progress.overall}%, Current Chain: ${message.progress.currentChain} (${message.progress.chainProgress[message.progress.currentChain]}%)%, Chains Completed: ${message.progress.chainsCompleted}`);
      }
    });

    initialGenerationWorker.on('error', (error) => {
      console.error('Error in initial generation worker:', error);
      reject(error);
    });

    initialGenerationWorker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Initial generation worker stopped with exit code ${code}`));
      }
    });
  });
}

app.post('/regenerate-trees', async (req, res) => {
  console.log('Starting Merkle tree regeneration...');
  if (isRegenerating) {
    console.log('Regeneration already in progress');
    return res.status(409).json({ error: 'Regeneration already in progress' });
  }
  
  isRegenerating = true;
  regenerationComplete = false;

  // Respond immediately
  res.json({ message: 'Merkle tree regeneration initiated' });

  // Start regeneration in a separate worker thread
  regenerationWorker = new Worker('./regenerationWorker.js');
  
  regenerationWorker.on('message', async (message) => {
    if (message.type === 'complete') {
      console.log('Merkle tree regeneration completed');
      merkleTreePaths = message.merkleTreePaths;
      rootHashes = message.rootHashes;
      
      // Load new Merkle trees into memory
      await loadMerkleTrees();
      
      regenerationComplete = true;
      isRegenerating = false;
    } else if (message.type === 'progress') {
      console.log(`Regeneration progress: Overall ${message.progress.overall}%, Current Chain: ${message.progress.currentChain} (${message.progress.chainProgress[message.progress.currentChain]}%), Chains Completed: ${message.progress.chainsCompleted}`);
    }
  });

  regenerationWorker.on('error', (error) => {
    console.error('Error in regeneration worker:', error);
    isRegenerating = false;
    regenerationComplete = false;
  });

  regenerationWorker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Regeneration worker stopped with exit code ${code}`);
      isRegenerating = false;
      regenerationComplete = false;
    }
  });
});

app.get('/proof/:chain/:citizenId/:token', (req, res) => {
  const { chain, citizenId, token } = req.params;
  
  if (!merkleTrees[chain]) {
    return res.status(400).json({ error: 'Invalid chain or Merkle tree not loaded' });
  }

  const leaf = hashToken(token, citizenId);
  const proof = merkleTrees[chain].getHexProof(leaf);
  
  res.json({ proof });
});

app.get('/rootHash/:chain', (req, res) => {
  const { chain } = req.params;

  if (!rootHashes[chain]) {
    return res.status(400).json({ error: `Invalid or unsupported chain: ${chain}` });
  }

  res.json({ rootHash: rootHashes[chain] });
});

app.get('/regeneration-status', (req, res) => {
  if (regenerationWorker) {
    regenerationWorker.postMessage({ type: 'getProgress' });
    regenerationWorker.once('message', (message) => {
      if (message.type === 'progress') {
        res.json({
          isComplete: regenerationComplete,
          overall: message.progress.overall,
          currentChain: message.progress.currentChain,
          chainsCompleted: message.progress.chainsCompleted,
          chainProgress: message.progress.chainProgress
        });
      }
    });
  } else {
    res.json({
      isComplete: regenerationComplete,
      overall: 0,
      currentChain: '',
      chainsCompleted: 0,
      chainProgress: {}
    });
  }
});

app.get('/root-hashes', (req, res) => {
  if (!regenerationComplete) {
    return res.status(400).json({ message: 'Tree regeneration not complete' });
  }
  res.json({ rootHashes });
});

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Server is healthy' });
});

async function startServer() {
  const startTime = Date.now();
  try {
    console.log('Starting server initialization...');
    await generateInitialMerkleTrees();
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