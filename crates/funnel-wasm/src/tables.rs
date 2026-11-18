//! Фиксированные константы всех детерминированных frame-операций.
//!
//! Любое изменение таблиц меняет score и требует синхронного обновления
//! контракта, fixtures и независимой серверной реализации.

/// Восемь начальных 32-bit lanes профиля `cv1`.
pub const INITIAL: [u32; 8] = [
    0x243f_6a88,
    0x85a3_08d3,
    0x1319_8a2e,
    0x0370_7344,
    0xa409_3822,
    0x299f_31d0,
    0x082e_fa98,
    0xec4e_6c89,
];

/// Нечётные multipliers для absorb- и diffuse-операций.
pub const MULTIPLIERS: [u32; 8] = [
    0x9e37_79b1,
    0x85eb_ca6b,
    0xc2b2_ae35,
    0x27d4_eb2f,
    0x1656_67b1,
    0xd3a2_646d,
    0xfd70_46c5,
    0xb55a_4f09,
];

/// Additive masks, применяемые после rotations в absorb/diffuse rounds.
pub const ADDITIVES: [u32; 8] = [
    0x7f4a_7c15,
    0x6a09_e667,
    0xbb67_ae85,
    0x3c6e_f372,
    0xa54f_f53a,
    0x510e_527f,
    0x1f83_d9ab,
    0x5be0_cd19,
];

/// Cross-lane read order каждого diffuse-раунда.
pub const PERMUTATION: [usize; 8] = [3, 7, 1, 6, 0, 4, 2, 5];

/// Шестнадцать substitutions для независимой обработки двух nibbles byte.
pub const SUBSTITUTION: [u8; 16] = [6, 11, 3, 13, 8, 0, 15, 5, 10, 2, 12, 7, 1, 14, 4, 9];
