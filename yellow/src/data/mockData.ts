import type { Artist, LegacySong, Song } from '../types';
import { DEFAULT_PRICE_PER_SECOND, formatUSDC } from '../config';
import * as fs from 'fs';
import * as path from 'path';

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
 * Sample songs with mock metadata (Legacy format)
 * Song metadata is for demo purposes, but artist wallets are real
 */
export const SAMPLE_LEGACY_SONGS: LegacySong[] = [
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
];

/**
 * Sample songs matching the new Song type from songs.json
 */
export const SAMPLE_SONGS: Song[] = [
    {
        id: 'song-001',
        songName: 'Digital Sunrise',
        pricePerSecond: '0.0001',
        collaborators: [
            {
                artistName: 'Synthwave Dreams',
                address: '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91',
                blockchain: 'Ethereum_Sepolia',
            },
        ],
    },
    {
        id: 'song-002',
        songName: 'Neon Nights',
        pricePerSecond: '0.0001',
        collaborators: [
            {
                artistName: 'Synthwave Dreams',
                address: '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91',
                blockchain: 'Ethereum_Sepolia',
            },
        ],
    },
    {
        id: 'song-003',
        songName: 'Token of Love',
        pricePerSecond: '0.0002',
        collaborators: [
            {
                artistName: 'Crypto Beats',
                address: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
                blockchain: 'Ethereum_Sepolia',
            },
        ],
    },
];

/**
 * Load songs from songs.json file
 */
export function loadSongsFromFile(filePath?: string): Song[] {
    const songsPath = filePath || path.resolve(__dirname, '../../../../data/songs.json');
    try {
        const data = fs.readFileSync(songsPath, 'utf-8');
        return JSON.parse(data) as Song[];
    } catch (error) {
        console.warn(`Could not load songs from ${songsPath}, using sample songs`);
        return SAMPLE_SONGS;
    }
}

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
 * Create a custom song (new format)
 */
export function createSong(
    id: string,
    songName: string,
    pricePerSecond: string,
    collaborators: Song['collaborators']
): Song {
    return { id, songName, pricePerSecond, collaborators };
}
