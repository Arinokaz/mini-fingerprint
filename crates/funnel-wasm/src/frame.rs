//! Хранение восьми lane и арифметика фиксированной 32-bit ширины.

use crate::journey::{validate_journey, JourneyError};
use crate::tables::INITIAL;

/// Складывает два words modulo 2^32.
pub const fn add32(left: u32, right: u32) -> u32 {
    left.wrapping_add(right)
}

/// Вычитает words modulo 2^32; то же правило используется при pulse decoding.
pub const fn sub32(left: u32, right: u32) -> u32 {
    left.wrapping_sub(right)
}

/// Умножает words modulo 2^32 без перехода к более широкому integer type.
pub const fn mul32(left: u32, right: u32) -> u32 {
    left.wrapping_mul(right)
}

/// Циклически сдвигает word влево; нулевой сдвиг определён стандартным Rust.
pub const fn rotl32(value: u32, shift: u32) -> u32 {
    value.rotate_left(shift % 32)
}

/// Циклически сдвигает word вправо в том же fixed-width представлении.
pub const fn rotr32(value: u32, shift: u32) -> u32 {
    value.rotate_right(shift % 32)
}

/// Изменяемое conversion-состояние; lanes сериализуются в порядке индексов.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Frame(pub [u32; 8]);

impl Frame {
    /// Возвращает восемь начальных lanes без чтения browser state.
    pub const fn initial() -> Self {
        Self(INITIAL)
    }

    /// Проверяет API-путь и создаёт frame, готовый к journey-стадии.
    ///
    /// Поглощение пути намеренно выполняется versioned stage, а не скрывается
    /// в constructor: так порядок операций остаётся явным и тестируемым.
    pub fn from_journey(journey: &str) -> Result<Self, JourneyError> {
        validate_journey(journey)?;
        Ok(Self::initial())
    }

    /// Восстанавливает frame из fixture или промежуточных lanes.
    pub const fn from_lanes(lanes: [u32; 8]) -> Self {
        Self(lanes)
    }

    /// Возвращает read-only lanes для сравнений и последующих преобразований.
    pub fn lanes(&self) -> &[u32] {
        &self.0
    }

    /// Возвращает mutable lane array, изменяемый versioned stages.
    pub fn lanes_mut(&mut self) -> &mut [u32; 8] {
        &mut self.0
    }

    /// Сериализует lanes как little-endian bytes и затем как lowercase hex.
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
