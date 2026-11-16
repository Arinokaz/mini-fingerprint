//! Eight-lane frame storage and fixed-width arithmetic.

use crate::journey::{validate_journey, JourneyError};
use crate::tables::INITIAL;

/// Adds two words modulo 2^32.
pub const fn add32(left: u32, right: u32) -> u32 {
    left.wrapping_add(right)
}

/// Subtracts two words modulo 2^32; later pulse decoding uses the same rule.
pub const fn sub32(left: u32, right: u32) -> u32 {
    left.wrapping_sub(right)
}

/// Multiplies two words modulo 2^32 without entering a wider integer type.
pub const fn mul32(left: u32, right: u32) -> u32 {
    left.wrapping_mul(right)
}

/// Rotates a word left; Rust defines rotations by zero without special cases.
pub const fn rotl32(value: u32, shift: u32) -> u32 {
    value.rotate_left(shift % 32)
}

/// Rotates a word right using the same fixed-width representation.
pub const fn rotr32(value: u32, shift: u32) -> u32 {
    value.rotate_right(shift % 32)
}

/// Mutable conversion state. Its eight lanes are serialized in index order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Frame(pub [u32; 8]);

impl Frame {
    /// Returns the eight documented initial lanes without reading browser state.
    pub const fn initial() -> Self {
        Self(INITIAL)
    }

    /// Validates an API path and creates a frame ready for the journey stage.
    ///
    /// Path absorption is deliberately performed by the versioned stage rather
    /// than hidden in this constructor.
    pub fn from_journey(journey: &str) -> Result<Self, JourneyError> {
        validate_journey(journey)?;
        Ok(Self::initial())
    }

    /// Restores a frame from fixture or intermediate-stage lanes.
    pub const fn from_lanes(lanes: [u32; 8]) -> Self {
        Self(lanes)
    }

    /// Borrows the lanes for comparisons and subsequent transformations.
    pub fn lanes(&self) -> &[u32] {
        &self.0
    }

    /// Borrows the mutable lane array used by versioned conversion stages.
    pub fn lanes_mut(&mut self) -> &mut [u32; 8] {
        &mut self.0
    }

    /// Serializes lanes as little-endian bytes and then as lowercase hex.
    pub fn to_hex(&self) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut output = String::with_capacity(64);
        for lane in self.0 {
            for byte in lane.to_le_bytes() {
                output.push(HEX[(byte >> 4) as usize] as char);
                output.push(HEX[(byte & 0x0f) as usize] as char);
            }
        }
        output
    }
}
