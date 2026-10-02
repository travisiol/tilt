/**
 * Development only. Plays one whole round in a real (headless) browser against
 * a LOCAL Hardhat node, through the site's own buttons:
 *
 *   connect → stake UP → stake DOWN → (clock jumps to the end) → settle → claim
 *
 * Needs: `npm --prefix contracts run node`, `npm --prefix contracts run deploy:local`,
 * and the dev server started with the environment deploy:local printed.
 * The "wallet" is a stub injected into the page that forwards transactions to
 * the node's unlocked test account #1; a second test account takes the other
 * side directly on the node. Nothing here can reach a real network: the script
 * refuses any chain id other than 31337.
 *
 *   node scripts/play-local.mjs [base=http://localhost:3817] [outDir=shots]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { encodeFunctionData, formatEther, parseAbi, parseEther } from "viem";

const base = process.argv[2] ?? "http://localhost:3817";
const out = resolve(process.argv[3] ?? "shots");
mkdirSync(out, { recursive: true });

const RPC = "http://127.0.0.1:8817";
const record = JSON.parse(readFileSync(resolve("contracts/deployments/local.json"), "utf8"));
const TILT = record.tilt;
const DURATION = 300;
const abi = parseAbi(["function enter(uint8 asset, uint32 duration, uint64 start, bool up) payable returns (uint256)"]);

let rpcId = 1;
async function rpc(method, params = []) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chainNow = async () => Number((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp);
const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]));

if (Number(await rpc("eth_chainId")) !== 31337) throw new Error("play-local only runs against a local Hardhat node (chain 31337)");
// the node's own unlocked test accounts: #1 plays through the site, #2 takes the other side
const [, PLAYER, OTHER] = await rpc("eth_accounts");
const SHORT = PLAYER.slice(2, 6);

const STUB = `(() => {
  const RPC = ${JSON.stringify(RPC)}, ACCOUNT = ${JSON.stringify(PLAYER)};
  let id = 1;
  const rpc = async (method, params) => {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params ?? [] }) });
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
    return j.result;
  };
  const provider = {
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ACCOUNT];
      if (method === "eth_chainId") return "0x7a69";
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
      if (method === "eth_sendTransaction") {
        const tx = { ...params[0], from: ACCOUNT };
        (window.__STUB_TXS ||= []).push(tx);
        return rpc(method, [tx]);
      }
      return rpc(method, params);
    },
    on: () => {},
    removeListener: () => {},
  };
  window.ethereum = provider;
  const info = { uuid: "0b0f3a5e-6c1d-4a3f-9a57-000000000001", name: "Local Stub", icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", rdns: "local.stub" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;

const CANDIDATES = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"];
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error("no Chrome found");
const PORT = 9348;
const proc = spawn(
  chrome,
  ["--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${resolve(tmpdir(), "tilt-play")}`, `--remote-debugging-port=${PORT}`, "--hide-scrollbars", "--window-size=1536,864", "about:blank"],
  { stdio: "ignore" },
);

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
    } catch {
      await sleep(200);
    }
  }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });

  const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const text = () => evaluate("document.body.innerText");
  /** Clicks the first enabled button whose text matches; returns its text, or null. */
  const click = (pattern) =>
    evaluate(`(() => { const re = new RegExp(${JSON.stringify(pattern)}); const b = [...document.querySelectorAll("button")].find((x) => !x.disabled && re.test(x.innerText.replace(/\\s+/g, " ").trim())); if (!b) return null; b.click(); return b.innerText.replace(/\\s+/g, " ").trim(); })()`);
  const waitFor = async (pattern, ms = 30_000) => {
    const re = new RegExp(pattern);
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (re.test(await text())) return true;
      await sleep(500);
    }
    throw new Error(`timed out waiting for /${pattern}/ — page says:\n${(await text()).slice(0, 1500)}`);
  };
  const shot = async (name, w, h, mobile = false) => {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    await sleep(1200);
    const { contentSize } = await cdp.send("Page.getLayoutMetrics");
    const height = Math.min(Math.ceil(contentSize.height), 12000);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height, scale: 1 } });
    writeFileSync(resolve(out, `${name}.png`), Buffer.from(data, "base64"));
    const overflow = await evaluate("JSON.stringify({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })");
    say(`  shot ${name}.png ${overflow}`);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 864, deviceScaleFactor: 1, mobile: false });
  };

  // a round with at least two minutes left before its lock
  let now = Math.max(await chainNow(), Math.floor(Date.now() / 1000));
  let start = Math.floor(now / DURATION) * DURATION;
  if (start + DURATION - 30 - now < 120) {
    start += DURATION;
    await rpc("evm_setNextBlockTimestamp", [start + 2]);
    await rpc("evm_mine");
    say(`clock moved to the start of the next round (${start})`);
  }
  const before = await balance(PLAYER);

  // the other side, sent straight to the node by test account #2
  await rpc("eth_sendTransaction", [{ from: OTHER, to: TILT, value: "0x" + parseEther("0.02").toString(16), data: encodeFunctionData({ abi, functionName: "enter", args: [0, DURATION, BigInt(start), false] }) }]);
  say(`account #2 staked 0.02 ETH on DOWN in BTC round ${start}`);

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 864, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: `${base}/rounds/btc` });
  await waitFor("Your ticket");
  await sleep(4000);

  say(`click: ${await click("^Connect wallet$")}`);
  await sleep(1500);
  say(`click: ${await click("Local Stub")}`);
  await waitFor(`0x(${SHORT}|${SHORT.toUpperCase()})`);
  await waitFor("DOWN pot");
  say(`connected as 0x${SHORT}…; the page shows the round's pots`);

  say(`click: ${await click("^Stake 0\\.01 ETH on UP$")}`);
  await waitFor("Already in this round: 0\\.01 ETH on UP");
  say(`click: ${await click("^DOWN close below strike$")}`);
  await sleep(500);
  say(`click: ${await click("^Stake 0\\.01 ETH on DOWN$")}`);
  await waitFor("Already in this round: 0\\.01 ETH on UP · 0\\.01 ETH on DOWN");
  await sleep(5000);
  say(`both stakes are in; the page reads: ${(/UP pot[\s\S]*?DOWN pot\s+\S+ ETH/.exec(await text()) ?? ["?"])[0].replace(/\s+/g, " ")}`);
  await shot("rounds-1536-local-open", 1536, 864);
  await shot("rounds-390-local-open", 390, 844, true);

  // jump the local clock past the end of the round, through the site's dev route
  const warp = await (await fetch(`${base}/api/dev/warp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: start + DURATION + 3 }) })).json();
  say(`clock moved to ${warp.now} (round ended at ${start + DURATION})`);
  await waitFor("Awaiting settlement");
  await shot("rounds-1536-local-awaiting", 1536, 864);
  say(`click: ${await click("^Settle$")}`);
  await waitFor("(UP|DOWN) won");
  const result = /(UP|DOWN) won/.exec(await text())[0];
  say(`settled through the site: ${result}`);
  await waitFor("Won · to claim");
  const claimLabel = await click("^Claim ");
  say(`click: ${claimLabel}`);
  await waitFor("Paid");
  await sleep(1500);
  await shot("rounds-1536-local-settled", 1536, 864);
  await shot("rounds-390-local-settled", 390, 844, true);

  const after = await balance(PLAYER);
  const txs = await evaluate("JSON.stringify((window.__STUB_TXS || []).map((t) => ({ to: t.to, value: t.value, data: t.data.slice(0, 10) })))");
  say(`wallet transactions asked by the site: ${txs}`);
  say(`player balance change over the whole round (stakes, payout, gas): ${formatEther(after - before)} ETH`);
  writeFileSync(resolve(out, "play-local.log"), log.join("\n") + "\n");
} finally {
  proc.kill();
}
