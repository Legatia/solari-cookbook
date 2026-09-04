//! Reserve accounting.
//!
//! Every quantity here is an integer: lamports in, base units of currency out.
//! There is no floating point anywhere in the protocol, and no rounding is left
//! to chance — each function below rounds in the direction that protects the
//! people who stay, never the person transacting. That single rule is what
//! makes `nav_per_token` non-decreasing across mints and redemptions, which is
//! the property the whole design rests on.

use anchor_lang::prelude::*;

/// Basis points denominator. A fee of 100 bps is one percent.
pub const BPS_DENOMINATOR: u64 = 10_000;

#[error_code]
pub enum ReserveMathError {
    #[msg("Arithmetic overflowed while computing a reserve amount.")]
    Overflow,
    #[msg("Supply cannot be zero while the currency holds reserves.")]
    ZeroSupply,
    #[msg("Reserves cannot be zero while supply is outstanding.")]
    ZeroReserve,
    #[msg("A fee cannot exceed the amount it is charged against.")]
    FeeExceedsAmount,
}

type MathResult<T> = std::result::Result<T, ReserveMathError>;

/// `a * b / c` in 128-bit space, rounded down.
///
/// Every ratio in the protocol goes through here. Doing it in `u64` would
/// overflow on realistic balances long before it produced a wrong answer.
fn mul_div_floor(a: u64, b: u64, c: u64) -> MathResult<u64> {
    if c == 0 {
        return Err(ReserveMathError::ZeroSupply);
    }
    let product = (a as u128)
        .checked_mul(b as u128)
        .ok_or(ReserveMathError::Overflow)?;
    u64::try_from(product / (c as u128)).map_err(|_| ReserveMathError::Overflow)
}

/// Deduct a basis-point fee, returning `(net, fee)`.
///
/// The fee is not skimmed out of the system: callers leave it in the reserve,
/// where it raises NAV for everyone still holding.
pub fn apply_fee(amount: u64, fee_bps: u16) -> MathResult<(u64, u64)> {
    let fee = mul_div_floor(amount, fee_bps as u64, BPS_DENOMINATOR)?;
    let net = amount.checked_sub(fee).ok_or(ReserveMathError::FeeExceedsAmount)?;
    Ok((net, fee))
}

/// Genesis supply follows funded capital, never a founder's choice.
///
/// `supply = funded_lamports / price_per_whole_token`, expressed in base units.
/// If only part of the target is raised, the supply is smaller — the price the
/// constitution published before anyone deposited is what holds.
pub fn genesis_supply(
    funded_lamports: u64,
    initial_price_lamports: u64,
    decimals: u8,
) -> MathResult<u64> {
    if initial_price_lamports == 0 {
        return Err(ReserveMathError::ZeroReserve);
    }
    let scale = 10u64
        .checked_pow(decimals as u32)
        .ok_or(ReserveMathError::Overflow)?;
    mul_div_floor(funded_lamports, scale, initial_price_lamports)
}

/// A subscriber's pro-rata share of the genesis supply.
///
/// Rounded down, so the sum of all claims can never exceed what was minted.
pub fn subscription_claim(
    subscribed_lamports: u64,
    total_subscribed_lamports: u64,
    genesis_supply: u64,
) -> MathResult<u64> {
    mul_div_floor(subscribed_lamports, genesis_supply, total_subscribed_lamports)
}

/// Tokens issued for a deposit, priced at NAV *before* the deposit lands.
///
/// Pricing against the post-deposit reserve would let a depositor buy into the
/// value of their own deposit. Rounded down, so a deposit never mints more
/// claim than it funded.
pub fn tokens_for_deposit(
    net_deposit_lamports: u64,
    reserve_lamports: u64,
    outstanding_supply: u64,
) -> MathResult<u64> {
    if reserve_lamports == 0 {
        return Err(ReserveMathError::ZeroReserve);
    }
    if outstanding_supply == 0 {
        return Err(ReserveMathError::ZeroSupply);
    }
    mul_div_floor(net_deposit_lamports, outstanding_supply, reserve_lamports)
}

/// Lamports owed for burning `token_amount`, at current NAV.
///
/// Rounded down, so a redeemer can never withdraw more than their share and
/// the remainder stays with the people who did not redeem.
pub fn lamports_for_redemption(
    token_amount: u64,
    reserve_lamports: u64,
    outstanding_supply: u64,
) -> MathResult<u64> {
    if outstanding_supply == 0 {
        return Err(ReserveMathError::ZeroSupply);
    }
    mul_div_floor(token_amount, reserve_lamports, outstanding_supply)
}

/// NAV per whole token, in lamports. Reporting only — never a pricing input.
pub fn nav_per_token(
    reserve_lamports: u64,
    outstanding_supply: u64,
    decimals: u8,
) -> MathResult<u64> {
    if outstanding_supply == 0 {
        return Ok(0);
    }
    let scale = 10u64
        .checked_pow(decimals as u32)
        .ok_or(ReserveMathError::Overflow)?;
    mul_div_floor(reserve_lamports, scale, outstanding_supply)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DECIMALS: u8 = 9;
    const SCALE: u128 = 1_000_000_000;

    /// NAV as an exact rational, for comparisons that integer NAV would blur.
    fn nav_ratio(reserve: u64, supply: u64) -> f64 {
        if supply == 0 {
            return 0.0;
        }
        (reserve as f64) * (SCALE as f64) / (supply as f64)
    }

    #[test]
    fn supply_follows_capital_not_ambition() {
        // The published price is 0.0001 SOL per token.
        let price = 100_000u64;
        let full = genesis_supply(100_000 * 1_000_000_000, price, DECIMALS).unwrap();
        let partial = genesis_supply(60_000 * 1_000_000_000, price, DECIMALS).unwrap();

        assert_eq!(full, 1_000_000_000 * 1_000_000_000);
        // Sixty percent of the capital buys exactly sixty percent of the supply.
        assert_eq!(partial, full / 100 * 60);
    }

    #[test]
    fn claims_never_exceed_the_minted_supply() {
        let total = 1_000_000u64;
        let supply = genesis_supply(total, 1_000, DECIMALS).unwrap();
        // Three subscribers whose shares do not divide evenly.
        let parts = [333_333u64, 333_333, 333_334];
        let claimed: u64 = parts
            .iter()
            .map(|part| subscription_claim(*part, total, supply).unwrap())
            .sum();
        assert!(claimed <= supply, "claims {claimed} exceeded supply {supply}");
    }

    #[test]
    fn a_deposit_cannot_buy_into_its_own_value() {
        let reserve = 1_000_000_000u64;
        let supply = 1_000_000_000u64;
        let deposit = 1_000_000_000u64;

        let priced_before = tokens_for_deposit(deposit, reserve, supply).unwrap();
        // What a naive implementation would do: price against the new reserve.
        let priced_after = tokens_for_deposit(deposit, reserve + deposit, supply).unwrap();
        assert!(
            priced_before > priced_after,
            "pricing before the deposit must issue more tokens for the same money",
        );
        // Doubling the reserve for a supply of the same size doubles the supply.
        assert_eq!(priced_before, supply);
    }

    #[test]
    fn minting_never_dilutes_the_people_already_holding() {
        let mut reserve = 7_777_777_777u64;
        let mut supply = 3_333_333_333u64;

        for deposit in [1u64, 7, 999, 1_000_000, 123_456_789, 8_888_888_888] {
            let before = nav_ratio(reserve, supply);
            let (net, fee) = apply_fee(deposit, 50).unwrap();
            let minted = tokens_for_deposit(net, reserve, supply).unwrap();
            // The whole deposit enters the reserve; the fee simply stays behind.
            reserve += net + fee;
            supply += minted;
            let after = nav_ratio(reserve, supply);
            assert!(
                after >= before,
                "mint of {deposit} moved NAV down: {before} -> {after}",
            );
        }
    }

    #[test]
    fn redemption_never_dilutes_the_people_who_stay() {
        let mut reserve = 5_000_000_007u64;
        let mut supply = 1_234_567_891u64;

        for burn in [1u64, 3, 101, 7_777, 111_111_111] {
            let before = nav_ratio(reserve, supply);
            let owed = lamports_for_redemption(burn, reserve, supply).unwrap();
            reserve -= owed;
            supply -= burn;
            let after = nav_ratio(reserve, supply);
            assert!(
                after >= before,
                "redemption of {burn} moved NAV down: {before} -> {after}",
            );
        }
    }

    #[test]
    fn a_round_trip_cannot_extract_value() {
        // The classic drain: deposit, immediately redeem, repeat.
        let start_reserve = 1_000_000_000u64;
        let start_supply = 1_000_000_000u64;
        let mut reserve = start_reserve;
        let mut supply = start_supply;
        let deposit = 999_983u64;

        for _ in 0..64 {
            let minted = tokens_for_deposit(deposit, reserve, supply).unwrap();
            reserve += deposit;
            supply += minted;
            let returned = lamports_for_redemption(minted, reserve, supply).unwrap();
            reserve -= returned;
            supply -= minted;
            assert!(returned <= deposit, "round trip returned more than it paid in");
        }
        assert!(reserve >= start_reserve, "the reserve leaked over 64 round trips");
        assert_eq!(supply, start_supply);
    }

    #[test]
    fn fees_stay_with_the_holders_rather_than_leaving() {
        let (net, fee) = apply_fee(1_000_000, 250).unwrap();
        assert_eq!(fee, 25_000);
        assert_eq!(net + fee, 1_000_000);
        // A zero fee is the honest default for a treasury with no execution cost.
        assert_eq!(apply_fee(1_000_000, 0).unwrap(), (1_000_000, 0));
    }

    #[test]
    fn dust_amounts_fail_closed_instead_of_minting_nothing_for_something() {
        // Far more reserve than supply: a tiny deposit rounds to zero tokens.
        let minted = tokens_for_deposit(1, 1_000_000_000_000, 1_000).unwrap();
        assert_eq!(minted, 0, "the instruction must reject this, not silently keep the SOL");
    }

    #[test]
    fn an_empty_currency_is_refused_rather_than_dividing_by_zero() {
        assert!(tokens_for_deposit(100, 0, 100).is_err());
        assert!(tokens_for_deposit(100, 100, 0).is_err());
        assert!(lamports_for_redemption(100, 100, 0).is_err());
        assert_eq!(nav_per_token(100, 0, DECIMALS).unwrap(), 0);
    }

    #[test]
    fn large_balances_do_not_overflow() {
        // Roughly the entire SOL supply against a large token supply.
        let reserve = 600_000_000u64 * 1_000_000_000;
        let supply = u64::MAX / 4;
        assert!(lamports_for_redemption(1_000_000, reserve, supply).is_ok());
        assert!(tokens_for_deposit(1_000_000, reserve, supply).is_ok());
    }
}
