import { payForStream } from "./stream.js";

// Test: User streams Song #1 for 60 seconds
// Song #1 (Midnight Dreams): 0.0001 USDC/sec × 60 sec = 0.006 USDC total
// Splits: Artist 50% (0.003), Producer 30% (0.0018), Platform 20% (0.0012)

console.log("=== Test: Stream Song #1 for 60 seconds ===");

const result = await payForStream("song-001", 60);

console.log("\n=== Payment Complete ===");
console.log(JSON.stringify(result, null, 2));
