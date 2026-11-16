//! DOM touchpoint discovery with a deterministic unresolved fallback.

/// Value mixed when exactly one usable DOM marker cannot be found.
pub const FALLBACK_TOUCHPOINT: &str = "telemetry.unresolved.v1";

/// Chooses a tag only when the candidate list contains one usable value.
///
/// Empty, missing, duplicate and oversized markers all follow the same path,
/// allowing browser execution to continue without exposing a DOM exception.
pub fn choose_touchpoint(candidates: &[Option<String>]) -> String {
    match candidates {
        [Some(value)] if !value.is_empty() && value.len() <= 256 => value.clone(),
        _ => FALLBACK_TOUCHPOINT.to_owned(),
    }
}

/// Reads `span.telemetrics_click[data-tag]` from the active browser document.
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

/// Native fallback keeps non-browser tests independent from a JavaScript host.
#[cfg(not(target_arch = "wasm32"))]
pub fn current_touchpoint() -> String {
    FALLBACK_TOUCHPOINT.to_owned()
}
