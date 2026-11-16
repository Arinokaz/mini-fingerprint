//! Validation and owned data associated with the requested API journey.

use crate::codec::CanonicalProperties;
use crate::pulse::encode_pulse;
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

/// Owned inputs shared by every stage of one conversion run.
#[derive(Debug, Clone)]
pub struct JourneyContext {
    /// Absolute API path supplied by the Angular facade.
    journey: String,
    /// Valid DOM marker or the deterministic unresolved fallback.
    touchpoint: String,
    /// Additional properties already validated and placed in canonical order.
    properties: CanonicalProperties,
    /// Temporal window selected inside the Wasm module.
    selected_window: u64,
    /// Reversible representation mixed into the final stage and sent to PHP.
    pulse: (u32, u32),
}

impl JourneyContext {
    /// Validates environment-derived strings and precomputes the encoded pulse.
    pub fn new(
        journey: &str,
        touchpoint: &str,
        properties: CanonicalProperties,
        selected_window: u64,
    ) -> Result<Self, JourneyError> {
        validate_journey(journey)?;
        if touchpoint.is_empty() || touchpoint.len() > 256 {
            return Err(JourneyError::new(
                "touchpoint must contain 1..=256 UTF-8 bytes",
            ));
        }
        Ok(Self {
            journey: journey.to_owned(),
            touchpoint: touchpoint.to_owned(),
            properties,
            selected_window,
            pulse: encode_pulse(selected_window),
        })
    }

    /// Returns the absolute API path consumed by the journey stage.
    pub fn journey(&self) -> &str {
        &self.journey
    }

    /// Returns the selected DOM value consumed by the touchpoint stage.
    pub fn touchpoint(&self) -> &str {
        &self.touchpoint
    }

    /// Returns canonical additional properties consumed by the property stage.
    pub fn properties(&self) -> &CanonicalProperties {
        &self.properties
    }

    /// Returns the decoded window used in the pulse payload.
    pub fn selected_window(&self) -> u64 {
        self.selected_window
    }

    /// Returns the encoded words used in the pulse payload and HTTP header.
    pub fn pulse(&self) -> (u32, u32) {
        self.pulse
    }
}
