//! Strict parsing and canonical encoding for additional telemetry properties.

use serde_json::Value;
use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter, Write};

/// Maximum accepted JSON payload size in bytes.
const MAX_JSON_BYTES: usize = 4096;
/// Maximum number of `[name, value]` pairs.
const MAX_PROPERTIES: usize = 32;
/// Maximum ASCII property-name length.
const MAX_NAME_BYTES: usize = 64;
/// Maximum UTF-8 property-value length.
const MAX_VALUE_BYTES: usize = 512;
/// Names reserved for context supplied outside the additional-property bag.
const RESERVED_NAMES: [&str; 4] = ["sys.journey", "sys.touchpoint", "sys.pulse", "sys.profile"];

/// Describes a malformed property payload without panicking in Wasm.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PropertyError {
    /// Validation detail intended for logs and developer-facing tests.
    message: String,
}

impl PropertyError {
    /// Builds an error with a stable, specific validation message.
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for PropertyError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for PropertyError {}

/// Owned, validated properties kept in canonical name order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalProperties {
    /// Sorted pairs; ownership prevents borrowed JSON lifetimes crossing Wasm calls.
    pairs: Vec<(String, String)>,
}

impl CanonicalProperties {
    /// Parses a JSON pair array, validates every item and sorts it by name.
    pub fn parse(input: &str) -> Result<Self, PropertyError> {
        if input.len() > MAX_JSON_BYTES {
            return Err(PropertyError::new("property JSON exceeds 4096 bytes"));
        }

        let document: Value = serde_json::from_str(input)
            .map_err(|error| PropertyError::new(format!("invalid property JSON: {error}")))?;
        let entries = document
            .as_array()
            .ok_or_else(|| PropertyError::new("properties must be a JSON array"))?;
        if entries.len() > MAX_PROPERTIES {
            return Err(PropertyError::new("too many properties"));
        }

        let mut pairs = Vec::with_capacity(entries.len());
        let mut names = BTreeSet::new();
        for entry in entries {
            let pair = entry
                .as_array()
                .filter(|pair| pair.len() == 2)
                .ok_or_else(|| PropertyError::new("every property must be a two-item array"))?;
            let name = pair[0]
                .as_str()
                .ok_or_else(|| PropertyError::new("property name must be a string"))?;
            let value = pair[1]
                .as_str()
                .ok_or_else(|| PropertyError::new("property value must be a string"))?;

            validate_name(name)?;
            if value.len() > MAX_VALUE_BYTES {
                return Err(PropertyError::new("property value exceeds 512 UTF-8 bytes"));
            }
            if !names.insert(name.to_owned()) {
                return Err(PropertyError::new("duplicate property name"));
            }
            pairs.push((name.to_owned(), value.to_owned()));
        }

        pairs.sort_by(|left, right| left.0.as_bytes().cmp(right.0.as_bytes()));
        Ok(Self { pairs })
    }

    /// Returns compact canonical JSON with deterministic escaping and UTF-8.
    pub fn canonical_json(&self) -> String {
        let mut output = String::from("[");
        for (index, (name, value)) in self.pairs.iter().enumerate() {
            if index > 0 {
                output.push(',');
            }
            output.push('[');
            write_json_string(&mut output, name);
            output.push(',');
            write_json_string(&mut output, value);
            output.push(']');
        }
        output.push(']');
        output
    }

    /// Appends length-prefixed names and values in canonical order.
    pub fn write_bytes(&self, output: &mut Vec<u8>) {
        for (name, value) in &self.pairs {
            append_length_prefixed(output, name.as_bytes());
            append_length_prefixed(output, value.as_bytes());
        }
    }
}

/// Validates the restricted ASCII name grammar and reserved namespace.
fn validate_name(name: &str) -> Result<(), PropertyError> {
    if name.is_empty() || name.len() > MAX_NAME_BYTES {
        return Err(PropertyError::new(
            "property name must contain 1..=64 bytes",
        ));
    }
    if !name.bytes().all(|byte| {
        byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'_' | b'.' | b'-')
    }) {
        return Err(PropertyError::new(
            "property name contains unsupported characters",
        ));
    }
    if RESERVED_NAMES.contains(&name) {
        return Err(PropertyError::new("property name is reserved"));
    }
    Ok(())
}

/// Appends a 32-bit little-endian byte length followed by the original bytes.
fn append_length_prefixed(output: &mut Vec<u8>, bytes: &[u8]) {
    output.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    output.extend_from_slice(bytes);
}

/// Writes one JSON string without escaping non-ASCII text or the solidus.
fn write_json_string(output: &mut String, value: &str) {
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{08}' => output.push_str("\\b"),
            '\t' => output.push_str("\\t"),
            '\n' => output.push_str("\\n"),
            '\u{0c}' => output.push_str("\\f"),
            '\r' => output.push_str("\\r"),
            control if control <= '\u{1f}' => {
                write!(output, "\\u{:04x}", control as u32).expect("String formatting cannot fail");
            }
            other => output.push(other),
        }
    }
    output.push('"');
}
