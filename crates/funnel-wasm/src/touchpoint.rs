//! Поиск DOM touchpoint с детерминированным unresolved fallback.

/// Значение, используемое при отсутствии ровно одного пригодного DOM marker.
pub const FALLBACK_TOUCHPOINT: &str = "telemetry.unresolved.v1";

/// Выбирает tag только при наличии одного пригодного candidate.
///
/// Empty, missing, duplicate и oversized markers используют один путь fallback.
/// Браузерное вычисление продолжается без DOM-исключения, но будущая demo
/// PHP-проверка обязана отклонять fallback-результат вместо ожидаемого tag.
pub fn choose_touchpoint(candidates: &[Option<String>]) -> String {
    match candidates {
        [Some(value)] if !value.is_empty() && value.len() <= 256 => value.clone(),
        _ => FALLBACK_TOUCHPOINT.to_owned(),
    }
}

/// Читает `span.telemetrics_click[data-tag]` из активного browser document.
#[cfg(target_arch = "wasm32")]
pub fn current_touchpoint() -> String {
    use wasm_bindgen::JsCast;
    use web_sys::{window, Element};

    let Some(window) = window() else {
        return FALLBACK_TOUCHPOINT.to_owned();
    };
    let Some(document) = window.document() else {
        return FALLBACK_TOUCHPOINT.to_owned();
    };
    let Ok(nodes) = document.query_selector_all("span.telemetrics_click") else {
        return FALLBACK_TOUCHPOINT.to_owned();
    };

    let mut candidates = Vec::with_capacity(nodes.length() as usize);
    for index in 0..nodes.length() {
        let value = nodes
            .item(index)
            .and_then(|node| node.dyn_into::<Element>().ok())
            .and_then(|element| element.get_attribute("data-tag"));
        candidates.push(value);
    }
    choose_touchpoint(&candidates)
}

/// Native fallback позволяет тестам работать без JavaScript host.
#[cfg(not(target_arch = "wasm32"))]
pub fn current_touchpoint() -> String {
    FALLBACK_TOUCHPOINT.to_owned()
}
