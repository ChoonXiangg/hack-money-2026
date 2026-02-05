module superfan::badge {
    /// FanBadge represents a fan's engagement with an artist
    /// Tiers: 1 = Bronze, 2 = Silver, 3 = Gold
    public struct FanBadge has key, store {
        id: UID,
        artist_id: address,
        fan: address,
        listen_seconds: u64,
        tier: u8,
    }

    /// Mint a new FanBadge for the sender
    #[allow(lint(self_transfer))]
    public fun mint_badge(artist_id: address, ctx: &mut TxContext) {
        let badge = FanBadge {
            id: object::new(ctx),
            artist_id,
            fan: tx_context::sender(ctx),
            listen_seconds: 0,
            tier: 1, // Bronze
        };
        transfer::public_transfer(badge, tx_context::sender(ctx));
    }

    /// Add listening time to a badge
    public fun add_listen_time(badge: &mut FanBadge, seconds: u64) {
        badge.listen_seconds = badge.listen_seconds + seconds;
    }

    /// Update tier based on listen_seconds
    /// Bronze (1) -> Silver (2) at 3600 seconds (1 hour)
    /// Silver (2) -> Gold (3) at 36000 seconds (10 hours)
    public fun update_tier(badge: &mut FanBadge) {
        if (badge.listen_seconds >= 36000) {
            badge.tier = 3; // Gold
        } else if (badge.listen_seconds >= 3600) {
            badge.tier = 2; // Silver
        }
    }

    /// Get the total listen seconds for a badge
    public fun get_listen_seconds(badge: &FanBadge): u64 {
        badge.listen_seconds
    }

    /// Get the current tier of a badge
    public fun get_tier(badge: &FanBadge): u8 {
        badge.tier
    }
}
