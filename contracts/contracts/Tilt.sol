// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPyth, PythStructs} from "./interfaces/IPyth.sol";

/**
 * TILT — up or down, on a clock.
 *
 * A round is one asset, one duration and one start time on a fixed grid
 * (start is a multiple of the duration, so rounds of a kind run back to
 * back and nobody has to open them). While a round runs, anyone stakes
 * native ETH on UP or on DOWN; entries stop LOCK seconds before the end.
 *
 * Two prices decide a round, and both come from Pyth: the strike is the
 * first print at or after the round's start, the close is the first print
 * at or after its end. Anyone may submit those prints once the round has
 * ended; Pyth itself rejects an update that is not the first one in the
 * window, so the settler cannot choose the price.
 *
 *   close > strike  → the UP pot shares both pots, pro rata
 *   close < strike  → the DOWN pot shares both pots, pro rata
 *   close == strike, or one pot empty → every stake is refunded, no fee
 *   nobody settled within VOID_AFTER  → every stake is refunded, no fee
 *
 * The fee is taken on a decisive round only: feeBps of both pots, capped
 * at the losing pot so that a winner never gets back less than the stake.
 *
 * No owner, no operator, no upgrade path. The treasury can receive the
 * accrued fee and do nothing else.
 */
contract Tilt {
    // ---------------------------------------------------------------- rules

    /// Entries stop this many seconds before a round ends.
    uint256 public constant LOCK = 30;
    /// A settlement print must be the first Pyth print at or after its
    /// timestamp, and no later than this after it.
    uint256 public constant SETTLE_WINDOW = 15 minutes;
    /// A round nobody settled this long after its end is void: stakes are
    /// refunded and it can no longer be settled.
    uint256 public constant VOID_AFTER = 1 days;
    uint256 public constant MIN_STAKE = 0.0001 ether;
    uint16 public constant MAX_FEE_BPS = 500;

    struct Asset {
        bytes32 feedId;
        string symbol;
    }

    enum Outcome {
        Pending,
        Up,
        Down,
        Refund
    }

    struct Round {
        uint8 asset;
        Outcome outcome;
        uint32 duration;
        uint64 start;
        int64 strike; // 1e-8 USD, 0 until settled
        int64 close; // 1e-8 USD, 0 until settled
        uint256 upPot;
        uint256 downPot;
        uint256 payoutPool; // both pots minus the fee, once decisive
        uint256 fee;
    }

    struct Position {
        uint128 up;
        uint128 down;
        bool claimed;
    }

    IPyth public immutable pyth;
    address public immutable treasury;
    uint16 public immutable feeBps;

    Asset[] private _assets;
    uint32[] private _durations;
    mapping(uint32 => bool) public isDuration;

    uint256 public roundCount;
    mapping(uint256 => Round) private _rounds;
    /// asset → duration → start → round id (0 = nobody entered it).
    mapping(uint8 => mapping(uint32 => mapping(uint64 => uint256))) public roundIdOf;
    mapping(uint256 => mapping(address => Position)) private _positions;
    mapping(address => uint256[]) private _roundsOf;

    /// asset → timestamp → the first Pyth print at or after it (1e-8 USD),
    /// once somebody has submitted it. Rounds that share a boundary share
    /// the print: the close of one round is the strike of the next.
    mapping(uint8 => mapping(uint64 => int64)) public priceAt;

    uint256 public feesAccrued;

    uint256 private _entered = 1;

    event RoundOpened(uint256 indexed roundId, uint8 indexed asset, uint32 duration, uint64 start);
    event Entered(uint256 indexed roundId, address indexed account, bool up, uint256 amount);
    event PricePinned(uint8 indexed asset, uint64 indexed timestamp, int64 price);
    event Settled(uint256 indexed roundId, Outcome outcome, int64 strike, int64 close, uint256 payoutPool, uint256 fee);
    event Refunded(uint256 indexed roundId, bool voided);
    event Claimed(uint256 indexed roundId, address indexed account, uint256 amount);
    event FeesSwept(uint256 amount);

    error UnknownAsset();
    error UnknownDuration();
    error OffSchedule();
    error NotStarted();
    error Locked();
    error StakeTooSmall();
    error NoSuchRound();
    error AlreadySettled();
    error TooEarly();
    error Voided();
    error FeeNotCovered();
    error NothingToClaim();
    error BadPrice();
    error Reentrancy();
    error TransferFailed();

    modifier nonReentrant() {
        if (_entered != 1) revert Reentrancy();
        _entered = 2;
        _;
        _entered = 1;
    }

    constructor(IPyth pyth_, address treasury_, uint16 feeBps_, uint32[] memory durations_, Asset[] memory assets_) {
        require(address(pyth_) != address(0) && treasury_ != address(0), "zero address");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        require(assets_.length > 0 && assets_.length <= 32, "assets");
        require(durations_.length > 0 && durations_.length <= 8, "durations");
        pyth = pyth_;
        treasury = treasury_;
        feeBps = feeBps_;
        for (uint256 i = 0; i < durations_.length; i++) {
            uint32 d = durations_[i];
            require(d >= 2 * LOCK && !isDuration[d], "duration");
            isDuration[d] = true;
            _durations.push(d);
        }
        for (uint256 i = 0; i < assets_.length; i++) {
            require(assets_[i].feedId != bytes32(0), "asset");
            _assets.push(assets_[i]);
        }
    }

    // ---------------------------------------------------------------- views

    function assetCount() external view returns (uint256) {
        return _assets.length;
    }

    function getAsset(uint8 asset) external view returns (Asset memory) {
        if (asset >= _assets.length) revert UnknownAsset();
        return _assets[asset];
    }

    function durations() external view returns (uint32[] memory) {
        return _durations;
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        if (roundId == 0 || roundId > roundCount) revert NoSuchRound();
        return _rounds[roundId];
    }

    function positionOf(uint256 roundId, address account) external view returns (Position memory) {
        return _positions[roundId][account];
    }

    function roundsCountOf(address account) external view returns (uint256) {
        return _roundsOf[account].length;
    }

    /// Round ids `account` has entered, oldest first, `count` of them from index `from`.
    function roundsOf(address account, uint256 from, uint256 count) external view returns (uint256[] memory ids) {
        uint256[] storage all = _roundsOf[account];
        if (from >= all.length) return new uint256[](0);
        uint256 n = all.length - from;
        if (n > count) n = count;
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = all[from + i];
    }

    /// True once a round is past VOID_AFTER without a settlement.
    function isVoid(uint256 roundId) public view returns (bool) {
        Round storage r = _rounds[roundId];
        return r.start != 0 && r.outcome == Outcome.Pending && block.timestamp > _end(r) + VOID_AFTER;
    }

    /// What `account` would be paid by claim() right now.
    function owed(uint256 roundId, address account) external view returns (uint256) {
        Round storage r = _rounds[roundId];
        Position storage p = _positions[roundId][account];
        if (r.start == 0 || p.claimed) return 0;
        return _amount(r, p, _effectiveOutcome(r));
    }

    // -------------------------------------------------------------- entering

    /// Stakes msg.value on UP (`up` = true) or DOWN in the round of `asset`
    /// and `duration` that started at `start`. Only the round in progress
    /// can be entered, and only until LOCK seconds before its end.
    function enter(uint8 asset, uint32 duration, uint64 start, bool up) external payable returns (uint256 roundId) {
        if (asset >= _assets.length) revert UnknownAsset();
        if (!isDuration[duration]) revert UnknownDuration();
        if (start == 0 || start % duration != 0) revert OffSchedule();
        if (block.timestamp < start) revert NotStarted();
        if (block.timestamp + LOCK >= uint256(start) + duration) revert Locked();
        if (msg.value < MIN_STAKE || msg.value > type(uint128).max) revert StakeTooSmall();

        roundId = roundIdOf[asset][duration][start];
        if (roundId == 0) {
            roundId = ++roundCount;
            roundIdOf[asset][duration][start] = roundId;
            Round storage created = _rounds[roundId];
            created.asset = asset;
            created.duration = duration;
            created.start = start;
            emit RoundOpened(roundId, asset, duration, start);
        }
        Round storage r = _rounds[roundId];
        Position storage p = _positions[roundId][msg.sender];
        if (p.up == 0 && p.down == 0) _roundsOf[msg.sender].push(roundId);
        if (up) {
            p.up += uint128(msg.value);
            r.upPot += msg.value;
        } else {
            p.down += uint128(msg.value);
            r.downPot += msg.value;
        }
        emit Entered(roundId, msg.sender, up, msg.value);
    }

    // ------------------------------------------------------------ settlement

    /// Stores the first Pyth print at or after `timestamp` for `asset`.
    /// Settling does this by itself; calling it directly only makes a
    /// strike readable on chain before its round ends.
    function pin(uint8 asset, uint64 timestamp, bytes[] calldata updateData) external payable nonReentrant returns (int64 price) {
        if (asset >= _assets.length) revert UnknownAsset();
        if (timestamp > block.timestamp) revert TooEarly();
        uint256 spent;
        (price, spent) = _pin(asset, timestamp, updateData, msg.value);
        _refund(msg.value - spent);
    }

    /// Settles a round that has ended. `startUpdate` and `endUpdate` are the
    /// Pyth updates for the round's start and end seconds (Hermes:
    /// /v2/updates/price/<timestamp>); either may be empty when that print
    /// is already stored in priceAt. A round with an empty side needs no
    /// price at all. msg.value covers the Pyth fee; the excess is returned.
    function settle(uint256 roundId, bytes[] calldata startUpdate, bytes[] calldata endUpdate) external payable nonReentrant {
        Round storage r = _rounds[roundId];
        if (r.start == 0) revert NoSuchRound();
        if (r.outcome != Outcome.Pending) revert AlreadySettled();
        uint256 end = _end(r);
        if (block.timestamp < end) revert TooEarly();
        if (block.timestamp > end + VOID_AFTER) revert Voided();

        if (r.upPot == 0 || r.downPot == 0) {
            r.outcome = Outcome.Refund;
            emit Refunded(roundId, false);
            _refund(msg.value);
            return;
        }

        (int64 strike, uint256 spentA) = _pin(r.asset, r.start, startUpdate, msg.value);
        (int64 close, uint256 spentB) = _pin(r.asset, uint64(end), endUpdate, msg.value - spentA);
        r.strike = strike;
        r.close = close;

        if (close == strike) {
            r.outcome = Outcome.Refund;
        } else {
            bool upWins = close > strike;
            uint256 total = r.upPot + r.downPot;
            uint256 losing = upWins ? r.downPot : r.upPot;
            uint256 fee = (total * feeBps) / 10_000;
            if (fee > losing) fee = losing;
            r.outcome = upWins ? Outcome.Up : Outcome.Down;
            r.fee = fee;
            r.payoutPool = total - fee;
            feesAccrued += fee;
        }
        emit Settled(roundId, r.outcome, strike, close, r.payoutPool, r.fee);
        _refund(msg.value - spentA - spentB);
    }

    /// Pays `account` what the round owes it: its share of a decisive round,
    /// or its stakes back from a refunded or void one. Anyone may trigger it.
    function claim(uint256 roundId, address account) external nonReentrant {
        if (_claim(roundId, account) == 0) revert NothingToClaim();
    }

    /// Same, over several rounds; rounds that owe nothing are skipped.
    function claimMany(uint256[] calldata roundIds, address account) external nonReentrant {
        uint256 total;
        for (uint256 i = 0; i < roundIds.length; i++) total += _claim(roundIds[i], account);
        if (total == 0) revert NothingToClaim();
    }

    /// Sends the accrued fee to the treasury. Anyone may trigger it.
    function sweepFees() external nonReentrant {
        uint256 amount = feesAccrued;
        feesAccrued = 0;
        _pay(treasury, amount);
        emit FeesSwept(amount);
    }

    // ----------------------------------------------------------- internals

    function _end(Round storage r) private view returns (uint256) {
        return uint256(r.start) + r.duration;
    }

    /// The outcome claim() would act on: a stored one, or Refund for a
    /// round that is one-sided once locked, or void.
    function _effectiveOutcome(Round storage r) private view returns (Outcome) {
        if (r.outcome != Outcome.Pending) return r.outcome;
        uint256 end = _end(r);
        if (block.timestamp > end + VOID_AFTER) return Outcome.Refund;
        if (block.timestamp + LOCK >= end && (r.upPot == 0 || r.downPot == 0)) return Outcome.Refund;
        return Outcome.Pending;
    }

    function _amount(Round storage r, Position storage p, Outcome outcome) private view returns (uint256) {
        if (outcome == Outcome.Refund) return uint256(p.up) + uint256(p.down);
        if (outcome == Outcome.Up) return (r.payoutPool * p.up) / r.upPot;
        if (outcome == Outcome.Down) return (r.payoutPool * p.down) / r.downPot;
        return 0;
    }

    function _claim(uint256 roundId, address account) private returns (uint256 amount) {
        Round storage r = _rounds[roundId];
        if (r.start == 0) revert NoSuchRound();
        Position storage p = _positions[roundId][account];
        if (p.claimed) return 0;
        Outcome outcome = _effectiveOutcome(r);
        if (outcome == Outcome.Pending) return 0;
        if (r.outcome == Outcome.Pending) {
            // one-sided after the lock, or void: fixed as a refund from here on
            r.outcome = Outcome.Refund;
            emit Refunded(roundId, block.timestamp > _end(r) + VOID_AFTER);
        }
        amount = _amount(r, p, outcome);
        if (amount == 0) return 0;
        p.claimed = true;
        _pay(account, amount);
        emit Claimed(roundId, account, amount);
    }

    function _pin(uint8 asset, uint64 timestamp, bytes[] calldata updateData, uint256 budget) private returns (int64 price, uint256 spent) {
        price = priceAt[asset][timestamp];
        if (price != 0) return (price, 0);
        spent = pyth.getUpdateFee(updateData);
        if (budget < spent) revert FeeNotCovered();
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _assets[asset].feedId;
        PythStructs.PriceFeed[] memory feeds =
            pyth.parsePriceFeedUpdatesUnique{value: spent}(updateData, ids, timestamp, uint64(timestamp + SETTLE_WINDOW));
        price = _normalize(feeds[0].price.price, feeds[0].price.expo);
        priceAt[asset][timestamp] = price;
        emit PricePinned(asset, timestamp, price);
    }

    /// Any Pyth exponent → 1e-8 USD units.
    function _normalize(int64 price, int32 expo) private pure returns (int64) {
        if (price <= 0) revert BadPrice();
        if (expo == -8) return price;
        int256 p = int256(price);
        if (expo > -8) {
            for (int32 i = expo; i > -8; i--) p *= 10;
        } else {
            for (int32 i = expo; i < -8; i++) p /= 10;
        }
        if (p <= 0 || p > type(int64).max) revert BadPrice();
        return int64(p);
    }

    function _refund(uint256 amount) private {
        if (amount > 0) _pay(msg.sender, amount);
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
