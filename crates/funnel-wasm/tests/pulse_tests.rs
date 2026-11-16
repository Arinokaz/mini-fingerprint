use funnel_wasm::frame::rotl32;
use funnel_wasm::pulse::{decode_pulse, encode_pulse, pulse_to_hex, select_window};
use serde_json::Value;

const FIXTURES: &str = include_str!("../../../tests/fixtures/conversion-v1.json");

fn fixture_pulse(value: &str) -> (u32, u32) {
    assert_eq!(value.len(), 16);
    let read_lane = |offset: usize| {
        let mut bytes = [0_u8; 4];
        for (index, byte) in bytes.iter_mut().enumerate() {
            *byte =
                u8::from_str_radix(&value[offset + index * 2..offset + index * 2 + 2], 16).unwrap();
        }
        u32::from_le_bytes(bytes)
    };
    (read_lane(0), read_lane(8))
}

#[test]
fn golden_pulses_encode_and_decode_without_loss() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let window = case["selectedWindow"].as_u64().unwrap();
        let expected = fixture_pulse(case["pulse"].as_str().unwrap());
        assert_eq!(
            encode_pulse(window),
            expected,
            "case {}",
            case["name"].as_str().unwrap()
        );
        assert_eq!(decode_pulse(expected), window);
        assert_eq!(pulse_to_hex(expected), case["pulse"].as_str().unwrap());
    }
}

#[test]
fn client_window_boundary_is_strictly_less_than_fifteen_seconds() {
    let current = 1_700_000_000_u64 / 180 * 180;
    let end = current + 180;
    assert_eq!(select_window(end - 15), current);
    assert_eq!(select_window(end - 14), end);
    assert_eq!(select_window(end - 1), end);
    assert_eq!(select_window(end), end);
}

#[test]
fn ten_thousand_deterministic_windows_round_trip() {
    let mut lane = 0x6d2b_79f5_u32;
    for index in 0..10_000_u64 {
        lane = lane.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let window = (index << 32) | u64::from(rotl32(lane, index as u32));
        assert_eq!(
            decode_pulse(encode_pulse(window)),
            window,
            "window {window}"
        );
    }
}
