//! Нейтральный 128-битный идентификатор события и правила отбора score.

use std::error::Error;
use std::fmt::{Display, Formatter};

/// Ошибка формата идентификатора или настройки префикса.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClickIdError {
    message: String,
}

impl ClickIdError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for ClickIdError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for ClickIdError {}

/// Четыре little-endian слова одного clickId.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClickId(pub [u32; 4]);

impl ClickId {
    /// Сохраняет слова в порядке, определённом контрактом cv2.
    pub const fn from_words(words: [u32; 4]) -> Self {
        Self(words)
    }

    /// Возвращает шестнадцать байт от младшего слова к старшему.
    pub const fn to_le_bytes(self) -> [u8; 16] {
        let mut output = [0_u8; 16];
        let mut word_index = 0;
        while word_index < 4 {
            let bytes = self.0[word_index].to_le_bytes();
            let mut byte_index = 0;
            while byte_index < 4 {
                output[word_index * 4 + byte_index] = bytes[byte_index];
                byte_index += 1;
            }
            word_index += 1;
        }
        output
    }

    /// Увеличивает 128-битное значение с переносом и полным wrap.
    pub const fn incremented(self) -> Self {
        let mut words = self.0;
        let mut index = 0;
        while index < 4 {
            let (next, carry) = words[index].overflowing_add(1);
            words[index] = next;
            if !carry {
                break;
            }
            index += 1;
        }
        Self(words)
    }

    /// Разбирает ровно 32 строчных hex-символа в little-endian байты.
    pub fn from_hex(value: &str) -> Result<Self, ClickIdError> {
        if value.len() != 32 || !value.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()) {
            return Err(ClickIdError::new("clickId must contain 32 lowercase hex characters"));
        }
        let mut bytes = [0_u8; 16];
        for (index, byte) in bytes.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
                .map_err(|_| ClickIdError::new("clickId contains invalid hex"))?;
        }
        let mut words = [0_u32; 4];
        for (index, word) in words.iter_mut().enumerate() {
            let offset = index * 4;
            *word = u32::from_le_bytes([
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3],
            ]);
        }
        Ok(Self(words))
    }

    /// Сериализует шестнадцать байт как 32 строчных hex-символа.
    pub fn to_hex(self) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut output = String::with_capacity(32);
        for byte in self.to_le_bytes() {
            output.push(HEX[(byte >> 4) as usize] as char);
            output.push(HEX[(byte & 0x0f) as usize] as char);
        }
        output
    }
}

/// Разрешает только пустой префикс или от одного до трёх нулей.
pub fn validate_score_prefix(value: &str) -> Result<(), ClickIdError> {
    if value.len() <= 3 && value.bytes().all(|byte| byte == b'0') {
        return Ok(());
    }
    Err(ClickIdError::new(
        "scorePrefix must contain between zero and three zero characters",
    ))
}

/// Формирует начальный идентификатор из обычных браузерных источников.
#[cfg(target_arch = "wasm32")]
pub fn next_browser_click_id(now_milliseconds: f64) -> ClickId {
    use std::cell::Cell;
    use web_sys::window;

    thread_local! {
        static CALL_COUNTER: Cell<u32> = const { Cell::new(0) };
    }

    let counter = CALL_COUNTER.with(|current| {
        let value = current.get();
        current.set(value.wrapping_add(1));
        value
    });
    let random_word = || (js_sys::Math::random() * 4_294_967_296.0).floor() as u32;
    let now = now_milliseconds.floor() as u64;
    let performance_micros = window()
        .and_then(|browser| browser.performance())
        .map(|performance| performance.now() * 1000.0)
        .unwrap_or(0.0)
        .floor() as u64;

    ClickId::from_words([
        random_word() ^ now as u32,
        random_word() ^ ((now >> 32) as u32),
        random_word() ^ performance_micros as u32,
        random_word() ^ counter,
    ])
}
