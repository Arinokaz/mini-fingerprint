//! Validation and owned data associated with the requested API journey.

use std::error::Error;
use std::fmt::{Display, Formatter};

/// Explains why an input cannot be used as an API journey.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JourneyError {
    /// Human-readable validation detail for maintainers and tests.
    message: String,
}

impl JourneyError {
    /// Creates a validation error without exposing a browser-specific error type.
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for JourneyError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for JourneyError {}

/// Checks the path shape shared by the browser and the PHP mirror.
///
/// Only an absolute path is accepted. Query strings and fragments are excluded
/// so the same value can be derived from the active server route.
pub fn validate_journey(journey: &str) -> Result<(), JourneyError> {
    let byte_length = journey.len();
    if byte_length == 0 || byte_length > 512 {
        return Err(JourneyError::new(
            "journey must contain 1..=512 UTF-8 bytes",
        ));
    }
    if !journey.starts_with('/') {
        return Err(JourneyError::new("journey must start with '/'"));
    }
    if journey.bytes().any(|byte| byte == 0) {
        return Err(JourneyError::new("journey must not contain NUL"));
    }
    if journey.contains(['?', '#']) {
        return Err(JourneyError::new(
            "journey must not contain a query or fragment",
        ));
    }
    Ok(())
}
