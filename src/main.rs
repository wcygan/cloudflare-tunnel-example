use axum::{
    http::{header, HeaderValue, Request},
    middleware,
    response::{Html, Json, Response},
    routing::get,
    Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tower::ServiceBuilder;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::{info, warn};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let app = create_app()
;

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    axum::serve(listener, app).await.unwrap_or_else(|err| {
        warn!("Server error: {}", err);
        std::process::exit(1);
    });
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

    #[tokio::test]
    async fn test_root_endpoint() {
        let app = create_app();

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        
        assert!(body_str.contains("Hello World"));
        assert!(body_str.contains("Cloudflare Tunnel Example"));
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = create_app();

        let response = app
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        
        assert_eq!(json["status"], "healthy");
        assert_eq!(json["service"], "cloudflare-tunnel-example");
        assert!(json["timestamp"].is_string());
    }

    #[tokio::test]
    async fn test_security_headers() {
        let app = create_app();

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        let headers = response.headers();
        
        assert_eq!(headers.get("x-content-type-options").unwrap(), "nosniff");
        assert_eq!(headers.get("x-frame-options").unwrap(), "DENY");
        assert_eq!(headers.get("x-xss-protection").unwrap(), "1; mode=block");
        assert!(headers.get("strict-transport-security").unwrap().to_str().unwrap().contains("max-age=31536000"));
        assert!(headers.get("content-security-policy").is_some());
        assert_eq!(headers.get("referrer-policy").unwrap(), "strict-origin-when-cross-origin");
        assert_eq!(headers.get("permissions-policy").unwrap(), "geolocation=(), microphone=(), camera=()");
    }

    #[tokio::test]
    async fn test_404_not_found() {
        let app = create_app();

        let response = app
            .oneshot(Request::builder().uri("/nonexistent").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
