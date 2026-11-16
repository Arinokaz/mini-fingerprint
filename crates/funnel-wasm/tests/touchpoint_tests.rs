use funnel_wasm::touchpoint::{choose_touchpoint, FALLBACK_TOUCHPOINT};

#[test]
fn one_non_empty_tag_is_selected() {
    let candidates = vec![Some("dsf3fdfgdfg".to_owned())];
    assert_eq!(choose_touchpoint(&candidates), "dsf3fdfgdfg");
}

#[test]
fn missing_empty_duplicate_and_oversized_candidates_use_fallback() {
    let cases = [
        vec![],
        vec![None],
        vec![Some(String::new())],
        vec![Some("first".to_owned()), Some("second".to_owned())],
        vec![Some("x".repeat(257))],
    ];

    for candidates in cases {
        assert_eq!(choose_touchpoint(&candidates), FALLBACK_TOUCHPOINT);
    }
}

#[test]
fn a_256_byte_tag_remains_valid() {
    let candidates = vec![Some("я".repeat(128))];
    assert_eq!(choose_touchpoint(&candidates), "я".repeat(128));
}
