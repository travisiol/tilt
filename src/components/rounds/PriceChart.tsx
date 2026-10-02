import { durationLabel } from "@/config/game";

/** TradingView symbol per asset. A market reference to read the trend; rounds settle on Pyth prints. */
const TV_SYMBOL: Record<string, string> = {
  BTC: "COINBASE:BTCUSD",
  ETH: "COINBASE:ETHUSD",
  NVDA: "NASDAQ:NVDA",
  TSLA: "NASDAQ:TSLA",
  HOOD: "NASDAQ:HOOD",
  MSTR: "NASDAQ:MSTR",
};

/**
 * TradingView's advanced chart, candles sized to the round length. It lives
 * in its own srcdoc iframe so the embed script never meets React's
 * re-renders (Strict Mode runs effects twice in dev).
 */
export function PriceChart({ symbol, duration }: { symbol: string; duration: number }) {
  const tvSymbol = TV_SYMBOL[symbol];
  if (!tvSymbol) return null;
  const config = JSON.stringify({
    symbol: tvSymbol,
    interval: String(Math.round(duration / 60)),
    timezone: "Etc/UTC",
    theme: "light",
    style: "1",
    locale: "en",
    hide_top_toolbar: false,
    hide_legend: false,
    allow_symbol_change: false,
    save_image: false,
    backgroundColor: "#ffffff",
    gridColor: "rgba(28, 20, 16, 0.06)",
    withdateranges: true,
    autosize: true,
  });
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#fff}.tradingview-widget-container,.tradingview-widget-container__widget{height:100%;width:100%}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>${config}</script></div></body></html>`;
  const pair = `${symbol}/USD`;

  return (
    <section className="card mt-8 overflow-hidden" aria-label="Live price chart">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-8">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Live price chart</h2>
          <p className="text-[15px] text-soft">
            TradingView · {durationLabel(duration)} candles · UTC. Rounds settle on Pyth prints, which can differ slightly.
          </p>
        </div>
        <span className="tag num">{pair}</span>
      </div>
      <iframe
        key={`${tvSymbol}-${duration}`}
        title={`TradingView chart ${pair}`}
        srcDoc={srcDoc}
        className="block h-[380px] w-full border-0 border-t border-line sm:h-[460px]"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </section>
  );
}
