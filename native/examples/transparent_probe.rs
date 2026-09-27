//! Asks a server whether its compact blocks carry transparent data.
//!
//! pepper-sync finds a transparent payment in one of two ways: the address
//! discovery RPCs, which run once per sync session, and the `vout`/`vin`
//! entries of compact blocks, which is the only one that can see a payment
//! that arrives while a session is already running. The protocol carries both
//! fields; a server that does not populate them leaves a wallet unable to
//! notice an incoming transparent payment until its next session — and only
//! if that session's discovery pass reaches back far enough.
//!
//! Run with: cargo run --example transparent_probe -- <uri> [blocks]

use std::time::Duration;

use zingo_netutils::lightwallet_protocol::{BlockId, BlockRange};
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
        println!("  -> no transparent outputs served: a payment to a t-address cannot be seen by scanning");
    }
}
