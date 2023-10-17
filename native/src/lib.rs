#[macro_use]
extern crate lazy_static;

use neon::prelude::Context;
use neon::prelude::FunctionContext;
use neon::prelude::JsBoolean;
use neon::prelude::JsNumber;
use neon::prelude::JsPromise;
use neon::prelude::JsResult;
use neon::prelude::JsString;

use neon::register_module;

use zingoconfig::{self, construct_lightwalletd_uri, ChainType, RegtestNetwork, ZingoConfig};
use zingolib::{commands, lightclient::LightClient, wallet::WalletBase};

use std::sync::RwLock;
use std::{sync::Arc, thread};

// We'll use a MUTEX to store a global lightclient instance,
// so we don't have to keep creating it. We need to store it here, in rust
// because we can't return such a complex structure back to JS
lazy_static! {
    static ref LIGHTCLIENT: RwLock<Option<Arc<LightClient>>> = RwLock::new(None);
}

register_module!(mut m, {
    m.export_function("zingolib_wallet_exists", zingolib_wallet_exists)?;
    m.export_function("zingolib_initialize_new", zingolib_initialize_new)?;
    m.export_function("zingolib_initialize_existing", zingolib_initialize_existing)?;
    m.export_function(
        "zingolib_initialize_new_from_phrase",
        zingolib_initialize_new_from_phrase,
    )?;
    m.export_function(
        "zingolib_initialize_new_from_ufvk",
        zingolib_initialize_new_from_ufvk,
    )?;
    m.export_function("zingolib_deinitialize", zingolib_deinitialize)?;
    m.export_function("zingolib_execute_spawn", zingolib_execute_spawn)?;
    m.export_function("zingolib_execute_async", zingolib_execute_async)?;

    Ok(())
});

fn get_chainnym(chain_hint_str: &str) -> Result<ChainType, String> {
    // Attempt to guess type from known URIs
    let result = match chain_hint_str {
        "main" => ChainType::Mainnet,
        "test" => ChainType::Testnet,
        "regtest" => ChainType::Regtest(RegtestNetwork::all_upgrades_active()),
        _ => return Err("Not a valid chain hint!".to_string()),
    };
    
    Ok(result)
}

// Check if there is an existing wallet
fn zingolib_wallet_exists(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let chain_hint = cx.argument::<JsString>(0)?.value(&mut cx);

    let chaintype = match get_chainnym(&chain_hint.to_string())
    {
        Ok(c) => c,
        Err(_) => return Ok(cx.boolean(false)),
    };
    let config = ZingoConfig::create_unconnected(chaintype, None);

    Ok(cx.boolean(config.wallet_path_exists()))
}

/// Create a new wallet and return the seed for the newly created wallet.
fn zingolib_initialize_new(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);

    let resp = || {
        let server = construct_lightwalletd_uri(Some(server_uri));
        let chaintype = match get_chainnym(&chain_hint.to_string())
        {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };
        let block_height = match zingolib::get_latest_block_height(server.clone())
        {
            Ok(height) => height,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let config = match zingolib::load_clientconfig(server, None, chaintype, false) {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let lightclient = match LightClient::new(&config, block_height.saturating_sub(100)) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        // Initialize logging
        let _ = LightClient::init_logging();

        let lc = Arc::new(lightclient);
        LightClient::start_mempool_monitor(lc.clone());

        *LIGHTCLIENT.write().unwrap() = Some(lc);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

/// Restore a wallet from the seed phrase
fn zingolib_initialize_new_from_phrase(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let seed = cx.argument::<JsString>(1)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(2)?.value(&mut cx);
    let overwrite = cx.argument::<JsBoolean>(3)?.value(&mut cx);   
    let chain_hint = cx.argument::<JsString>(4)?.value(&mut cx);

    let resp = || {
        let server = construct_lightwalletd_uri(Some(server_uri));
        let chaintype = match get_chainnym(&chain_hint.to_string())
        {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let config = match zingolib::load_clientconfig(server, None, chaintype, false) {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let lightclient = match LightClient::create_from_wallet_base(
            WalletBase::MnemonicPhrase(seed),
            &config,
            birthday as u64,
            overwrite,
        ) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        // Initialize logging
        let _ = LightClient::init_logging();

        let lc = Arc::new(lightclient);
        LightClient::start_mempool_monitor(lc.clone());

        *LIGHTCLIENT.write().unwrap() = Some(lc);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

fn zingolib_initialize_new_from_ufvk(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let ufvk = cx.argument::<JsString>(1)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(2)?.value(&mut cx);
    let overwrite = cx.argument::<JsBoolean>(3)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(4)?.value(&mut cx);

    let resp = || {
        let server = construct_lightwalletd_uri(Some(server_uri));
        let chaintype = match get_chainnym(&chain_hint.to_string())
        {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let config = match zingolib::load_clientconfig(server, None, chaintype, false) {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let lightclient = match LightClient::create_from_wallet_base(
            WalletBase::Ufvk(ufvk),
            &config,
            birthday as u64,
            overwrite,
        ) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        // Initialize logging
        let _ = LightClient::init_logging();

        let lc = Arc::new(lightclient);
        LightClient::start_mempool_monitor(lc.clone());

        *LIGHTCLIENT.write().unwrap() = Some(lc);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

// Initialize a new lightclient and store its value
fn zingolib_initialize_existing(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);

    let resp = || {
        let server = construct_lightwalletd_uri(Some(server_uri));
        let chaintype = match get_chainnym(&chain_hint.to_string())
        {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let config = match zingolib::load_clientconfig(server, None, chaintype, false) {
            Ok(c) => c,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let lightclient = match LightClient::read_wallet_from_disk(&config) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        // Initialize logging
        let _ = LightClient::init_logging();

        let lc = Arc::new(lightclient);
        LightClient::start_mempool_monitor(lc.clone());

        *LIGHTCLIENT.write().unwrap() = Some(lc);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

fn zingolib_deinitialize(mut cx: FunctionContext) -> JsResult<JsString> {
    *LIGHTCLIENT.write().unwrap() = None;

    Ok(cx.string(format!("OK")))
}

fn zingolib_execute_spawn(mut cx: FunctionContext) -> JsResult<JsString> {
    let cmd = cx.argument::<JsString>(0)?.value(&mut cx);
    let args_list = cx.argument::<JsString>(1)?.value(&mut cx);

    let resp = || {
        {
            if let Some(lc) = &*LIGHTCLIENT.read().unwrap() {
                let lightclient = lc.clone();
                // sync, rescan and import commands.
                thread::spawn(move || {
                    let args = if args_list.is_empty() {
                        vec![]
                    } else {
                        vec![&args_list[..]]
                    };
                    commands::do_user_command(&cmd, &args, lightclient.as_ref());
                });

                format!("OK")
            } else {
                return format!("Error: Light Client is not initialized");
            }
        }
    };

    Ok(cx.string(resp()))
}

fn zingolib_execute_async(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let cmd = cx.argument::<JsString>(0)?.value(&mut cx);
    let args_list = cx.argument::<JsString>(1)?.value(&mut cx);
    let channel = cx.channel();

    // Create a JavaScript promise and a `deferred` handle for resolving it.
    // It is important to be careful not to perform failable actions after
    // creating the promise to avoid an unhandled rejection.
    let (deferred, promise) = cx.promise();

    // Spawn an `async` task on a separate thread.
    thread::spawn(move || {
        // Inside this closure, you can perform asynchronous operations

        let resp = {
            let lightclient = LIGHTCLIENT.read().unwrap();

            if lightclient.is_none() {
                format!("Error: Light Client is not initialized")
            } else {
                let args = if args_list.is_empty() {
                    vec![]
                } else {
                    vec![&args_list[..]]
                };
                commands::do_user_command(&cmd, &args, lightclient.as_ref().unwrap()).clone()
            }
        };

        deferred.settle_with(&channel, move |mut cx| Ok(cx.string(resp)));

        // Settle the promise based on the response
        //deferred.resolve(&mut cx, cx.string(&resp));
    });

    // Return the promise back to JavaScript
    Ok(promise)
}
