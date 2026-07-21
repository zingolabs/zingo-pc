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
use zingolib::wallet::migration::{MigrationParams, MigrationPhase, SigningStrategy, plan_hash};
use zcash_protocol::consensus::{NetworkType, NetworkUpgrade, Parameters};

use pepper_sync::config::SyncConfig;
use pepper_sync::config::{PerformanceLevel, TransparentAddressDiscovery};
use pepper_sync::keys::transparent;
use pepper_sync::wallet::{KeyIdInterface, SyncMode};
use pepper_sync::error::SyncModeError;
use zingolib::config::{ChainType, ClientConfig, WalletConfig, construct_indexer_uri};
use zingolib::data::PollReport;
use zingolib::lightclient::LightClient;
use zingolib::lightclient::error::LightClientError;
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
    cx.export_function("plan_ironwood_migration", plan_ironwood_migration)?;
    cx.export_function("start_ironwood_migration", start_ironwood_migration)?;
    cx.export_function("migration_status", migration_status)?;
    cx.export_function("reconcile_migration", reconcile_migration)?;
    cx.export_function("broadcast_due_parts", broadcast_due_parts)?;
    cx.export_function("auto_broadcast_if_due", auto_broadcast_if_due)?;
    cx.export_function("catch_up_migration", catch_up_migration)?;
    cx.export_function("migrate_to_ironwood", migrate_to_ironwood)?;
    cx.export_function("cancel_ironwood_migration", cancel_ironwood_migration)?;
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
    #[error("Error: saving wallet: {0}")]
    Save(String),
    #[error("Error: initializing wallet: {0}")]
    Init(String),
    #[error("Error: sync: {0}")]
    Sync(String),
    #[error("Error: rescan: {0}")]
    Rescan(String),
    #[error("Error: read: {0}")]
    Read(String),
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
) -> Result<(zingolib::config::ClientConfigBuilder, WalletSettings, http::Uri), ZingolibError> {
    // if uri is empty -> Offline Mode.
    let lightwalletd_uri = construct_indexer_uri(Some(uri.clone()))
        .map_err(|e| ZingolibError::Init(format!("Invalid server uri: {e}")))?;

    let chaintype = match chain_hint.as_str() {
        "main" => ChainType::Mainnet,
        "test" => ChainType::Testnet,
        "regtest" => ChainType::Regtest(ActivationHeights::default()),
        _ => return Err(ZingolibError::Init("Not a valid chain hint!".to_string())),
    };
    let performancetype = match performance_level.as_str() {
        "Maximum" => PerformanceLevel::Maximum,
        "High" => PerformanceLevel::High,
        "Medium" => PerformanceLevel::Medium,
        "Low" => PerformanceLevel::Low,
        _ => return Err(ZingolibError::Init("Not a valid performance level!".to_string())),
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
            .map_err(|_| ZingolibError::Init("min_confirmations must be >= 1".to_string()))?,
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
        )?;

        let config = builder
            .set_wallet_config(WalletConfig::Read)
            .build()
            .map_err(|e| ZingolibError::Init(e.to_string()))?;
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
        let (builder, wallet_settings, lightwalletd_uri) =
            construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name)?;
        // Fetch the current chain tip from the server; the NewSeed wallet
        // derives its birthday from this height (chain_height - 100).
        let chain_height = RT.block_on(async move {
            let mut indexer = GrpcIndexer::new(lightwalletd_uri)
                .await
                .map_err(|e| e.to_string())?;
            indexer
                .get_latest_block(std::time::Duration::from_secs(30))
                .await
                .map(|block_id| block_id.height as u32)
                .map_err(|e| e.to_string())
        })
        .map_err(ZingolibError::Init)?;
        let config = builder
            .set_wallet_config(WalletConfig::NewSeed {
                no_of_accounts: NonZeroU32::try_from(1).expect("hard-coded integer"),
                chain_height,
                wallet_settings,
            })
            .build()
            .map_err(|e| ZingolibError::Init(e.to_string()))?;
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Err(ZingolibError::Init(e.to_string())),
        };
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        get_seed_string()
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
        let (builder, wallet_settings, _lightwalletd_uri) =
            construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name)?;
        // Validate the phrase up front to surface a specific error before any
        // config/disk work; the resolved phrase is then handed to the wallet.
        let mnemonic = Mnemonic::<bip0039::English>::from_phrase(seed)
            .map_err(|e| ZingolibError::Init(e.to_string()))?;
        let config = builder
            .set_wallet_config(WalletConfig::MnemonicPhrase {
                mnemonic_phrase: mnemonic.phrase().to_string(),
                no_of_accounts: NonZeroU32::try_from(1).expect("hard-coded integer"),
                birthday: birthday as u32,
                wallet_settings,
            })
            .build()
            .map_err(|e| ZingolibError::Init(e.to_string()))?;
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Err(ZingolibError::Init(e.to_string())),
        };
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        get_seed_string()
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
        let (builder, wallet_settings, _lightwalletd_uri) =
            construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name)?;
        let config = builder
            .set_wallet_config(WalletConfig::Ufvk {
                ufvk,
                birthday: birthday as u32,
                wallet_settings,
            })
            .build()
            .map_err(|e| ZingolibError::Init(e.to_string()))?;
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Err(ZingolibError::Init(e.to_string())),
        };
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        get_ufvk_string()
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
        let (builder, _wallet_settings, _lightwalletd_uri) =
            construct_uri_load_config(server_uri, chain_hint, performance_level, min_confirmations, wallet_name)?;
        // Read the existing wallet file from disk (Read variant).
        let config = builder
            .set_wallet_config(WalletConfig::Read)
            .build()
            .map_err(|e| ZingolibError::Init(e.to_string()))?;
        let mut lightclient = match RT.block_on(async { LightClient::new(config, false).await }) {
            Ok(l) => l,
            Err(e) => return Err(ZingolibError::Init(e.to_string())),
        };
        let has_seed = RT.block_on(async {
            lightclient.wallet().read().await.mnemonic_phrase().is_some()
        });
        // save the wallet file here
        RT.block_on(async { lightclient.save_task().await });
        let _ = store_client(lightclient);

        if has_seed { get_seed_string() } else { get_ufvk_string() }
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
                    // Failures travel on the typed error channel; only benign
                    // status strings (which never begin with "error") cross on
                    // the data channel, so no success can resemble a failure.
                    RT.block_on(async move {
                        let wallet_path = lightclient.wallet_path();
                        let mut wallet = lightclient.wallet().write().await;
                        match wallet.save() {
                            Ok(Some(wallet_bytes)) => {
                                write_to_path(&wallet_path, &wallet_bytes)
                                    .map_err(|e| ZingolibError::Save(format!("writing wallet file: {e}")))?;
                                Ok(format!("Wallet saved successfully. Size: {} bytes.", wallet_bytes.len()))
                            }
                            Ok(None) => Ok("Wallet is empty. Nothing to save.".to_string()),
                            Err(e) => Err(ZingolibError::Save(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        match lightclient.check_save_error().await {
                            Ok(()) => Ok(String::new()),
                            Err(e) => Err(ZingolibError::Save(format!(
                                "save failed. {e}\nRestarting save task..."
                            ))),
                        }
                    })
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
        CryptoProvider::get_default().map_or_else(
            || match default_provider().install_default() {
                Ok(_) => Ok("true".to_string()),
                Err(_) => Err(ZingolibError::Init(
                    "failed to install crypto provider".to_string(),
                )),
            },
            |_| Ok("true".to_string()),
        )
    });

    match res {
        Ok(v) => Ok(cx.string(v)),
        Err(e) => cx.throw_error(e.to_string()),
    }
}

fn get_seed_string() -> Result<String, ZingolibError> {
    with_panic_guard(|| {
        let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        if let Some(lightclient) = &mut *guard {
            RT.block_on(async move {
                let wallet = lightclient.wallet().read().await;
                match wallet.recovery_info() {
                    Some(recovery_info) => serde_json::to_string_pretty(&recovery_info)
                        .map_err(|_| ZingolibError::Read("get seed: failed to serialize".to_string())),
                    None => Err(ZingolibError::Read(
                        "get seed: no mnemonic found. wallet loaded from key.".to_string(),
                    )),
                }
            })
        } else {
            Err(ZingolibError::LightclientNotInitialized)
        }
    })
}

fn get_seed(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                get_seed_string()
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}

fn get_ufvk_string() -> Result<String, ZingolibError> {
    with_panic_guard(|| {
        let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        if let Some(lightclient) = &mut *guard {
            RT.block_on(async move {
                let wallet = lightclient.wallet().read().await;
                let ufvk: UnifiedFullViewingKey = wallet
                    .unified_key_store
                    .get(&AccountId::ZERO)
                    .expect("account 0 must always exist")
                    .try_into()
                    .map_err(|e| ZingolibError::Read(format!("{e}")))?;
                Ok(object! {
                    "ufvk" => ufvk.encode(&wallet.chain_type()),
                    "birthday" => u32::from(wallet.birthday())
                }
                .pretty(2)
                .to_string())
            })
        } else {
            Err(ZingolibError::LightclientNotInitialized)
        }
    })
}

fn get_ufvk(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                get_ufvk_string()
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
                        return Err(ZingolibError::Read(format!("failed to parse uri. {e}")));
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
                    Err(e) => Err(ZingolibError::Read(e)),
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
                    RT.block_on(async move {
                        match lightclient
                            .wallet()
                            .read()
                            .await
                            .value_transfers(true)
                            .await
                        {
                            Ok(value_transfers) => Ok(json::JsonValue::from(value_transfers).pretty(2)),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                            Err(e) => Err(ZingolibError::Sync(e.to_string())),
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
                        // resume_sync can race: sync_mode() was Paused a moment
                        // ago but the task may have advanced before we got here.
                        // Return the error typed instead of `expect` — panicking
                        // would poison LIGHTCLIENT.
                        match lightclient.resume_sync() {
                            Ok(_) => Ok("Resuming sync task...".to_string()),
                            Err(e) => Err(ZingolibError::Sync(e.to_string())),
                        }
                    } else {
                        RT.block_on(async move {
                            match lightclient.sync().await {
                                Ok(_) => Ok("Launching sync task...".to_string()),
                                // Launching is idempotent: a concurrent launch
                                // means the desired state — a running sync —
                                // already holds, so it reports as status, not
                                // failure.
                                Err(LightClientError::SyncModeError(
                                    SyncModeError::SyncAlreadyRunning,
                                )) => Ok("Sync task already running.".to_string()),
                                Err(e) => Err(ZingolibError::Sync(e.to_string())),
                            }
                        })
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
                        Err(e) => Err(ZingolibError::Sync(e.to_string())),
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
                        Err(e) => Err(ZingolibError::Sync(e.to_string())),
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
                    RT.block_on(async move {
                        match pepper_sync::sync_status(&*lightclient.wallet().read().await).await {
                            Ok(status) => Ok(json::JsonValue::from(status).pretty(2)),
                            Err(e) => Err(ZingolibError::Sync(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        match lightclient.rescan().await {
                            Ok(_) => Ok("Launching rescan...".to_string()),
                            Err(e) => Err(ZingolibError::Rescan(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        match lightclient.info().await {
                            // `ServerInfo` doesn't derive `Serialize` (and its
                            // `server_uri` is an `http::Uri`), so build the JSON
                            // the renderer expects (`RPCInfoType`) by hand.
                            Ok(info) => Ok(serde_json::json!({
                                "version": info.version,
                                "git_commit": info.git_commit,
                                "server_uri": info.server_uri.to_string(),
                                "vendor": info.vendor,
                                "taddr_support": info.taddr_support,
                                "chain_name": info.chain_name,
                                "sapling_activation_height": info.sapling_activation_height,
                                "consensus_branch_id": info.consensus_branch_id,
                                "latest_block_height": info.latest_block_height,
                            })
                            .to_string()),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                            Err(_) => return Ok(object! { "error" => "invalid server uri" }.pretty(2)),
                        }
                    };
                    // `set_server` is gone; `set_indexer_uri` is the replacement.
                    // Unlike the old setter it actually (re)connects to the
                    // indexer, so a bad/unreachable uri surfaces here. Success and
                    // failure both cross as structured JSON — never error prose.
                    Ok(RT.block_on(async move {
                        match lightclient.set_indexer_uri(uri).await {
                            Ok(_) => object! {
                                "status" => if is_default { "server set (default)" } else { "server set" }
                            }
                            .pretty(2),
                            Err(e) => object! { "error" => e.to_string() }.pretty(2),
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
                    // Empty input is invalid; report it with the same structured
                    // status the decode-failure path uses, never as error prose.
                    Ok(object! {
                        "status" => "Invalid address",
                        "chain_name" => json::JsonValue::Null,
                        "address_kind" => json::JsonValue::Null,
                    }
                    .pretty(2))
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
                    // Empty input is invalid; report it with the same structured
                    // status the decode-failure path uses, never as error prose.
                    Ok(object! {
                        "status" => "Invalid viewkey",
                        "chain_name" => json::JsonValue::Null,
                        "address_kind" => json::JsonValue::Null,
                    }
                    .pretty(2))
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
                    RT.block_on(async move {
                        match lightclient
                            .messages_containing(Some(address.as_str()))
                            .await
                        {
                            Ok(value_transfers) => Ok(json::JsonValue::from(value_transfers).pretty(2)),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        match lightclient
                            .account_balance(AccountId::ZERO)
                            .await
                        {
                            Ok(bal) => Ok(json::JsonValue::from(bal).pretty(2)),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        match lightclient.do_total_memobytes_to_address().await {
                            Ok(total_memo_bytes) => Ok(json::JsonValue::from(total_memo_bytes).pretty(2)),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        match lightclient.do_total_value_to_address().await {
                            Ok(total_values) => Ok(json::JsonValue::from(total_values).pretty(2)),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        match lightclient.do_total_spends_to_address().await {
                            Ok(total_spends) => Ok(json::JsonValue::from(total_spends).pretty(2)),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                            // Failures cross as `{ "error": .. }` JSON, never as
                            // error prose, matching the success shape.
                            Err(e) => object! { "error" => e.to_string() }.pretty(2),
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
                            // Failures cross as `{ "error": .. }` JSON, never as
                            // error prose, matching the success shape.
                            Err(e) => object! { "error" => e.to_string() }.pretty(2),
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

// ---- Private (scheduled) Ironwood migration (zingolib parts/buckets engine) ----
// Surfaces zingolib's split + scheduled migration over the FFI. Every function
// follows the Phase 1-4 contract: structured JSON on the data channel, typed
// errors on the throw channel. Account is always 0; strategy is always
// LazyAtBoundary (zingolib rejects PreSigned). zingo-pc drives the schedule from
// the foreground only — there is no background broadcast.

// plan_ironwood_migration: the Phase 1 split plan the user consents to. Read-only
// (nothing signed or sent). Its `plan_hash` is the consent handed to start.
fn plan_ironwood_migration(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        let chain_type = lightclient.wallet().read().await.chain_type();
                        let params = MigrationParams::provisional(chain_type);
                        let plan = lightclient
                            .plan_ironwood_migration(zip32::AccountId::ZERO)
                            .await
                            .map_err(|e| ZingolibError::Read(e.to_string()))?;
                        let split_rounds: Vec<Vec<serde_json::Value>> = plan
                            .split_rounds
                            .iter()
                            .map(|round| {
                                round
                                    .iter()
                                    .map(|tx| {
                                        serde_json::json!({
                                            "inputs": tx.inputs,
                                            "outputs": tx.outputs,
                                            "fee": tx.fee(),
                                        })
                                    })
                                    .collect()
                            })
                            .collect();
                        Ok(serde_json::json!({
                            "split_rounds": split_rounds,
                            "parts": plan.parts,
                            "stranded": plan.stranded,
                            "split_fee": plan.split_fee(),
                            "parts_fee": plan.parts_fee(&params),
                            "is_split": plan.is_split(),
                            "plan_hash": hex::encode(plan_hash(&plan)),
                        })
                        .to_string())
                    })
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

// start_ironwood_migration(consented_plan_hash_hex, per_bucket): begins the flow.
// per_bucket <= 0 means "use the default"; a positive value sets k_max.
fn start_ironwood_migration(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let consented_hash = cx.argument::<JsString>(0)?.value(&mut cx);
    let per_bucket = cx.argument::<JsNumber>(1)?.value(&mut cx);

    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let hash_bytes = hex::decode(&consented_hash)
                    .map_err(|e| ZingolibError::Init(format!("invalid plan hash: {e}")))?;
                let hash: [u8; 32] = hash_bytes
                    .try_into()
                    .map_err(|_| ZingolibError::Init("plan hash must be 32 bytes".to_string()))?;
                let per_bucket: Option<u32> = if per_bucket >= 1.0 {
                    Some(per_bucket as u32)
                } else {
                    None
                };

                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        lightclient
                            .start_ironwood_migration(
                                zip32::AccountId::ZERO,
                                SigningStrategy::LazyAtBoundary,
                                hash,
                                per_bucket,
                            )
                            .await
                            .map_err(|e| ZingolibError::Init(e.to_string()))?;
                        Ok(object! { "status" => "started" }.pretty(2))
                    })
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

// migration_status: everything the progress UI + Dashboard banner render.
fn migration_status(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        let status = lightclient
                            .migration_status()
                            .await
                            .map_err(|e| ZingolibError::Read(e.to_string()))?;
                        // Coarse phase, `null` when no migration is in progress.
                        let phase = match &status.phase {
                            None => serde_json::Value::Null,
                            Some(MigrationPhase::Planned) => serde_json::json!({ "kind": "planned" }),
                            Some(MigrationPhase::NoteSplitting { round, pending_txids }) => serde_json::json!({
                                "kind": "note_splitting",
                                "round": round,
                                "pending_txids": pending_txids.iter().map(|t| t.to_string()).collect::<Vec<_>>(),
                            }),
                            Some(MigrationPhase::PartsScheduled) => serde_json::json!({ "kind": "parts_scheduled" }),
                            Some(MigrationPhase::Complete { residual }) => serde_json::json!({
                                "kind": "complete",
                                "residual": residual,
                            }),
                        };
                        let next_wakes: Vec<serde_json::Value> = status
                            .next_wakes
                            .iter()
                            .map(|w| {
                                serde_json::json!({
                                    "bucket_index": w.bucket_index,
                                    "boundary": u32::from(w.boundary),
                                    "part_ids": w.part_ids.iter().map(|p| p.0).collect::<Vec<u32>>(),
                                    "estimated_unix_time": w.estimated_unix_time,
                                })
                            })
                            .collect();
                        Ok(serde_json::json!({
                            "in_progress": status.phase.is_some(),
                            "orchard_confirmed_spendable": status.orchard_confirmed_spendable,
                            "phase": phase,
                            "parts_total": status.parts_total,
                            "parts_confirmed": status.parts_confirmed,
                            "value_total": status.value_total,
                            "value_migrated": status.value_migrated,
                            "next_wakes": next_wakes,
                        })
                        .to_string())
                    })
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

// reconcile_migration: run on every launch. Applies the safe-unattended actions
// and reports what it did (as Debug strings — the UI just surfaces them).
fn reconcile_migration(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        let report = lightclient
                            .reconcile_migration()
                            .await
                            .map_err(|e| ZingolibError::Read(e.to_string()))?;
                        let actions: Vec<String> =
                            report.actions.iter().map(|a| format!("{a:?}")).collect();
                        Ok(serde_json::json!({ "actions": actions }).to_string())
                    })
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

// broadcast_due_parts: send every part whose bucket window is open. Foreground
// only — the caller invokes this while the app is running.
fn broadcast_due_parts(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        let txids = lightclient
                            .broadcast_due_parts()
                            .await
                            .map_err(|e| ZingolibError::Sync(e.to_string()))?;
                        Ok(serde_json::json!({
                            "txids": txids.iter().map(|t| t.to_string()).collect::<Vec<_>>(),
                        })
                        .to_string())
                    })
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

// catch_up_migration: send parts from windows that already passed (needs the
// user-facing disclosure). Sends are spaced to avoid a burst.
fn catch_up_migration(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        let txids = lightclient
                            .catch_up_migration(std::time::Duration::from_secs(2))
                            .await
                            .map_err(|e| ZingolibError::Sync(e.to_string()))?;
                        Ok(serde_json::json!({
                            "txids": txids.iter().map(|t| t.to_string()).collect::<Vec<_>>(),
                        })
                        .to_string())
                    })
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

// auto_broadcast_if_due: the periodic driving-loop primitive. No-op when no
// migration is in progress; otherwise refreshes part witnesses and broadcasts
// every due part. Safe to call every sync cycle.
fn auto_broadcast_if_due(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        let txids = lightclient
                            .auto_broadcast_if_due()
                            .await
                            .map_err(|e| ZingolibError::Sync(e.to_string()))?;
                        Ok(serde_json::json!({
                            "txids": txids.iter().map(|t| t.to_string()).collect::<Vec<_>>(),
                        })
                        .to_string())
                    })
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

// migrate_to_ironwood: the immediate, one-call migration — splits notes into
// standard denominations (in rounds, waiting for each to confirm) and then
// broadcasts every part to Ironwood at once. This is the ONLY public path that
// drives note-splitting to completion (the scheduled start/broadcast_due_parts
// flow has no public split driver in this zingolib build), so it is what an
// interactive migration uses. Long-running and syncs internally, so the caller
// must stop any background sync first (the RPC layer brackets it like the drain).
// Returns structured JSON: the summary on success, `{ error }` on failure.
fn migrate_to_ironwood(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    Ok(RT.block_on(async move {
                        match lightclient.migrate_to_ironwood(zip32::AccountId::ZERO).await {
                            Ok(summary) => object! {
                                "split_txids" => summary.split_txids.iter().map(ToString::to_string).collect::<Vec<_>>(),
                                "part_txids" => summary.part_txids.iter().map(ToString::to_string).collect::<Vec<_>>(),
                                "stranded" => summary.stranded,
                            }
                            .pretty(2),
                            // Failures cross as `{ error }` JSON, matching the drain.
                            Err(e) => object! { "error" => e.to_string() }.pretty(2),
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

// cancel_ironwood_migration: abandon the in-progress migration.
fn cancel_ironwood_migration(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let promise = cx
        .task(move || -> Result<String, ZingolibError> {
            with_panic_guard(|| {
                let mut guard = LIGHTCLIENT.write().map_err(|_| ZingolibError::LightclientLockPoisoned)?;
                if let Some(lightclient) = &mut *guard {
                    RT.block_on(async move {
                        lightclient
                            .cancel_ironwood_migration()
                            .await
                            .map_err(|e| ZingolibError::Sync(e.to_string()))?;
                        Ok(object! { "status" => "cancelled" }.pretty(2))
                    })
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
                    RT.block_on(async move {
                        match lightclient
                            .wallet()
                            .write()
                            .await
                            .update_current_price()
                            .await
                        {
                            Ok(price) => Ok(object! { "current_price" => price }.pretty(2)),
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                        Err(e) => return Ok(object! { "error" => e.to_string() }.pretty(2)),
                    };
                    Ok(RT.block_on(async move {
                        match lightclient
                            .wallet()
                            .write()
                            .await
                            .remove_failed_transaction(txid)
                        {
                            Ok(_) => object! { "status" => "Successfully removed transaction." }.pretty(2),
                            Err(e) => object! { "error" => e.to_string() }.pretty(2),
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
                        return Err(ZingolibError::Read("unknown address format".to_string()));
                    };
                    let Ok(zennies) = zennies.parse() else {
                        return Err(ZingolibError::Read("failed to parse zennies setting.".to_string()));
                    };
                    RT.block_on(async move {
                        match lightclient
                            .max_send_value(address, zennies, AccountId::ZERO)
                            .await
                        {
                            Ok(bal) => {
                                Ok(object! { "spendable_balance" => bal.into_u64() }.pretty(2))
                            }
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        let wallet = lightclient.wallet().read().await;
                        let spendable_balance =
                            match wallet.shielded_spendable_balance(AccountId::ZERO, false) {
                                Ok(bal) => bal,
                                Err(e) => return Err(ZingolibError::Read(e.to_string())),
                            };
                        Ok(object! {
                            "spendable_balance" => spendable_balance.into_u64(),
                        }
                        .pretty(2))
                    })
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
                Ok(object! { "error" => "unimplemented" }.pretty(2))
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
                    RT.block_on(async move {
                        let mut wallet = lightclient.wallet().write().await;
                        let network = wallet.chain_type();
                        let receivers_available = ReceiverSelection {
                            orchard: receivers.contains('o'),
                            sapling: receivers.contains('z'),
                        };
                        match wallet.generate_unified_address(receivers_available, AccountId::ZERO) {
                            Ok((id, unified_address)) => {
                                Ok(json::object! {
                                    "account" => u32::from(AccountId::ZERO),
                                    "address_index" => id.address_index,
                                    "has_orchard" => unified_address.has_orchard(),
                                    "has_sapling" => unified_address.has_sapling(),
                                    "has_transparent" => unified_address.has_transparent(),
                                    "encoded_address" => unified_address.encode(&network),
                                }.pretty(2))
                            }
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                    RT.block_on(async move {
                        let mut wallet = lightclient.wallet().write().await;
                        let network = wallet.chain_type();
                        match wallet.generate_transparent_address(AccountId::ZERO, true) {
                            Ok((id, transparent_address)) => {
                                Ok(json::object! {
                                    "account" => u32::from(id.account_id()),
                                    "address_index" => id.address_index().index(),
                                    "scope" => id.scope().to_string(),
                                    "encoded_address" => transparent::encode_address(&network,  transparent_address),
                                }.pretty(2))
                            }
                            Err(e) => Err(ZingolibError::Read(e.to_string())),
                        }
                    })
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
                            _ => return object! { "error" => "Not a valid performance level!" }.pretty(2),
                        };
                        // `min_confirmations` comes from the renderer through IPC. Reject 0
                        // (and anything that casts to 0) instead of unwrapping — panic in this
                        // async block would unwind into Neon's panic guard but corrupt wallet
                        // state mid-write since we already hold the write lock.
                        let min_conf_nonzero = match NonZeroU32::try_from(min_confirmations as u32) {
                            Ok(n) => n,
                            Err(_) => return object! { "error" => "min_confirmations must be >= 1" }.pretty(2),
                        };
                        let mut wallet = lightclient.wallet().write().await;
                        wallet.wallet_settings.min_confirmations = min_conf_nonzero;
                        wallet.wallet_settings.sync_config.performance_level = performancetype;
                        wallet.mark_dirty();
                        object! { "status" => "Successfully set config wallet to prod." }.pretty(2)
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
                        // Validation failures cross on the data channel as a
                        // structured `{ "error": .. }` object (the same shape as
                        // the propose/fee result below), never as error prose —
                        // so no success can resemble a failure.
                        let json_args = match json::parse(&send_json) {
                            Ok(parsed) => parsed,
                            Err(_) => return object! { "error" => "it is not a valid JSON" }.pretty(2),
                        };
                        let mut receivers = Receivers::new();
                        for j in json_args.members() {
                            let recipient_address = match j["address"].as_str() {
                                Some(addr) => match ZcashAddress::try_from_encoded(addr) {
                                    Ok(a) => a,
                                    Err(e) => return object! { "error" => format!("Invalid address: {e}") }.pretty(2),
                                },
                                None => return object! { "error" => "Missing address" }.pretty(2),
                            };
                            let amount = match j["amount"].as_u64() {
                                Some(a) => match Zatoshis::from_u64(a) {
                                    Ok(a) => a,
                                    Err(e) => return object! { "error" => format!("Invalid amount: {e}") }.pretty(2),
                                },
                                None => return object! { "error" => "Missing amount" }.pretty(2),
                            };
                            let memo = if let Some(m) = j["memo"].as_str() {
                                match interpret_memo_string(m.to_string()) {
                                    Ok(memo_bytes) => Some(memo_bytes),
                                    Err(e) => return object! { "error" => format!("Invalid memo: {e}") }.pretty(2),
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
                            Err(e) => return object! { "error" => format!("Request Error: {e}") }.pretty(2),
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
                    Err(_) => return Ok(object! { "error" => "Config issue, delete failed." }.pretty(2)),
                };
                let config = match builder.set_wallet_config(WalletConfig::Read).build() {
                    Ok(c) => c,
                    Err(_) => return Ok(object! { "error" => "Config issue, delete failed." }.pretty(2)),
                };
                let wallet_path = config.get_wallet_path();
                // Success and failure both cross as structured JSON — never error
                // prose, so no path can resemble a failure.
                if wallet_path.exists() {
                    match remove_file(&wallet_path) {
                        Ok(_) => {
                            reset_lightclient();

                            Ok(object! {
                                "status" => format!("File deleted successfully: {}", wallet_path.display())
                            }
                            .pretty(2))
                        }
                        Err(e) => Ok(object! {
                            "error" => format!("deleting file {}: {}", wallet_path.display(), e)
                        }
                        .pretty(2)),
                    }
                } else {
                    Ok(object! {
                        "error" => format!("File does not exist: {}", wallet_path.display())
                    }
                    .pretty(2))
                }
            })
        })
        .promise(move |mut cx, result| match result {
            Ok(msg) => Ok(cx.string(msg)),
            Err(err) => cx.throw_error(err.to_string()),
        });

    Ok(promise)
}
