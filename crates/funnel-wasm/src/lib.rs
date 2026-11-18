//! Чистые conversion-примитивы, используемые браузерным telemetry-фасадом.

pub mod codec;
pub mod frame;
pub mod journey;
pub mod pulse;
pub mod stages;
pub mod tables;
pub mod touchpoint;

/// Выполняет текущее conversion-вычисление полностью внутри браузерного модуля.
///
/// Фасад передаёт только API-путь и дополнительные свойства. Время и DOM
/// получаются здесь, поэтому TypeScript не предоставляет доверенный timestamp.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn calculate_funnel_score(
    journey: &str,
    properties_json: &str,
) -> Result<String, wasm_bindgen::JsValue> {
    use crate::codec::CanonicalProperties;
    use crate::frame::Frame;
    use crate::journey::JourneyContext;
    use crate::pulse::{pulse_to_hex, select_window};
    use crate::stages::stages_v1;
    use crate::touchpoint::current_touchpoint;
    use serde_json::{json, Value};
    use wasm_bindgen::JsValue;

    let properties = CanonicalProperties::parse(properties_json)
        .map_err(|_| JsValue::from_str("unsupported conversion properties"))?;
    let canonical_json = properties.canonical_json();
    let now_milliseconds = js_sys::Date::now();
    if !now_milliseconds.is_finite() || now_milliseconds < 0.0 {
        return Err(JsValue::from_str("runtime clock unavailable"));
    }
    let now_seconds = (now_milliseconds / 1000.0) as u64;
    let selected_window = select_window(now_seconds);
    let context = JourneyContext::new(journey, &current_touchpoint(), properties, selected_window)
        .map_err(|_| JsValue::from_str("unsupported conversion context"))?;

    let mut frame = Frame::from_journey(context.journey())
        .map_err(|_| JsValue::from_str("unsupported conversion journey"))?;
    // Порядок стадий является частью контракта cv1 и не должен меняться независимо.
    for stage in stages_v1() {
        stage.apply(frame.lanes_mut(), &context);
    }

    let property_value: Value = serde_json::from_str(&canonical_json)
        .map_err(|_| JsValue::from_str("conversion property encoding failed"))?;
    let result = json!({
        "profile": "cv1",
        "pulse": pulse_to_hex(context.pulse()),
        "score": frame.to_hex(),
        "properties": property_value,
    });
    Ok(result.to_string())
}
