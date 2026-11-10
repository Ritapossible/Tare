# Launch drafts

## X post (tags @openservai)

> Agents pay first. Nobody checks the goods.
>
> Tare pays x402 data sellers on Kite testnet, has @openservai SERV Reasoning read what the seller
> promised, then counts what actually arrived, in code.
>
> Seller promised 1,240 unique records. Delivered 860. Disputed, held, never paid again.
>
> The label is not the delivery.
> https://tare-agent.vercel.app

(Under 280 characters without the link line: check before posting. Attach a screenshot of the
seller A receipt. Add the video link once uploaded.)

Short variant:

> Pay per record? Then someone has to count the records.
> Tare: an independent check of what an x402 seller delivered. @openservai SERV reads the promise;
> code counts the rows. Kite testnet.
> https://tare-agent.vercel.app

## Video script (under 90 s)

Record from a fresh `node scripts/reset.mjs`, console at http://127.0.0.1:4020, sellers awake
(open both seller URLs a minute before recording; Render's free tier sleeps).

| Time | Screen | Voice |
|---|---|---|
| 0-8 s | Landing hero | "Agents pay for data with x402. Spending limits decide whether they may pay. Nothing checks what they got. That's Tare." |
| 8-25 s | Console: Buy seller A. Receipt opens: promise card, 1,240 claimed, 860 unique, failed count/unique/no_nulls, hash | "Seller A promises 1,240 unique records, no nulls. SERV Reasoning reads that sentence. Code counts the rows: 860 unique, 40 empty. Dispute. Here is the real Kite testnet hash." |
| 25-35 s | Buy seller A again: Stopped, payment counter unchanged | "Buy A again: stopped before any payment. The counter does not move." |
| 35-48 s | Buy seller B: Verified, 200 of 200, hash | "Seller B promises 200 and delivers 200. Verified, paid, in good standing." |
| 48-62 s | Terminal: publish, then a second agent with `TARE_FEEDS=…/records.json` buying A: refused, 0 payment attempts | "Tare publishes the record. Another agent that trusts this feed is warned and never pays seller A." |
| 62-75 s | `/check` page: paste seller A (held, evidence), seller B (good standing, badge) | "Anyone can check a seller before paying. Honest sellers get a badge." |
| 75-88 s | Landing "Three systems. Strict lanes." | "SERV reads the promise. Code counts and decides. The model never sees the rows and never gives a verdict. The label is not the delivery." |

Never show a made-up hash; if a buy returns no hash, show "paid, no hash" as it is.
