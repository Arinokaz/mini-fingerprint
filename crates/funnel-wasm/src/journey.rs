//! Проверка API-пути и owned-данные одного conversion-вызова.

use crate::codec::CanonicalProperties;
use crate::pulse::encode_pulse;
use std::error::Error;
use std::fmt::{Display, Formatter};

/// Описывает причину, по которой вход нельзя использовать как API journey.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JourneyError {
    /// Человекочитаемая деталь для сопровождения и тестов.
    message: String,
}

impl JourneyError {
    /// Создаёт validation error без привязки к browser-specific error type.
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

/// Проверяет форму пути, общую для браузерной реализации и будущего PHP mirror.
///
/// Принимается только абсолютный путь. Query и fragment исключаются, чтобы
/// сервер мог однозначно получить то же значение из активного маршрута.
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

/// Owned-входы, совместно используемые всеми стадиями одного вычисления.
#[derive(Debug, Clone)]
pub struct JourneyContext {
    /// Абсолютный API-путь, полученный от Angular-фасада.
    journey: String,
    /// Действительный DOM marker либо детерминированный unresolved fallback.
    touchpoint: String,
    /// Проверенные дополнительные свойства в каноническом порядке.
    properties: CanonicalProperties,
    /// Точный Unix timestamp текущей секунды, полученный внутри WASM.
    timestamp: u64,
    /// Обратимое представление для последней стадии и HTTP-заголовка.
    pulse: (u32, u32),
}

impl JourneyContext {
    /// Проверяет environment-строки и заранее вычисляет encoded pulse.
    pub fn new(
        journey: &str,
        touchpoint: &str,
        properties: CanonicalProperties,
        timestamp: u64,
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
            timestamp,
            pulse: encode_pulse(timestamp),
        })
    }

    /// Возвращает абсолютный API-путь для journey-стадии.
    pub fn journey(&self) -> &str {
        &self.journey
    }

    /// Возвращает выбранный DOM marker для touchpoint-стадии.
    pub fn touchpoint(&self) -> &str {
        &self.touchpoint
    }

    /// Возвращает канонические свойства для property-стадии.
    pub fn properties(&self) -> &CanonicalProperties {
        &self.properties
    }

    /// Возвращает decoded timestamp, используемый в pulse payload.
    pub fn timestamp(&self) -> u64 {
        self.timestamp
    }

    /// Возвращает encoded words для pulse payload и HTTP-заголовка.
    pub fn pulse(&self) -> (u32, u32) {
        self.pulse
    }
}
