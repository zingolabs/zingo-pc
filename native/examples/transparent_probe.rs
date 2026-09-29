//! Asks a server for the transparent data of its compact blocks.
//!
//! pepper-sync finds a transparent payment in one of two ways: the address
//! discovery RPCs, which run once per sync session, and the `vout`/`vin`
//! entries of compact blocks, which is the only one that can see a payment
//! arriving while a session is already running.
//!
//! The request names the pools it wants and the server serves those. Asking
//! for none — which is what this probe did at first, and what pepper-sync did
//! until zingolib #2794 — is answered with no transparent data at all, and
//! looks exactly like a server that cannot serve it. It was read that way
//! here: the four servers this app draws from were reported as serving none,
//! when what they had been sent was a request for shielded pools. Asked
//! properly, each of them serves it.
//!
//! So the number to watch is zero where the pools were named, which means the
//! server really does not have it.
//!
//! Run with: cargo run --example transparent_probe -- <uri> [blocks]

use std::time::Duration;

use zingo_netutils::lightwallet_protocol::{BlockId, BlockRange, PoolType};
use zingo_netutils::{GrpcIndexer, Indexer};

const TIMEOUT: Duration = Duration::from_secs(30);

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let uri: String = args
        .next()
        .expect("usage: transparent_probe <uri> [blocks]");
    let span: u64 = args.next().and_then(|a| a.parse().ok()).unwrap_or(20);

    let mut client = GrpcIndexer::new(uri.parse().expect("a valid uri"))
        .await
        .expect("the server answers");
    let tip = client
        .get_latest_block(TIMEOUT)
        .await
        .expect("the server reports its tip")
        .height;
    println!("{uri} tip {tip}, reading the last {span} blocks");

    let mut stream = client
        .get_block_range(
            BlockRange {
                start: Some(BlockId {
                    height: tip - span,
                    hash: Vec::new(),
                }),
                end: Some(BlockId {
                    height: tip,
                    hash: Vec::new(),
                }),
                // The request names the pools it wants, and a server serves
                // only those. Left empty — which is what this asked for at
                // first, and what pepper-sync asked for until zingolib #2794 —
                // a server returns no transparent data at all, and the wallet
                // reads that as a chain with no transparent activity in it.
                pool_types: vec![
                    PoolType::Transparent as i32,
                    PoolType::Sapling as i32,
                    PoolType::Orchard as i32,
                    PoolType::Ironwood as i32,
                ],
                ..Default::default()
            },
            TIMEOUT,
        )
        .await
        .expect("the range streams");

    let (mut blocks, mut txs, mut vout, mut vin, mut shielded) = (0u64, 0u64, 0u64, 0u64, 0u64);
    while let Some(block) = stream.message().await.expect("the stream holds") {
        blocks += 1;
        for tx in &block.vtx {
            txs += 1;
            vout += tx.vout.len() as u64;
            vin += tx.vin.len() as u64;
            shielded += (tx.outputs.len() + tx.actions.len() + tx.ironwood_actions.len()) as u64;
        }
    }

    println!("  blocks {blocks}, txs {txs}");
    println!("  transparent outputs (vout) {vout}, inputs (vin) {vin}");
    println!("  shielded outputs/actions {shielded}");
    if vout == 0 {
        println!("  -> no transparent outputs served, though they were asked for");
    }
}
