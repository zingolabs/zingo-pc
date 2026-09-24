//! Asks each server what it can say about the Ironwood note commitment tree.
//!
//! A transaction with an Ironwood output needs that tree's root, and a wallet
//! builds it from two things the server supplies: the frontier in
//! `GetTreeState` and the shard roots in `GetSubtreeRoots`. pepper-sync
//! tolerates a server that serves neither, so a wallet on one of those looks
//! perfectly synced and then cannot compute the root.
//!
//! Run with: cargo run --example ironwood_probe -- <uri> [<uri> ...]

use std::time::Duration;

use zingo_netutils::lightwallet_protocol::GetSubtreeRootsArg;
use zingo_netutils::{GrpcIndexer, Indexer};

const TIMEOUT: Duration = Duration::from_secs(20);

#[tokio::main]
async fn main() {
    let uris: Vec<String> = std::env::args().skip(1).collect();
    for uri in uris {
        println!("--- {uri}");
        let parsed: http::Uri = match uri.parse() {
            Ok(u) => u,
            Err(e) => {
                println!("    bad uri: {e}");
                continue;
            }
        };
        let mut client = match GrpcIndexer::new(parsed).await {
            Ok(c) => c,
            Err(e) => {
                println!("    cannot connect: {e}");
                continue;
            }
        };

        match client.get_latest_tree_state(TIMEOUT).await {
            Ok(state) => {
                println!("    height {}", state.height);
                println!(
                    "    sapling frontier {} bytes, orchard {} bytes, ironwood {} bytes",
                    state.sapling_tree.len() / 2,
                    state.orchard_tree.len() / 2,
                    state.ironwood_tree.len() / 2,
                );
            }
            Err(e) => println!("    tree state failed: {}", e.message()),
        }

        for (name, protocol) in [("sapling", 0), ("orchard", 1), ("ironwood", 2)] {
            let arg = GetSubtreeRootsArg {
                start_index: 0,
                shielded_protocol: protocol,
                max_entries: 0,
            };
            match client.get_subtree_roots(arg, TIMEOUT).await {
                Ok(mut stream) => {
                    let mut count = 0usize;
                    loop {
                        match stream.message().await {
                            Ok(Some(_)) => count += 1,
                            Ok(None) => break,
                            Err(e) => {
                                println!(
                                    "    {name} roots: stream failed after {count}: {}",
                                    e.message()
                                );
                                break;
                            }
                        }
                    }
                    println!("    {name} roots: {count}");
                }
                Err(e) => println!("    {name} roots: refused — {}", e.message()),
            }
        }
    }
}
