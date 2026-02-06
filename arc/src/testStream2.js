import { payForStream } from "./stream.js";

// Test: User streams Song #2 for 60 seconds
// Song #2 (Electric Sunrise): 0.00015 USDC/sec × 60 sec = 0.009 USDC total
// Splits: Artist 60% (0.0054), Producer 25% (0.00225), Platform 15% (0.00135)

console.log("=== Test: Stream Song #2 for 60 seconds ===");

const result = await payForStream("song-002", 60);

console.log("\n=== Payment Complete ===");
console.log(JSON.stringify(result, null, 2));
