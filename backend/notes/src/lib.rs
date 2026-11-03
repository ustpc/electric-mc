//! Electric MC notes server.
//!
//! Each browser signs its requests with its own ECDSA P-256 key. A key is
//! registered once, with what MC says about the logged-in person (email,
//! name, person ID) and the name they gave us. The first upload of a key is
//! taken as legitimate; one email may have many keys (one per browser
//! profile). The project owner can ban a key or an email.
//!
//! A note is (manuscript ID, session time_t, author email, text). Writing
//! the same (manuscript, time, author) again overwrites it: that is how
//! edits arrive. Authors may delete their own notes; moderators (co-chairs
//! and the EIC) may delete any note.
//!
//! Every note request also carries (manuscript ID, SHA-256 of its
//! normalized title). The first title hash seen for a manuscript is kept,
//! only as an HMAC with a server secret, and later requests must match it.
//! The title itself is never sent or stored.

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use p256::ecdsa::signature::Verifier;
use p256::ecdsa::{Signature, VerifyingKey};
use p256::pkcs8::DecodePublicKey;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub mod dynamo;

/// Requests more than this many seconds from the server's clock are refused.
pub const MAX_SKEW_S: i64 = 300;
/// Longest note accepted, in bytes.
pub const MAX_NOTE_BYTES: usize = 20_000;
const MAX_BODY_BYTES: usize = 32_000;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyRec {
    pub key_id: String,
    pub email: String,
    pub label: String,
    pub mc_name: String,
    pub person_id: Option<String>,
    pub role: Option<String>,
    pub journal: Option<String>,
    /// Public key, SubjectPublicKeyInfo DER, base64.
    pub spki: String,
    pub registered: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub m: String,
    pub t: i64,
    pub email: String,
    pub author: String,
    pub text: String,
    pub updated: i64,
    pub key_id: String,
}

#[derive(Debug)]
pub struct StoreError(pub String);

/// Where keys, bans, title MACs and notes live: DynamoDB in Lambda, memory in tests.
#[async_trait]
pub trait Store: Send + Sync {
    async fn get_key(&self, key_id: &str) -> Result<Option<KeyRec>, StoreError>;
    /// Save a key; replaces the label and MC details of one already registered.
    async fn put_key(&self, k: &KeyRec) -> Result<(), StoreError>;
    async fn list_keys(&self) -> Result<Vec<KeyRec>, StoreError>;
    /// Whether a ban exists for this target ("key#<id>" or "email#<address>").
    async fn is_banned(&self, target: &str) -> Result<bool, StoreError>;
    async fn set_ban(&self, target: &str, banned: bool, by: &str, at: i64) -> Result<(), StoreError>;
    async fn title_macs(&self, m: &str) -> Result<Vec<String>, StoreError>;
    async fn add_title_mac(&self, m: &str, mac: &str) -> Result<(), StoreError>;
    async fn list_notes(&self, m: &str) -> Result<Vec<Note>, StoreError>;
    async fn get_note(&self, m: &str, t: i64, email: &str) -> Result<Option<Note>, StoreError>;
    async fn put_note(&self, n: &Note) -> Result<(), StoreError>;
    async fn delete_note(&self, m: &str, t: i64, email: &str) -> Result<(), StoreError>;
}

pub struct Config {
    /// HMAC key for manuscript title hashes.
    pub secret: Vec<u8>,
    /// Emails that may ban keys, list registrations and delete any note.
    pub owners: Vec<String>,
    /// Emails that may delete any note (co-chairs, the EIC).
    pub moderators: Vec<String>,
}

impl Config {
    pub fn from_env() -> Result<Config, String> {
        let secret = std::env::var("NOTES_SECRET").map_err(|_| "NOTES_SECRET is not set".to_string())?;
        if secret.len() < 32 {
            return Err("NOTES_SECRET must be at least 32 characters".into());
        }
        Ok(Config { secret: secret.into_bytes(), owners: emails_env("OWNERS"), moderators: emails_env("MODERATORS") })
    }

    fn is_owner(&self, email: &str) -> bool {
        self.owners.iter().any(|e| e == email)
    }

    fn is_moderator(&self, email: &str) -> bool {
        self.is_owner(email) || self.moderators.iter().any(|e| e == email)
    }
}

fn emails_env(name: &str) -> Vec<String> {
    std::env::var(name).unwrap_or_default().split(',').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect()
}

/// An HTTP status and JSON body.
pub type Reply = (u16, Value);

fn err(status: u16, msg: &str) -> Reply {
    (status, json!({ "error": msg }))
}

#[derive(Deserialize)]
struct Envelope {
    key: String,
    payload: String,
    sig: String,
    spki: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    op: String,
    ts: i64,
    m: Option<String>,
    h: Option<String>,
    t: Option<i64>,
    text: Option<String>,
    email: Option<String>,
    label: Option<String>,
    mc_name: Option<String>,
    person_id: Option<String>,
    role: Option<String>,
    journal: Option<String>,
    key: Option<String>,
}

/// The key ID: the first 128 bits of SHA-256 of the public key, in hex.
pub fn key_id_of(spki: &[u8]) -> String {
    hex::encode(&Sha256::digest(spki)[..16])
}

/// HMAC-SHA256(secret, "m|h"), hex: what is stored instead of the title hash.
pub fn title_mac(secret: &[u8], m: &str, h: &str) -> String {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(secret).expect("any key length works");
    mac.update(format!("{m}|{h}").as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Check a WebCrypto ECDSA P-256 / SHA-256 signature (64 bytes, r||s).
pub fn verify(spki_der: &[u8], message: &[u8], sig: &[u8]) -> bool {
    let (Ok(key), Ok(sig)) = (VerifyingKey::from_public_key_der(spki_der), Signature::from_slice(sig)) else {
        return false;
    };
    key.verify(message, &sig).is_ok()
}

/// A plausible manuscript ID ("XYZJ-26-01-9001"), as a key, not a check of the journal's format.
pub fn valid_manuscript_id(m: &str) -> bool {
    (3..=48).contains(&m.len()) && m.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_')
}

fn valid_hash(h: &str) -> bool {
    h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn clip(s: Option<String>, max: usize) -> Option<String> {
    s.map(|s| s.trim().chars().take(max).collect::<String>()).filter(|s| !s.is_empty())
}

macro_rules! tryst {
    ($e:expr) => {
        match $e {
            Ok(v) => v,
            Err(StoreError(e)) => return err(500, &format!("storage: {e}")),
        }
    };
}

/// Handle one request body at server time `now` (seconds since 1970).
pub async fn handle(store: &dyn Store, cfg: &Config, body: &str, now: i64) -> Reply {
    if body.len() > MAX_BODY_BYTES {
        return err(413, "request too large");
    }
    let Ok(env) = serde_json::from_str::<Envelope>(body) else { return err(400, "bad request") };
    let Ok(p) = serde_json::from_str::<Payload>(&env.payload) else { return err(400, "bad payload") };
    let b64 = base64::engine::general_purpose::STANDARD;
    let Ok(sig) = b64.decode(&env.sig) else { return err(400, "bad signature encoding") };
    if (now - p.ts).abs() > MAX_SKEW_S {
        return err(401, "request time is too far from the server's clock");
    }

    if p.op == "register" {
        return register(store, &env, &p, &sig, now).await;
    }
    let Some(me) = tryst!(store.get_key(&env.key).await) else { return err(401, "unknown key: register first") };
    let Ok(spki) = b64.decode(&me.spki) else { return err(500, "stored key is unreadable") };
    if !verify(&spki, env.payload.as_bytes(), &sig) {
        return err(401, "bad signature");
    }
    if tryst!(store.is_banned(&format!("key#{}", me.key_id)).await) || tryst!(store.is_banned(&format!("email#{}", me.email)).await) {
        return err(403, "this key is banned");
    }

    match p.op.as_str() {
        "list" | "put" | "delete" => notes_op(store, cfg, &me, p, now).await,
        "ban" | "unban" => {
            if !cfg.is_owner(&me.email) {
                return err(403, "only the project owner can ban keys");
            }
            let Some(target) = p.key.map(|k| format!("key#{k}")).or(p.email.map(|e| format!("email#{}", e.to_lowercase()))) else {
                return err(400, "ban needs a key or an email");
            };
            tryst!(store.set_ban(&target, p.op == "ban", &me.email, now).await);
            (200, json!({ "ok": true }))
        }
        "keys" => {
            if !cfg.is_owner(&me.email) {
                return err(403, "only the project owner can list keys");
            }
            let mut keys = tryst!(store.list_keys().await);
            keys.sort_by(|a, b| a.email.cmp(&b.email).then(a.registered.cmp(&b.registered)));
            let mut out = Vec::new();
            for k in keys {
                let banned = tryst!(store.is_banned(&format!("key#{}", k.key_id)).await) || tryst!(store.is_banned(&format!("email#{}", k.email)).await);
                out.push(json!({ "key": k, "banned": banned }));
            }
            (200, json!({ "ok": true, "keys": out }))
        }
        _ => err(400, "unknown op"),
    }
}

async fn register(store: &dyn Store, env: &Envelope, p: &Payload, sig: &[u8], now: i64) -> Reply {
    let b64 = base64::engine::general_purpose::STANDARD;
    let Some(spki) = env.spki.as_deref().and_then(|s| b64.decode(s).ok()) else { return err(400, "register needs the public key") };
    if key_id_of(&spki) != env.key {
        return err(400, "key ID doesn't match the public key");
    }
    if !verify(&spki, env.payload.as_bytes(), sig) {
        return err(401, "bad signature");
    }
    let Some(email) = clip(p.email.clone(), 254).map(|e| e.to_lowercase()).filter(|e| e.contains('@')) else {
        return err(400, "register needs the MC email");
    };
    if tryst!(store.is_banned(&format!("key#{}", env.key)).await) || tryst!(store.is_banned(&format!("email#{email}")).await) {
        return err(403, "this key is banned");
    }
    let prev = tryst!(store.get_key(&env.key).await);
    if let Some(prev) = &prev {
        // First upload wins: a key stays with the account it was registered for.
        if prev.email != email {
            return err(409, "this key is registered to another account");
        }
    }
    let mc_name = clip(p.mc_name.clone(), 120).unwrap_or_else(|| email.clone());
    let rec = KeyRec {
        key_id: env.key.clone(),
        label: clip(p.label.clone(), 200).unwrap_or_else(|| mc_name.clone()),
        mc_name,
        email,
        person_id: clip(p.person_id.clone(), 40),
        role: clip(p.role.clone(), 60),
        journal: clip(p.journal.clone(), 60),
        spki: b64.encode(&spki),
        registered: prev.map(|k| k.registered).unwrap_or(now),
    };
    tryst!(store.put_key(&rec).await);
    (200, json!({ "ok": true, "key": rec.key_id }))
}

async fn notes_op(store: &dyn Store, cfg: &Config, me: &KeyRec, p: Payload, now: i64) -> Reply {
    let (Some(m), Some(h)) = (p.m, p.h) else { return err(400, "needs the manuscript ID and title hash") };
    if !valid_manuscript_id(&m) || !valid_hash(&h) {
        return err(400, "bad manuscript ID or title hash");
    }
    let mac = title_mac(&cfg.secret, &m, &h);
    let macs = tryst!(store.title_macs(&m).await);
    if macs.is_empty() {
        // Nothing stored for this manuscript yet. The first note sets its title.
        match p.op.as_str() {
            "list" => return (200, json!({ "ok": true, "notes": [] })),
            "delete" => return err(404, "no such note"),
            _ => tryst!(store.add_title_mac(&m, &mac).await),
        }
    } else if !macs.contains(&mac) {
        // A revision can change the title; a moderator's request adds the new one.
        if !cfg.is_moderator(&me.email) {
            return err(403, "the title doesn't match this manuscript");
        }
        tryst!(store.add_title_mac(&m, &mac).await);
    }

    match p.op.as_str() {
        "list" => (200, json!({ "ok": true, "notes": tryst!(store.list_notes(&m).await) })),
        "put" => {
            let Some(t) = p.t.filter(|t| *t > 0 && *t <= now + MAX_SKEW_S) else { return err(400, "bad session time") };
            let text = p.text.unwrap_or_default();
            if text.trim().is_empty() {
                return err(400, "empty note: delete it instead");
            }
            if text.len() > MAX_NOTE_BYTES {
                return err(413, "note too long");
            }
            // The author is whoever the key belongs to, never what the request says.
            let n = Note { m, t, email: me.email.clone(), author: me.label.clone(), text, updated: now, key_id: me.key_id.clone() };
            tryst!(store.put_note(&n).await);
            (200, json!({ "ok": true, "note": n }))
        }
        "delete" => {
            let (Some(t), Some(email)) = (p.t, p.email.map(|e| e.to_lowercase())) else { return err(400, "delete needs the note's time and author") };
            if email != me.email && !cfg.is_moderator(&me.email) {
                return err(403, "only the author, a co-chair or the EIC can delete this note");
            }
            if tryst!(store.get_note(&m, t, &email).await).is_none() {
                return err(404, "no such note");
            }
            tryst!(store.delete_note(&m, t, &email).await);
            (200, json!({ "ok": true }))
        }
        _ => unreachable!(),
    }
}

/// An in-memory store, for tests and local runs.
#[derive(Default)]
pub struct MemStore {
    keys: Mutex<HashMap<String, KeyRec>>,
    bans: Mutex<HashMap<String, bool>>,
    macs: Mutex<HashMap<String, Vec<String>>>,
    notes: Mutex<HashMap<(String, i64, String), Note>>,
}

#[async_trait]
impl Store for MemStore {
    async fn get_key(&self, key_id: &str) -> Result<Option<KeyRec>, StoreError> {
        Ok(self.keys.lock().unwrap().get(key_id).cloned())
    }
    async fn put_key(&self, k: &KeyRec) -> Result<(), StoreError> {
        self.keys.lock().unwrap().insert(k.key_id.clone(), k.clone());
        Ok(())
    }
    async fn list_keys(&self) -> Result<Vec<KeyRec>, StoreError> {
        Ok(self.keys.lock().unwrap().values().cloned().collect())
    }
    async fn is_banned(&self, target: &str) -> Result<bool, StoreError> {
        Ok(self.bans.lock().unwrap().get(target).copied().unwrap_or(false))
    }
    async fn set_ban(&self, target: &str, banned: bool, _by: &str, _at: i64) -> Result<(), StoreError> {
        self.bans.lock().unwrap().insert(target.to_string(), banned);
        Ok(())
    }
    async fn title_macs(&self, m: &str) -> Result<Vec<String>, StoreError> {
        Ok(self.macs.lock().unwrap().get(m).cloned().unwrap_or_default())
    }
    async fn add_title_mac(&self, m: &str, mac: &str) -> Result<(), StoreError> {
        let mut all = self.macs.lock().unwrap();
        let list = all.entry(m.to_string()).or_default();
        if !list.iter().any(|x| x == mac) {
            list.push(mac.to_string());
        }
        Ok(())
    }
    async fn list_notes(&self, m: &str) -> Result<Vec<Note>, StoreError> {
        let mut out: Vec<Note> = self.notes.lock().unwrap().values().filter(|n| n.m == m).cloned().collect();
        out.sort_by(|a, b| a.t.cmp(&b.t).then(a.email.cmp(&b.email)));
        Ok(out)
    }
    async fn get_note(&self, m: &str, t: i64, email: &str) -> Result<Option<Note>, StoreError> {
        Ok(self.notes.lock().unwrap().get(&(m.to_string(), t, email.to_string())).cloned())
    }
    async fn put_note(&self, n: &Note) -> Result<(), StoreError> {
        self.notes.lock().unwrap().insert((n.m.clone(), n.t, n.email.clone()), n.clone());
        Ok(())
    }
    async fn delete_note(&self, m: &str, t: i64, email: &str) -> Result<(), StoreError> {
        self.notes.lock().unwrap().remove(&(m.to_string(), t, email.to_string()));
        Ok(())
    }
}
