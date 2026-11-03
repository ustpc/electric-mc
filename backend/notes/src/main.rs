//! Lambda entry point: a function URL POSTs a JSON body here. CORS headers
//! come from the function URL's configuration (see README.md).

use emc_notes::dynamo::Dynamo;
use emc_notes::{handle, Config};
use lambda_http::{service_fn, Body, Error, Request, Response};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Error> {
    let cfg = Config::from_env()?;
    let aws = aws_config::load_from_env().await;
    let store = Dynamo { client: aws_sdk_dynamodb::Client::new(&aws), table: std::env::var("NOTES_TABLE").unwrap_or_else(|_| "emc-notes".into()) };
    let (cfg, store) = (&cfg, &store);
    lambda_http::run(service_fn(move |req: Request| async move {
        let (status, body) = if req.method() == "POST" {
            let text = match req.body() {
                Body::Text(t) => t.clone(),
                Body::Binary(b) => String::from_utf8_lossy(b).into_owned(),
                Body::Empty => String::new(),
            };
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
            handle(store, cfg, &text, now).await
        } else {
            (405, serde_json::json!({ "error": "POST only" }))
        };
        Response::builder().status(status).header("content-type", "application/json").body(Body::Text(body.to_string())).map_err(Error::from)
    }))
    .await
}
