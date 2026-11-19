//! Чистые conversion-примитивы, используемые браузерным telemetry-фасадом.

pub mod click;
pub mod codec;
pub mod frame;
pub mod journey;
pub mod pulse;
pub mod sampling;
pub mod stages;
pub mod tables;
pub mod touchpoint;

/// Выполняет текущее conversion-вычисление полностью внутри браузерного модуля.
///
/// Фасад передаёт только API-путь, дополнительные свойства и настройку prefix.
/// Время, DOM и начальный clickId получаются здесь, поэтому TypeScript не
/// предоставляет доверенный timestamp или отправную точку перебора.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn calculate_funnel_score(
    journey: &str,
    properties_json: &str,
    score_prefix: &str,
) -> Result<String, wasm_bindgen::JsValue> {
    use crate::click::{next_browser_click_id, validate_score_prefix};
    use crate::codec::CanonicalProperties;
    use crate::journey::JourneyContext;
    use crate::pulse::pulse_to_hex;
    use crate::sampling::sample_v2;
    use crate::touchpoint::current_touchpoint;
    use serde_json::{json, Value};
    use wasm_bindgen::JsValue;

    validate_score_prefix(score_prefix)
        .map_err(|_| JsValue::from_str("unsupported conversion settings"))?;
    let properties = CanonicalProperties::parse(properties_json)
        .map_err(|_| JsValue::from_str("unsupported conversion properties"))?;
    let canonical_json = properties.canonical_json();
    let now_milliseconds = js_sys::Date::now();
    if !now_milliseconds.is_finite() || now_milliseconds < 0.0 {
        return Err(JsValue::from_str("runtime clock unavailable"));
    }
    let now_seconds = (now_milliseconds / 1000.0) as u64;
    let context = JourneyContext::new(journey, &current_touchpoint(), properties, now_seconds)
        .map_err(|_| JsValue::from_str("unsupported conversion context"))?;
    let initial = next_browser_click_id(now_milliseconds);
    let sample = sample_v2(&context, initial, score_prefix)
        .map_err(|_| JsValue::from_str("unsupported conversion settings"))?;

    let property_value: Value = serde_json::from_str(&canonical_json)
        .map_err(|_| JsValue::from_str("conversion property encoding failed"))?;
    let result = json!({
        "profile": "cv2",
        "clickId": sample.click_id.to_hex(),
        "pulse": pulse_to_hex(context.pulse()),
        "score": sample.score,
        "properties": property_value,
    });
    Ok(result.to_string())
}
