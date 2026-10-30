//! The notes server on your own computer, with an in-memory store, for
//! trying the extension without AWS:
//!
//!   cargo run --example local            # http://127.0.0.1:8787/
//!
//! Then set Settings > Notes server to that address. Everything is lost
//! when it stops. OWNERS and MODERATORS work as in Lambda.

use emc_notes::{handle, Config, MemStore};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main(flavor = "current_thread")]
async fn main() -> std::io::Result<()> {
    if std::env::var("NOTES_SECRET").is_err() {
        std::env::set_var("NOTES_SECRET", "local-development-secret-not-for-real-use");
    }
    let cfg = Config::from_env().expect("config");
    let store = MemStore::default();
    let addr = std::env::var("ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let listener = TcpListener::bind(&addr).await?;
    eprintln!("notes server on http://{addr}/");
    loop {
        let (mut sock, _) = listener.accept().await?;
        let mut buf = Vec::new();
        let mut chunk = [0u8; 8192];
        // Read the headers, then as much body as Content-Length says.
        let (head_end, len) = loop {
            let n = sock.read(&mut chunk).await?;
            if n == 0 {
                break (0, 0);
            }
            buf.extend_from_slice(&chunk[..n]);
            if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&buf[..i]).to_lowercase();
                let len = head.lines().find_map(|l| l.strip_prefix("content-length:")).and_then(|v| v.trim().parse().ok()).unwrap_or(0);
                break (i + 4, len);
            }
        };
        if head_end == 0 {
            continue;
        }
        while buf.len() < head_end + len {
            let n = sock.read(&mut chunk).await?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
        }
        let is_post = buf.starts_with(b"POST ");
        let (status, body) = if is_post {
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
            handle(&store, &cfg, &String::from_utf8_lossy(&buf[head_end..(head_end + len).min(buf.len())]), now).await
        } else {
            (204, serde_json::Value::Null)
        };
        let body = if status == 204 { String::new() } else { body.to_string() };
        let reply = format!(
            "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\naccess-control-allow-origin: *\r\naccess-control-allow-methods: POST\r\naccess-control-allow-headers: content-type\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        );
        sock.write_all(reply.as_bytes()).await?;
    }
}
