//! Reversible temporal-window encoding and client boundary selection.

use crate::frame::{add32, rotl32, sub32};

/// Width of one accepted temporal interval in seconds.
const INTERVAL_SECONDS: u64 = 180;
/// Client switches to the next interval strictly inside this boundary.
const BOUNDARY_SECONDS: u64 = 15;
/// First XOR mask applied to the low temporal word.
const KEY_0: u32 = 0xa53c_9e17;
/// Second XOR mask applied to the high temporal word.
const KEY_1: u32 = 0x6d2b_79f5;
/// Output whitening mask for the first encoded word.
const ADD_0: u32 = 0x9e37_79b9;
/// Output whitening mask for the second encoded word.
const ADD_1: u32 = 0x7f4a_7c15;

/// Chooses the current or next 180-second window using the 15-second buffer.
pub const fn select_window(now_seconds: u64) -> u64 {
    let current = (now_seconds / INTERVAL_SECONDS) * INTERVAL_SECONDS;
    let end = current + INTERVAL_SECONDS;
    if end - now_seconds < BOUNDARY_SECONDS {
        end
    } else {
        current
    }
}

/// Encodes a 64-bit window with two reversible fixed-width Feistel rounds.
pub const fn encode_pulse(window: u64) -> (u32, u32) {
    let a = (window as u32) ^ KEY_0;
    let b = ((window >> 32) as u32) ^ KEY_1;
    let c = add32(a, rotl32(b, 7));
    let d = b;
    let e = c;
    let f = add32(d, rotl32(c, 13));
    (e ^ ADD_0, f ^ ADD_1)
}

/// Restores the original 64-bit window by applying inverse steps in reverse.
pub const fn decode_pulse(parts: (u32, u32)) -> u64 {
    let e = parts.0 ^ ADD_0;
    let f = parts.1 ^ ADD_1;
    let d = sub32(f, rotl32(e, 13));
    let c = e;
    let a = sub32(c, rotl32(d, 7));
    let b = d;
    let low = a ^ KEY_0;
    let high = b ^ KEY_1;
    (low as u64) | ((high as u64) << 32)
}

/// Serializes two encoded words as 16 lowercase hexadecimal characters.
pub fn pulse_to_hex(parts: (u32, u32)) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(16);
    for word in [parts.0, parts.1] {
        for byte in word.to_le_bytes() {
            output.push(HEX[(byte >> 4) as usize] as char);
            output.push(HEX[(byte & 0x0f) as usize] as char);
        }
    }
    output
}
