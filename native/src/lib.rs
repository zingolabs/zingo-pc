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

use tokio::runtime::Runtime;
use std::thread;

use std::cell::RefCell;
use std::sync::{Arc, Mutex};
use zingolib::config::{construct_lightwalletd_uri, ChainType, RegtestNetwork, ZingoConfig};
use zingolib::{commands, lightclient::LightClient, wallet::WalletBase};

// We'll use a MUTEX to store a global lightclient instance,
// so we don't have to keep creating it. We need to store it here, in rust
// because we can't return such a complex structure back to JS
lazy_static! {
    static ref LIGHTCLIENT: Mutex<RefCell<Option<Arc<LightClient>>>> =
        Mutex::new(RefCell::new(None));
}

register_module!(mut m, {
    m.export_function("zingolib_wallet_exists", zingolib_wallet_exists)?;
    m.export_function("zingolib_init_new", zingolib_init_new)?;
    m.export_function("zingolib_init_from_b64", zingolib_init_from_b64)?;
    m.export_function(
        "zingolib_init_from_seed",
        zingolib_init_from_seed,
    )?;
    m.export_function(
        "zingolib_init_from_ufvk",
        zingolib_init_from_ufvk,
    )?;
    m.export_function("zingolib_deinitialize", zingolib_deinitialize)?;
    m.export_function("zingolib_execute_spawn", zingolib_execute_spawn)?;
    m.export_function("zingolib_execute_async", zingolib_execute_async)?;
    m.export_function("zingolib_get_latest_block_server", zingolib_get_latest_block_server)?;
    m.export_function("zingolib_get_transaction_summaries", zingolib_get_transaction_summaries)?;
    m.export_function("zingolib_get_value_transfers", zingolib_get_value_transfers)?;

    Ok(())
});

fn lock_client(lightclient: LightClient) {
    let lc = Arc::new(lightclient);
    LightClient::start_mempool_monitor(lc.clone());

    LIGHTCLIENT.lock().unwrap().replace(Some(lc));
}

fn construct_uri_load_config(
    uri: String,
    chain_hint: String,
    monitor_mempool: bool,
) -> Result<(ZingoConfig, http::Uri), String> {
    let lightwalletd_uri = construct_lightwalletd_uri(Some(uri));

    let chaintype = match chain_hint.as_str() {
        "main" => ChainType::Mainnet,
        "test" => ChainType::Testnet,
        "regtest" => ChainType::Regtest(RegtestNetwork::all_upgrades_active()),
        _ => return Err("Error: Not a valid chain hint!".to_string()),
    };
    let config = match zingolib::config::load_clientconfig(
        lightwalletd_uri.clone(),
        None,
        chaintype,
        monitor_mempool,
    ) {
        Ok(c) => c,
        Err(e) => {
            return Err(format!("Error: Config load: {}", e));
        }
    };
    
    Ok((config, lightwalletd_uri))
}

// check the latency of a server
fn zingolib_get_latest_block_server(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);

    let lightwalletd_uri: http::Uri = server_uri.parse().expect("To be able to represent a Uri.");
    match zingolib::get_latest_block_height(lightwalletd_uri).map_err(|e| format! {"Error: {e}"}) {
        Ok(height) => Ok(cx.string(height.to_string())),
        Err(e) => Ok(cx.string(e)),
    }
}

// Check if there is an existing wallet
fn zingolib_wallet_exists(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    
    let (config, _lightwalletd_uri);
    match construct_uri_load_config(server_uri, chain_hint, true) {
        Ok((c, h)) => (config, _lightwalletd_uri) = (c, h),
        Err(_) => return Ok(cx.boolean(false)),
    };
   
    Ok(cx.boolean(config.wallet_path_exists()))
}

// Create a new wallet and return the seed for the newly created wallet.
fn zingolib_init_new(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);

    let resp = || {
        let (config, lightwalletd_uri);
        match construct_uri_load_config(server_uri, chain_hint, true) {
            Ok((c, h)) => (config, lightwalletd_uri) = (c, h),
            Err(s) => return s,
        }
        let latest_block_height = match zingolib::get_latest_block_height(lightwalletd_uri)
            .map_err(|e| format! {"Error: {e}"})
        {
            Ok(height) => height,
            Err(e) => return e,
        };
        let lightclient = match LightClient::new(&config, latest_block_height.saturating_sub(100)) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };
        lock_client(lightclient);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

// Restore a wallet from the seed phrase
fn zingolib_init_from_seed(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let seed = cx.argument::<JsString>(1)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(2)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(3)?.value(&mut cx);

    let birthday_u64: u64 = birthday as u64;

    let resp = || {
        let (config, _lightwalletd_uri);
        match construct_uri_load_config(server_uri, chain_hint, true) {
            Ok((c, h)) => (config, _lightwalletd_uri) = (c, h),
            Err(s) => return s,
        }
        let lightclient = match LightClient::create_from_wallet_base(
            WalletBase::MnemonicPhrase(seed),
            &config,
            birthday_u64,
            false,
        ) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };
        lock_client(lightclient);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

fn zingolib_init_from_ufvk(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let ufvk = cx.argument::<JsString>(1)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(2)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(3)?.value(&mut cx);

    let birthday_u64: u64 = birthday as u64;

    let resp = || {
        let (config, _lightwalletd_uri);
        match construct_uri_load_config(server_uri, chain_hint, true) {
            Ok((c, h)) => (config, _lightwalletd_uri) = (c, h),
            Err(s) => return s,
        }
        let lightclient = match LightClient::create_from_wallet_base(
            WalletBase::Ufvk(ufvk),
            &config,
            birthday_u64,
            false,
        ) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };
        lock_client(lightclient);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

// Initialize a new lightclient and store its value
fn zingolib_init_from_b64(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);

    let resp = || {
        let (config, _lightwalletd_uri);
        match construct_uri_load_config(server_uri, chain_hint, true) {
            Ok((c, h)) => (config, _lightwalletd_uri) = (c, h),
            Err(s) => return s,
        }
        let lightclient = match LightClient::read_wallet_from_disk(&config) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };
        lock_client(lightclient);

        format!("OK")
    };
    Ok(cx.string(resp()))
}

fn zingolib_deinitialize(mut cx: FunctionContext) -> JsResult<JsString> {
    *LIGHTCLIENT.lock().unwrap().borrow_mut() = None;

    Ok(cx.string(format!("OK")))
}

fn zingolib_execute_spawn(mut cx: FunctionContext) -> JsResult<JsString> {
    let cmd = cx.argument::<JsString>(0)?.value(&mut cx);
    let args_list = cx.argument::<JsString>(1)?.value(&mut cx);

    let resp = || {
        {
            let lightclient: Arc<LightClient>;
            {
                let lc = LIGHTCLIENT.lock().unwrap();

                if lc.borrow().is_none() {
                    return format!("Error: Lightclient is not initialized");
                }

                lightclient = lc.borrow().as_ref().unwrap().clone();
            };
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
            let lc = LIGHTCLIENT.lock().unwrap();

            if lc.borrow().is_none() {
                format!("Error: Light Client is not initialized")
            } else {
                let lightclient: Arc<LightClient> = lc.borrow().as_ref().unwrap().clone();
                let args = if args_list.is_empty() {
                    vec![]
                } else {
                    vec![&args_list[..]]
                };
                commands::do_user_command(&cmd, &args, lightclient.as_ref()).clone()
            }
        };

        deferred.settle_with(&channel, move |mut cx| Ok(cx.string(resp)));

    });

    // Return the promise back to JavaScript
    Ok(promise)
}

fn zingolib_get_transaction_summaries(mut cx: FunctionContext) -> JsResult<JsString> {
    let resp: String;
    {
        let lightclient: Arc<LightClient>;
        {
            let lc = LIGHTCLIENT.lock().unwrap();

            if lc.borrow().is_none() {
                return Ok(cx.string(format!("Error: Light Client is not initialized")));
            }

            lightclient = lc.borrow().as_ref().unwrap().clone();
        };

        let rt = Runtime::new().unwrap();
        resp = rt.block_on(async {
            lightclient.transaction_summaries_json_string().await
        })
    };

    Ok(cx.string(resp))
}

fn zingolib_get_value_transfers(mut cx: FunctionContext) -> JsResult<JsString> {
    let resp: String;
    {
        let lightclient: Arc<LightClient>;
        {
            let lc = LIGHTCLIENT.lock().unwrap();

            if lc.borrow().is_none() {
                return Ok(cx.string(format!("Error: Light Client is not initialized")));
            }

            lightclient = lc.borrow().as_ref().unwrap().clone();
        };

        let rt = Runtime::new().unwrap();
        resp = rt.block_on(async {
            lightclient.value_transfers_json_string().await
        })
    };

    Ok(cx.string(resp))
}