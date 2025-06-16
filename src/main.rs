use axum::{
    http::{header, HeaderValue, Request},
    middleware,
    response::{Html, Json, Response},
    routing::get,
    Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use thiserror::Error;
use tower::ServiceBuilder;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::{error, info};

#[derive(Debug, Error)]
pub enum ServerError {
    #[error("Failed to bind to address {addr}: {source}")]
    BindError {
        addr: SocketAddr,
        #[source]
        source: std::io::Error,
    },
    #[error("Server runtime error: {0}")]
    RuntimeError(#[from] std::io::Error),
    #[error("Configuration error: {0}")]
    ConfigError(String),
}

pub type Result<T> = std::result::Result<T, ServerError>;

#[tokio::main]
async fn main() {
    if let Err(e) = run_server().await {
        error!("Fatal server error: {}", e);
        std::process::exit(1);
    }
}

async fn run_server() -> Result<()> {
    init_tracing();
    
    let app = create_app();
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    
    info!("Starting server on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| ServerError::BindError { addr, source: e })?;
    
    info!("Server successfully bound to {}", addr);
    
    axum::serve(listener, app)
        .await
        .map_err(ServerError::RuntimeError)?;
    
    Ok(())
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info".into());
    
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();
}

async fn hello_world() -> Html<&'static str> {
    Html("<h1>Hello World</h1><p>Cloudflare Tunnel Example - Rust Axum Service</p>")
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "cloudflare-tunnel-example",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

pub fn create_app() -> Router {
    Router::new()
        .route("/", get(hello_world))
        .route("/health", get(health_check))
        .layer(
            ServiceBuilder::new()
                .layer(middleware::from_fn(security_headers))
                .layer(SetResponseHeaderLayer::if_not_present(
                    header::SERVER,
                    HeaderValue::from_static("cloudflare-tunnel-example"),
                )),
        )
}

async fn security_headers(
    request: Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Response {
    let mut response = next.run(request).await;

    let headers = response.headers_mut();

    headers.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert(
        "X-XSS-Protection",
        HeaderValue::from_static("1; mode=block"),
    );
    headers.insert(
        "Strict-Transport-Security",
        HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
    );
    headers.insert(
        "Content-Security-Policy",
        HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'"),
    );
    headers.insert(
        "Referrer-Policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        "Permissions-Policy",
        HeaderValue::from_static("geolocation=(), microphone=(), camera=()"),
    );

    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::util::ServiceExt;
    
    async fn make_request(uri: &str) -> (StatusCode, String) {
        let app = create_app();
        let request = Request::builder()
            .uri(uri)
            .body(Body::empty())
            .expect("Failed to build test request");
        
        let response = app
            .oneshot(request)
            .await
            .expect("Failed to get response from app");
        
        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("Failed to read response body");
        let body_str = String::from_utf8(body.to_vec())
            .expect("Response body was not valid UTF-8");
        
        (status, body_str)
    }
    
    async fn make_request_with_headers(uri: &str) -> (StatusCode, String, axum::http::HeaderMap) {
        let app = create_app();
        let request = Request::builder()
            .uri(uri)
            .body(Body::empty())
            .expect("Failed to build test request");
        
        let response = app
            .oneshot(request)
            .await
            .expect("Failed to get response from app");
        
        let status = response.status();
        let headers = response.headers().clone();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("Failed to read response body");
        let body_str = String::from_utf8(body.to_vec())
            .expect("Response body was not valid UTF-8");
        
        (status, body_str, headers)
    }

    #[tokio::test]
    async fn test_root_endpoint() {
        let (status, body) = make_request("/").await;
        
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Hello World"));
        assert!(body.contains("Cloudflare Tunnel Example"));
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let (status, body) = make_request("/health").await;
        
        assert_eq!(status, StatusCode::OK);
        
        let json: serde_json::Value = serde_json::from_str(&body)
            .expect("Response was not valid JSON");
        
        assert_eq!(json["status"], "healthy");
        assert_eq!(json["service"], "cloudflare-tunnel-example");
        assert!(json["timestamp"].is_string());
    }

    #[tokio::test]
    async fn test_security_headers() {
        let (_status, _body, headers) = make_request_with_headers("/").await;
        
        assert_eq!(
            headers.get("x-content-type-options")
                .expect("Missing X-Content-Type-Options header"), 
            "nosniff"
        );
        assert_eq!(
            headers.get("x-frame-options")
                .expect("Missing X-Frame-Options header"), 
            "DENY"
        );
        assert_eq!(
            headers.get("x-xss-protection")
                .expect("Missing X-XSS-Protection header"), 
            "1; mode=block"
        );
        
        let hsts_header = headers.get("strict-transport-security")
            .expect("Missing Strict-Transport-Security header")
            .to_str()
            .expect("HSTS header was not valid UTF-8");
        assert!(hsts_header.contains("max-age=31536000"));
        
        assert!(headers.get("content-security-policy").is_some());
        
        assert_eq!(
            headers.get("referrer-policy")
                .expect("Missing Referrer-Policy header"), 
            "strict-origin-when-cross-origin"
        );
        assert_eq!(
            headers.get("permissions-policy")
                .expect("Missing Permissions-Policy header"), 
            "geolocation=(), microphone=(), camera=()"
        );
    }

    #[tokio::test]
    async fn test_404_not_found() {
        let (status, _body) = make_request("/nonexistent").await;
        
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
}
