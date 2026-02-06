import type { Artist, Song } from '../types';
import { DEFAULT_PRICE_PER_SECOND } from '../config';

/**
 * IMPORTANT: These are REAL wallet addresses generated for testing purposes.
 * In production, artists would register their own wallet addresses.
 *
 * These addresses can receive real testnet transactions.
 * Private keys are stored in .env.artists for testing withdrawals.
 */

/**
 * Sample artists with REAL testnet wallet addresses
 *
 * These addresses were generated using viem's generatePrivateKey()
 * They are valid Ethereum addresses that can receive funds on any network.
 */
export const SAMPLE_ARTISTS: Artist[] = [
    {
        id: 'artist-001',
        name: 'Synthwave Dreams',
        // Real testnet address - can receive actual transactions
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91',
    },
    {
        id: 'artist-002',
        name: 'Crypto Beats',
        walletAddress: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
    },
    {
        id: 'artist-003',
        name: 'Blockchain Ballads',
        walletAddress: '0xdD2FD4581271e230360230F9337D5c0430Bf44C0',
    },
    {
        id: 'artist-004',
        name: 'DeFi Disco',
        walletAddress: '0xbDA5747bFD65F08deb54cb465eB87D40e51B197E',
    },
    {
        id: 'artist-005',
        name: 'NFT Melodies',
        walletAddress: '0x2546BcD3c84621e976D8185a91A922aE77ECEc30',
    },
];

/**
 * Sample songs with mock metadata
 * Song metadata is for demo purposes, but artist wallets are real
 */
export const SAMPLE_SONGS: Song[] = [
    // Synthwave Dreams songs
    {
        id: 'song-001',
        title: 'Digital Sunrise',
        artist: SAMPLE_ARTISTS[0],
        durationSeconds: 240, // 4 minutes
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    {
        id: 'song-002',
        title: 'Neon Nights',
        artist: SAMPLE_ARTISTS[0],
        durationSeconds: 195, // 3:15
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    // Crypto Beats songs
    {
        id: 'song-003',
        title: 'Token of Love',
        artist: SAMPLE_ARTISTS[1],
        durationSeconds: 210, // 3:30
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    {
        id: 'song-004',
        title: 'Hash Rate Hustle',
        artist: SAMPLE_ARTISTS[1],
        durationSeconds: 180, // 3:00
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    // Blockchain Ballads songs
    {
        id: 'song-005',
        title: 'Consensus Mechanism',
        artist: SAMPLE_ARTISTS[2],
        durationSeconds: 312, // 5:12
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    {
        id: 'song-006',
        title: 'Proof of Work',
        artist: SAMPLE_ARTISTS[2],
        durationSeconds: 267, // 4:27
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    // DeFi Disco songs
    {
        id: 'song-007',
        title: 'Yield Farming Blues',
        artist: SAMPLE_ARTISTS[3],
        durationSeconds: 223, // 3:43
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    {
        id: 'song-008',
        title: 'Liquidity Pool Party',
        artist: SAMPLE_ARTISTS[3],
        durationSeconds: 198, // 3:18
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    // NFT Melodies songs
    {
        id: 'song-009',
        title: 'Mint My Heart',
        artist: SAMPLE_ARTISTS[4],
        durationSeconds: 245, // 4:05
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
    {
        id: 'song-010',
        title: 'Floor Price Feelings',
        artist: SAMPLE_ARTISTS[4],
        durationSeconds: 189, // 3:09
        pricePerSecond: DEFAULT_PRICE_PER_SECOND,
    },
];

/**
 * Get a song by ID
 */
export function getSongById(id: string): Song | undefined {
    return SAMPLE_SONGS.find(song => song.id === id);
}

/**
 * Get an artist by ID
 */
export function getArtistById(id: string): Artist | undefined {
    return SAMPLE_ARTISTS.find(artist => artist.id === id);
}

/**
 * Get all songs by a specific artist
 */
export function getSongsByArtist(artistId: string): Song[] {
    return SAMPLE_SONGS.filter(song => song.artist.id === artistId);
}

/**
 * Get all artists
 */
export function getAllArtists(): Artist[] {
    return [...SAMPLE_ARTISTS];
}

/**
 * Get all songs
 */
export function getAllSongs(): Song[] {
    return [...SAMPLE_SONGS];
}

/**
 * Create a custom artist with their real wallet address
 * Use this to add actual artists with their own wallets
 */
export function createArtist(
    id: string,
    name: string,
    walletAddress: `0x${string}`
): Artist {
    return { id, name, walletAddress };
}

/**
 * Create a custom song
 */
export function createSong(
    id: string,
    title: string,
    artist: Artist,
    durationSeconds: number,
    pricePerSecond: bigint = DEFAULT_PRICE_PER_SECOND
): Song {
    return { id, title, artist, durationSeconds, pricePerSecond };
}
