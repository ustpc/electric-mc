// The notes protocol end to end against the in-memory store: registration,
// signed requests, title checks, edit and delete rules, and bans.
// Synthetic people and manuscript IDs only.

use base64::Engine as _;
use emc_notes::{handle, key_id_of, title_mac, Config, MemStore, Store};
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::pkcs8::EncodePublicKey;
use serde_json::{json, Value};

const NOW: i64 = 1_800_000_000;
const M: &str = "XYZJ-26-01-9001";
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

struct Browser {
    key: SigningKey,
    spki: Vec<u8>,
    id: String,
}

impl Browser {
    fn new() -> Browser {
        let key = SigningKey::random(&mut rand_core::OsRng);
        let spki = key.verifying_key().to_public_key_der().unwrap().as_bytes().to_vec();
        let id = key_id_of(&spki);
        Browser { key, spki, id }
    }

    fn body(&self, payload: Value, with_spki: bool) -> String {
        let payload = payload.to_string();
        let sig: Signature = self.key.sign(payload.as_bytes());
        let mut env = json!({ "key": self.id, "payload": payload, "sig": B64.encode(sig.to_bytes()) });
        if with_spki {
            env["spki"] = json!(B64.encode(&self.spki));
        }
        env.to_string()
    }
}

fn cfg() -> Config {
    Config { secret: b"0123456789abcdef0123456789abcdef".to_vec(), owners: vec!["owner@example.org".into()], moderators: vec!["cochair@example.org".into()] }
}

const H: &str = "1111111111111111111111111111111111111111111111111111111111111111";
const H2: &str = "2222222222222222222222222222222222222222222222222222222222222222";

async fn register(s: &MemStore, b: &Browser, email: &str, label: &str) -> (u16, Value) {
    let p = json!({ "op": "register", "ts": NOW, "email": email, "label": label, "mcName": "Example Person", "personId": "12345" });
    handle(s, &cfg(), &b.body(p, true), NOW).await
}

async fn call(s: &MemStore, b: &Browser, mut p: Value) -> (u16, Value) {
    p["ts"] = json!(NOW);
    handle(s, &cfg(), &b.body(p, false), NOW).await
}

async fn person(s: &MemStore, email: &str) -> Browser {
    let b = Browser::new();
    assert_eq!(register(s, &b, email, email).await.0, 200);
    b
}

#[tokio::test]
async fn register_then_put_list_and_edit() {
    let s = MemStore::default();
    let alice = person(&s, "Alice@Example.org").await;
    let (st, _) = call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW - 10, "text": "first" })).await;
    assert_eq!(st, 200);
    // The same session overwrites: that's an edit.
    call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW - 10, "text": "edited" })).await;
    call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "second session" })).await;
    let (st, got) = call(&s, &alice, json!({ "op": "list", "m": M, "h": H })).await;
    assert_eq!(st, 200);
    let notes = got["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 2);
    assert_eq!(notes[0]["text"], "edited");
    assert_eq!(notes[0]["email"], "alice@example.org");
    assert_eq!(notes[0]["keyId"], alice.id);
}

#[tokio::test]
async fn author_comes_from_the_key_not_the_request() {
    let s = MemStore::default();
    let alice = person(&s, "alice@example.org").await;
    call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "x", "email": "carol@example.org" })).await;
    let notes = s.list_notes(M).await.unwrap();
    assert_eq!(notes[0].email, "alice@example.org");
}

#[tokio::test]
async fn one_email_may_have_many_keys() {
    let s = MemStore::default();
    let a1 = person(&s, "alice@example.org").await;
    let a2 = person(&s, "alice@example.org").await;
    call(&s, &a1, json!({ "op": "put", "m": M, "h": H, "t": NOW - 5, "text": "from browser 1" })).await;
    // The other browser is the same person, so it may delete the note.
    let (st, _) = call(&s, &a2, json!({ "op": "delete", "m": M, "h": H, "t": NOW - 5, "email": "alice@example.org" })).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn a_key_stays_with_its_first_account() {
    let s = MemStore::default();
    let b = person(&s, "alice@example.org").await;
    assert_eq!(register(&s, &b, "carol@example.org", "Carol").await.0, 409);
    // Re-registering for the same account updates the name.
    assert_eq!(register(&s, &b, "alice@example.org", "Alice A.").await.0, 200);
    assert_eq!(s.get_key(&b.id).await.unwrap().unwrap().label, "Alice A.");
}

#[tokio::test]
async fn signatures_are_checked() {
    let s = MemStore::default();
    let alice = person(&s, "alice@example.org").await;
    let mallory = Browser::new();
    // Mallory signs with her own key but claims Alice's key ID.
    let mut body: Value = serde_json::from_str(&mallory.body(json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "x", "ts": NOW }), false)).unwrap();
    body["key"] = json!(alice.id);
    assert_eq!(handle(&s, &cfg(), &body.to_string(), NOW).await.0, 401);
    // An unregistered key gets nowhere.
    assert_eq!(call(&s, &mallory, json!({ "op": "list", "m": M, "h": H })).await.0, 401);
    // Registration must carry the public key that matches the ID.
    let mut reg: Value = serde_json::from_str(&mallory.body(json!({ "op": "register", "ts": NOW, "email": "m@example.org" }), true)).unwrap();
    reg["spki"] = json!(B64.encode(&alice.spki));
    assert_eq!(handle(&s, &cfg(), &reg.to_string(), NOW).await.0, 400);
}

#[tokio::test]
async fn old_requests_are_refused() {
    let s = MemStore::default();
    let alice = person(&s, "alice@example.org").await;
    let body = alice.body(json!({ "op": "list", "m": M, "h": H, "ts": NOW - 3600 }), false);
    assert_eq!(handle(&s, &cfg(), &body, NOW).await.0, 401);
}

#[tokio::test]
async fn the_first_title_sticks_and_only_its_mac_is_stored() {
    let s = MemStore::default();
    let alice = person(&s, "alice@example.org").await;
    let carol = person(&s, "carol@example.org").await;
    assert_eq!(call(&s, &alice, json!({ "op": "list", "m": M, "h": H })).await.1["notes"], json!([]));
    call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "x" })).await;
    assert_eq!(s.title_macs(M).await.unwrap(), vec![title_mac(&cfg().secret, M, H)]);
    assert_eq!(call(&s, &carol, json!({ "op": "list", "m": M, "h": H2 })).await.0, 403);
    assert_eq!(call(&s, &carol, json!({ "op": "put", "m": M, "h": H2, "t": NOW, "text": "y" })).await.0, 403);
    assert_eq!(call(&s, &carol, json!({ "op": "list", "m": M, "h": H })).await.0, 200);
}

#[tokio::test]
async fn a_moderator_can_add_a_revised_title() {
    let s = MemStore::default();
    let alice = person(&s, "alice@example.org").await;
    let chair = person(&s, "cochair@example.org").await;
    call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "x" })).await;
    assert_eq!(call(&s, &chair, json!({ "op": "list", "m": M, "h": H2 })).await.0, 200);
    assert_eq!(call(&s, &alice, json!({ "op": "list", "m": M, "h": H2 })).await.0, 200);
}

#[tokio::test]
async fn only_authors_and_moderators_delete() {
    let s = MemStore::default();
    let alice = person(&s, "alice@example.org").await;
    let bob = person(&s, "bob@example.org").await;
    let chair = person(&s, "cochair@example.org").await;
    call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "x" })).await;
    let del = json!({ "op": "delete", "m": M, "h": H, "t": NOW, "email": "alice@example.org" });
    assert_eq!(call(&s, &bob, del.clone()).await.0, 403);
    assert_eq!(call(&s, &chair, del.clone()).await.0, 200);
    assert_eq!(call(&s, &chair, del).await.0, 404);
    assert!(s.list_notes(M).await.unwrap().is_empty());
}

#[tokio::test]
async fn the_owner_bans_keys_and_emails() {
    let s = MemStore::default();
    let owner = person(&s, "owner@example.org").await;
    let chair = person(&s, "cochair@example.org").await;
    let bob = person(&s, "bob@example.org").await;
    assert_eq!(call(&s, &chair, json!({ "op": "ban", "key": bob.id })).await.0, 403);
    assert_eq!(call(&s, &owner, json!({ "op": "ban", "key": bob.id })).await.0, 200);
    assert_eq!(call(&s, &bob, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "x" })).await.0, 403);
    // A banned key can't come back by registering again.
    assert_eq!(register(&s, &bob, "bob@example.org", "Bob").await.0, 403);
    // A new key for the same email works until the email is banned.
    let bob2 = person(&s, "bob@example.org").await;
    assert_eq!(call(&s, &bob2, json!({ "op": "list", "m": M, "h": H })).await.0, 200);
    call(&s, &owner, json!({ "op": "ban", "email": "Bob@example.org" })).await;
    assert_eq!(call(&s, &bob2, json!({ "op": "list", "m": M, "h": H })).await.0, 403);
    let (_, keys) = call(&s, &owner, json!({ "op": "keys" })).await;
    let banned: Vec<bool> = keys["keys"].as_array().unwrap().iter().filter(|k| k["key"]["email"] == "bob@example.org").map(|k| k["banned"].as_bool().unwrap()).collect();
    assert_eq!(banned, vec![true, true]);
    call(&s, &owner, json!({ "op": "unban", "email": "bob@example.org" })).await;
    assert_eq!(call(&s, &bob2, json!({ "op": "list", "m": M, "h": H })).await.0, 200);
}

#[tokio::test]
async fn bad_input_is_refused() {
    let s = MemStore::default();
    let alice = person(&s, "alice@example.org").await;
    assert_eq!(call(&s, &alice, json!({ "op": "put", "m": "bad id!", "h": H, "t": NOW, "text": "x" })).await.0, 400);
    assert_eq!(call(&s, &alice, json!({ "op": "put", "m": M, "h": "ABC", "t": NOW, "text": "x" })).await.0, 400);
    assert_eq!(call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "  " })).await.0, 400);
    assert_eq!(call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW + 3600, "text": "x" })).await.0, 400);
    assert_eq!(call(&s, &alice, json!({ "op": "put", "m": M, "h": H, "t": NOW, "text": "x".repeat(20_001) })).await.0, 413);
    assert_eq!(handle(&s, &cfg(), "not json", NOW).await.0, 400);
}

#[test]
fn accepts_a_browser_webcrypto_signature() {
    // Made with crypto.subtle (ECDSA P-256, SHA-256) as the extension does.
    // Its s is in the upper half of the curve order, which WebCrypto allows.
    let spki = B64.decode("MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEbwzdIKry10CmCiXQ+jI5dy9FH2TQZl9VBXfSbOv2guettNzxmy3osqB8uszV59y5/kiu9XzGG3OQDHBt32r7g==").unwrap();
    let sig = B64.decode("zDoFgmNhfiq9Ln26ZZAoDQAmeAdJ0D5TZcipZhI7/wS49zxnGQfWiS1at3GN3p3aMMJ1R9viYP5t/7uUvDw1Pg==").unwrap();
    let msg = br#"{"op":"list","m":"XYZJ-26-01-9001","ts":1800000000}"#;
    assert!(emc_notes::verify(&spki, msg, &sig));
    assert!(!emc_notes::verify(&spki, b"something else", &sig));
}
