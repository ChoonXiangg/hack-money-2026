# Music Streaming Royalty Split - Transaction Log

## Wallet Addresses

| Role | Wallet ID | Address |
|------|-----------|---------|
| Listener | `57043c9c-b520-59c8-b315-9a46c581bf35` | `0x843b9ec5c49092bbf874acbacb397d2c252e36a4` |
| Artist | `c92e30e6-d7e4-5f8d-b22c-3060dd56a3e1` | `0xda29bf5e13cc0a808baa3a435f4e3fbfece8bb6f` |
| Producer | `aac5f0ea-60ad-5303-912a-8cc93f327a94` | `0x0f19f1f7e413af44b79e30c1cc4a07a25f4eee03` |
| Platform | `c339974e-21ac-5d0d-b1e2-fc2a3158be96` | `0x96244711f04a3899cf5c3b1e727409e1856d6874` |

---

## Song Catalog

| Song ID | Title | Price/Second | Artist % | Producer % | Platform % |
|---------|-------|--------------|----------|------------|------------|
| song-001 | Midnight Dreams | 0.0001 USDC | 50% | 30% | 20% |
| song-002 | Electric Sunrise | 0.00015 USDC | 60% | 25% | 15% |
| song-003 | Ocean Waves | 0.00008 USDC | 70% | - | 30% |

---

## Transaction History

### Stream #1: Song #1 "Midnight Dreams" - 60 seconds

- **Total Cost:** 0.006 USDC (0.0001 × 60)
- **Split Ratio:** 50/30/20

| Recipient | Percentage | Amount | Transaction ID |
|-----------|------------|--------|----------------|
| Artist | 50% | 0.003000 USDC | `a831bf82-68d1-5efa-bcba-88b9ef3b1915` |
| Producer | 30% | 0.001800 USDC | `1adffd88-a576-5a02-b21d-0d05d15f6a04` |
| Platform | 20% | 0.001200 USDC | `42cfcc10-7bdb-5fa9-af47-f88f79e6de48` |

---

### Stream #2: Song #1 "Midnight Dreams" - 100 seconds

- **Total Cost:** 0.01 USDC (0.0001 × 100)
- **Split Ratio:** 50/30/20

| Recipient | Percentage | Amount | Transaction ID |
|-----------|------------|--------|----------------|
| Artist | 50% | 0.005000 USDC | `e4c84f1c-f2d9-535e-8cac-be7ca2a3fda5` |
| Producer | 30% | 0.003000 USDC | `c53d76cf-c3d9-51d1-9406-35cae1e96a63` |
| Platform | 20% | 0.002000 USDC | `83a1f8c6-89b9-5fe4-ac1b-01d6eef3bf79` |

---

### Stream #3: Song #1 "Midnight Dreams" - 500 seconds

- **Total Cost:** 0.05 USDC (0.0001 × 500)
- **Split Ratio:** 50/30/20

| Recipient | Percentage | Amount | Transaction ID |
|-----------|------------|--------|----------------|
| Artist | 50% | 0.025000 USDC | `1ba80910-65a1-557a-9d2b-6a98ad38d0ff` |
| Producer | 30% | 0.015000 USDC | `c1e8fedf-52b1-50bc-9f58-bc75a4f1c3e8` |
| Platform | 20% | 0.010000 USDC | `be4a1f2f-6d2a-54cb-9a1d-ece3adbdfe54` |

---

### Stream #4: Song #1 "Midnight Dreams" - 200 seconds

- **Total Cost:** 0.02 USDC (0.0001 × 200)
- **Split Ratio:** 50/30/20

| Recipient | Percentage | Amount | Transaction ID |
|-----------|------------|--------|----------------|
| Artist | 50% | 0.010000 USDC | `eb8c5fe7-80b7-53a0-88a3-b1cd16f6d5e7` |
| Producer | 30% | 0.006000 USDC | `ddd0bdf4-d74e-5f2e-b5a1-c5f2d3b1e26c` |
| Platform | 20% | 0.004000 USDC | `19b0e990-1da8-5faf-b7c7-1ee2aa8fa8db` |

---

### Stream #5: Song #1 "Midnight Dreams" - 100 seconds

- **Total Cost:** 0.01 USDC (0.0001 × 100)
- **Split Ratio:** 50/30/20

| Recipient | Percentage | Amount | Transaction ID |
|-----------|------------|--------|----------------|
| Artist | 50% | 0.005000 USDC | `4a7b2e27-7bb7-5aa9-9e91-abf69099b5a9` |
| Producer | 30% | 0.003000 USDC | `e9af56ec-5ad3-541f-8c65-d51f54b83f3e` |
| Platform | 20% | 0.002000 USDC | `8214f5d9-7aa5-5d2b-a72d-5fe5ad45d63b` |

---

### Stream #6: Song #1 "Midnight Dreams" - 60 seconds (Test Replay)

- **Total Cost:** 0.006 USDC (0.0001 × 60)
- **Split Ratio:** 50/30/20

| Recipient | Percentage | Amount | Transaction ID |
|-----------|------------|--------|----------------|
| Artist | 50% | 0.003000 USDC | (from testStream.js) |
| Producer | 30% | 0.001800 USDC | (from testStream.js) |
| Platform | 20% | 0.001200 USDC | (from testStream.js) |

---

### Stream #7: Song #2 "Electric Sunrise" - 60 seconds

- **Total Cost:** 0.009 USDC (0.00015 × 60)
- **Split Ratio:** 60/25/15

| Recipient | Percentage | Amount | Transaction ID |
|-----------|------------|--------|----------------|
| Artist | 60% | 0.005400 USDC | `de7b7c32-8a37-59fa-9152-3dee9ea632cd` |
| Producer | 25% | 0.002250 USDC | `e0862945-9a2e-57da-99c4-64ad5e555aec` |
| Platform | 15% | 0.001350 USDC | `8af1326d-4d76-5973-8614-6a9a577549b4` |

---

## Final Balances

| Wallet | Balance |
|--------|---------|
| Artist | 0.0584 USDC |
| Producer | 0.03405 USDC |
| Platform | 0.02255 USDC |

---

## Summary

- **Network:** Arc Testnet
- **Token:** USDC-TESTNET (Native token on Arc)
- **Token ID:** `15dc2b5d-0994-58b0-bf8c-3a0501148ee8`
- **Total Streams:** 7
- **Total Royalties Distributed:** 0.1145 USDC
