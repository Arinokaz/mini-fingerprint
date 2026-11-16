use funnel_wasm::frame::{add32, mul32, rotl32, Frame};
use serde_json::Value;

const FIXTURES: &str = include_str!("../../../tests/fixtures/conversion-v1.json");

fn word(value: &str) -> u32 {
    u32::from_str_radix(value, 16).expect("fixture contains a u32 word")
}

#[test]
fn arithmetic_matches_independent_vectors() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    for vector in fixtures["arithmetic"].as_array().unwrap() {
        let a = word(vector["a"].as_str().unwrap());
        let expected = word(vector["result"].as_str().unwrap());
        let actual = match vector["operation"].as_str().unwrap() {
            "add32" => add32(a, word(vector["b"].as_str().unwrap())),
            "mul32" => mul32(a, word(vector["b"].as_str().unwrap())),
            "rotl32" => rotl32(a, vector["b"].as_u64().unwrap() as u32),
            operation => panic!("unknown fixture operation {operation}"),
        };
        assert_eq!(actual, expected, "vector {vector}");
    }
}

#[test]
fn final_lanes_serialize_to_the_golden_score() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let mut lanes = [0_u32; 8];
        for (index, lane) in case["stages"]["pulse"]
            .as_array()
            .unwrap()
            .iter()
            .enumerate()
        {
            lanes[index] = word(lane.as_str().unwrap());
        }
        assert_eq!(
            Frame::from_lanes(lanes).to_hex(),
            case["score"].as_str().unwrap(),
            "case {}",
            case["name"].as_str().unwrap()
        );
    }
}

#[test]
fn a_valid_journey_starts_with_the_documented_initial_frame() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    let expected: Vec<u32> = fixtures["constants"]["initial"]
        .as_array()
        .unwrap()
        .iter()
        .map(|lane| word(lane.as_str().unwrap()))
        .collect();

    let frame = Frame::from_journey("/api/auth/login").unwrap();
    assert_eq!(frame.lanes(), expected.as_slice());
}

#[test]
fn malformed_api_paths_are_rejected_before_mixing() {
    for journey in [
        "",
        "api/auth/login",
        "/api/auth/login?source=bot",
        "/api/auth/login#form",
    ] {
        assert!(
            Frame::from_journey(journey).is_err(),
            "accepted {journey:?}"
        );
    }
    assert!(Frame::from_journey(&format!("/{}", "a".repeat(512))).is_err());
}
