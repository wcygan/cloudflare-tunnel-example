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

mod config;
use config::SecurityConfig;

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
    
    // Load security configuration
    let security_config = SecurityConfig::from_env()?;
    info!("Loaded security configuration with {} headers", security_config.to_headers().len());
    
    let app = create_app(security_config);
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

pub fn create_app(security_config: SecurityConfig) -> Router {
    // Clone security config for use in middleware
    let config_for_middleware = security_config.clone();
    
    Router::new()
        .route("/", get(hello_world))
        .route("/health", get(health_check))
        .layer(
            ServiceBuilder::new()
                .layer(middleware::from_fn(move |req, next| {
                    let config = config_for_middleware.clone();
                    security_headers(req, next, config)
                }))
                .layer(SetResponseHeaderLayer::if_not_present(
                    header::SERVER,
                    HeaderValue::from_str(&security_config.server_header)
                        .unwrap_or_else(|_| HeaderValue::from_static("cloudflare-tunnel-example")),
                )),
        )
}

async fn security_headers(
    request: Request<axum::body::Body>,
    next: axum::middleware::Next,
    config: SecurityConfig,
) -> Response {
    let mut response = next.run(request).await;

    let headers = response.headers_mut();

    // Apply all configured security headers
    let security_headers = config.to_headers();
    
    // Insert each header using static string literals for known headers
    if let Some(value) = security_headers.get("X-Content-Type-Options") {
        if let Ok(header_value) = HeaderValue::from_str(value) {
            headers.insert("X-Content-Type-Options", header_value);
        }
    }
    
    if let Some(value) = security_headers.get("X-Frame-Options") {
        if let Ok(header_value) = HeaderValue::from_str(value) {
            headers.insert("X-Frame-Options", header_value);
        }
    }
    
    if let Some(value) = security_headers.get("X-XSS-Protection") {
        if let Ok(header_value) = HeaderValue::from_str(value) {
            headers.insert("X-XSS-Protection", header_value);
        }
    }
    
    if let Some(value) = security_headers.get("Strict-Transport-Security") {
        if let Ok(header_value) = HeaderValue::from_str(value) {
            headers.insert("Strict-Transport-Security", header_value);
        }
    }
    
    if let Some(value) = security_headers.get("Content-Security-Policy") {
        if let Ok(header_value) = HeaderValue::from_str(value) {
            headers.insert("Content-Security-Policy", header_value);
        }
    }
    
    if let Some(value) = security_headers.get("Referrer-Policy") {
        if let Ok(header_value) = HeaderValue::from_str(value) {
            headers.insert("Referrer-Policy", header_value);
        }
    }
    
    if let Some(value) = security_headers.get("Permissions-Policy") {
        if let Ok(header_value) = HeaderValue::from_str(value) {
            headers.insert("Permissions-Policy", header_value);
        }
    }

    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::util::ServiceExt;
    
    async fn make_request(uri: &str) -> (StatusCode, String) {
        let app = create_app(SecurityConfig::default());
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
        let app = create_app(SecurityConfig::default());
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
    
    #[tokio::test]
    async fn test_configurable_security_headers() {
        // Test with custom security configuration
        let mut config = SecurityConfig::default();
        config.frame_options = "SAMEORIGIN".to_string();
        config.hsts.max_age = 3600; // 1 hour instead of default 1 year
        config.hsts.include_subdomains = false;
        
        let app = create_app(config);
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).expect("Failed to build request"))
            .await
            .expect("Failed to get response");
        
        let headers = response.headers();
        
        // Verify custom values are applied
        assert_eq!(
            headers.get("x-frame-options").expect("Missing X-Frame-Options header"), 
            "SAMEORIGIN"
        );
        
        let hsts_header = headers.get("strict-transport-security")
            .expect("Missing HSTS header")
            .to_str()
            .expect("HSTS header not valid UTF-8");
        assert!(hsts_header.contains("max-age=3600"));
        assert!(!hsts_header.contains("includeSubDomains"));
        assert!(hsts_header.contains("preload")); // Should still be true by default
    }
}
