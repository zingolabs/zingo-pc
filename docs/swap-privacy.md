# Swap traffic and the mixnet

The swap layer's HTTP leaves the machine over clearnet. `swapHttp:request`,
`swapLogo:get`, and the Midgard queries all run `fetch` from the main process
with no proxy, while the wallet's own indexer traffic rides the Nym mixnet.

**Decided 2026-08-27: this ships as it is.** Routing swap traffic through the
mixnet is deferred, not rejected, and the options are kept in **If it is
revisited** below so whoever picks it up does not repeat the analysis. What
shipped alongside the decision is the disclosure: the Swap screen now says the
provider sees the user's IP, so the mixnet indicator and this screen stop
disagreeing.

One related finding was accepted in the same pass: `native/Cargo.toml` pins
zingolib by branch against ADR 0024 rule 7, which stands until that branch
merges.

## The shape of it

A quote is an ordinary HTTPS request to the provider, so the provider sees
where it came from along with what it asks. The request has to carry wallet
addresses to be answerable at all, which is what makes this more than a
network-level observation: it puts an address the wallet controls beside
something that identifies the machine. Tracking repeats that for as long as the
swap runs, and the Midgard queries behave the same way.

Keeping those two apart is what a shielded wallet is for, and here they are
not. That is the whole of the concern, and it is why the decision above is a
deferral rather than a dismissal.

Token logos are a separate leak with a different shape. Their hosts arrive
inside SwapKit's catalog rather than being ours to know, and the asset picker
renders up to 60 at a time, so opening it contacts whatever CDNs the catalog
names and tells each one which tokens the user is looking at. That part
remains.

Two things about them were fixed rather than accepted. `swapLogo:get` used to
fetch any HTTPS URL the renderer named, which answered whether an arbitrary
host serves an image; it now accepts only hosts harvested from the catalog as
it passes through `swapHttp:request`, so the allowlist comes from SwapKit
rather than from a guess here. And the cache, which held data URIs of up to
256 KB with no bound, now evicts oldest-first under a byte budget and
remembers a logo that would not load so the picker stops asking for it.

## What the user is told

`MixnetModal` says the mixnet "hides your IP from the indexer when you send".
Scoped to the indexer, so the text is accurate as written. It is also not what
a user reads off a green mixnet indicator, and a swap sends more to SwapKit
than a send sends to an indexer.

The Swap screen closes that gap directly rather than leaving the reader to
infer it, in the words the decision above settled on: swaps reach the provider
directly, and quoting or tracking one shows the provider an IP address
alongside the assets, the amount, and the addresses. Stated as what the
provider sees, since that is the fact, and the remedy is the user's to choose.

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

## If it is revisited

Deferred on 2026-08-27, with the analysis kept so the next attempt starts here
rather than at the beginning.

**Through zingolib.** A mixnet-capable HTTP call in zingolib that zingo-pc
consumes, the way price already works. What ADR 0024 asks for by rule 1's "one
mint, N renderers", since zingolib owns the mixnet surface and `zingo-netutils`
already speaks SOCKS5. Costs a new public surface there and a cross-repo
change.

**SOCKS5 in main.** A proxy agent over `mixnet.socks5Addr`, which main already
holds. Self-contained and small. It also puts mixnet transport policy back in a
renderer, which is the divergence ADR 0024 was written to end, and would be the
fourth place that policy lives.

The third option, saying it out loud and leaving the traffic where it is, is
what shipped. It costs nothing to keep if either of the above lands later: a
screen that has stopped claiming privacy it does not have is still telling the
truth once it does.

## Adjacent

`native/Cargo.toml` pins zingolib by branch. ADR 0024 rule 7: "Consumers
declare exactly one wallet dependency: zingolib at a git rev, never a branch."
A one-line change once `opreturn_on_proposal` lands.
