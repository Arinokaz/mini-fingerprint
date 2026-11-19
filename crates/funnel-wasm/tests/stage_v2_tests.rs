use funnel_wasm::click::ClickId;
use funnel_wasm::codec::CanonicalProperties;
use funnel_wasm::frame::Frame;
use funnel_wasm::journey::JourneyContext;
use funnel_wasm::stages::stages_v2;
use serde_json::Value;

const FIXTURES: &str = include_str!("../../../tests/fixtures/conversion-v2.json");
const STAGE_NAMES: [&str; 5] = ["journey", "touchpoint", "properties", "click", "pulse"];

fn expected_lanes(case: &Value, stage: &str) -> [u32; 8] {
    let mut lanes = [0_u32; 8];
    for (index, lane) in case["stages"][stage].as_array().unwrap().iter().enumerate() {
        lanes[index] = u32::from_str_radix(lane.as_str().unwrap(), 16).unwrap();
    }
    lanes
}

fn context(case: &Value) -> JourneyContext {
    let properties = CanonicalProperties::parse(&serde_json::to_string(&case["inputProperties"]).unwrap()).unwrap();
    JourneyContext::new(
        case["journey"].as_str().unwrap(),
        case["selectedTag"].as_str().unwrap(),
        properties,
        case["selectedTimestamp"].as_u64().unwrap(),
    )
    .unwrap()
}

#[test]
fn every_cv2_stage_matches_the_independent_golden_frames() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let click_id = ClickId::from_hex(case["clickId"].as_str().unwrap()).unwrap();
        let context = context(case);
        let mut frame = Frame::from_journey(context.journey()).unwrap();
        for (index, stage) in stages_v2(click_id).iter().enumerate() {
            stage.apply(frame.lanes_mut(), &context);
            assert_eq!(frame.lanes(), expected_lanes(case, STAGE_NAMES[index]), "case {}, stage {}", case["name"], STAGE_NAMES[index]);
        }
        assert_eq!(frame.to_hex(), case["score"].as_str().unwrap());
    }
}

#[test]
fn changing_click_id_preserves_the_shared_prefix_and_timestamp() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    let case = &fixtures["cases"][0];
    let context = context(case);
    let initial = ClickId::from_hex(case["initialClickId"].as_str().unwrap()).unwrap();
    let mut first = Frame::from_journey(context.journey()).unwrap();
    let mut second = Frame::from_journey(context.journey()).unwrap();
    for stage in stages_v2(initial).into_iter().take(3) {
        stage.apply(first.lanes_mut(), &context);
    }
    for stage in stages_v2(initial.incremented()).into_iter().take(3) {
        stage.apply(second.lanes_mut(), &context);
    }
    assert_eq!(first, second);
    assert_eq!(context.timestamp(), case["selectedTimestamp"].as_u64().unwrap());
}
