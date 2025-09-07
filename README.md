# Merkle Proof Server

A high-performance, multi-chain merkle proof generation server built for enterprise-scale blockchain applications. This server efficiently generates and serves cryptographic proofs for token verification across multiple blockchain networks.

## 🚀 Overview

This server was developed for Eureka's auction platform to provide scalable merkle proof verification for citizen tokens across multiple blockchain networks. It handles massive datasets (20,000+ citizens across 5 chains) with optimized batch processing and memory management.

## 🏗️ Architecture

### Multi-Chain Support
- **Ethereum (ETH)**
- **Arbitrum (ARB)** 
- **Base (BASE)**
- **Polygon (POL)**
- **Avalanche (AVAX)**

### Core Components
- **Express.js** REST API server
- **Prisma** ORM with PostgreSQL
- **MerkleTreeJS** for cryptographic proof generation
- **Ethers.js** for blockchain utilities
- **PM2** for production process management

## 📊 Performance

- **Scale**: 20,000 citizens × 5 chains × 100 tokens = 10M+ tokens
- **Batch Processing**: 100,000 tokens per batch for optimal memory usage
- **Startup Time**: ~2-3 minutes for full tree generation
- **Memory Management**: Automatic garbage collection and cleanup

## 🛠️ Installation

### Prerequisites
- Node.js 18+
- PostgreSQL database
- PM2 (for production)

### Setup

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd merkle-proof-server
npm install
```

2. **Environment Configuration**
Create a `.env` file:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
PORT=3000
```

3. **Database Setup**
```bash
npx prisma generate
npx prisma db push
```

4. **Generate Token Data** (if needed)
```bash
node scripts/generateCitizenTokens.js
node scripts/updateChainOnTokens.js
```

5. **Start the Server**
```bash
# Development
npm run dev

# Production
npm start
```

## 📡 API Endpoints

### Get Merkle Proof
```http
GET /proof/:chain/:citizenId/:token
```

**Response:**
```json
{
  "token": "123456789",
  "merkleProof": ["0x...", "0x..."],
  "rootHash": "0x..."
}
```

### Get Root Hash
```http
GET /rootHash/:chain
```

**Response:**
```json
{
  "rootHash": "0x..."
}
```

### Regenerate Merkle Trees
```http
POST /regenerate-trees
```

**Response:**
```json
{
  "message": "Merkle trees regenerated successfully",
  "rootHashes": {
    "ETH": "0x...",
    "ARB": "0x...",
    "BASE": "0x...",
    "POL": "0x...",
    "AVAX": "0x..."
  }
}
```

### Check Regeneration Status
```http
GET /regeneration-status
```

**Response:**
```json
{
  "isComplete": true
}
```

### Health Check
```http
GET /
```

**Response:**
```json
{
  "status": "OK",
  "message": "Server is healthy"
}
```

## 🔧 Production Deployment

### PM2 Configuration
The project includes `ecosystem.config.js` for PM2 process management:

```bash
pm2 start ecosystem.config.js
pm2 monit
```

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default: 3000)

## 🗄️ Database Schema

The server uses a sophisticated Prisma schema with optimized indexing:

- **CitizenTokens**: Core token storage with chain association
- **Citizens**: User management and wallet integration
- **Auctions**: Auction system integration
- **Orders**: Payment and transaction tracking

## 🔐 Security Features

- **Cryptographic Hashing**: Keccak256 for merkle tree generation
- **Input Validation**: Parameter sanitization and validation
- **Error Handling**: Graceful error responses and logging
- **Memory Safety**: Automatic cleanup and garbage collection

## 📈 Monitoring

The server provides comprehensive logging:
- Startup time tracking
- Batch processing progress
- Memory usage monitoring
- Error logging and recovery

## 🧪 Development

### Scripts
- `npm start`: Production server
- `npm run dev`: Development with nodemon
- `npm test`: Run tests (to be implemented)

### Database Scripts
- `scripts/generateCitizenTokens.js`: Generate test token data
- `scripts/updateChainOnTokens.js`: Assign chains to existing tokens

## 📝 License

ISC License

## 👨‍💻 Author

Built by Tim, CTO at ReplyCorp - Professional blockchain infrastructure for enterprise applications.

---

*This server demonstrates enterprise-scale blockchain infrastructure capabilities, handling millions of tokens with optimized performance and multi-chain support.*