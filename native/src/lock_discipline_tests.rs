//! Lock-discipline tests for the read-only FFI endpoints, ported from
//! zingo-mobile's suite.
//!
//! Each test initializes the offline fixture wallet, then calls its endpoint
//! from another thread while the test thread holds a read guard on
//! `LIGHTCLIENT`. An endpoint on the shared lock answers beside the guard; one
//! that takes the exclusive lock queues behind it and times out. The answer is
//! then checked against the fixture, so an endpoint that goes silent fails as
//! loudly as one that takes the wrong lock.
//!
//! This is the mechanism that makes the split worth having. A neon endpoint
//! cannot be called from a test — there is no way to build a `FunctionContext`
//! — so each one hands its work to a plain `*_string` function, and that is
//! what the tests drive.

use super::*;

/// Serializes the tests that initialize or lock the global `LIGHTCLIENT`.
static LIGHTCLIENT_SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serialized() -> std::sync::MutexGuard<'static, ()> {
    LIGHTCLIENT_SERIAL
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// The all-zero BIP-39 test vector: a published constant that has never held
/// funds and never will. It is here so the fixture is reproducible.
const FIXTURE_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

/// A height well inside mainnet history, so the fixture has a positive
/// birthday without needing a chain tip.
const FIXTURE_BIRTHDAY: f64 = 2_700_000.0;

/// Takes the panic hook back so this suite's failures are legible.
///
/// `with_panic_guard` installs a hook that records the panic for the FFI caller
/// to read and prints nothing — right for the wallet, and it would make every
/// assertion in this file fail silently. Running that installation first means
/// its `Once` is spent, so the hook set here is the one that stays.
fn report_panics_to_stderr() {
    install_panic_hook_once();
    std::panic::set_hook(Box::new(|info| eprintln!("{info}")));
}

/// Builds a mainnet wallet from the fixture seed and stores it as the global
/// client.
///
/// An empty server uri is Offline Mode, which is what keeps this off the
/// network. `init_new` cannot be the fixture: it asks a server for the chain
/// tip to derive a birthday, and a unit test that needs a lightwalletd to be
/// reachable tests the weather.
fn init_offline_wallet() {
    report_panics_to_stderr();
    let dir = std::env::temp_dir().join("zingo-pc-lock-discipline");
    // The wallet refuses to create over an existing file, so each test starts
    // from an empty directory. The previous client is dropped first: on Windows
    // it still holds the file it wrote, and the delete would fail.
    reset_lightclient();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the fixture needs somewhere to write");
    // A `OnceCell`: set by whichever test runs first, and the same directory
    // for the rest.
    let _ = WALLET_BASE_DIR.set(dir);

    init_from_seed_string(
        FIXTURE_MNEMONIC.to_string(),
        FIXTURE_BIRTHDAY,
        String::new(),
        "main".to_string(),
        "Medium".to_string(),
        1.0,
        "lock-discipline-fixture".to_string(),
    )
    .expect("the offline fixture wallet must initialize");
}

/// Runs `endpoint` on another thread while the caller holds a read guard on
/// `LIGHTCLIENT`, and returns its outcome. Panics only if the endpoint blocks
/// behind the guard, which means it takes the exclusive lock.
fn outcome_under_held_read_lock(
    endpoint: impl FnOnce() -> Result<String, ZingolibError> + Send + 'static,
) -> Result<String, ZingolibError> {
    let _reader = LIGHTCLIENT
        .read()
        .expect("no serialized test leaves the lock poisoned");
    let (outcome_tx, outcome_rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = outcome_tx.send(endpoint());
    });
    outcome_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .expect("the endpoint queued behind a held read guard: it takes the exclusive lock")
}

/// [`outcome_under_held_read_lock`] for the common case: the endpoint must
/// answer Ok with well-formed JSON.
fn answer_under_held_read_lock(
    endpoint: impl FnOnce() -> Result<String, ZingolibError> + Send + 'static,
) -> json::JsonValue {
    let answer = outcome_under_held_read_lock(endpoint)
        .expect("the initialized wallet answers this endpoint");
    json::parse(&answer).expect("the endpoint answers well-formed JSON")
}

/// The fixture wallet's own (only) unified address.
fn fixture_unified_address() -> String {
    let parsed = json::parse(&get_unified_addresses_string().expect("initialized fixture"))
        .expect("well-formed address list");
    parsed[0]["encoded_address"]
        .as_str()
        .expect("the fixture derives one address")
        .to_string()
}

#[test]
fn value_transfers_answer_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_value_transfers_string);
    // A never-synced wallet has no history, and the empty list still arrives
    // under its named key.
    assert!(
        answer["value_transfers"].is_array() && answer["value_transfers"].is_empty(),
        "the fixture wallet's history is an empty list: {answer}"
    );
}

#[test]
fn status_sync_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(status_sync_string);
    assert!(
        answer["scan_ranges"].is_array() && answer["scan_ranges"].is_empty(),
        "no scan ranges before a first sync: {answer}"
    );
    assert_eq!(
        answer["total_outputs_scanned"].as_u64(),
        Some(0),
        "nothing scanned before a first sync: {answer}"
    );
}

#[test]
fn seed_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_seed_string);
    assert_eq!(
        answer["seed_phrase"].as_str(),
        Some(FIXTURE_MNEMONIC),
        "the recovery info returns the phrase it was restored from: {answer}"
    );
    assert_eq!(
        answer["birthday"].as_u32(),
        Some(FIXTURE_BIRTHDAY as u32),
        "a restore keeps the birthday it was given: {answer}"
    );
    assert_eq!(
        answer["no_of_accounts"].as_u32(),
        Some(1),
        "the fixture derives a single account: {answer}"
    );
}

#[test]
fn ufvk_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_ufvk_string);
    assert!(
        answer["ufvk"]
            .as_str()
            .is_some_and(|encoded| encoded.starts_with("uview1")),
        "a mainnet UFVK encodes with the uview1 prefix: {answer}"
    );
    assert_eq!(
        answer["birthday"].as_u32(),
        Some(FIXTURE_BIRTHDAY as u32),
        "the UFVK travels with the fixture's birthday: {answer}"
    );
}

#[test]
fn messages_answer_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let own_address = fixture_unified_address();
    let answer = answer_under_held_read_lock(move || get_messages_string(own_address));
    assert!(
        answer["value_transfers"].is_array() && answer["value_transfers"].is_empty(),
        "the fixture wallet holds no messages: {answer}"
    );
}

#[test]
fn balance_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_balance_string);
    // Every figure of a never-synced wallet is zero, and the object names its
    // pools — an endpoint answering `{}` would slip past the weaker assertion.
    let mut fields = 0;
    for (field, value) in answer.entries() {
        assert_eq!(value.as_u64(), Some(0), "{field} of a fresh wallet: {answer}");
        fields += 1;
    }
    assert!(fields > 0, "the balance answer names its pools: {answer}");
}

#[test]
fn total_memobytes_answer_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_total_memobytes_to_address_string);
    assert!(
        answer.is_object() && answer.is_empty(),
        "the fixture wallet has sent no memos: {answer}"
    );
}

#[test]
fn total_value_to_address_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_total_value_to_address_string);
    assert!(
        answer.is_object() && answer.is_empty(),
        "the fixture wallet has sent no value: {answer}"
    );
}

#[test]
fn total_spends_to_address_answer_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_total_spends_to_address_string);
    assert!(
        answer.is_object() && answer.is_empty(),
        "the fixture wallet has spent nothing: {answer}"
    );
}

#[test]
fn spendable_balance_with_address_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    // Whatever a never-synced wallet decides it can send, the point is that it
    // decides beside the guard rather than queueing behind it. The address is
    // parsed inside the lock, so even a refusal proves the lock was taken.
    let outcome = outcome_under_held_read_lock(|| {
        get_spendable_balance_with_address_string(
            zingolib::DEVELOPER_DONATION_ADDRESS.to_string(),
            "false".to_string(),
        )
    });
    match outcome {
        Ok(answer) => {
            let parsed = json::parse(&answer).expect("well-formed JSON");
            assert!(
                parsed["spendable_balance"].as_u64().is_some(),
                "the answer names the balance: {parsed}"
            );
        }
        Err(ZingolibError::Read(_)) => (),
        other => panic!("expected an answer or a typed Read refusal, got: {other:?}"),
    }
}

#[test]
fn spendable_balance_total_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_spendable_balance_total_string);
    assert_eq!(
        answer["spendable_balance"].as_u64(),
        Some(0),
        "the fixture wallet's spendable total is zero: {answer}"
    );
}

#[test]
fn wallet_kind_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(wallet_kind_string);
    assert!(
        answer["kind"]
            .as_str()
            .is_some_and(|kind| kind.starts_with("Loaded from seed or mnemonic phrase")),
        "the fixture is a mnemonic wallet: {answer}"
    );
    for receiver in ["transparent", "sapling", "orchard"] {
        assert_eq!(
            answer[receiver].as_bool(),
            Some(true),
            "a seed wallet carries every receiver: {answer}"
        );
    }
}

#[test]
fn unified_addresses_answer_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_unified_addresses_string);
    assert_eq!(answer.len(), 1, "one derived address: {answer}");
    let address = &answer[0];
    assert_eq!(address["account"].as_u32(), Some(0), "{answer}");
    assert!(
        address["encoded_address"]
            .as_str()
            .is_some_and(|encoded| encoded.starts_with("u1")),
        "a mainnet unified address encodes with the u1 prefix: {answer}"
    );
}

#[test]
fn transparent_addresses_answer_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_transparent_addresses_string);
    assert_eq!(answer.len(), 1, "one derived address: {answer}");
    let address = &answer[0];
    assert_eq!(address["account"].as_u32(), Some(0), "{answer}");
    assert_eq!(address["scope"].as_str(), Some("external"), "{answer}");
    assert!(
        address["encoded_address"]
            .as_str()
            .is_some_and(|encoded| encoded.starts_with("t1")),
        "a mainnet P2PKH address encodes with the t1 prefix: {answer}"
    );
}

#[test]
fn wallet_save_required_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_wallet_save_required_string);
    assert!(
        answer["save_required"].as_bool().is_some(),
        "the endpoint answers under its named key: {answer}"
    );
}

#[test]
fn config_wallet_performance_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_config_wallet_performance_string);
    assert_eq!(
        answer["performance_level"].as_str(),
        Some("Medium"),
        "the fixture's configured level: {answer}"
    );
}

#[test]
fn wallet_version_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_wallet_version_string);
    let current = answer["current_version"].as_u32();
    assert!(
        current.is_some_and(|version| version > 0),
        "the wallet has a positive serialization version: {answer}"
    );
    assert_eq!(
        answer["read_version"].as_u32(),
        current,
        "a fresh wallet's read version matches current: {answer}"
    );
}

#[test]
fn latest_block_wallet_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(get_latest_block_wallet_string);
    // An offline wallet has never learned a chain height, which this endpoint
    // reports as 0.
    assert_eq!(
        answer["height"].as_u32(),
        Some(0),
        "the fixture wallet's height answer changed shape: {answer}"
    );
}

#[test]
fn mixnet_status_answers_beside_a_held_read_guard() {
    let _serial = serialized();
    init_offline_wallet();
    let answer = answer_under_held_read_lock(mixnet_status_string);
    // The snapshot is a borrow of the session status channel, so it exists
    // from the moment the client does.
    assert!(
        !answer.is_null(),
        "the status snapshot is a value, not null: {answer}"
    );
}
