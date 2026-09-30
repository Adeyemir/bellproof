# Bellproof demo script

**Target length:** 3 minutes 40 seconds; stay under the hackathon's four-minute limit. **Demo URL:** [bellproof-one.vercel.app](https://bellproof-one.vercel.app/).

This is a script for a **recorded** demo after the small mainnet test. Read the “Say” lines in your own voice. The “Show” lines are screen directions, not narration. Keep the actual wallet prompts and transaction result on screen. Cut waiting time, but do not cut around an error or imply a transaction settled when it did not.

## One-sentence pitch

> Bellproof checks a tokenized-stock rebalance against the real BSC asset, market session, swap route, and wallet limits before I sign—and records why it traded, waited, or blocked.

## Four-minute video

### 0:00–0:22 — Why this exists

**Show:** Open the Bellproof home page. Keep “Keep your stock basket within policy” and “PROPOSE / VERIFY / EXECUTE / RECORD” visible, then open **Live execution** in the workspace.

**Say:**

> A tokenized stock can trade while the underlying market is closed. A quote alone doesn't tell me whether a basket rebalance is allowed by my rules. Bellproof sits between the proposal and my wallet signature. It can trade, wait, or block—and show me why.

### 0:22–0:52 — Find the actual BSC asset

**Show:** In **Find your stock token**, search `NVDA` with **Check ticker**. Frame the Ondo `NVDAon` and bStocks `NVDAB` cards, including contract, session, and restriction. Click **Continue with this asset** on NVDAon. Use the live result at recording time.

**Say:**

> I search NVDA, and Binance returns two different BSC tokens: Ondo's NVDAon and bStocks' NVDAB. Bellproof shows the issuer, contract, market session, and restrictions. A ticker alone isn't enough to decide what I can buy.

### 0:52–1:22 — Show that it refuses trades

**Show:** Use a clearly dated **live** premarket clip of an NVDAon preflight returning `WAIT / EXTENDED_HOURS_OPT_OUT`, then a live NVDAB preflight returning `BLOCK / UNKNOWN_MARKET_STATE`, if you have captured both. Keep the action and reason code legible. Do not present clips from different times as one continuous live session. If either state is unavailable, switch to **Policy simulator** and use its **Policy lab**, visibly labelled **SAMPLE INPUTS**: leave **Allow premarket, postmarket, and overnight** unchecked, select `premarket` for `WAIT`, then check **Issuer or market pause reported** for `BLOCK`.

**Say, if both clips are live:**

> Earlier, NVDAon had a route, but its underlying market was premarket. My regular-session policy said WAIT, so there was no wallet prompt. NVDAB returned an unknown session. Bellproof blocked that one even though a quote existed.

**Say, if using the Policy lab:**

> These are labelled sample inputs in the policy lab. A premarket session makes this policy wait. A reported pause makes it block. Neither result can submit a transaction. The separate Live execution view uses current market data.

### 1:22–1:54 — Read the wallet and propose

**Show:** Switch back to **Live execution** if you used the simulator. In the right execution column, connect your BSC wallet. Set **USDT quote size** to `10` and **STOCK TARGET %** to `100` for the tiny test basket. Click **Propose from basket**. Frame the actual balance and `BUY` proposal. Only use this take if a funded wallet produces that proposal.

**Say:**

> Now I'm connected on BSC mainnet. For this small test basket, I set a ten-dollar quote and a visible stock target. Bellproof reads my wallet balances and proposes a buy because the basket has drifted from that target. A proposal still has no authority to spend.

### 1:54–2:36 — Inspect the route and preflight

**Show:** In the same right column, click **Get live routes**, then **Check transaction · no wallet charge**. Show the prominent decision, route mode, quoted and minimum output, 0.5% slippage, wallet balances, approval and swap simulations, and the router/spender. If the status is `WAIT / APPROVAL_REQUIRED`, leave that visible before moving on.

**Say:**

> This is a fresh Binance route. Bellproof checks the exact transaction it would ask me to sign: wallet, tokens, router, spender, input amount, minimum output, and slippage. It simulates approval and swap separately, then checks my USDT, BNB for gas, allowance, and policy limits. A successful quote by itself never unlocks signing.

### 2:36–3:05 — Approval, if required

**Show:** If the app says `WAIT / APPROVAL_REQUIRED`, click **Approve exact USDT amount**. Show the wallet prompt, then the approval receipt and fresh preflight. Cut the confirmation wait only. If the wallet already has enough allowance, skip this segment and give the saved time to the swap and evidence.

**Say, if approval was required:**

> It needs an exact USDT approval first. I review the spender and amount in my wallet. Once that transaction confirms, Bellproof gets a new quote and reruns the swap simulation against the real allowance.

**Say, if allowance already exists:**

> This wallet already has the required allowance, so there is no approval transaction in this run. Bellproof still checks that allowance before it offers the swap.

### 3:05–3:35 — Sign only after `TRADE`

**Show:** Frame `TRADE / READY_TO_SIGN` and a successful swap simulation. Click **Review and sign swap**. Show the wallet confirmation and transaction submission. Do this only when those live states actually appear.

**Say:**

> Now the result is TRADE, ready to sign. That means this specific route passed the checks; Bellproof hasn't traded yet. I review the wallet prompt and sign the small BSC mainnet swap myself. The app never holds my key.

### 3:35–3:55 — Prove the result

**Show:** Frame `SETTLED` in **Decision evidence**, the receipt, USDT decrease, token increase, and BscScan link. Open the record or download its JSON. Keep the transaction hash on screen; there is no need to read all 66 characters aloud.

**Say, only after `SETTLED` is verified:**

> The receipt confirmed, USDT went down, and the stock-token balance went up. Bellproof marks it settled only after those checks. The decision, simulation, wallet action, and transaction hash are in this browser's evidence record, which I can export.

**Close, if time remains:**

> One thing we found while building: the Binance docs say equity routes return RFQ, but our NVDA routes returned SWAP. We logged that exact mismatch in our developer notes.

## If the live test does not settle

Do **not** record the `TRADE` and `SETTLED` lines above as though they happened. Show the actual `WAIT`, `BLOCK`, `REVERTED`, or `SETTLEMENT_UNVERIFIED` result and say:

> This run stopped at **[read the exact visible status]**. Here is the reason and the last verified step. I am not calling it a settled trade.

Then fix the cause and record a fresh successful take before the final submission. Never substitute the Policy lab's sample `TRADE` for a live transaction.

## Recording checklist

- Follow the [live demo runbook](DEMO_RUNBOOK.md) first. Use a wallet you control, BSC chain `56`, the actual NVDAon contract returned by the app, BSC USDT, and BNB for gas. The observed route worked at a $10 quote; smaller requests failed during development.
- Capture `WAIT` and `BLOCK` live when they occur. If you must use the Policy lab, leave its **SAMPLE INPUTS** label visible and use the sample narration above.
- Record the live swap only after the app shows `TRADE / READY_TO_SIGN`. Keep approval and swap as distinct wallet prompts. Do not expose recovery phrases, private keys, API credentials, or personal wallet details you do not want public.
- Check that the final cut shows the exact receipt, balance delta, and BscScan link. Rehearse once at normal speaking speed and trim pauses to keep the video below four minutes.
- The demo video is separate from the required firsthand DX report. Record your own spoken DX debrief after the trade; edit that report from your actual experience and the dated [DX log](DX_LOG.md).

Sources: [BNB hackathon deliverables and scoring](https://www.bnbchain.org/en/hackathons/tokenized-stocks); [Binance Trading API route modes](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api).
