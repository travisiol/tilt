import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { ASSETS, DURATIONS, FEE_BPS, assetTuples } from "../../src/config/game";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";
import multicall3 from "./lib/multicall3.json";

/**
 * Deploys Tilt.
 *
 *   npm run deploy:robinhood   — DEPLOYER_PRIVATE_KEY, TREASURY and
 *                                PYTH_ADDRESS in contracts/.env
 *   npm run deploy:local       — against `npm run node` (port 8817); deploys a
 *                                MockPyth first when PYTH_ADDRESS is unset and
 *                                installs Multicall3 so the site's batched
 *                                reads work on a bare node
 *
 * Durations, fee and assets come from src/config/game.ts. The script writes
 * contracts/deployments/<network>.json and prints the line to put in the
 * site's environment; it never edits the site's environment itself.
 */
/** Starting prints for MockPyth on a local node, whole dollars, in ASSETS order. Never used on a real network. */
const LOCAL_MOCK_USD = [80_000, 2_500, 180, 400, 100, 300];

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer: set DEPLOYER_PRIVATE_KEY in contracts/.env");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const local = network.name === "hardhat" || network.name === "localhost";

  const treasury = process.env.TREASURY?.trim() || (local ? deployer.address : "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(treasury)) throw new Error("TREASURY must be an address (contracts/.env)");

  let pyth = process.env.PYTH_ADDRESS?.trim() ?? "";
  let mock = false;
  if (!pyth) {
    if (!local) throw new Error("PYTH_ADDRESS is required on a real network");
    const mockPyth = await (await ethers.getContractFactory("MockPyth")).deploy(0);
    await mockPyth.waitForDeployment();
    pyth = await mockPyth.getAddress();
    mock = true;
    // MockPyth starts empty: give every feed a starting print so the local site has a price to read.
    // These numbers exist only on the local node.
    const now = Number((await ethers.provider.getBlock("latest"))!.timestamp);
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const updates = ASSETS.map((a, i) =>
      coder.encode(["bytes32", "int64", "uint64", "int32", "uint64", "uint64"], [a.feedId, BigInt(LOCAL_MOCK_USD[i] ?? 100) * 100_000_000n, 0n, -8, now, now - 1]),
    );
    await (await mockPyth.updatePriceFeeds(updates)).wait();
    console.log(`MockPyth at ${pyth}`);
  }
  if ((await ethers.provider.getCode(pyth)) === "0x") throw new Error(`no code at Pyth ${pyth} on chain ${chainId}`);
  if (local && (await ethers.provider.getCode(multicall3.address)) === "0x") {
    await network.provider.send("hardhat_setCode", [multicall3.address, multicall3.code]);
  }

  console.log(`network ${network.name} chainId ${chainId} deployer ${deployer.address}`);
  console.log(`pyth ${pyth} treasury ${treasury} fee ${FEE_BPS} bps, durations ${DURATIONS.join("/")} s, ${ASSETS.length} assets`);

  const tilt = await (await ethers.getContractFactory("Tilt")).deploy(pyth, treasury, FEE_BPS, [...DURATIONS], assetTuples());
  const tx = tilt.deploymentTransaction();
  await tilt.waitForDeployment();
  const address = await tilt.getAddress();
  console.log(`Tilt at ${address} (tx ${tx?.hash})`);

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    tilt: address,
    pyth,
    treasury,
    feeBps: FEE_BPS,
    durations: [...DURATIONS],
    assets: ASSETS.map((a) => a.symbol),
    deployedAt: new Date().toISOString(),
    txHash: tx?.hash ?? null,
  };
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, `${local ? "local" : network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${file}`);
  console.log(`\nsite environment:\nNEXT_PUBLIC_TILT_ADDRESS=${address}`);
  if (local) {
    console.log(`NEXT_PUBLIC_CHAIN_ID=${chainId}\nNEXT_PUBLIC_RPC_URL=http://127.0.0.1:8817\nNEXT_PUBLIC_PYTH_ADDRESS=${pyth}${mock ? "\nNEXT_PUBLIC_PYTH_MOCK=1" : ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
