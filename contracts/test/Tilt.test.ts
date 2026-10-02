import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AbiCoder, parseEther, type Signer } from "ethers";
import type { MockPyth, Tilt } from "../typechain-types";
import { ASSETS, DURATIONS, FEE_BPS, LOCK_SECONDS, MIN_STAKE_WEI, SETTLE_WINDOW_SECONDS, VOID_AFTER_SECONDS, assetTuples } from "../../src/config/game";

const coder = AbiCoder.defaultAbiCoder();
const FIVE = 300;
const HOUR = 3600;
const BTC = 0;
const ETH = 1;

const PENDING = 0n;
const UP = 1n;
const DOWN = 2n;
const REFUND = 3n;

/** $ → 1e-8 units. */
const usd = (x: number) => BigInt(Math.round(x * 1e8));

function encodeUpdate(feedId: string, price: bigint, expo: number, publishTime: number, prevPublishTime: number): string {
  return coder.encode(["bytes32", "int64", "uint64", "int32", "uint64", "uint64"], [feedId, price, 0n, expo, publishTime, prevPublishTime]);
}

/** The first print at or after `at` for `asset`. */
function print(asset: number, price: number, at: number, offset = 0, prevOffset = -1, expo = -8): string[] {
  const p = expo === -8 ? usd(price) : BigInt(Math.round(price * 10 ** -expo));
  return [encodeUpdate(ASSETS[asset].feedId, p, expo, at + offset, at + prevOffset)];
}

describe("Tilt", () => {
  let tilt: Tilt;
  let pyth: MockPyth;
  let treasury: Signer, alice: Signer, bob: Signer, carol: Signer, keeper: Signer;
  let treasuryAddr: string, aliceAddr: string, bobAddr: string, carolAddr: string;

  /** Moves the clock to 10 s into a fresh round of `duration` and returns its start. */
  async function freshRound(duration: number = FIVE): Promise<number> {
    const now = await time.latest();
    const start = (Math.floor(now / duration) + 1) * duration;
    await time.increaseTo(start + 10);
    return start;
  }

  async function enter(who: Signer, start: number, up: boolean, eth: string, asset = BTC, duration = FIVE) {
    return tilt.connect(who).enter(asset, duration, start, up, { value: parseEther(eth) });
  }

  beforeEach(async () => {
    [, treasury, alice, bob, carol, keeper] = await ethers.getSigners();
    treasuryAddr = await treasury.getAddress();
    aliceAddr = await alice.getAddress();
    bobAddr = await bob.getAddress();
    carolAddr = await carol.getAddress();
    pyth = await (await ethers.getContractFactory("MockPyth")).deploy(0);
    tilt = await (await ethers.getContractFactory("Tilt")).deploy(await pyth.getAddress(), treasuryAddr, FEE_BPS, [...DURATIONS], assetTuples());
  });

  describe("configuration", () => {
    it("compiles the constants the site prints from src/config/game.ts", async () => {
      expect(await tilt.LOCK()).to.equal(LOCK_SECONDS);
      expect(await tilt.SETTLE_WINDOW()).to.equal(SETTLE_WINDOW_SECONDS);
      expect(await tilt.VOID_AFTER()).to.equal(VOID_AFTER_SECONDS);
      expect(await tilt.MIN_STAKE()).to.equal(MIN_STAKE_WEI);
      expect(await tilt.feeBps()).to.equal(FEE_BPS);
      expect((await tilt.durations()).map(Number)).to.deep.equal([...DURATIONS]);
      expect(await tilt.assetCount()).to.equal(ASSETS.length);
      for (let i = 0; i < ASSETS.length; i++) {
        const a = await tilt.getAsset(i);
        expect(a.feedId).to.equal(ASSETS[i].feedId);
        expect(a.symbol).to.equal(ASSETS[i].symbol);
      }
      expect(await tilt.treasury()).to.equal(treasuryAddr);
    });

    it("refuses a fee above 5 %, a zero treasury, duplicate or too-short durations", async () => {
      const f = await ethers.getContractFactory("Tilt");
      const p = await pyth.getAddress();
      await expect(f.deploy(p, treasuryAddr, 501, [...DURATIONS], assetTuples())).to.be.revertedWith("fee too high");
      await expect(f.deploy(p, ethers.ZeroAddress, FEE_BPS, [...DURATIONS], assetTuples())).to.be.revertedWith("zero address");
      await expect(f.deploy(p, treasuryAddr, FEE_BPS, [300, 300], assetTuples())).to.be.revertedWith("duration");
      await expect(f.deploy(p, treasuryAddr, FEE_BPS, [59], assetTuples())).to.be.revertedWith("duration");
      await expect(f.deploy(p, treasuryAddr, FEE_BPS, [], assetTuples())).to.be.revertedWith("durations");
    });
  });

  describe("entering", () => {
    it("opens the round with the first stake and keeps two pots", async () => {
      const start = await freshRound();
      await expect(enter(alice, start, true, "0.3")).to.emit(tilt, "RoundOpened").withArgs(1n, BTC, FIVE, start);
      await expect(enter(bob, start, false, "0.1")).to.emit(tilt, "Entered").withArgs(1n, bobAddr, false, parseEther("0.1"));
      await enter(alice, start, true, "0.2");
      const id = await tilt.roundIdOf(BTC, FIVE, start);
      expect(id).to.equal(1n);
      const r = await tilt.getRound(id);
      expect(r.asset).to.equal(BTC);
      expect(r.duration).to.equal(FIVE);
      expect(r.start).to.equal(start);
      expect(r.outcome).to.equal(PENDING);
      expect(r.upPot).to.equal(parseEther("0.5"));
      expect(r.downPot).to.equal(parseEther("0.1"));
      const pos = await tilt.positionOf(id, aliceAddr);
      expect(pos.up).to.equal(parseEther("0.5"));
      expect(pos.down).to.equal(0n);
      expect(await tilt.roundsCountOf(aliceAddr)).to.equal(1n);
      expect(await tilt.roundsOf(aliceAddr, 0, 10)).to.deep.equal([1n]);
      expect(await ethers.provider.getBalance(await tilt.getAddress())).to.equal(parseEther("0.6"));
    });

    it("keeps rounds of different assets and durations apart", async () => {
      const start = await freshRound(HOUR); // a multiple of 300, 900 and 3600
      await enter(alice, start, true, "0.01", BTC, FIVE);
      await enter(alice, start, true, "0.01", ETH, FIVE);
      await enter(alice, start, true, "0.01", BTC, 900);
      await enter(alice, start, true, "0.01", BTC, HOUR);
      expect(await tilt.roundCount()).to.equal(4n);
      expect(await tilt.roundsOf(aliceAddr, 1, 2)).to.deep.equal([2n, 3n]);
      expect(await tilt.roundsOf(aliceAddr, 9, 2)).to.deep.equal([]);
    });

    it("rejects unknown assets and durations, off-grid starts, future rounds and small stakes", async () => {
      const start = await freshRound();
      await expect(tilt.connect(alice).enter(ASSETS.length, FIVE, start, true, { value: parseEther("0.01") })).to.be.revertedWithCustomError(tilt, "UnknownAsset");
      await expect(tilt.connect(alice).enter(BTC, 600, start - (start % 600), true, { value: parseEther("0.01") })).to.be.revertedWithCustomError(tilt, "UnknownDuration");
      await expect(tilt.connect(alice).enter(BTC, FIVE, start + 1, true, { value: parseEther("0.01") })).to.be.revertedWithCustomError(tilt, "OffSchedule");
      await expect(tilt.connect(alice).enter(BTC, FIVE, start + FIVE, true, { value: parseEther("0.01") })).to.be.revertedWithCustomError(tilt, "NotStarted");
      await expect(tilt.connect(alice).enter(BTC, FIVE, start, true, { value: MIN_STAKE_WEI - 1n })).to.be.revertedWithCustomError(tilt, "StakeTooSmall");
      await expect(tilt.connect(alice).enter(BTC, FIVE, start, true, { value: MIN_STAKE_WEI })).to.not.be.reverted;
    });

    it("locks 30 seconds before the end, and a finished round cannot be entered", async () => {
      const start = await freshRound();
      await time.setNextBlockTimestamp(start + FIVE - LOCK_SECONDS - 1);
      await expect(enter(alice, start, true, "0.01")).to.not.be.reverted; // last open second
      await time.setNextBlockTimestamp(start + FIVE - LOCK_SECONDS);
      await expect(enter(alice, start, true, "0.01")).to.be.revertedWithCustomError(tilt, "Locked");
      await time.increaseTo(start + FIVE + 5);
      await expect(enter(alice, start, true, "0.01")).to.be.revertedWithCustomError(tilt, "Locked");
    });
  });

  describe("settlement", () => {
    it("pays the UP pot both pots minus 2 % when the close is above the strike", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.3");
      await enter(carol, start, true, "0.1");
      await enter(bob, start, false, "0.6");
      await time.increaseTo(start + FIVE);
      const total = parseEther("1");
      const fee = (total * BigInt(FEE_BPS)) / 10_000n; // 0.02
      const pool = total - fee; // 0.98
      await expect(tilt.connect(keeper).settle(1, print(BTC, 80_000, start), print(BTC, 80_000.01, start + FIVE)))
        .to.emit(tilt, "Settled")
        .withArgs(1n, UP, usd(80_000), usd(80_000.01), pool, fee);
      const r = await tilt.getRound(1);
      expect(r.outcome).to.equal(UP);
      expect(r.strike).to.equal(usd(80_000));
      expect(r.close).to.equal(usd(80_000.01));
      expect(r.payoutPool).to.equal(pool);
      expect(r.fee).to.equal(fee);
      expect(await tilt.feesAccrued()).to.equal(fee);

      // alice 0.3 of 0.4 UP → 0.735, carol 0.1 of 0.4 → 0.245, bob nothing
      expect(await tilt.owed(1, aliceAddr)).to.equal(parseEther("0.735"));
      expect(await tilt.owed(1, carolAddr)).to.equal(parseEther("0.245"));
      expect(await tilt.owed(1, bobAddr)).to.equal(0n);
      await expect(tilt.connect(keeper).claim(1, aliceAddr)).to.changeEtherBalance(alice, parseEther("0.735"));
      await expect(tilt.connect(carol).claim(1, carolAddr)).to.changeEtherBalance(carol, parseEther("0.245"));
      await expect(tilt.claim(1, bobAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim");
      // what is left in the contract is exactly the fee
      expect(await ethers.provider.getBalance(await tilt.getAddress())).to.equal(fee);
    });

    it("pays the DOWN pot when the close is below the strike", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.5");
      await enter(bob, start, false, "0.25");
      await enter(carol, start, false, "0.25");
      await time.increaseTo(start + FIVE + 60);
      await tilt.settle(1, print(BTC, 80_000, start), print(BTC, 79_950, start + FIVE));
      const r = await tilt.getRound(1);
      expect(r.outcome).to.equal(DOWN);
      expect(await tilt.owed(1, aliceAddr)).to.equal(0n);
      expect(await tilt.owed(1, bobAddr)).to.equal(parseEther("0.49"));
      await expect(tilt.claim(1, bobAddr)).to.changeEtherBalance(bob, parseEther("0.49"));
      await expect(tilt.claim(1, carolAddr)).to.changeEtherBalance(carol, parseEther("0.49"));
      await expect(tilt.claim(1, aliceAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim");
    });

    it("only pays the winning side of a wallet that staked on both", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.1");
      await enter(alice, start, false, "0.1");
      await enter(bob, start, false, "0.3");
      await time.increaseTo(start + FIVE);
      await tilt.settle(1, print(BTC, 100, start), print(BTC, 101, start + FIVE));
      // total 0.5, fee 0.01, pool 0.49, alice holds the whole UP pot
      expect(await tilt.owed(1, aliceAddr)).to.equal(parseEther("0.49"));
      expect(await tilt.roundsCountOf(aliceAddr)).to.equal(1n);
    });

    it("caps the fee at the losing pot, so a winner never gets back less than the stake", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "1");
      await enter(bob, start, false, "0.001");
      await time.increaseTo(start + FIVE);
      await tilt.settle(1, print(BTC, 100, start), print(BTC, 101, start + FIVE));
      const r = await tilt.getRound(1);
      // 2 % of 1.001 would be 0.02002: more than the 0.001 the losing side put in
      expect(r.fee).to.equal(parseEther("0.001"));
      expect(r.payoutPool).to.equal(parseEther("1"));
      expect(await tilt.owed(1, aliceAddr)).to.equal(parseEther("1"));
    });

    it("refunds everyone, without a fee, when the price is flat", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.6");
      await time.increaseTo(start + FIVE);
      await expect(tilt.settle(1, print(BTC, 80_000, start), print(BTC, 80_000, start + FIVE)))
        .to.emit(tilt, "Settled")
        .withArgs(1n, REFUND, usd(80_000), usd(80_000), 0n, 0n);
      expect(await tilt.feesAccrued()).to.equal(0n);
      await expect(tilt.claim(1, aliceAddr)).to.changeEtherBalance(alice, parseEther("0.3"));
      await expect(tilt.claim(1, bobAddr)).to.changeEtherBalance(bob, parseEther("0.6"));
      expect(await ethers.provider.getBalance(await tilt.getAddress())).to.equal(0n);
    });

    it("refunds a one-sided round as soon as it locks, with no price needed", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.3");
      await enter(carol, start, true, "0.2");
      // before the lock the other side can still show up: nothing is owed yet
      expect(await tilt.owed(1, aliceAddr)).to.equal(0n);
      await expect(tilt.claim(1, aliceAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim");
      await time.increaseTo(start + FIVE - LOCK_SECONDS);
      expect(await tilt.owed(1, aliceAddr)).to.equal(parseEther("0.3"));
      await expect(tilt.claim(1, aliceAddr)).to.emit(tilt, "Refunded").withArgs(1n, false);
      expect((await tilt.getRound(1)).outcome).to.equal(REFUND);
      // settle() takes the same path and needs no update
      await time.increaseTo(start + FIVE);
      await expect(tilt.settle(1, [], [])).to.be.revertedWithCustomError(tilt, "AlreadySettled");
      await expect(tilt.claim(1, carolAddr)).to.changeEtherBalance(carol, parseEther("0.2"));
      expect(await tilt.feesAccrued()).to.equal(0n);
    });

    it("settles a one-sided round as a refund through settle() too", async () => {
      const start = await freshRound();
      await enter(bob, start, false, "0.4");
      await time.increaseTo(start + FIVE);
      await expect(tilt.settle(1, [], [])).to.emit(tilt, "Refunded").withArgs(1n, false);
      await expect(tilt.claim(1, bobAddr)).to.changeEtherBalance(bob, parseEther("0.4"));
    });

    it("cannot be settled before the end, twice, or for a round nobody entered", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.3");
      await expect(tilt.settle(1, print(BTC, 100, start), print(BTC, 101, start + FIVE))).to.be.revertedWithCustomError(tilt, "TooEarly");
      await expect(tilt.settle(2, [], [])).to.be.revertedWithCustomError(tilt, "NoSuchRound");
      await time.increaseTo(start + FIVE);
      await tilt.settle(1, print(BTC, 100, start), print(BTC, 101, start + FIVE));
      await expect(tilt.settle(1, print(BTC, 100, start), print(BTC, 99, start + FIVE))).to.be.revertedWithCustomError(tilt, "AlreadySettled");
    });

    it("only accepts the first print at or after each boundary, within 15 minutes", async () => {
      const start = await freshRound();
      const end = start + FIVE;
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.3");
      await time.increaseTo(end + SETTLE_WINDOW_SECONDS + 120);
      const goodStart = print(BTC, 100, start);
      const goodEnd = print(BTC, 101, end);
      // a print from before the boundary
      await expect(tilt.settle(1, goodStart, print(BTC, 99, end, -1, -2))).to.be.revertedWithCustomError(pyth, "PriceFeedNotFoundWithinRange");
      // a later print: the one before it was already at or after the boundary
      await expect(tilt.settle(1, goodStart, print(BTC, 99, end, 3, 1))).to.be.revertedWithCustomError(pyth, "PriceFeedNotFoundWithinRange");
      // a print too long after the boundary
      await expect(tilt.settle(1, goodStart, print(BTC, 99, end, SETTLE_WINDOW_SECONDS + 1, -5))).to.be.revertedWithCustomError(pyth, "PriceFeedNotFoundWithinRange");
      // another asset's print
      await expect(tilt.settle(1, goodStart, print(ETH, 99, end))).to.be.revertedWithCustomError(pyth, "PriceFeedNotFoundWithinRange");
      // a bad strike print fails the same way
      await expect(tilt.settle(1, print(BTC, 200, start, 4, 2), goodEnd)).to.be.revertedWithCustomError(pyth, "PriceFeedNotFoundWithinRange");
      // the first print two seconds late is still the first print
      await tilt.settle(1, print(BTC, 100, start, 2, -1), print(BTC, 101, end, 0, -3));
      expect((await tilt.getRound(1)).outcome).to.equal(UP);
    });

    it("stores boundary prints once: the close of a round is the strike of the next", async () => {
      const s1 = await freshRound();
      const s2 = s1 + FIVE;
      await enter(alice, s1, true, "0.3");
      await enter(bob, s1, false, "0.3");
      await time.increaseTo(s2 + 5);
      await enter(alice, s2, true, "0.2");
      await enter(bob, s2, false, "0.2");
      await time.increaseTo(s2 + FIVE);
      await expect(tilt.settle(1, print(BTC, 100, s1), print(BTC, 101, s2)))
        .to.emit(tilt, "PricePinned")
        .withArgs(BTC, s2, usd(101));
      expect(await tilt.priceAt(BTC, s1)).to.equal(usd(100));
      expect(await tilt.priceAt(BTC, s2)).to.equal(usd(101));
      // round 2: the strike is already stored, whatever is passed for it is ignored
      await tilt.settle(2, print(BTC, 5_000, s2), print(BTC, 100.5, s2 + FIVE));
      const r2 = await tilt.getRound(2);
      expect(r2.strike).to.equal(usd(101));
      expect(r2.close).to.equal(usd(100.5));
      expect(r2.outcome).to.equal(DOWN);
      // and an empty update works for a stored boundary
      expect(await tilt.priceAt(ETH, s2)).to.equal(0n);
    });

    it("lets anyone pin a strike while the round runs", async () => {
      const start = await freshRound();
      await expect(tilt.connect(keeper).pin(BTC, start, print(BTC, 250.5, start)))
        .to.emit(tilt, "PricePinned")
        .withArgs(BTC, start, usd(250.5));
      await expect(tilt.pin(BTC, start + FIVE, print(BTC, 251, start + FIVE))).to.be.revertedWithCustomError(tilt, "TooEarly");
      await expect(tilt.pin(ASSETS.length, start, print(BTC, 251, start))).to.be.revertedWithCustomError(tilt, "UnknownAsset");
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.3");
      await time.increaseTo(start + FIVE);
      await tilt.settle(1, [], print(BTC, 250.49, start + FIVE));
      expect((await tilt.getRound(1)).outcome).to.equal(DOWN);
    });

    it("reads prices in 1e-8 USD whatever the feed's exponent", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.3");
      await time.increaseTo(start + FIVE);
      // strike 182.34 at expo -5, close 182.35 at expo -10
      await tilt.settle(1, print(BTC, 182.34, start, 0, -1, -5), print(BTC, 182.35, start + FIVE, 0, -1, -10));
      const r = await tilt.getRound(1);
      expect(r.strike).to.equal(usd(182.34));
      expect(r.close).to.equal(usd(182.35));
      expect(r.outcome).to.equal(UP);
    });

    it("forwards the Pyth fee and returns the excess", async () => {
      await pyth.setFee(1_000n);
      const start = await freshRound();
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.3");
      await time.increaseTo(start + FIVE);
      const a = print(BTC, 100, start);
      const b = print(BTC, 101, start + FIVE);
      await expect(tilt.connect(keeper).settle(1, a, b, { value: 1_999n })).to.be.revertedWithCustomError(tilt, "FeeNotCovered");
      await expect(tilt.connect(keeper).settle(1, a, b, { value: 5_000n })).to.changeEtherBalances([keeper, pyth], [-2_000n, 2_000n]);
      // stakes untouched by the oracle fee
      expect(await ethers.provider.getBalance(await tilt.getAddress())).to.equal(parseEther("0.6"));
    });
  });

  describe("void", () => {
    it("refunds a round nobody settled for a day, and it can no longer be settled", async () => {
      const start = await freshRound();
      const end = start + FIVE;
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.6");
      await time.increaseTo(end + VOID_AFTER_SECONDS);
      // the last second it can still be settled: not void yet
      expect(await tilt.isVoid(1)).to.equal(false);
      expect(await tilt.owed(1, aliceAddr)).to.equal(0n);
      await time.increaseTo(end + VOID_AFTER_SECONDS + 1);
      expect(await tilt.isVoid(1)).to.equal(true);
      await expect(tilt.settle(1, print(BTC, 100, start), print(BTC, 101, end))).to.be.revertedWithCustomError(tilt, "Voided");
      expect(await tilt.owed(1, bobAddr)).to.equal(parseEther("0.6"));
      await expect(tilt.connect(keeper).claim(1, aliceAddr)).to.emit(tilt, "Refunded").withArgs(1n, true);
      await expect(tilt.claim(1, bobAddr)).to.changeEtherBalance(bob, parseEther("0.6"));
      expect((await tilt.getRound(1)).outcome).to.equal(REFUND);
      expect(await tilt.feesAccrued()).to.equal(0n);
      expect(await ethers.provider.getBalance(await tilt.getAddress())).to.equal(0n);
    });
  });

  describe("claims", () => {
    it("pays once: a second claim, a stranger and an open round get nothing", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.3");
      await enter(bob, start, false, "0.3");
      await expect(tilt.claim(1, aliceAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim"); // still running
      await time.increaseTo(start + FIVE);
      await expect(tilt.claim(1, aliceAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim"); // ended, not settled
      await tilt.settle(1, print(BTC, 100, start), print(BTC, 101, start + FIVE));
      await expect(tilt.claim(1, carolAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim"); // never entered
      await expect(tilt.claim(1, aliceAddr)).to.emit(tilt, "Claimed").withArgs(1n, aliceAddr, parseEther("0.588"));
      expect(await tilt.owed(1, aliceAddr)).to.equal(0n);
      await expect(tilt.claim(1, aliceAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim");
      await expect(tilt.claim(7, aliceAddr)).to.be.revertedWithCustomError(tilt, "NoSuchRound");
    });

    it("claims several rounds at once and skips the ones that owe nothing", async () => {
      const s1 = await freshRound();
      await enter(alice, s1, true, "0.3");
      await enter(bob, s1, false, "0.3");
      await time.increaseTo(s1 + FIVE + 5);
      const s2 = s1 + FIVE;
      await enter(alice, s2, true, "0.2");
      await enter(bob, s2, false, "0.2");
      await time.increaseTo(s2 + FIVE + 5);
      const s3 = s2 + FIVE;
      await enter(alice, s3, true, "0.1"); // still running, two-sided later or not: owes nothing now
      await tilt.settle(1, print(BTC, 100, s1), print(BTC, 101, s2)); // alice wins 0.588
      await tilt.settle(2, [], print(BTC, 100, s3)); // alice loses
      await expect(tilt.connect(keeper).claimMany([1, 2, 3], aliceAddr)).to.changeEtherBalance(alice, parseEther("0.588"));
      await expect(tilt.claimMany([1, 2, 3], aliceAddr)).to.be.revertedWithCustomError(tilt, "NothingToClaim");
      await expect(tilt.claimMany([2], bobAddr)).to.changeEtherBalance(bob, parseEther("0.392"));
    });
  });

  describe("fee", () => {
    it("is swept to the treasury by anyone, once", async () => {
      const start = await freshRound();
      await enter(alice, start, true, "0.5");
      await enter(bob, start, false, "0.5");
      await time.increaseTo(start + FIVE);
      await tilt.settle(1, print(BTC, 100, start), print(BTC, 99, start + FIVE));
      const fee = parseEther("0.02");
      await expect(tilt.connect(keeper).sweepFees()).to.changeEtherBalance(treasury, fee);
      expect(await tilt.feesAccrued()).to.equal(0n);
      await expect(tilt.connect(keeper).sweepFees()).to.changeEtherBalance(treasury, 0n);
      // the winner's money is still there after the sweep
      await expect(tilt.claim(1, bobAddr)).to.changeEtherBalance(bob, parseEther("0.98"));
      expect(await ethers.provider.getBalance(await tilt.getAddress())).to.equal(0n);
    });

    it("has no owner functions: nothing but sweepFees moves money to the treasury", async () => {
      const names = tilt.interface.fragments.filter((f) => f.type === "function").map((f) => (f as { name: string }).name);
      for (const banned of ["owner", "transferOwnership", "pause", "setFee", "setTreasury", "withdraw", "upgradeTo"]) {
        expect(names).to.not.include(banned);
      }
    });
  });
});
