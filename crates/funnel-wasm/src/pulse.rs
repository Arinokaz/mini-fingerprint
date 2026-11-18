//! Обратимое кодирование Unix timestamp в секундах.

use crate::frame::{add32, rotl32, sub32};

/// Первая XOR-маска младшего временного слова.
const KEY_0: u32 = 0xa53c_9e17;
/// Вторая XOR-маска старшего временного слова.
const KEY_1: u32 = 0x6d2b_79f5;
/// Output-маска первого encoded word.
const ADD_0: u32 = 0x9e37_79b9;
/// Output-маска второго encoded word.
const ADD_1: u32 = 0x7f4a_7c15;

/// Кодирует 64-bit timestamp двумя обратимыми fixed-width Feistel-раундами.
pub const fn encode_pulse(timestamp: u64) -> (u32, u32) {
    let a = (timestamp as u32) ^ KEY_0;
    let b = ((timestamp >> 32) as u32) ^ KEY_1;
    let c = add32(a, rotl32(b, 7));
    let d = b;
    let e = c;
    let f = add32(d, rotl32(c, 13));
    (e ^ ADD_0, f ^ ADD_1)
}

/// Восстанавливает исходное 64-bit timestamp обратными шагами в обратном порядке.
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

/// Сериализует два encoded words как 16 строчных hex-символов.
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
