/*!
 * Configuration module for security headers and application settings
 * 
 * Provides configurable security policies that can be set via environment variables
 * or configuration files, with sensible defaults for production deployment.
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// X-Content-Type-Options header value
    pub content_type_options: String,
    
    /// X-Frame-Options header value
    pub frame_options: String,
    
    /// X-XSS-Protection header value  
    pub xss_protection: String,
    
    /// Strict-Transport-Security header configuration
    pub hsts: HstsConfig,
    
    /// Content Security Policy configuration
    pub csp: CspConfig,
    
    /// Referrer-Policy header value
    pub referrer_policy: String,
    
    /// Permissions-Policy header value
    pub permissions_policy: String,
    
    /// Server header value
    pub server_header: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HstsConfig {
    /// Max age in seconds
    pub max_age: u32,
    
    /// Include subdomains
    pub include_subdomains: bool,
    
    /// Include preload directive
    pub preload: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CspConfig {
    /// Default source directive
    pub default_src: String,
    
    /// Script source directive
    pub script_src: String,
    
    /// Style source directive
    pub style_src: String,
    
    /// Image source directive
    pub img_src: String,
    
    /// Connect source directive
    pub connect_src: String,
    
    /// Font source directive
    pub font_src: String,
    
    /// Object source directive
    pub object_src: String,
    
    /// Media source directive
    pub media_src: String,
    
    /// Frame source directive
    pub frame_src: String,
    
    /// Child source directive
    pub child_src: String,
    
    /// Worker source directive
    pub worker_src: String,
    
    /// Base URI directive
    pub base_uri: String,
    
    /// Form action directive
    pub form_action: String,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            content_type_options: "nosniff".to_string(),
            frame_options: "DENY".to_string(),
            xss_protection: "1; mode=block".to_string(),
            hsts: HstsConfig::default(),
            csp: CspConfig::default(),
            referrer_policy: "strict-origin-when-cross-origin".to_string(),
            permissions_policy: "geolocation=(), microphone=(), camera=()".to_string(),
            server_header: "cloudflare-tunnel-example".to_string(),
        }
    }
}

impl Default for HstsConfig {
    fn default() -> Self {
        Self {
            max_age: 31536000, // 1 year
            include_subdomains: true,
            preload: true,
        }
    }
}

impl Default for CspConfig {
    fn default() -> Self {
        Self {
            default_src: "'self'".to_string(),
            script_src: "'self'".to_string(),
            style_src: "'self' 'unsafe-inline'".to_string(),
            img_src: "'self' data:".to_string(),
            connect_src: "'self'".to_string(),
            font_src: "'self'".to_string(),
            object_src: "'none'".to_string(),
            media_src: "'self'".to_string(),
            frame_src: "'none'".to_string(),
            child_src: "'none'".to_string(),
            worker_src: "'none'".to_string(),
            base_uri: "'self'".to_string(),
            form_action: "'self'".to_string(),
        }
    }
}

impl SecurityConfig {
    /// Load configuration from environment variables with fallback to defaults
    pub fn from_env() -> crate::Result<Self> {
        let mut config = Self::default();
        
        // Override with environment variables if present
        if let Ok(value) = std::env::var("SECURITY_CONTENT_TYPE_OPTIONS") {
            config.content_type_options = value;
        }
        
        if let Ok(value) = std::env::var("SECURITY_FRAME_OPTIONS") {
            config.frame_options = value;
        }
        
        if let Ok(value) = std::env::var("SECURITY_XSS_PROTECTION") {
            config.xss_protection = value;
        }
        
        if let Ok(value) = std::env::var("SECURITY_HSTS_MAX_AGE") {
            config.hsts.max_age = value.parse()
                .map_err(|e| crate::ServerError::ConfigError(
                    format!("Invalid HSTS max age: {}", e)
                ))?;
        }
        
        if let Ok(value) = std::env::var("SECURITY_HSTS_INCLUDE_SUBDOMAINS") {
            config.hsts.include_subdomains = value.parse()
                .map_err(|e| crate::ServerError::ConfigError(
                    format!("Invalid HSTS include subdomains: {}", e)
                ))?;
        }
        
        if let Ok(value) = std::env::var("SECURITY_HSTS_PRELOAD") {
            config.hsts.preload = value.parse()
                .map_err(|e| crate::ServerError::ConfigError(
                    format!("Invalid HSTS preload: {}", e)
                ))?;
        }
        
        if let Ok(value) = std::env::var("SECURITY_CSP_DEFAULT_SRC") {
            config.csp.default_src = value;
        }
        
        if let Ok(value) = std::env::var("SECURITY_CSP_SCRIPT_SRC") {
            config.csp.script_src = value;
        }
        
        if let Ok(value) = std::env::var("SECURITY_CSP_STYLE_SRC") {
            config.csp.style_src = value;
        }
        
        if let Ok(value) = std::env::var("SECURITY_REFERRER_POLICY") {
            config.referrer_policy = value;
        }
        
        if let Ok(value) = std::env::var("SECURITY_PERMISSIONS_POLICY") {
            config.permissions_policy = value;
        }
        
        if let Ok(value) = std::env::var("SERVER_HEADER") {
            config.server_header = value;
        }
        
        Ok(config)
    }
    
    /// Generate HSTS header value from configuration
    pub fn hsts_header_value(&self) -> String {
        let mut parts = vec![format!("max-age={}", self.hsts.max_age)];
        
        if self.hsts.include_subdomains {
            parts.push("includeSubDomains".to_string());
        }
        
        if self.hsts.preload {
            parts.push("preload".to_string());
        }
        
        parts.join("; ")
    }
    
    /// Generate CSP header value from configuration
    pub fn csp_header_value(&self) -> String {
        vec![
            format!("default-src {}", self.csp.default_src),
            format!("script-src {}", self.csp.script_src),
            format!("style-src {}", self.csp.style_src),
            format!("img-src {}", self.csp.img_src),
            format!("connect-src {}", self.csp.connect_src),
            format!("font-src {}", self.csp.font_src),
            format!("object-src {}", self.csp.object_src),
            format!("media-src {}", self.csp.media_src),
            format!("frame-src {}", self.csp.frame_src),
            format!("child-src {}", self.csp.child_src),
            format!("worker-src {}", self.csp.worker_src),
            format!("base-uri {}", self.csp.base_uri),
            format!("form-action {}", self.csp.form_action),
        ].join("; ")
    }
    
    /// Get all headers as a HashMap for easy iteration
    pub fn to_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        
        headers.insert("X-Content-Type-Options".to_string(), self.content_type_options.clone());
        headers.insert("X-Frame-Options".to_string(), self.frame_options.clone());
        headers.insert("X-XSS-Protection".to_string(), self.xss_protection.clone());
        headers.insert("Strict-Transport-Security".to_string(), self.hsts_header_value());
        headers.insert("Content-Security-Policy".to_string(), self.csp_header_value());
        headers.insert("Referrer-Policy".to_string(), self.referrer_policy.clone());
        headers.insert("Permissions-Policy".to_string(), self.permissions_policy.clone());
        
        headers
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_security_config() {
        let config = SecurityConfig::default();
        
        assert_eq!(config.content_type_options, "nosniff");
        assert_eq!(config.frame_options, "DENY");
        assert_eq!(config.hsts.max_age, 31536000);
        assert!(config.hsts.include_subdomains);
        assert!(config.hsts.preload);
    }
    
    #[test]
    fn test_hsts_header_generation() {
        let config = SecurityConfig::default();
        let hsts = config.hsts_header_value();
        
        assert!(hsts.contains("max-age=31536000"));
        assert!(hsts.contains("includeSubDomains"));
        assert!(hsts.contains("preload"));
    }
    
    #[test]
    fn test_csp_header_generation() {
        let config = SecurityConfig::default();
        let csp = config.csp_header_value();
        
        assert!(csp.contains("default-src 'self'"));
        assert!(csp.contains("script-src 'self'"));
        assert!(csp.contains("object-src 'none'"));
    }
    
    #[test]
    fn test_minimal_hsts_config() {
        let mut config = SecurityConfig::default();
        config.hsts.include_subdomains = false;
        config.hsts.preload = false;
        
        let hsts = config.hsts_header_value();
        assert_eq!(hsts, "max-age=31536000");
    }
    
    #[test]
    fn test_headers_conversion() {
        let config = SecurityConfig::default();
        let headers = config.to_headers();
        
        assert!(headers.contains_key("X-Content-Type-Options"));
        assert!(headers.contains_key("Content-Security-Policy"));
        assert!(headers.contains_key("Strict-Transport-Security"));
        assert_eq!(headers.len(), 7); // All security headers included
    }
}