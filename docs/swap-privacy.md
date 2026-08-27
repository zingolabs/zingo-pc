# Swap traffic and the mixnet

The swap layer's HTTP leaves the machine over clearnet. `swapHttp:request`,
`swapLogo:get`, and the Midgard queries all run `fetch` from the main process
with no proxy, while the wallet's own indexer traffic rides the Nym mixnet.

This is recorded rather than fixed. The routing decision is open, and the
options are in **Deciding it** below.

## What a third party learns today

Per quote, SwapKit sees the user's IP alongside the asset pair, the amount, the
slippage tolerance, and both addresses: the counterparty's, and the
refund-scope Zcash address this wallet derived. That last one is the part worth
naming plainly. It correlates a Zcash address the wallet controls with an IP
and with an identity on another chain, which is the correlation a shielded
wallet exists to prevent, arriving through a side door.

Committing adds nothing new. Polling repeats the association for as long as the
swap runs, every 20 to 90 seconds.

Midgard sees the destination address of inbound Maya and THORChain swaps, on
the same terms, whenever the poller probes for a source-chain hash.

Token logos are a separate leak with a different shape. Their hosts arrive
inside SwapKit's catalog rather than being ours to know, and the asset picker
renders up to 60 at a time, so opening it contacts whatever CDNs the catalog
names and tells each one which tokens the user is looking at. `swapLogo:get`
also accepts any HTTPS URL from the renderer, which makes it a probe for
whether an arbitrary host returns an image. The response is constrained
(image content-type, a 256 KB cap, handed back as a data URI, so nothing
executes), and its cache has no bound on entries or bytes.

## What the disclaimer says

`MixnetModal` says the mixnet "hides your IP from the indexer when you send".
Scoped to the indexer, so the text is accurate as written. It is also not what
a user reads off a green mixnet indicator, and a swap sends more to SwapKit
than a send sends to an indexer.

## The precedent

zingolib ADR 0024 ruled on this shape already. Its Context names the failure:

> Both shipping consumers fetch price over clearnet while their disclaimers
> claim the mixnet covers price-fetch.

and rule 6 resolves it:

> The 2026-07-23 mixnet-only rule is reinstated in full... The driver refuses
> price in every state except ready; a build without the nym feature compiles
> no fetch.

zingo-pc already honours that for price: the display goes dark until the
mixnet converges. Swap traffic is the same shape, carrying more.

Rule 8 leaves narration to each consumer while zingolib owns "the shared
semantic sentences: the IP-correlation disclaimer and refusal remedies", so
whatever is decided here should reach the user in zingolib's words rather than
a second set invented in this repo.

## Deciding it

**Through zingolib.** A mixnet-capable HTTP call in zingolib that zingo-pc
consumes, the way price already works. What ADR 0024 asks for by rule 1's "one
mint, N renderers", since zingolib owns the mixnet surface and `zingo-netutils`
already speaks SOCKS5. Costs a new public surface there and a cross-repo
change.

**SOCKS5 in main.** A proxy agent over `mixnet.socks5Addr`, which main already
holds. Self-contained and small. It also puts mixnet transport policy back in a
renderer, which is the divergence ADR 0024 was written to end, and would be the
fourth place that policy lives.

**Neither, said out loud.** Leave the traffic on clearnet and say so on the
Swap screen, so the indicator and the behaviour stop disagreeing. Cheap and
honest. The correlation still happens.

## Adjacent

`native/Cargo.toml` pins zingolib by branch. ADR 0024 rule 7: "Consumers
declare exactly one wallet dependency: zingolib at a git rev, never a branch."
A one-line change once `opreturn_on_proposal` lands.

The SwapKit API key ships in the renderer bundle, extractable from any build.
No client-side fix exists for a distributed desktop app, so the key is public
in practice and belongs behind rate limits and rotation on SwapKit's side.
