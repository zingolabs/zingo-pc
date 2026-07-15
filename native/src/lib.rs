#[macro_use]
extern crate lazy_static;

#[cfg(target_os = "macos")]
extern "C" {
    fn check_mac_auth_available() -> std::ffi::c_int;
    fn verify_mac_auth_sync(reason: *const std::ffi::c_char) -> std::ffi::c_int;
    fn start_security_scoped_access(bookmark_b64: *const std::ffi::c_char) -> std::ffi::c_int;
}

static WALLET_BASE_DIR: once_cell::sync::OnceCell<std::path::PathBuf> = once_cell::sync::OnceCell::new();

use neon::prelude::*;

use std::num::NonZeroU32;
use std::str::FromStr;
use std::sync::RwLock;
use std::fs::remove_file;
use std::any::Any;
use std::panic::{self, PanicHookInfo, UnwindSafe};
use std::backtrace::Backtrace;
use std::sync::Once;
use std::sync::Mutex;
use once_cell::sync::Lazy;

use bip0039::Mnemonic;
use json::object;
// aws-lc-rs, not ring. The zingolib feat/ironwood workspace (this commit)
// documents aws-lc-rs as its SOLE rustls CryptoProvider — "ring is excised" —
// and enables prefer-post-quantum (X25519MLKEM768). Both zingo-netutils (gRPC
// sync) and zingo-price (the Gemini price fetch) install aws-lc-rs first-
// install-wins. Installing `ring` here pre-empts that: sync still connects with
// classical kx, but the price handshake wants PQ groups ring lacks and fails.
// (The exported fn name `set_crypto_default_provider_to_ring` is kept for the
// JS caller; despite the name it now installs aws-lc-rs.)
use rustls::crypto::{CryptoProvider, aws_lc_rs::default_provider};

use zcash_address::unified::{Container, Encoding, Ufvk};
use zcash_keys::address::Address;
use zcash_keys::keys::UnifiedFullViewingKey;
use zip32::AccountId;
use zcash_protocol::consensus::{NetworkType, NetworkUpgrade, Parameters};

use pepper_sync::config::SyncConfig;
use pepper_sync::config::{PerformanceLevel, TransparentAddressDiscovery};
use pepper_sync::keys::transparent;
use pepper_sync::wallet::{KeyIdInterface, SyncMode};
use zingolib::config::{ChainType, ClientConfig, WalletConfig, construct_lightwalletd_uri};
use zingolib::data::PollReport;
use zingolib::lightclient::LightClient;
use zingolib::utils::{conversion::address_from_str, conversion::txid_from_hex_encoded_str};
use zingolib::wallet::keys::unified::{ReceiverSelection, UnifiedKeyStore};
use zingolib::wallet::WalletSettings;
use zingolib::data::receivers::Receivers;
use zcash_address::ZcashAddress;
use zcash_protocol::{value::Zatoshis};
use tokio::runtime::Runtime;
use zcash_protocol::memo::MemoBytes;
use zingolib::data::receivers::transaction_request_from_receivers;
use zingolib::data::proposal::total_fee;
use zingolib::ActivationHeights;
use zingo_netutils::{GrpcIndexer, Indexer};

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    install_panic_hook_once();

    cx.export_function("set_wallet_base_dir", set_wallet_base_dir)?;
    cx.export_function("start_security_scoped_access", neon_start_security_scoped_access)?;
    cx.export_function("deinitialize", deinitialize)?;
    cx.export_function("wallet_exists", wallet_exists)?;
    cx.export_function("init_new", init_new)?;
    cx.export_function("init_from_seed", init_from_seed)?;
    cx.export_function("init_from_ufvk", init_from_ufvk)?;
    cx.export_function("init_from_b64", init_from_b64)?;
    cx.export_function("save_wallet_file", save_wallet_file)?;
    cx.export_function("check_save_error", check_save_error)?;
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
    cx.export_function("drain_orchard_to_ironwood", drain_orchard_to_ironwood)?;
    cx.export_function("get_ironwood_activation_height", get_ironwood_activation_height)?;
    cx.export_function("plan_orchard_drain", plan_orchard_drain)?;
    cx.export_function("remove_transaction", remove_transaction)?;
    cx.export_function("get_spendable_balance_with_address", get_spendable_balance_with_address)?;
    cx.export_function("get_spendable_balance_total", get_spendable_balance_total)?;
    cx.export_function("set_option_wallet", set_option_wallet)?;
    cx.export_function("get_unified_addresses", get_unified_addresses)?;
    cx.export_function("get_transparent_addresses", get_transparent_addresses)?;
    cx.export_function("create_new_unified_address", create_new_unified_address)?;
    cx.export_function("create_new_transparent_address", create_new_transparent_address)?;
    cx.export_function("get_wallet_save_required", get_wallet_save_required)?;
    cx.export_function("set_config_wallet_to_test", set_config_wallet_to_test)?;
    cx.export_function("set_config_wallet_to_prod", set_config_wallet_to_prod)?;
    cx.export_function("get_config_wallet_performance", get_config_wallet_performance)?;
    cx.export_function("get_wallet_version", get_wallet_version)?;
    cx.export_function("send", send)?;
    cx.export_function("shield", shield)?;
    cx.export_function("confirm", confirm)?;
    cx.export_function("delete_wallet", delete_wallet)?;

    #[cfg(target_os = "windows")]
    cx.export_function("checkWindowsHello", check_windows_hello)?;
    #[cfg(target_os = "windows")]
    cx.export_function("verifyWindowsUser", verify_windows_user)?;

    #[cfg(target_os = "macos")]
    cx.export_function("checkMacAuth", check_mac_auth)?;
    #[cfg(target_os = "macos")]
    cx.export_function("verifyMacUser", verify_mac_user)?;

    Ok(())
}

// Returns "available", "not_configured", or "not_supported".
// Uses .get() (blocking) — the availability check is fast and shows no UI.
#[cfg(target_os = "windows")]
fn check_windows_hello(mut cx: FunctionContext) -> JsResult<JsString> {
    use windows::Security::Credentials::UI::{UserConsentVerifier, UserConsentVerifierAvailability};

    let status = std::panic::catch_unwind(|| {
        match UserConsentVerifier::CheckAvailabilityAsync() {
            Ok(op) => match op.get() {
                Ok(s) if s == UserConsentVerifierAvailability::Available => "available",
                Ok(s) if s == UserConsentVerifierAvailability::NotConfiguredForUser => "not_configured",
                _ => "not_supported",
            },
            Err(_) => "not_supported",
        }
    });

    Ok(cx.string(status.unwrap_or("not_supported")))
}

// Returns a Promise<{success: boolean}> after showing the Windows Hello prompt.
// Runs on a background thread so the UI prompt does not block the Node event loop.
#[cfg(target_os = "windows")]
fn verify_windows_user(mut cx: FunctionContext) -> JsResult<JsPromise> {
    use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier};
    use windows::core::HSTRING;

    let reason: String = cx.argument::<JsString>(0)?.value(&mut cx);
    let channel = cx.channel();
    let (deferred, promise) = cx.promise();

    std::thread::spawn(move || {
        let success = std::panic::catch_unwind(|| {
            let h = HSTRING::from(reason.as_str());
            match UserConsentVerifier::RequestVerificationAsync(&h) {
                Ok(op) => match op.get() {
                    Ok(r) => r == UserConsentVerificationResult::Verified,
                    Err(_) => false,
                },
                Err(_) => false,
            }
        })
        .unwrap_or(false);

        deferred.settle_with(&channel, move |mut cx| {
            let obj = cx.empty_object();
            let v = cx.boolean(success);
            obj.set(&mut cx, "success", v)?;
            Ok(obj)
        });
    });

    Ok(promise)
}

#[cfg(target_os = "macos")]
fn check_mac_auth(mut cx: FunctionContext) -> JsResult<JsString> {
    let available = unsafe { check_mac_auth_available() != 0 };
    Ok(cx.string(if available { "available" } else { "not_supported" }))
}

#[cfg(target_os = "macos")]
fn verify_mac_user(mut cx: FunctionContext) -> JsResult<JsPromise> {
    use std::ffi::CString;

    let reason: String = cx.argument::<JsString>(0)?.value(&mut cx);
    let channel = cx.channel();
    let (deferred, promise) = cx.promise();

    std::thread::spawn(move || {
        let c_reason = CString::new(reason.as_str())
            .unwrap_or_else(|_| CString::new("Authenticate").unwrap());
        let success = unsafe { verify_mac_auth_sync(c_reason.as_ptr()) != 0 };

        deferred.settle_with(&channel, move |mut cx| {
            let obj = cx.empty_object();
            let v = cx.boolean(success);
            obj.set(&mut cx, "success", v)?;
            Ok(obj)
        });
    });

    Ok(promise)
}

#[derive(Debug, thiserror::Error)]
pub enum ZingolibError {
    #[error("Error: Lightclient is not initialized")]
    LightclientNotInitialized,
    #[error("Error: Lightclient lock poisoned")]
    LightclientLockPoisoned,
    #[error("Error: panic: {0}")]
    Panic(String),
}

pub fn with_panic_guard<T, F>(f: F) -> Result<T, ZingolibError>
where
    F: FnOnce() -> Result<T, ZingolibError> + UnwindSafe,
{
    install_panic_hook_once();
    match panic::catch_unwind(f) {
        Ok(res) => res,
        Err(payload) => Err(ZingolibError::Panic(format_panic_text(payload))),
    }
}

#[derive(Clone, Default)]
struct PanicReport {
    msg: String,
    file: Option<String>,
    line: Option<u32>,
    col:  Option<u32>,
    backtrace: Option<String>,
}

static LAST_PANIC: Lazy<Mutex<PanicReport>> =
    Lazy::new(|| Mutex::new(PanicReport::default()));

fn set_last_panic(report: PanicReport) {
    if let Ok(mut r) = LAST_PANIC.lock() {
        *r = report;
    }
}

fn take_last_panic() -> PanicReport {
    if let Ok(mut r) = LAST_PANIC.lock() {
        let out = r.clone();
        *r = PanicReport::default();
        out
    } else {
        PanicReport::default()
    }
}

static PANIC_HOOK_ONCE: Once = Once::new();

fn install_panic_hook_once() {
    PANIC_HOOK_ONCE.call_once(|| {
        panic::set_hook(Box::new(|info: &PanicHookInfo<'_>| {
            let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
                (*s).to_string()
            } else if let Some(s) = info.payload().downcast_ref::<String>() {
                s.clone()
            } else {
                info.to_string()
            };

            let (file, line, col) = info.location()
                .map(|l| (Some(l.file().to_string()), Some(l.line()), Some(l.column())))
                .unwrap_or((None, None, None));

            let bt = Backtrace::force_capture().to_string();

            set_last_panic(PanicReport {
                msg: payload,
                file, line, col,
                backtrace: Some(bt),
            });
        }));
    });
}

fn clean_backtrace(bt_raw: &str) -> String {
    const DROP: &[&str] = &[
        "<unknown>"
    ];

    let mut out = String::new();

    for line in bt_raw.lines() {
        let l = line.trim();
        if l.is_empty() { continue; }
        if DROP.iter().any(|d| l.contains(d)) { continue; }

        out.push_str(line);
        out.push('\n');
    }

    out
}

fn format_panic_text(payload: Box<dyn Any + Send>) -> String {
    let rpt = take_last_panic();

    let fallback = if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic payload".to_string()
    };

    let mut out = String::new();

    if let (Some(f), Some(l), Some(c)) = (rpt.file.as_ref(), rpt.line, rpt.col) {
        out.push_str(&format!("{f}:{l}:{c}: "));
    }
    if !rpt.msg.is_empty() {
        out.push_str(&rpt.msg);
    } else {
        out.push_str(&fallback);
    }

    if let Some(bt) = rpt.backtrace {
        let cleaned = clean_backtrace(&bt);
        if !cleaned.is_empty() {
            out.push_str("\nBacktrace:\n");
            out.push_str(&cleaned);
        }
    }

    out
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

fn with_lightclient_write<F, R>(f: F) -> R
where
    F: FnOnce(&mut Option<LightClient>) -> R,
{
    let mut guard = match LIGHTCLIENT.write() {
        Ok(g) => g,
        Err(poisoned) => {
            log::warn!("LIGHTCLIENT RwLock poisoned; recovering and clearing poison");
            let g = poisoned.into_inner();
            LIGHTCLIENT.clear_poison();
            g
        }
    };
    f(&mut *guard)
}

fn reset_lightclient() {
    with_lightclient_write(|slot| {
        *slot = None;
    });
}

fn store_client(lightclient: LightClient) -> Result<(), ZingolibError> {
    with_lightclient_write(|slot| {
        *slot = Some(lightclient);
    });
    Ok(())
}

fn set_wallet_base_dir(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let path_str = cx.argument::<JsString>(0)?.value(&mut cx);
    let _ = WALLET_BASE_DIR.set(std::path::PathBuf::from(path_str));
    Ok(cx.boolean(true))
}

fn neon_start_security_scoped_access(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    #[cfg(target_os = "macos")]
    {
        let bookmark_b64 = cx.argument::<JsString>(0)?.value(&mut cx);
        let c_str = match std::ffi::CString::new(bookmark_b64) {
            Ok(s) => s,
            Err(_) => return Ok(cx.boolean(false)),
        };
        let result = unsafe { start_security_scoped_access(c_str.as_ptr()) };
        return Ok(cx.boolean(result == 1));
    }
    #[cfg(not(target_os = "macos"))]
    Ok(cx.boolean(true))
}

// Builds the pieces shared by every wallet-construction entry point: a
// `ClientConfigBuilder` primed with chain type, wallet dir/name and (unless
// Offline) the indexer URI, plus the resolved `WalletSettings` and the parsed
// lightwalletd URI. Each caller finishes the config by calling
// `.set_wallet_config(..)` with the variant it needs (NewSeed / MnemonicPhrase
// / Ufvk / Read) before `.build()`.
fn construct_uri_load_config(
    uri: String,
    chain_hint: String,
    performance_level: String,
    min_confirmations: f64,
    wallet_name: String,
) -> Result<(zingolib::config::ClientConfigBuilder, WalletSettings, http::Uri), String> {
    // if uri is empty -> Offline Mode.
    let lightwalletd_uri = construct_lightwalletd_uri(Some(uri.clone()))
        .map_err(|e| format!("Error: Invalid server uri: {e}"))?;

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
    let wallet_dir = WALLET_BASE_DIR.get().cloned().map(|mut dir| {
        match chaintype {
            ChainType::Testnet => { dir.push("testnet3"); dir }
            ChainType::Regtest(_) => { dir.push("regtest"); dir }
            ChainType::Mainnet => dir,
        }
    });

    let wallet_settings = WalletSettings {
        sync_config: SyncConfig {
            transparent_address_discovery: TransparentAddressDiscovery::minimal(),
            performance_level: performancetype,
        },
        // `min_confirmations` comes from the renderer through IPC. Reject 0 (and
        // anything that casts to 0 — negatives, NaN, fractional values <1) instead
        // of unwrapping, which would panic and abort the wallet process.
        min_confirmations: NonZeroU32::try_from(min_confirmations as u32)
            .map_err(|_| "Error: min_confirmations must be >= 1".to_string())?,
    };

    let mut builder = ClientConfig::builder()
        .set_chain_type(chaintype)
        .set_wallet_name(wallet_name);
    if let Some(dir) = wallet_dir {
        builder = builder.set_wallet_dir(dir);
    }
    // Empty uri means Offline Mode: leave the indexer unset so the resulting
    // LightClient starts offline (no network traffic on construction).
    if !uri.is_empty() {
        builder = builder.set_indexer_uri(lightwalletd_uri.clone());
    }

    Ok((builder, wallet_settings, lightwalletd_uri))
}

// reset lightclient
fn deinitialize(mut cx: FunctionContext) -> JsResult<JsString> {
    reset_lightclient();

    Ok(cx.string(format!("OK")))
}

// Check if there is an existing wallet
fn wallet_exists(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(4)?.value(&mut cx);

    let res: Result<bool, ZingolibError> = with_panic_guard(|| {
        let (builder, _wallet_settings, _lightwalletd_uri) = construct_uri_load_config(
            server_uri.clone(),
            chain_hint.clone(),
            performance_level.clone(),
            min_confirmations,
            wallet_name.clone(),
        )
        .map_err(|e| ZingolibError::Panic(e.to_string()))?;

        let config = builder.set_wallet_config(WalletConfig::Read).build();
        Ok(config.get_wallet_path().exists())
    });

    match res {
        Ok(v) => Ok(cx.boolean(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

// Create a new wallet and return the seed for the newly created wallet.
fn init_new(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(4)?.value(&mut cx);

    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        reset_lightclient();
        let (builder, wallet_settings, lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name) {
            Ok(c) => c,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        // Fetch the current chain tip from the server; the NewSeed wallet
        // derives its birthday from this height (chain_height - 100).
        let chain_height = match RT.block_on(async move {
            let mut indexer = GrpcIndexer::new(lightwalletd_uri)
                .await
                .map_err(|e| e.to_string())?;
            indexer
                .get_latest_block(std::time::Duration::from_secs(30))
                .await
                .map(|block_id| block_id.height as u32)
                .map_err(|e| e.to_string())
        }) {
            Ok(h) => h,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        let config = builder
            .set_wallet_config(WalletConfig::NewSeed {
                no_of_accounts: NonZeroU32::try_from(1).expect("hard-coded integer"),
                chain_height,
                wallet_settings,
            })
            .build();
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        Ok(get_seed_string())
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

// Restore a wallet from the seed phrase
fn init_from_seed(mut cx: FunctionContext) -> JsResult<JsString> {
    let seed = cx.argument::<JsString>(0)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(1)?.value(&mut cx);
    let server_uri = cx.argument::<JsString>(2)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(3)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(4)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(5)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(6)?.value(&mut cx);

    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        reset_lightclient();
        let (builder, wallet_settings, _lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name) {
            Ok(c) => c,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        // Validate the phrase up front to surface a specific error before any
        // config/disk work; the resolved phrase is then handed to the wallet.
        let mnemonic = match Mnemonic::<bip0039::English>::from_phrase(seed) {
            Ok(m) => m,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        let config = builder
            .set_wallet_config(WalletConfig::MnemonicPhrase {
                mnemonic_phrase: mnemonic.phrase().to_string(),
                no_of_accounts: NonZeroU32::try_from(1).expect("hard-coded integer"),
                birthday: birthday as u32,
                wallet_settings,
            })
            .build();
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        Ok(get_seed_string())
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

fn init_from_ufvk(mut cx: FunctionContext) -> JsResult<JsString> {
    let ufvk = cx.argument::<JsString>(0)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(1)?.value(&mut cx);
    let server_uri = cx.argument::<JsString>(2)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(3)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(4)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(5)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(6)?.value(&mut cx);

    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        reset_lightclient();
        let (builder, wallet_settings, _lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name) {
            Ok(c) => c,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        let config = builder
            .set_wallet_config(WalletConfig::Ufvk {
                ufvk,
                birthday: birthday as u32,
                wallet_settings,
            })
            .build();
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        Ok(get_ufvk_string())
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

fn init_from_b64(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(4)?.value(&mut cx);

    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        reset_lightclient();
        let (builder, _wallet_settings, _lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name) {
            Ok(c) => c,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        // Read the existing wallet file from disk (Read variant).
        let config = builder.set_wallet_config(WalletConfig::Read).build();
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Ok(format!("Error: {e}")),
        };
        let has_seed = RT.block_on(async {
            lightclient.wallet().read().await.mnemonic_phrase().is_some()
        });
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        Ok(if has_seed { get_seed_string() } else { get_ufvk_string() })
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

fn write_to_path(wallet_path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let temp_wallet_path: std::path::PathBuf = wallet_path.with_extension(
        wallet_path
            .extension()
            .map(|e| format!("{}.tmp", e.to_string_lossy()))
            .unwrap_or_else(|| "tmp".to_string()),
    );
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp_wallet_path)
        .map_err(|e| std::io::Error::new(e.kind(), format!("open temp {:?}: {}", temp_wallet_path, e)))?;

    let mut writer = std::io::BufWriter::new(file);
    std::io::Write::write_all(&mut writer, bytes)
        .map_err(|e| std::io::Error::new(e.kind(), format!("write temp {:?}: {}", temp_wallet_path, e)))?;

    let file = writer.into_inner()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("into_inner: {}", e)))?;

    file.sync_all()
        .map_err(|e| std::io::Error::new(e.kind(), format!("sync temp {:?}: {}", temp_wallet_path, e)))?;

    std::fs::rename(&temp_wallet_path, wallet_path)
        .map_err(|e| std::io::Error::new(e.kind(), format!("rename {:?} -> {:?}: {}", temp_wallet_path, wallet_path, e)))?;

    #[cfg(unix)]
    {
        if let Some(parent) = wallet_path.parent() {
            let wallet_dir = std::fs::File::open(parent)
                .map_err(|e| std::io::Error::new(e.kind(), format!("open dir {:?}: {}", parent, e)))?;
            wallet_dir.sync_all()
                .map_err(|e| std::io::Error::new(e.kind(), format!("sync dir {:?}: {}", parent, e)))?;
        }
    }

    Ok(())
}

fn save_wallet_file(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let wallet_path = lightclient.wallet_path();
                        let mut wallet = lightclient.wallet().write().await;
                        match wallet.save() {
                            Ok(Some(wallet_bytes)) => {
                                match write_to_path(&wallet_path, &wallet_bytes) {
                                    Ok(_) => {
                                        let size = wallet_bytes.len();
                                        format!("Wallet saved successfully. Size: {} bytes.", size)
                                    }
                                    Err(e) => {
                                        format!("Error: writing wallet file: {e}")
                                    }
                                }
                            }
                            Ok(None) => {
                                "Wallet is empty. Nothing to save.".to_string()
                            }
                            Err(e) => {
                                format!("Error: {e}")
                            }
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn check_save_error(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move { 
                        match lightclient.check_save_error().await {
                            Ok(()) => String::new(),
                            Err(e) => {
                                format!("Error: save failed. {e}\nRestarting save task...")
                            }
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// FFI-exposed but currently has no JS caller. Reserved for an upcoming UI
// feature; review input validation here when the JS caller is wired up.
fn get_developer_donation_address(mut cx: FunctionContext) -> JsResult<JsString> {
    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        let resp = zingolib::DEVELOPER_DONATION_ADDRESS.to_string();

        Ok(resp)
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

// FFI-exposed but currently has no JS caller. Reserved for an upcoming UI
// feature; review input validation here when the JS caller is wired up.
fn get_zennies_for_zingo_donation_address(mut cx: FunctionContext) -> JsResult<JsString> {
    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        let resp = zingolib::ZENNIES_FOR_ZINGO_DONATION_ADDRESS.to_string();

        Ok(resp)
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

fn set_crypto_default_provider_to_ring(mut cx: FunctionContext) -> JsResult<JsString> {
    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        let resp = CryptoProvider::get_default().map_or_else(
            || match default_provider().install_default() {
                Ok(_) => "true".to_string(),
                Err(_) => "Error: Failed to install crypto provider".to_string(),
            },
            |_| "true".to_string(),
        );

        Ok(resp)
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

fn get_seed_string() -> String {
    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        if let Some(lightclient) = &mut *guard {
            Ok(RT.block_on(async move {
                let wallet = lightclient.wallet().read().await;
                match wallet.recovery_info() {
                    Some(recovery_info) => serde_json::to_string_pretty(&recovery_info)
                        .unwrap_or_else(|_| "Error: get seed. failed to serialize".to_string()),
                    None => "Error: get seed. no mnemonic found. wallet loaded from key.".to_string(),
                }
            }))
        } else {
            Err(ZingolibError::LightclientNotInitialized)
        }
    });

    match res {
        Ok(v) => v,
        Err(e) => e.to_string(),
    }
}

fn get_seed(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                Ok(get_seed_string())
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_ufvk_string() -> String {
    let res: Result<String, ZingolibError> = with_panic_guard(|| {
        let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        if let Some(lightclient) = &mut *guard {
            Ok(RT.block_on(async move {
                let wallet = lightclient.wallet().read().await;
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
                    "ufvk" => ufvk.encode(&wallet.chain_type()),
                    "birthday" => u32::from(wallet.birthday())
                }
                .pretty(2).to_string()
            }))
        } else {
            Err(ZingolibError::LightclientNotInitialized)
        }
    });

    match res {
        Ok(v) => v,
        Err(e) => e.to_string(),
    }
}

fn get_ufvk(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                Ok(get_ufvk_string())
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_latest_block_server(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let lightwalletd_uri: http::Uri = match server_uri.parse() {
                    Ok(uri) => uri,
                    Err(e) => {
                        return Ok(format!("Error: failed to parse uri. {e}"));
                    }
                };
                match RT.block_on(async move {
                    let mut indexer = GrpcIndexer::new(lightwalletd_uri)
                        .await
                        .map_err(|e| e.to_string())?;
                    indexer
                        .get_latest_block(std::time::Duration::from_secs(30))
                        .await
                        .map_err(|e| e.to_string())
                }) {
                    Ok(block_id) => Ok(block_id.height.to_string()),
                    Err(e) => Ok(format!("Error: {e}")),
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_latest_block_wallet(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let wallet = lightclient.wallet().read().await;
                        object! { "height" => json::JsonValue::from(wallet.sync_state.last_known_chain_height().map_or(0, u32::from))}.pretty(2)
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_value_transfers(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient
                            .wallet()
                            .read()
                            .await
                            .value_transfers(true)
                            .await
                        {
                            Ok(value_transfers) => json::JsonValue::from(value_transfers).pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn poll_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    match lightclient.poll_sync() {
                        PollReport::NoHandle => Ok("Sync task has not been launched.".to_string()),
                        PollReport::NotReady => Ok("Sync task is not complete.".to_string()),
                        PollReport::Ready(result) => match result {
                            Ok(sync_result) => {
                                Ok(json::object! { "sync_complete" => json::JsonValue::from(sync_result) }
                                    .pretty(2))
                            }
                            Err(e) => Ok(format!("Error: {e}")),
                        },
                    }
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn run_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    if lightclient.sync_mode() == SyncMode::Paused {
                        lightclient.resume_sync().expect("sync should be paused");
                        Ok("Resuming sync task...".to_string())
                    } else {
                        Ok(RT.block_on(async move {
                            match lightclient.sync().await {
                                Ok(_) => "Launching sync task...".to_string(),
                                Err(e) => format!("Error: {e}"),
                            }
                        }))
                    }
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// FFI-exposed but currently has no JS caller. Reserved for an upcoming UI
// feature; review input validation here when the JS caller is wired up.
fn pause_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    match lightclient.pause_sync() {
                        Ok(_) => Ok("Pausing sync task...".to_string()),
                        Err(e) => Ok(format!("Error: {e}")),
                    }
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn stop_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    match lightclient.stop_sync() {
                        Ok(_) => Ok("Stopping sync task...".to_string()),
                        Err(e) => Ok(format!("Error: {e}")),
                    }
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn status_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match pepper_sync::sync_status(&*lightclient.wallet().read().await).await {
                            Ok(status) => json::JsonValue::from(status).pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn run_rescan(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.rescan().await {
                            Ok(_) => "Launching rescan...".to_string(),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn info_server(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.do_info().await {
                            Ok(info) => info,
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn change_server(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    let is_default = server_uri.is_empty();
                    let uri = if is_default {
                        http::Uri::default()
                    } else {
                        match http::Uri::from_str(&server_uri) {
                            Ok(uri) => uri,
                            Err(_) => return Ok("Error: invalid server uri".to_string()),
                        }
                    };
                    // `set_server` is gone; `set_indexer_uri` is the replacement.
                    // Unlike the old setter it actually (re)connects to the
                    // indexer, so a bad/unreachable uri surfaces here.
                    Ok(RT.block_on(async move {
                        match lightclient.set_indexer_uri(uri).await {
                            Ok(_) => if is_default {
                                "server set (default)".to_string()
                            } else {
                                "server set".to_string()
                            },
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn wallet_kind(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let wallet = lightclient.wallet().read().await;
                        if wallet.mnemonic_phrase().is_some() {
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
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn parse_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let address = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                if address.is_empty() {
                    Ok("Error: The address is empty".to_string())
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
                            Address::Sapling(_) => Ok(object! {
                                "status" => "success",
                                "chain_name" => chain_name_string,
                                "address_kind" => "sapling",
                            }
                            .pretty(2)),
                            Address::Transparent(_) => Ok(object! {
                                "status" => "success",
                                "chain_name" => chain_name_string,
                                "address_kind" => "transparent",
                            }
                            .pretty(2)),
                            Address::Tex(_) => Ok(object! {
                                "status" => "success",
                                "chain_name" => chain_name_string,
                                "address_kind" => "tex",
                            }
                            .pretty(2)),
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
                                    Ok(object! {
                                        "status" => "success",
                                        "chain_name" => chain_name_string,
                                        "address_kind" => "unified",
                                        "receivers_available" => receivers_available,
                                        "only_orchard_ua" => zcash_keys::address::UnifiedAddress::from_receivers(ua.orchard().cloned(), None, None).expect("To construct UA").encode(&chain_name),
                                    }
                                    .pretty(2))
                                } else {
                                    Ok(object! {
                                        "status" => "success",
                                        "chain_name" => chain_name_string,
                                        "address_kind" => "unified",
                                        "receivers_available" => receivers_available,
                                    }
                                    .pretty(2))
                                }
                            }
                        }
                    } else {
                        Ok(object! {
                            "status" => "Invalid address",
                            "chain_name" => json::JsonValue::Null,
                            "address_kind" => json::JsonValue::Null,
                        }
                        .pretty(2))
                    }
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// Validates a Unified Full Viewing Key for the renderer. Called from
// AddNewWallet.doRestoreUfvkWallet before init_from_ufvk to give the user a
// specific error (invalid key / wrong network) instead of the generic failure
// that would otherwise come back from init_from_ufvk after disk writes.
fn parse_ufvk(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let ufvk = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                if ufvk.is_empty() {
                    Ok("Error: The ufvk is empty".to_string())
                } else {
                    Ok(json::stringify_pretty(
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
                    ))
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_version(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                Ok(zingolib::git_description().to_string())
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_messages(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let address = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient
                            .messages_containing(Some(address.as_str()))
                            .await
                        {
                            Ok(value_transfers) => json::JsonValue::from(value_transfers).pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_balance(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient
                            .account_balance(AccountId::ZERO)
                            .await
                        {
                            Ok(bal) => json::JsonValue::from(bal).pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_total_memobytes_to_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.do_total_memobytes_to_address().await {
                            Ok(total_memo_bytes) => json::JsonValue::from(total_memo_bytes).pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_total_value_to_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.do_total_value_to_address().await {
                            Ok(total_values) => json::JsonValue::from(total_values).pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_total_spends_to_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.do_total_spends_to_address().await {
                            Ok(total_spends) => json::JsonValue::from(total_spends).pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// Plans (without signing or sending) the happy-path drain of the pre-Ironwood
// Orchard balance. Read-only and does NOT sync, so it is safe to poll. Returns
// { migrated, fee, stranded } in zatoshis, where `stranded` is the dust that
// cannot be migrated (worth at most the sweep minimum). `migrated == 0` means
// the whole Orchard balance is dust.
fn plan_orchard_drain(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.plan_orchard_drain(zip32::AccountId::ZERO).await {
                            Ok(plan) => object! {
                                "migrated" => plan.migrated,
                                "fee" => plan.fee,
                                "stranded" => plan.stranded,
                            }
                            .pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// The NU6.3 / Ironwood activation block height for this wallet's chain, read
// from zingolib (the source of truth) instead of hard-coded constants. Returns
// "0" if the upgrade has no scheduled activation on the chain.
fn get_ironwood_activation_height(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    let height = lightclient
                        .chain_type()
                        .activation_height(NetworkUpgrade::Nu6_3)
                        .map_or(0u32, u32::from);
                    Ok(height.to_string())
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// Happy-path Ironwood migration: drains every spendable pre-Ironwood Orchard
// note into the Ironwood pool in one round of independent transactions (the
// immediate ZIP 318 path). Low privacy, no note-splitting or windows. Returns
// { txids, migrated, fee, dust } (dust = value left below the economic
// threshold in Orchard). Requires the ironwood zingolib (see Cargo.toml).
fn drain_orchard_to_ironwood(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.drain_orchard_to_ironwood(zip32::AccountId::ZERO).await {
                            Ok(summary) => object! {
                                "txids" => summary.txids.iter().map(ToString::to_string).collect::<Vec<_>>(),
                                "migrated" => summary.migrated,
                                "fee" => summary.fee,
                                "dust" => summary.stranded,
                            }
                            .pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn zec_price(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient
                            .wallet()
                            .write()
                            .await
                            .update_current_price()
                            .await
                        {
                            Ok(price) => object! { "current_price" => price }.pretty(2),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn remove_transaction(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let txid = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    let txid = match txid_from_hex_encoded_str(&txid) {
                        Ok(txid) => txid,
                        Err(e) => return Ok(format!("Error: {e}")),
                    };
                    Ok(RT.block_on(async move {
                        match lightclient
                            .wallet()
                            .write()
                            .await
                            .remove_failed_transaction(txid)
                        {
                            Ok(_) => "Successfully removed transaction.".to_string(),
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_spendable_balance_with_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let address = cx.argument::<JsString>(0)?.value(&mut cx);
    let zennies = cx.argument::<JsString>(1)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    let Ok(address) = address_from_str(&address) else {
                        return Ok("Error: unknown address format".to_string());
                    };
                    let Ok(zennies) = zennies.parse() else {
                        return Ok("Error: failed to parse zennies setting.".to_string());
                    };
                    Ok(RT.block_on(async move {
                        match lightclient
                            .max_send_value(address, zennies, AccountId::ZERO)
                            .await
                        {
                            Ok(bal) => {
                                object! { "spendable_balance" => bal.into_u64() }.pretty(2)
                            }
                            Err(e) => format!("Error: {e}"),
                        }
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_spendable_balance_total(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let wallet = lightclient.wallet().read().await;
                        let spendable_balance =
                            match wallet.shielded_spendable_balance(AccountId::ZERO, false) {
                                Ok(bal) => bal,
                                Err(e) => return format!("Error: {e}"),
                            };
                        object! {
                            "spendable_balance" => spendable_balance.into_u64(),
                        }
                        .pretty(2)
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn set_option_wallet(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                Ok("Error: unimplemented".to_string())
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}


fn get_unified_addresses(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move { lightclient.unified_addresses_json().await.pretty(2) }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_transparent_addresses(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move { lightclient.transparent_addresses_json().await.pretty(2) }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn create_new_unified_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let receivers = cx.argument::<JsString>(0)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let mut wallet = lightclient.wallet().write().await;
                        let network = wallet.chain_type();
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
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn create_new_transparent_address(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let mut wallet = lightclient.wallet().write().await;
                        let network = wallet.chain_type();
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
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_wallet_save_required(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let save_required = lightclient.is_save_required().await;
                        object! { "save_required" => save_required }.pretty(2)
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// FFI-exposed but currently has no JS caller. Reserved for an upcoming UI
// feature; review input validation here when the JS caller is wired up.
fn set_config_wallet_to_test(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let mut wallet = lightclient.wallet().write().await;
                        wallet.wallet_settings.min_confirmations = NonZeroU32::try_from(1).unwrap();
                        wallet.wallet_settings.sync_config.performance_level = PerformanceLevel::Medium;
                        wallet.mark_dirty();
                        "Successfully set config wallet to test. (1 - Medium)".to_string()
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// FFI-exposed but currently has no JS caller. Reserved for an upcoming UI
// feature; review input validation here when the JS caller is wired up.
fn set_config_wallet_to_prod(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let performance_level = cx.argument::<JsString>(0)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(1)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let performancetype = match performance_level.as_str() {
                            "Maximum" => PerformanceLevel::Maximum,
                            "High" => PerformanceLevel::High,
                            "Medium" => PerformanceLevel::Medium,
                            "Low" => PerformanceLevel::Low,
                            _ => return "Error: Not a valid performance level!".to_string(),
                        };
                        // `min_confirmations` comes from the renderer through IPC. Reject 0
                        // (and anything that casts to 0) instead of unwrapping — panic in this
                        // async block would unwind into Neon's panic guard but corrupt wallet
                        // state mid-write since we already hold the write lock.
                        let min_conf_nonzero = match NonZeroU32::try_from(min_confirmations as u32) {
                            Ok(n) => n,
                            Err(_) => return "Error: min_confirmations must be >= 1".to_string(),
                        };
                        let mut wallet = lightclient.wallet().write().await;
                        wallet.wallet_settings.min_confirmations = min_conf_nonzero;
                        wallet.wallet_settings.sync_config.performance_level = performancetype;
                        wallet.mark_dirty();
                        "Successfully set config wallet to prod.".to_string()
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

// FFI-exposed but currently has no JS caller. Reserved for an upcoming UI
// feature; review input validation here when the JS caller is wired up.
fn get_config_wallet_performance(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let wallet = lightclient.wallet().read().await;
                        let performance_level = match wallet.wallet_settings.sync_config.performance_level {
                            PerformanceLevel::Low => "Low",
                            PerformanceLevel::Medium => "Medium",
                            PerformanceLevel::High => "High",
                            PerformanceLevel::Maximum => "Maximum",
                        };
                        object! { "performance_level" => performance_level }.pretty(2)
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_wallet_version(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        let wallet = lightclient.wallet().read().await;
                        let current_version = wallet.current_version();
                        let read_version = wallet.read_version();
                        object! { 
                            "current_version" => current_version,
                            "read_version" => read_version
                        }.pretty(2)
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
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
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
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
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn shield(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
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
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn confirm(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient
                            .send_stored_proposal(true)
                            .await {
                            Ok(txids) => {
                                object! { "txids" => txids.iter().map(|txid| txid.to_string()).collect::<Vec<_>>() }
                            }
                            Err(e) => {
                                object! { "error" => e.to_string() }
                            }
                        }
                        .pretty(2)
                    }))
                } else {
                    Err(ZingolibError::LightclientNotInitialized)
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn delete_wallet(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(4)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let (builder, _wallet_settings, _lightwalletd_uri) = match construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name.clone()) {
                    Ok(v) => v,
                    Err(_) => return Ok("Error: Config issue, delete failed.".to_string()),
                };
                let config = builder.set_wallet_config(WalletConfig::Read).build();
                let wallet_path = config.get_wallet_path();
                // Check if the file exists before attempting to delete
                if wallet_path.exists() {
                    match remove_file(&wallet_path) {
                        Ok(_) => {
                            reset_lightclient();

                            Ok(format!(
                                "File deleted successfully: {}",
                                wallet_path.display()
                            ))
                        }
                        Err(e) => Ok(format!(
                            "Error deleting file {}: {}",
                            wallet_path.display(),
                            e
                        )),
                    }
                } else {
                    Ok(format!(
                        "Error: File does not exist: {}",
                        wallet_path.display()
                    ))
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}
