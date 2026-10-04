//! A second wallet, synced behind the one the app has open.
//!
//! `LIGHTCLIENT` is the wallet on screen and every endpoint in the crate
//! reads it. Syncing the other wallets used to mean taking it away for as long
//! as that lasted. This slot holds one of those other wallets instead, with
//! its own engine and its own save task, so the wallet on screen stays where
//! it is.
//!
//! One rule comes with a second slot: a wallet file is never held by both.
//! Each client saves the file it opened whenever its wallet changes, and two
//! of them on one file would overwrite each other's scans. So each slot
//! refuses to open the file the other holds, and the renderer never asks.
//!
//! What a wallet opened here can do is sync and be saved. It has no spend, no
//! balance and no address endpoints: those belong to the wallet on screen.

use std::path::Path;
use std::sync::RwLock;

use lazy_static::lazy_static;
use neon::prelude::*;
use zingolib::config::WalletConfig;
use zingolib::lightclient::LightClient;

use super::{
    cause_chain, caught_up_report, construct_uri_load_config, launch_sync, open_wallet_file,
    poll_sync_report, retire_client, save_wallet_report, spawn_promise, stop_sync_report,
    with_panic_guard, ZingolibError, LIGHTCLIENT,
};

lazy_static! {
    static ref BACKGROUND: RwLock<Option<LightClient>> = RwLock::new(None);
}

/// The file the wallet in `slot` was opened from, when there is one.
fn file_held_by(slot: &RwLock<Option<LightClient>>) -> Option<std::path::PathBuf> {
    slot.read()
        .ok()
        .and_then(|guard| guard.as_ref().map(LightClient::wallet_path))
}

/// Refuses to open `wallet_path` on screen while this slot holds it.
pub(super) fn refuse_a_file_it_holds(wallet_path: &Path) -> Result<(), ZingolibError> {
    if file_held_by(&BACKGROUND).as_deref() == Some(wallet_path) {
        return Err(ZingolibError::Init(
            "this wallet is being synced in the background".to_string(),
        ));
    }
    Ok(())
}

fn with_background<T, F>(f: F) -> Result<T, ZingolibError>
where
    F: FnOnce(&mut LightClient) -> Result<T, ZingolibError> + std::panic::UnwindSafe,
{
    with_panic_guard(|| {
        let mut guard = BACKGROUND
            .write()
            .map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        match &mut *guard {
            Some(lightclient) => f(lightclient),
            None => Err(ZingolibError::LightclientNotInitialized),
        }
    })
}

fn with_background_read<T, F>(f: F) -> Result<T, ZingolibError>
where
    F: FnOnce(&LightClient) -> Result<T, ZingolibError> + std::panic::UnwindSafe,
{
    with_panic_guard(|| {
        let guard = BACKGROUND
            .read()
            .map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        match &*guard {
            Some(lightclient) => f(lightclient),
            None => Err(ZingolibError::LightclientNotInitialized),
        }
    })
}

/// Ends the wallet this slot holds, if any, and empties the slot.
fn close_string() -> Result<String, ZingolibError> {
    with_panic_guard(|| {
        let mut guard = BACKGROUND
            .write()
            .map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        retire_client(&guard);
        *guard = None;
        Ok("Background wallet closed.".to_string())
    })
}

pub(super) fn open_string(
    server_uri: String,
    chain_hint: String,
    performance_level: String,
    min_confirmations: f64,
    wallet_name: String,
) -> Result<String, ZingolibError> {
    with_panic_guard(|| {
        let (builder, _wallet_settings, _lightwalletd_uri) = construct_uri_load_config(
            server_uri,
            chain_hint,
            performance_level,
            min_confirmations,
            wallet_name,
        )?;
        let config = builder
            .set_wallet_config(WalletConfig::Read)
            .build()
            .map_err(|e| ZingolibError::Init(cause_chain(&e)))?;
        if file_held_by(&LIGHTCLIENT).as_deref() == Some(&*config.get_wallet_path()) {
            return Err(ZingolibError::Init(
                "this wallet is the one open in the app".to_string(),
            ));
        }
        close_string()?;
        let lightclient = open_wallet_file(config)?;
        let mut guard = BACKGROUND
            .write()
            .map_err(|_| ZingolibError::LightclientLockPoisoned)?;
        *guard = Some(lightclient);
        Ok("Background wallet opened.".to_string())
    })
}

/// Off the JS thread, unlike `init_from_b64`: the app is in use while this
/// reads a wallet file, and a large one takes seconds.
pub(super) fn open(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let chain_hint = cx.argument::<JsString>(1)?.value(&mut cx);
    let performance_level = cx.argument::<JsString>(2)?.value(&mut cx);
    let min_confirmations = cx.argument::<JsNumber>(3)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(4)?.value(&mut cx);

    spawn_promise(&mut cx, move || {
        open_string(
            server_uri,
            chain_hint,
            performance_level,
            min_confirmations,
            wallet_name,
        )
    })
}

pub(super) fn run_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    spawn_promise(&mut cx, || with_background(launch_sync))
}

pub(super) fn poll_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    spawn_promise(&mut cx, || with_background(poll_sync_report))
}

pub(super) fn sync_caught_up_string() -> Result<String, ZingolibError> {
    with_background_read(caught_up_report)
}

pub(super) fn sync_caught_up(mut cx: FunctionContext) -> JsResult<JsPromise> {
    spawn_promise(&mut cx, sync_caught_up_string)
}

pub(super) fn stop_sync(mut cx: FunctionContext) -> JsResult<JsPromise> {
    spawn_promise(&mut cx, || with_background(stop_sync_report))
}

pub(super) fn save(mut cx: FunctionContext) -> JsResult<JsPromise> {
    spawn_promise(&mut cx, || with_background(save_wallet_report))
}

pub(super) fn close(mut cx: FunctionContext) -> JsResult<JsPromise> {
    spawn_promise(&mut cx, close_string)
}

#[cfg(test)]
pub(super) fn close_for_tests() {
    close_string().expect("the background slot is not poisoned");
}
