//! Price feeds.
//!
//! Deliberately a settable account rather than a Pyth read, and that is not a
//! shortcut. The build sequence requires modelling oracle failure, depeg and
//! correlated drawdown, and none of those are testable against a live feed:
//! you cannot make Pyth go stale, widen its confidence, or crash sixty percent
//! on demand. A feed you control is the only way to prove the reserve behaves
//! correctly when its prices misbehave.
//!
//! What matters for the eventual swap is the *shape*, and it is Pyth's: a
//! price, a publish slot, and a confidence interval. A Pyth adapter replaces
//! `read_feed` and nothing else.

use anchor_lang::prelude::*;

use crate::math::BPS_DENOMINATOR;

pub const FEED_SEED: &[u8] = b"price-feed";

/// Beyond this a price is not a price, it is a memory.
pub const DEFAULT_MAX_STALENESS_SLOTS: u64 = 300;
/// A feed less certain than this should not be pricing anyone's redemption.
pub const DEFAULT_MAX_CONFIDENCE_BPS: u16 = 200;

#[account]
pub struct PriceFeed {
    /// The asset this feed prices.
    pub mint: Pubkey,
    pub publisher: Pubkey,
    /// Lamports per one whole unit of the asset.
    pub lamports_per_whole: u64,
    /// Half-width of the price interval, in basis points of the price. A feed
    /// that is uncertain says so, and the reserve refuses to price against it.
    pub confidence_bps: u16,
    pub published_slot: u64,
    pub published_at: i64,
    pub bump: u8,
}

impl PriceFeed {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 2 + 8 + 8 + 1 + 8;
}

/// Why a feed cannot currently be used for valuation.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FeedProblem {
    Stale,
    TooUncertain,
    ZeroPrice,
}

/// Decide whether a feed may price a valuation-sensitive operation.
///
/// Returning a problem rather than a bool so the caller can say which door it
/// is closing and why — the difference between "we paused" and "we paused
/// because this feed is nine minutes old" is most of the trust.
pub fn feed_problem(
    feed: &PriceFeed,
    current_slot: u64,
    max_staleness_slots: u64,
    max_confidence_bps: u16,
) -> Option<FeedProblem> {
    if feed.lamports_per_whole == 0 {
        return Some(FeedProblem::ZeroPrice);
    }
    if feed.confidence_bps > max_confidence_bps {
        return Some(FeedProblem::TooUncertain);
    }
    if current_slot.saturating_sub(feed.published_slot) > max_staleness_slots {
        return Some(FeedProblem::Stale);
    }
    None
}

/// The confidence-adjusted price used for valuation.
///
/// Prices at the *low* edge of the interval. A treasury that marks itself at
/// the optimistic end of every uncertain price is a treasury that discovers it
/// was smaller than it thought at the worst possible moment.
pub fn conservative_price(feed: &PriceFeed) -> u64 {
    let haircut = (feed.lamports_per_whole as u128)
        .saturating_mul(feed.confidence_bps as u128)
        / (BPS_DENOMINATOR as u128);
    feed.lamports_per_whole.saturating_sub(haircut as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed(price: u64, confidence_bps: u16, slot: u64) -> PriceFeed {
        PriceFeed {
            mint: Pubkey::default(),
            publisher: Pubkey::default(),
            lamports_per_whole: price,
            confidence_bps,
            published_slot: slot,
            published_at: 0,
            bump: 255,
        }
    }

    #[test]
    fn a_fresh_confident_feed_is_usable() {
        let f = feed(1_000_000_000, 10, 1_000);
        assert_eq!(feed_problem(&f, 1_100, 300, 200), None);
    }

    #[test]
    fn an_old_price_is_refused_rather_than_trusted() {
        let f = feed(1_000_000_000, 10, 1_000);
        assert_eq!(feed_problem(&f, 1_301, 300, 200), Some(FeedProblem::Stale));
    }

    #[test]
    fn an_uncertain_feed_is_refused_before_it_is_stale() {
        // Wide confidence is the earliest signal that something is wrong, and
        // it should stop valuation before the price itself goes missing.
        let f = feed(1_000_000_000, 900, 1_000);
        assert_eq!(feed_problem(&f, 1_001, 300, 200), Some(FeedProblem::TooUncertain));
    }

    #[test]
    fn a_zero_price_is_never_a_valuation() {
        let f = feed(0, 0, 1_000);
        assert_eq!(feed_problem(&f, 1_001, 300, 200), Some(FeedProblem::ZeroPrice));
    }

    #[test]
    fn valuation_takes_the_low_edge_of_the_interval() {
        // One percent of uncertainty marks one percent down, not up.
        let f = feed(1_000_000_000, 100, 0);
        assert_eq!(conservative_price(&f), 990_000_000);
        // A certain price is itself.
        assert_eq!(conservative_price(&feed(1_000_000_000, 0, 0)), 1_000_000_000);
    }
}
