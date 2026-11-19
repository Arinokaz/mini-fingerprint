use funnel_wasm::click::ClickId;
use funnel_wasm::codec::CanonicalProperties;
use funnel_wasm::journey::JourneyContext;
use funnel_wasm::sampling::sample_v2;
use serde_json::Value;

const FIXTURES: &str = include_str!("../../../tests/fixtures/conversion-v2.json");

#[test]
fn deterministic_search_matches_every_golden_sample() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let properties = CanonicalProperties::parse(&serde_json::to_string(&case["inputProperties"]).unwrap()).unwrap();
        let context = JourneyContext::new(
            case["journey"].as_str().unwrap(),
            case["selectedTag"].as_str().unwrap(),
            properties,
            case["selectedTimestamp"].as_u64().unwrap(),
        )
        .unwrap();
        let initial = ClickId::from_hex(case["initialClickId"].as_str().unwrap()).unwrap();
        let prefix = case["scorePrefix"].as_str().unwrap();
        let sample = sample_v2(&context, initial, prefix).unwrap();
        assert_eq!(sample.click_id.to_hex(), case["clickId"].as_str().unwrap(), "case {}", case["name"]);
        assert_eq!(sample.score, case["score"].as_str().unwrap(), "case {}", case["name"]);
        assert_eq!(sample.attempts, case["attempts"].as_u64().unwrap(), "case {}", case["name"]);
        assert!(sample.score.starts_with(prefix));
        if prefix.is_empty() {
            assert_eq!(sample.attempts, 1);
        }
    }
}
