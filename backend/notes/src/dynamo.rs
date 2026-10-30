//! The DynamoDB store: one on-demand table (env NOTES_TABLE) with string
//! keys `pk` and `sk`.
//!
//! | item          | pk              | sk                        |
//! |---------------|-----------------|---------------------------|
//! | signing key   | `key#<id>`      | `key`                     |
//! | key by email  | `email#<email>` | `key#<id>`                |
//! | ban           | `ban`           | `key#<id>` / `email#<e>`  |
//! | title MACs    | `m#<id>`        | `#auth`                   |
//! | note          | `m#<id>`        | `n#<t, 12 digits>#<email>`|

use std::collections::HashMap;

use async_trait::async_trait;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;

use crate::{KeyRec, Note, Store, StoreError};

pub struct Dynamo {
    pub client: Client,
    pub table: String,
}

type Item = HashMap<String, AttributeValue>;

fn s(v: &str) -> AttributeValue {
    AttributeValue::S(v.to_string())
}

fn n(v: i64) -> AttributeValue {
    AttributeValue::N(v.to_string())
}

fn get_s(i: &Item, k: &str) -> Option<String> {
    i.get(k).and_then(|v| v.as_s().ok()).cloned()
}

fn get_n(i: &Item, k: &str) -> i64 {
    i.get(k).and_then(|v| v.as_n().ok()).and_then(|v| v.parse().ok()).unwrap_or(0)
}

fn fail<E: std::fmt::Display>(e: E) -> StoreError {
    StoreError(e.to_string())
}

fn note_sk(t: i64, email: &str) -> String {
    format!("n#{t:012}#{email}")
}

fn key_from(i: &Item) -> Option<KeyRec> {
    Some(KeyRec {
        key_id: get_s(i, "keyId")?,
        email: get_s(i, "email")?,
        label: get_s(i, "label").unwrap_or_default(),
        mc_name: get_s(i, "mcName").unwrap_or_default(),
        person_id: get_s(i, "personId"),
        role: get_s(i, "role"),
        journal: get_s(i, "journal"),
        spki: get_s(i, "spki")?,
        registered: get_n(i, "registered"),
    })
}

fn note_from(i: &Item) -> Option<Note> {
    Some(Note {
        m: get_s(i, "m")?,
        t: get_n(i, "t"),
        email: get_s(i, "email")?,
        author: get_s(i, "author").unwrap_or_default(),
        text: get_s(i, "text").unwrap_or_default(),
        updated: get_n(i, "updated"),
        key_id: get_s(i, "keyId").unwrap_or_default(),
    })
}

impl Dynamo {
    async fn get(&self, pk: &str, sk: &str) -> Result<Option<Item>, StoreError> {
        let r = self.client.get_item().table_name(&self.table).key("pk", s(pk)).key("sk", s(sk)).send().await.map_err(fail)?;
        Ok(r.item)
    }
}

#[async_trait]
impl Store for Dynamo {
    async fn get_key(&self, key_id: &str) -> Result<Option<KeyRec>, StoreError> {
        Ok(self.get(&format!("key#{key_id}"), "key").await?.as_ref().and_then(key_from))
    }

    async fn put_key(&self, k: &KeyRec) -> Result<(), StoreError> {
        let mut req = self
            .client
            .put_item()
            .table_name(&self.table)
            .item("pk", s(&format!("key#{}", k.key_id)))
            .item("sk", s("key"))
            .item("keyId", s(&k.key_id))
            .item("email", s(&k.email))
            .item("label", s(&k.label))
            .item("mcName", s(&k.mc_name))
            .item("spki", s(&k.spki))
            .item("registered", n(k.registered));
        for (name, v) in [("personId", &k.person_id), ("role", &k.role), ("journal", &k.journal)] {
            if let Some(v) = v {
                req = req.item(name, s(v));
            }
        }
        req.send().await.map_err(fail)?;
        // One email, many keys: an index row per key.
        self.client
            .put_item()
            .table_name(&self.table)
            .item("pk", s(&format!("email#{}", k.email)))
            .item("sk", s(&format!("key#{}", k.key_id)))
            .item("registered", n(k.registered))
            .send()
            .await
            .map_err(fail)?;
        Ok(())
    }

    async fn list_keys(&self) -> Result<Vec<KeyRec>, StoreError> {
        // Owner-only and rare; a scan of a small table is fine.
        let mut out = Vec::new();
        let mut start: Option<Item> = None;
        loop {
            let r = self
                .client
                .scan()
                .table_name(&self.table)
                .filter_expression("sk = :k")
                .expression_attribute_values(":k", s("key"))
                .set_exclusive_start_key(start)
                .send()
                .await
                .map_err(fail)?;
            out.extend(r.items().iter().filter_map(key_from));
            start = r.last_evaluated_key;
            if start.is_none() {
                return Ok(out);
            }
        }
    }

    async fn is_banned(&self, target: &str) -> Result<bool, StoreError> {
        Ok(self.get("ban", target).await?.is_some())
    }

    async fn set_ban(&self, target: &str, banned: bool, by: &str, at: i64) -> Result<(), StoreError> {
        if banned {
            self.client
                .put_item()
                .table_name(&self.table)
                .item("pk", s("ban"))
                .item("sk", s(target))
                .item("by", s(by))
                .item("at", n(at))
                .send()
                .await
                .map_err(fail)?;
        } else {
            self.client.delete_item().table_name(&self.table).key("pk", s("ban")).key("sk", s(target)).send().await.map_err(fail)?;
        }
        Ok(())
    }

    async fn title_macs(&self, m: &str) -> Result<Vec<String>, StoreError> {
        let item = self.get(&format!("m#{m}"), "#auth").await?;
        Ok(item.and_then(|i| i.get("macs").and_then(|v| v.as_ss().ok()).cloned()).unwrap_or_default())
    }

    async fn add_title_mac(&self, m: &str, mac: &str) -> Result<(), StoreError> {
        self.client
            .update_item()
            .table_name(&self.table)
            .key("pk", s(&format!("m#{m}")))
            .key("sk", s("#auth"))
            .update_expression("ADD macs :mac")
            .expression_attribute_values(":mac", AttributeValue::Ss(vec![mac.to_string()]))
            .send()
            .await
            .map_err(fail)?;
        Ok(())
    }

    async fn list_notes(&self, m: &str) -> Result<Vec<Note>, StoreError> {
        let mut out = Vec::new();
        let mut start: Option<Item> = None;
        loop {
            let r = self
                .client
                .query()
                .table_name(&self.table)
                .key_condition_expression("pk = :pk AND begins_with(sk, :n)")
                .expression_attribute_values(":pk", s(&format!("m#{m}")))
                .expression_attribute_values(":n", s("n#"))
                .set_exclusive_start_key(start)
                .send()
                .await
                .map_err(fail)?;
            out.extend(r.items().iter().filter_map(note_from));
            start = r.last_evaluated_key;
            if start.is_none() {
                return Ok(out);
            }
        }
    }

    async fn get_note(&self, m: &str, t: i64, email: &str) -> Result<Option<Note>, StoreError> {
        Ok(self.get(&format!("m#{m}"), &note_sk(t, email)).await?.as_ref().and_then(note_from))
    }

    async fn put_note(&self, x: &Note) -> Result<(), StoreError> {
        self.client
            .put_item()
            .table_name(&self.table)
            .item("pk", s(&format!("m#{}", x.m)))
            .item("sk", s(&note_sk(x.t, &x.email)))
            .item("m", s(&x.m))
            .item("t", n(x.t))
            .item("email", s(&x.email))
            .item("author", s(&x.author))
            .item("text", s(&x.text))
            .item("updated", n(x.updated))
            .item("keyId", s(&x.key_id))
            .send()
            .await
            .map_err(fail)?;
        Ok(())
    }

    async fn delete_note(&self, m: &str, t: i64, email: &str) -> Result<(), StoreError> {
        self.client.delete_item().table_name(&self.table).key("pk", s(&format!("m#{m}"))).key("sk", s(&note_sk(t, email))).send().await.map_err(fail)?;
        Ok(())
    }
}
