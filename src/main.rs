use axum::{
    extract::Host,
    http::{header, HeaderValue, Request},
    middleware,
    response::{Html, Json, Response, IntoResponse},
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

    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_check))
        .layer(
            ServiceBuilder::new()
                .layer(middleware::from_fn(security_headers))
                .layer(SetResponseHeaderLayer::if_not_present(
                    header::SERVER,
                    HeaderValue::from_static("cloudflare-tunnel-example"),
                )),
        );

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    axum::serve(listener, app).await.unwrap_or_else(|err| {
        warn!("Server error: {}", err);
        std::process::exit(1);
    });
}

async fn root_handler(Host(hostname): Host) -> axum::response::Result<axum::response::Response> {
    info!("Root handler called with hostname: {}", hostname);
    if hostname.starts_with("health.") {
        info!("Routing to health check");
        Ok(health_check().await.into_response())
    } else {
        info!("Routing to hello world");
        Ok(hello_world().await.into_response())
    }
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
