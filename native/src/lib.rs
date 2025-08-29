#[macro_use]
extern crate lazy_static;

use neon::prelude::*;

use std::num::NonZeroU32;
use std::str::FromStr;
use std::sync::RwLock;
use std::fs::remove_file;
use std::{panic, sync::Once};

use bip0039::Mnemonic;
use json::object;
use rustls::crypto::{CryptoProvider, ring::default_provider};

use zcash_address::unified::{Container, Encoding, Ufvk};
use zcash_keys::address::Address;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::consensus::BlockHeight;
use zcash_primitives::zip32::AccountId;
use zcash_protocol::consensus::NetworkType;

use pepper_sync::keys::transparent;
use pepper_sync::config::{PerformanceLevel, SyncConfig, TransparentAddressDiscovery};
use pepper_sync::wallet::{KeyIdInterface, SyncMode};
use zingolib::config::{ChainType, ZingoConfig, construct_lightwalletd_uri};
use zingolib::data::PollReport;
use zingolib::lightclient::LightClient;
use zingolib::utils::{conversion::address_from_str, conversion::txid_from_hex_encoded_str};
use zingolib::wallet::keys::{
    WalletAddressRef,
    unified::{ReceiverSelection, UnifiedKeyStore},
};
use zingolib::wallet::{LightWallet, WalletBase, WalletSettings};
use zingolib::data::receivers::Receivers;
use zcash_address::ZcashAddress;
use zcash_protocol::{value::Zatoshis};
use tokio::runtime::Runtime;
use zcash_primitives::memo::MemoBytes;
use zingolib::data::receivers::transaction_request_from_receivers;
use zingolib::data::proposal::total_fee;
use zingo_infra_services::network::ActivationHeights;

fn install_panic_hook_once() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        std::env::set_var("RUST_BACKTRACE", "1"); // opcional pero útil
        panic::set_hook(Box::new(|info| {
            let where_ = info.location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_else(|| "<unknown>".into());
            let msg = if let Some(s) = info.payload().downcast_ref::<&str>() { *s }
                      else if let Some(s) = info.payload().downcast_ref::<String>() { s.as_str() }
                      else { "Box<Any>" };
            eprintln!("\n=== RUST PANIC ===\nAt: {where_}\nMsg: {msg}\n");
            // Con RUST_BACKTRACE=1 verás la traza después.
        }));
    });
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    install_panic_hook_once();

    cx.export_function("deinitialize", deinitialize)?;
    cx.export_function("wallet_exists", wallet_exists)?;
    cx.export_function("init_new", init_new)?;
    cx.export_function("init_from_seed", init_from_seed)?;
    cx.export_function("init_from_ufvk", init_from_ufvk)?;
    cx.export_function("init_from_b64", init_from_b64)?;
    cx.export_function("save_wallet_file", save_wallet_file)?;
    cx.export_function("get_developer_donation_address", get_developer_donation_address)?;
    cx.export_function("get_zennies_for_zingo_donation_address", get_zennies_for_zingo_donation_address)?;
    cx.export_function("set_crypto_default_provider_to_ring", set_crypto_default_provider_to_ring)?;
    cx.export_function("get_seed", get_seed)?;
    cx.export_function("get_ufvk", get_ufvk)?;
    cx.export_function("get_latest_block_server", get_latest_block_server)?;
    cx.export_function("get_latest_block_wallet", get_latest_block_wallet)?;
    cx.export_function("get_value_transfers", get_value_transfers)?;
    cx.export_function("poll_sync", poll_sync)?;
    cx.export_function("run_sync", run_sync)?;
    cx.export_function("pause_sync", pause_sync)?;
    cx.export_function("stop_sync", stop_sync)?;
    cx.export_function("status_sync", status_sync)?;
    cx.export_function("run_rescan", run_rescan)?;
    cx.export_function("info_server", info_server)?;
    cx.export_function("change_server", change_server)?;
    cx.export_function("wallet_kind", wallet_kind)?;
    cx.export_function("parse_address", parse_address)?;
    cx.export_function("parse_ufvk", parse_ufvk)?;
    cx.export_function("get_version", get_version)?;
    cx.export_function("get_messages", get_messages)?;
    cx.export_function("get_balance", get_balance)?;
    cx.export_function("get_total_memobytes_to_address", get_total_memobytes_to_address)?;
    cx.export_function("get_total_value_to_address", get_total_value_to_address)?;
    cx.export_function("get_total_spends_to_address", get_total_spends_to_address)?;
    cx.export_function("zec_price", zec_price)?;
    cx.export_function("resend_transaction", resend_transaction)?;
    cx.export_function("remove_transaction", remove_transaction)?;
    cx.export_function("get_spendable_balance_with_address", get_spendable_balance_with_address)?;
    cx.export_function("get_spendable_balance_total", get_spendable_balance_total)?;
    cx.export_function("set_option_wallet", set_option_wallet)?;
    cx.export_function("get_option_wallet", get_option_wallet)?;
    cx.export_function("create_tor_client", create_tor_client)?;
    cx.export_function("remove_tor_client", remove_tor_client)?;
    cx.export_function("get_unified_addresses", get_unified_addresses)?;
    cx.export_function("get_transparent_addresses", get_transparent_addresses)?;
    cx.export_function("create_new_unified_address", create_new_unified_address)?;
    cx.export_function("create_new_transparent_address", create_new_transparent_address)?;
    cx.export_function("check_my_addressv", check_my_address)?;
    cx.export_function("get_wallet_save_required", get_wallet_save_required)?;
    cx.export_function("set_config_wallet_to_test", set_config_wallet_to_test)?;
    cx.export_function("set_config_wallet_to_prod", set_config_wallet_to_prod)?;
    cx.export_function("get_config_wallet_performance", get_config_wallet_performance)?;
    cx.export_function("get_wallet_version", get_wallet_version)?;
    cx.export_function("send", send)?;
    cx.export_function("shield", shield)?;
    cx.export_function("confirm", confirm)?;
    cx.export_function("delete_wallet", delete_wallet)?;

    Ok(())
}

// We'll use a MUTEX to store a global lightclient instance,
// so we don't have to keep creating it. We need to store it here, in rust
// because we can't return such a complex structure back to JS
lazy_static! {
    static ref LIGHTCLIENT: RwLock<Option<LightClient>> = RwLock::new(None);
}

lazy_static! {
    pub static ref RT: Runtime = tokio::runtime::Runtime::new().unwrap();
}

fn store_client(lightclient: LightClient) {
    *LIGHTCLIENT.write().unwrap() = Some(lightclient);
}

fn construct_uri_load_config(
    uri: String,
    chain_hint: String,
    performance_level: String,
    min_confirmations: f64,
) -> Result<(ZingoConfig, http::Uri), String> {
    // if uri is empty -> Offline Mode.
    let lightwalletd_uri = construct_lightwalletd_uri(Some(uri));

    let chaintype = match chain_hint.as_str() {
        "main" => ChainType::Mainnet,
        "test" => ChainType::Testnet,
        "regtest" => ChainType::Regtest(ActivationHeights::default()),
        _ => return Err("Error: Not a valid chain hint!".to_string()),
    };
    let performancetype = match performance_level.as_str() {
        "Maximum" => PerformanceLevel::Maximum,
        "High" => PerformanceLevel::High,
        "Medium" => PerformanceLevel::Medium,
        "Low" => PerformanceLevel::Low,
        _ => return Err("Error: Not a valid performance level!".to_string()),
    };
    let config = match zingolib::config::load_clientconfig(
        lightwalletd_uri.clone(),
        None,
        chaintype,
        WalletSettings {
            sync_config: SyncConfig {
                transparent_address_discovery: TransparentAddressDiscovery::minimal(),
                performance_level: performancetype,
            },
            min_confirmations: NonZeroU32::try_from(min_confirmations as u32).unwrap(),
        },
        NonZeroU32::try_from(1).expect("hard-coded integer"),
    ) {
        Ok(c) => c,
        Err(e) => {
            return Err(format!("Error: Config load: {e}"));
        }
    };

    Ok((config, lightwalletd_uri))
}

// reset lightclient
fn deinitialize(mut cx: FunctionContext) -> JsResult<JsString> {
    *LIGHTCLIENT.write().unwrap() = None;

    Ok(cx.string(format!("OK")))
}

// Check if there is an existing wallet
fn wallet_exists(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);
    
    let (config, _lightwalletd_uri);
    match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations) {
        Ok((c, h)) => (config, _lightwalletd_uri) = (c, h),
        Err(_) => return Ok(cx.boolean(false)),
    };
   
    Ok(cx.boolean(config.wallet_path_exists()))
}

// Create a new wallet and return the seed for the newly created wallet.
fn init_new(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);

    let (config, lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations) {
        Ok(c) => c,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let chain_height = match RT
        .block_on(async move {
            zingolib::grpc_connector::get_latest_block(lightwalletd_uri)
                .await
                .map(|block_id| BlockHeight::from_u32(block_id.height as u32))
    }) {
        Ok(h) => h,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let lightclient = match LightClient::new(
        config,
        chain_height - 100,
        false,
    ) {
        Ok(l) => l,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    store_client(lightclient);

    Ok(cx.string(get_seed_string()))
}

// Restore a wallet from the seed phrase
fn init_from_seed(mut cx: FunctionContext) -> JsResult<JsString> {
    let seed = cx.argument::<JsString>(0)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(1)?.value(&mut cx);
    let server_uri = cx.argument::<JsString>(2)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(3)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(4)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(5)?.value(&mut cx);

    let (config, _lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations) {
        Ok(c) => c,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let mnemonic = match Mnemonic::from_phrase(seed) {
        Ok(m) => m,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let wallet = match LightWallet::new(
        config.chain,
        WalletBase::Mnemonic {
            mnemonic,
            no_of_accounts: config.no_of_accounts,
        },
        BlockHeight::from_u32(birthday as u32),
        config.wallet_settings.clone(),
    ) {
        Ok(w) => w,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let lightclient = match LightClient::create_from_wallet(wallet, config, false) {
        Ok(l) => l,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    store_client(lightclient);

    Ok(cx.string(get_seed_string()))
}

fn init_from_ufvk(mut cx: FunctionContext) -> JsResult<JsString> {
    let ufvk = cx.argument::<JsString>(0)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(1)?.value(&mut cx);
    let server_uri = cx.argument::<JsString>(2)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(3)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(4)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(5)?.value(&mut cx);

    let (config, _lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations) {
        Ok(c) => c,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let wallet = match LightWallet::new(
        config.chain,
        WalletBase::Ufvk(ufvk),
        BlockHeight::from_u32(birthday as u32),
        config.wallet_settings.clone(),
    ) {
        Ok(w) => w,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let lightclient = match LightClient::create_from_wallet(wallet, config, false) {
        Ok(l) => l,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    store_client(lightclient);

    Ok(cx.string(get_ufvk_string()))
}

fn init_from_b64(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);

    let (config, _lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations) {
        Ok(c) => c,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let lightclient = match LightClient::create_from_wallet_path(config) {
        Ok(l) => l,
        Err(e) => return Ok(cx.string(format!("Error: {e}"))),
    };
    let has_seed = RT.block_on(async {
        lightclient.wallet.read().await.mnemonic().is_some()
    });
    store_client(lightclient);

    Ok(cx.string(if has_seed { get_seed_string() } else { get_ufvk_string() }))
}

fn save_wallet_file(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move { lightclient.save_task().await });
                "Launching save task...".to_string()
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_developer_donation_address(mut cx: FunctionContext) -> JsResult<JsString> {
    let resp = zingolib::config::DEVELOPER_DONATION_ADDRESS.to_string();

    Ok(cx.string(resp))
}

fn get_zennies_for_zingo_donation_address(mut cx: FunctionContext) -> JsResult<JsString> {
    let resp = zingolib::config::ZENNIES_FOR_ZINGO_DONATION_ADDRESS.to_string();

    Ok(cx.string(resp))
}

fn set_crypto_default_provider_to_ring(mut cx: FunctionContext) -> JsResult<JsString> {
    let resp = CryptoProvider::get_default().map_or_else(
        || match default_provider().install_default() {
            Ok(_) => "true".to_string(),
            Err(_) => "Error: Failed to install crypto provider".to_string(),
        },
        |_| "true".to_string(),
    );

    Ok(cx.string(resp))
}

fn get_seed_string() -> String {
    if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
        RT.block_on(async move {
            let wallet = lightclient.wallet.read().await;
            match wallet.recovery_info() {
                Some(recovery_info) => serde_json::to_string_pretty(&recovery_info)
                    .unwrap_or_else(|_| "Error: get seed. failed to serialize".to_string()),
                None => "Error: get seed. no mnemonic found. wallet loaded from key.".to_string(),
            }
        })
    } else {
        "Error: Lightclient is not initialized".to_string()
    }
}

fn get_seed(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            get_seed_string()
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_ufvk_string() -> String {
    if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
        RT.block_on(async move {
            let wallet = lightclient.wallet.read().await;
            let ufvk: UnifiedFullViewingKey = match wallet
                .unified_key_store
                .get(&AccountId::ZERO)
                .expect("account 0 must always exist")
                .try_into()
            {
                Ok(ufvk) => ufvk,
                Err(e) => return format!("Error: {e}"),
            };
            object! {
                "ufvk" => ufvk.encode(&wallet.network),
                "birthday" => u32::from(wallet.birthday)
            }
            .pretty(2).to_string()
        })
    } else {
        "Error: Lightclient is not initialized".to_string()
    }
}

fn get_ufvk(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            get_ufvk_string()
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_latest_block_server(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            let lightwalletd_uri: http::Uri = match server_uri.parse() {
                Ok(uri) => uri,
                Err(e) => {
                    return format!("Error: failed to parse uri. {e}");
                }
            };
            match RT
                .block_on(async move { zingolib::grpc_connector::get_latest_block(lightwalletd_uri).await })
            {
                Ok(block_id) => block_id.height.to_string(),
                Err(e) => format!("Error: {e}"),
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_latest_block_wallet(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    let wallet = lightclient.wallet.write().await;
                    object! { "height" => json::JsonValue::from(wallet.sync_state.wallet_height().map(u32::from).unwrap_or(0))}.pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_value_transfers(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match lightclient
                        .wallet
                        .read()
                        .await
                        .value_transfers(true)
                        .await
                    {
                        Ok(value_transfers) => json::JsonValue::from(value_transfers).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn poll_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                match lightclient.poll_sync() {
                    PollReport::NoHandle => "Sync task has not been launched.".to_string(),
                    PollReport::NotReady => "Sync task is not complete.".to_string(),
                    PollReport::Ready(result) => match result {
                        Ok(sync_result) => {
                            json::object! { "sync_complete" => json::JsonValue::from(sync_result) }
                                .pretty(2)
                        }
                        Err(e) => format!("Error: {e}"),
                    },
                }
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn run_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                if lightclient.sync_mode() == SyncMode::Paused {
                    lightclient.resume_sync().expect("sync should be paused");
                    "Resuming sync task...".to_string()
                } else {
                    RT.block_on(async move {
                        match lightclient.sync().await {
                            Ok(_) => "Launching sync task...".to_string(),
                            Err(e) => format!("Error: {e}"),
                        }
                    })
                }
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn pause_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                match lightclient.pause_sync() {
                    Ok(_) => "Pausing sync task...".to_string(),
                    Err(e) => format!("Error: {e}"),
                }
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn stop_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                match lightclient.stop_sync() {
                    Ok(_) => "Stopping sync task...".to_string(),
                    Err(e) => format!("Error: {e}"),
                }
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn status_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match pepper_sync::sync_status(&*lightclient.wallet.read().await).await {
                        Ok(status) => json::JsonValue::from(status).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn run_rescan(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    match lightclient.rescan().await {
                        Ok(_) => "Launching rescan...".to_string(),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn info_server(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move { lightclient.do_info().await })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn change_server(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                if server_uri.is_empty() {
                    lightclient.set_server(http::Uri::default());
                    "server set (default)".to_string()
                } else {
                    match http::Uri::from_str(&server_uri) {
                        Ok(uri) => {
                            lightclient.set_server(uri);
                            "server set".to_string()
                        }
                        Err(_) => "Error: invalid server uri".to_string(),
                    }
                }
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn wallet_kind(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    let wallet = lightclient.wallet.read().await;
                    if wallet.mnemonic().is_some() {
                        object! {"kind" => "Loaded from seed or mnemonic phrase)",
                                "transparent" => true,
                                "sapling" => true,
                                "orchard" => true,
                        }
                        .pretty(2)
                    } else {
                        match wallet
                            .unified_key_store
                            .get(&AccountId::ZERO)
                            .expect("account 0 must always exist")
                        {
                            UnifiedKeyStore::Spend(_) => object! {
                                "kind" => "Loaded from unified spending key",
                                "transparent" => true,
                                "sapling" => true,
                                "orchard" => true,
                            }
                            .pretty(2),
                            UnifiedKeyStore::View(ufvk) => object! {
                                "kind" => "Loaded from unified full viewing key",
                                "transparent" => ufvk.transparent().is_some(),
                                "sapling" => ufvk.sapling().is_some(),
                                "orchard" => ufvk.orchard().is_some(),
                            }
                            .pretty(2),
                            UnifiedKeyStore::Empty => object! {
                                "kind" => "No keys found",
                                "transparent" => false,
                                "sapling" => false,
                                "orchard" => false,
                            }
                            .pretty(2),
                        }
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn parse_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let address = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if address.is_empty() {
                "Error: The address is empty".to_string()
            } else {
                fn make_decoded_chain_pair(
                    address: &str,
                ) -> Option<(zcash_client_backend::address::Address, ChainType)> {
                    [
                        ChainType::Mainnet,
                        ChainType::Testnet,
                        ChainType::Regtest(ActivationHeights::default()),
                    ]
                    .iter()
                    .find_map(|chain| Address::decode(chain, address).zip(Some(*chain)))
                }
                if let Some((recipient_address, chain_name)) = make_decoded_chain_pair(&address) {
                    let chain_name_string = match chain_name {
                        ChainType::Mainnet => "main",
                        ChainType::Testnet => "test",
                        ChainType::Regtest(_) => "regtest",
                    };
                    match recipient_address {
                        Address::Sapling(_) => object! {
                            "status" => "success",
                            "chain_name" => chain_name_string,
                            "address_kind" => "sapling",
                        }
                        .pretty(2),
                        Address::Transparent(_) => object! {
                            "status" => "success",
                            "chain_name" => chain_name_string,
                            "address_kind" => "transparent",
                        }
                        .pretty(2),
                        Address::Tex(_) => object! {
                            "status" => "success",
                            "chain_name" => chain_name_string,
                            "address_kind" => "tex",
                        }
                        .pretty(2),
                        Address::Unified(ua) => {
                            let mut receivers_available = vec![];
                            if ua.sapling().is_some() {
                                receivers_available.push("sapling")
                            }
                            if ua.transparent().is_some() {
                                receivers_available.push("transparent")
                            }
                            if ua.orchard().is_some() {
                                receivers_available.push("orchard");
                                object! {
                                    "status" => "success",
                                    "chain_name" => chain_name_string,
                                    "address_kind" => "unified",
                                    "receivers_available" => receivers_available,
                                    "only_orchard_ua" => zcash_keys::address::UnifiedAddress::from_receivers(ua.orchard().cloned(), None, None).expect("To construct UA").encode(&chain_name),
                                }
                                .pretty(2)
                            } else {
                                object! {
                                    "status" => "success",
                                    "chain_name" => chain_name_string,
                                    "address_kind" => "unified",
                                    "receivers_available" => receivers_available,
                                }
                                .pretty(2)
                            }
                        }
                    }
                } else {
                    object! {
                        "status" => "Invalid address",
                        "chain_name" => json::JsonValue::Null,
                        "address_kind" => json::JsonValue::Null,
                    }
                    .pretty(2)
                }
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn parse_ufvk(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let ufvk = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if ufvk.is_empty() {
                "Error: The ufvk is empty".to_string()
            } else {
                json::stringify_pretty(
                    match Ufvk::decode(&ufvk) {
                        Ok((network, ufvk)) => {
                            let mut pools_available = vec![];
                            for fvk in ufvk.items_as_parsed() {
                                match fvk {
                                    zcash_address::unified::Fvk::Orchard(_) => {
                                        pools_available.push("orchard")
                                    }
                                    zcash_address::unified::Fvk::Sapling(_) => {
                                        pools_available.push("sapling")
                                    }
                                    zcash_address::unified::Fvk::P2pkh(_) => {
                                        pools_available.push("transparent")
                                    }
                                    zcash_address::unified::Fvk::Unknown { .. } => pools_available.push(
                                        "Error: Unknown future protocol. Perhaps you're using old software",
                                    ),
                                }
                            }
                            object! {
                                "status" => "success",
                                "chain_name" => match network {
                                    NetworkType::Main => "main",
                                    NetworkType::Test => "test",
                                    NetworkType::Regtest => "regtest",
                                },
                                "address_kind" => "ufvk",
                                "pools_available" => pools_available,
                            }
                        }
                        Err(_) => {
                            object! {
                                "status" => "Invalid viewkey",
                                "chain_name" => json::JsonValue::Null,
                                "address_kind" => json::JsonValue::Null
                            }
                        }
                    },
                    2,
                )
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_version(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            zingolib::git_description().to_string()
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_messages(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let address = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match lightclient
                        .messages_containing(Some(address.as_str()))
                        .await
                    {
                        Ok(value_transfers) => json::JsonValue::from(value_transfers).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_balance(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match lightclient
                        .account_balance(AccountId::ZERO)
                        .await
                    {
                        Ok(bal) => json::JsonValue::from(bal).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_total_memobytes_to_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match lightclient.do_total_memobytes_to_address().await {
                        Ok(total_memo_bytes) => json::JsonValue::from(total_memo_bytes).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_total_value_to_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match lightclient.do_total_value_to_address().await {
                        Ok(total_values) => json::JsonValue::from(total_values).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_total_spends_to_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match lightclient.do_total_spends_to_address().await {
                        Ok(total_spends) => json::JsonValue::from(total_spends).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn zec_price(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let tor = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    let Ok(tor_bool) = tor.parse() else {
                        return "Error: failed to parse tor setting.".to_string();
                    };
                    let client_check = match (tor_bool, lightclient.tor_client()) {
                        (true, Some(tc)) => Ok(Some(tc)),
                        (true, None) => Err(()),
                        (false, _) => Ok(None),
                    };
                    let tor_client = match client_check {
                        Ok(tc) => tc,
                        Err(_) => {
                            return "Error: no tor client found. please create a tor client.".to_string();
                        }
                    };

                    match lightclient
                        .wallet
                        .write()
                        .await
                        .update_current_price(tor_client)
                        .await
                    {
                        Ok(price) => object! { "current_price" => price }.pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn resend_transaction(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let txid = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                let txid = match txid_from_hex_encoded_str(&txid) {
                    Ok(txid) => txid,
                    Err(e) => return format!("Error: {e}"),
                };

                RT.block_on(async move {
                    match lightclient.resend(txid).await {
                        Ok(_) => "Successfully resent transaction.".to_string(),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn remove_transaction(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let txid = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                let txid = match txid_from_hex_encoded_str(&txid) {
                    Ok(txid) => txid,
                    Err(e) => return format!("Error: {e}"),
                };

                RT.block_on(async move {
                    match lightclient
                        .wallet
                        .write()
                        .await
                        .remove_unconfirmed_transaction(txid)
                    {
                        Ok(_) => "Successfully removed transaction.".to_string(),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_spendable_balance_with_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let address = cx.argument::<JsString>(0)?.value(&mut cx);
    let zennies = cx.argument::<JsString>(1)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                let Ok(address) = address_from_str(&address) else {
                    return "Error: unknown address format".to_string();
                };
                let Ok(zennies) = zennies.parse() else {
                    return "Error: failed to parse zennies setting.".to_string();
                };
                RT.block_on(async move {
                    match lightclient
                        .max_send_value(address, zennies, AccountId::ZERO)
                        .await
                    {
                        Ok(bal) => {
                            object! { "spendable_balance" => bal.into_u64() }.pretty(2)
                        }
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_spendable_balance_total(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    let wallet = lightclient.wallet.write().await;
                    let spendable_balance =
                        match wallet.shielded_spendable_balance(AccountId::ZERO, false) {
                            Ok(bal) => bal,
                            Err(e) => return format!("Error: {e}"),
                        };
                    object! {
                        "spendable_balance" => spendable_balance.into_u64(),
                    }
                    .pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn set_option_wallet(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            "Error: unimplemented".to_string()
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_option_wallet(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            "Error: unimplemented".to_string()
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn create_tor_client(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let data_dir = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                if lightclient.tor_client().is_some() {
                    return "Error: Tor client already exists.".to_string();
                }

                match RT.block_on(async move {
                    lightclient.create_tor_client(Some(data_dir.into())).await
                }) {
                    Ok(_) => "Successfully created tor client.".to_string(),
                    Err(e) => format!("Error creating tor client: {e}"),
                }
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn remove_tor_client(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                if lightclient.tor_client().is_none() {
                    return "Error: Tor client is not active.".to_string();
                }

                RT.block_on(async move {
                    lightclient.remove_tor_client().await;
                });

                "Successfully removed tor client.".to_string()
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_unified_addresses(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move { lightclient.unified_addresses_json().await.pretty(2) })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_transparent_addresses(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move { lightclient.transparent_addresses_json().await.pretty(2) })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn create_new_unified_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let receivers = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let mut wallet = lightclient.wallet.write().await;
                    let network = wallet.network;
                    let receivers_available = ReceiverSelection {
                        orchard: receivers.contains('o'),
                        sapling: receivers.contains('z'),
                    };
                    match wallet.generate_unified_address(receivers_available, AccountId::ZERO) {
                        Ok((id, unified_address)) => {
                            json::object! {
                                "account" => u32::from(AccountId::ZERO),
                                "address_index" => id.address_index,
                                "has_orchard" => unified_address.has_orchard(),
                                "has_sapling" => unified_address.has_sapling(),
                                "has_transparent" => unified_address.has_transparent(),
                                "encoded_address" => unified_address.encode(&network),
                            }.pretty(2)
                        }
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn create_new_transparent_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let mut wallet = lightclient.wallet.write().await;
                    let network = wallet.network;
                    match wallet.generate_transparent_address(AccountId::ZERO, true) {
                        Ok((id, transparent_address)) => {
                            json::object! {
                                "account" => u32::from(id.account_id()),
                                "address_index" => id.address_index().index(),
                                "scope" => id.scope().to_string(),
                                "encoded_address" => transparent::encode_address(&network,  transparent_address),
                            }.pretty(2)
                        }
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn check_my_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let address = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &*LIGHTCLIENT.read().unwrap() {
                RT.block_on(async move {
                    match lightclient
                        .wallet
                        .read()
                        .await
                        .is_address_derived_by_keys(&address) {
                        Ok(address_ref) => address_ref.map_or(
                            json::object! { "is_wallet_address" => false },
                            |address_ref| match address_ref {
                                WalletAddressRef::Unified {
                                    account_id,
                                    address_index,
                                    has_orchard,
                                    has_sapling,
                                    has_transparent,
                                    encoded_address,
                                } => json::object! {
                                    "is_wallet_address" => true,
                                    "address_type" => "unified".to_string(),
                                    "address_index" => address_index,
                                    "account_id" => u32::from(account_id),
                                    "has_orchard" => has_orchard,
                                    "has_sapling" => has_sapling,
                                    "has_transparent" => has_transparent,
                                    "encoded_address" => encoded_address,
                                },
                                WalletAddressRef::OrchardInternal {
                                    account_id,
                                    diversifier_index,
                                    encoded_address,
                                } => json::object! {
                                    "is_wallet_address" => true,
                                    "address_type" => "orchard_internal".to_string(),
                                    "account_id" => u32::from(account_id),
                                    "diversifier_index" => u128::from(diversifier_index).to_string(),
                                    "encoded_address" => encoded_address,
                                },
                                WalletAddressRef::SaplingExternal {
                                    account_id,
                                    diversifier_index,
                                    encoded_address,
                                } => json::object! {
                                    "is_wallet_address" => true,
                                    "address_type" => "sapling".to_string(),
                                    "account_id" => u32::from(account_id),
                                    "diversifier_index" => u128::from(diversifier_index).to_string(),
                                    "encoded_address" => encoded_address,
                                },
                                WalletAddressRef::Transparent {
                                    account_id,
                                    scope,
                                    address_index,
                                    encoded_address,
                                } => json::object! {
                                    "is_wallet_address" => true,
                                    "address_type" => "transparent".to_string(),
                                    "account_id" => u32::from(account_id),
                                    "scope" => scope.to_string(),
                                    "address_index" => address_index.index(),
                                    "encoded_address" => encoded_address,
                                },
                            },
                        ).pretty(2),
                        Err(e) => format!("Error: {e}"),
                    }
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_wallet_save_required(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let wallet = lightclient.wallet.read().await;
                    object! { "save_required" => wallet.save_required }.pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn set_config_wallet_to_test(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let mut wallet = lightclient.wallet.write().await;
                    wallet.wallet_settings.min_confirmations = NonZeroU32::try_from(1).unwrap();
                    wallet.wallet_settings.sync_config.performance_level = PerformanceLevel::Medium;
                    wallet.save_required = true;
                    "Successfully set config wallet to test. (1 - Medium)".to_string()
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn set_config_wallet_to_prod(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let performance_level = cx.argument::<JsString>(0)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(1)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let performancetype = match performance_level.as_str() {
                        "Maximum" => PerformanceLevel::Maximum,
                        "High" => PerformanceLevel::High,
                        "Medium" => PerformanceLevel::Medium,
                        "Low" => PerformanceLevel::Low,
                        _ => return "Error: Not a valid performance level!".to_string(),
                    };
                    let mut wallet = lightclient.wallet.write().await;
                    wallet.wallet_settings.min_confirmations = NonZeroU32::try_from(min_confirmations as u32).unwrap();
                    wallet.wallet_settings.sync_config.performance_level = performancetype;
                    wallet.save_required = true;
                    "Successfully set config wallet to prod.".to_string()
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_config_wallet_performance(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let wallet = lightclient.wallet.read().await;
                    let performance_level = match wallet.wallet_settings.sync_config.performance_level {
                        PerformanceLevel::Low => "Low",
                        PerformanceLevel::Medium => "Medium",
                        PerformanceLevel::High => "High",
                        PerformanceLevel::Maximum => "Maximum",
                    };
                    object! { "performance_level" => performance_level }.pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn get_wallet_version(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let wallet = lightclient.wallet.read().await;
                    let current_version = wallet.current_version();
                    let read_version = wallet.read_version();
                    object! { 
                        "current_version" => current_version,
                        "read_version" => read_version
                    }.pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

// internal use
fn interpret_memo_string(memo_str: String) -> Result<MemoBytes, String> {
    // If the string starts with an "0x", and contains only hex chars ([a-f0-9]+) then
    // interpret it as a hex
    let s_bytes = if memo_str.to_lowercase().starts_with("0x") {
        match hex::decode(&memo_str[2..memo_str.len()]) {
            Ok(data) => data,
            Err(_) => Vec::from(memo_str.as_bytes()),
        }
    } else {
        Vec::from(memo_str.as_bytes())
    };

    MemoBytes::from_bytes(&s_bytes)
        .map_err(|_| format!("Error creating output. Memo '{:?}' is too long", memo_str))
}

fn send(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let send_json = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    let json_args = match json::parse(&send_json) {
                        Ok(parsed) => parsed,
                        Err(_) => return "Error: it is not a valid JSON".to_string(),
                    };

                    let mut receivers = Receivers::new();
                    for j in json_args.members() {
                        let recipient_address = match j["address"].as_str() {
                            Some(addr) => match ZcashAddress::try_from_encoded(addr) {
                                Ok(a) => a,
                                Err(e) => return format!("Error: Invalid address: {e}"),
                            },
                            None => return "Error: Missing address".to_string(),
                        };

                        let amount = match j["amount"].as_u64() {
                            Some(a) => match Zatoshis::from_u64(a) {
                                Ok(a) => a,
                                Err(e) => return format!("Error: Invalid amount: {e}"),
                            },
                            None => return "Missing amount".to_string(),
                        };

                        let memo = if let Some(m) = j["memo"].as_str() {
                            match interpret_memo_string(m.to_string()) {
                                Ok(memo_bytes) => Some(memo_bytes),
                                Err(e) => return format!("Error: Invalid memo: {e}"),
                            }
                        } else {
                            None
                        };

                        receivers.push(zingolib::data::receivers::Receiver {
                            recipient_address,
                            amount,
                            memo,
                        });
                    }

                    let request = match transaction_request_from_receivers(receivers)
                    {
                        Ok(request) => request,
                        Err(e) => return format!("Error: Request Error: {e}"),
                    };

                    match lightclient
                        .propose_send(request, AccountId::ZERO)
                        .await
                    {
                        Ok(proposal) => {
                            let fee = match total_fee(&proposal) {
                                Ok(fee) => fee,
                                Err(e) => return object! { "error" => e.to_string() }.pretty(2),
                            };
                            object! { "fee" => fee.into_u64() }
                        }
                        Err(e) => {
                            object! { "error" => e.to_string() }
                        }
                    }
                    .pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn shield(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    match lightclient.propose_shield(AccountId::ZERO).await {
                        Ok(proposal) => {
                            if proposal.steps().len() != 1 {
                                return object! { "error" => "shielding transactions should not have multiple proposal steps" }.pretty(2);
                            }
                            let step = proposal.steps().first();
                            let Some(value_to_shield) = step
                                .balance()
                                .proposed_change()
                                .iter()
                                .try_fold(Zatoshis::ZERO, |acc, c| acc + c.value()) else {
                                    return object! { "error" => "shield amount outside valid range of zatoshis" }
                                        .pretty(2);
                            };
                            let fee = step.balance().fee_required();
                            object! {
                                "value_to_shield" => value_to_shield.into_u64(),
                                "fee" => fee.into_u64(),
                            }
                        }
                        Err(e) => {
                            object! { "error" => e.to_string() }
                        }
                    }
                    .pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn confirm(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || {
            if let Some(lightclient) = &mut *LIGHTCLIENT.write().unwrap() {
                RT.block_on(async move {
                    match lightclient
                        .send_stored_proposal()
                        .await {
                        Ok(txids) => {
                            object! { "txids" => txids.iter().map(|txid| txid.to_string()).collect::<Vec<_>>() }
                        }
                        Err(e) => {
                            object! { "error" => e.to_string() }
                        }
                    }
                    .pretty(2)
                })
            } else {
                "Error: Lightclient is not initialized".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}

fn delete_wallet(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);

    let promise = cx
        .task(move || {
            let (config, _lightwalletd_uri);
            match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations) {
                Ok((c, h)) => (config, _lightwalletd_uri) = (c, h),
                Err(_) => return "Error: Config issue, delete failed.".to_string(),
            };

            // Check if the file exists before attempting to delete
            if config.wallet_path_exists() {
                match remove_file(config.get_wallet_path()) {
                    Ok(_) => "File deleted successfully!".to_string(),
                    Err(e) => format!("Error: {e}"),
                }
            } else {
                "Error: File does not exist, nothing to delete.".to_string()
            }
        })
        .promise(move |mut cx, resp| {
            Ok(cx.string(resp))
        });

    Ok(promise)
}
