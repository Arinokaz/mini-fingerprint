use funnel_wasm::codec::CanonicalProperties;
use funnel_wasm::frame::Frame;
use funnel_wasm::journey::JourneyContext;
use funnel_wasm::stages::stages_v1;
use serde_json::Value;
use std::time::Instant;

const FIXTURES: &str = include_str!("../../../tests/fixtures/conversion-v1.json");
const STAGE_NAMES: [&str; 4] = ["journey", "touchpoint", "properties", "pulse"];

fn expected_lanes(case: &Value, stage: &str) -> [u32; 8] {
    let mut lanes = [0_u32; 8];
    for (index, lane) in case["stages"][stage].as_array().unwrap().iter().enumerate() {
        lanes[index] = u32::from_str_radix(lane.as_str().unwrap(), 16).unwrap();
    }
    lanes
}

#[test]
fn every_stage_matches_the_independent_golden_frames() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let properties =
            CanonicalProperties::parse(&serde_json::to_string(&case["inputProperties"]).unwrap())
                .unwrap();
        let context = JourneyContext::new(
            case["journey"].as_str().unwrap(),
            case["selectedTag"].as_str().unwrap(),
            properties,
            case["selectedTimestamp"].as_u64().unwrap(),
        )
        .unwrap();
        let mut frame = Frame::from_journey(context.journey()).unwrap();

        for (index, stage) in stages_v1().iter().enumerate() {
            stage.apply(frame.lanes_mut(), &context);
            assert_eq!(
                frame.lanes(),
                expected_lanes(case, STAGE_NAMES[index]),
                "case {}, stage {}",
                case["name"].as_str().unwrap(),
                STAGE_NAMES[index]
            );
        }
        assert_eq!(frame.to_hex(), case["score"].as_str().unwrap());
    }
}

#[test]
fn native_stage_pipeline_stays_within_the_mvp_time_budget() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    let case = &fixtures["cases"][0];
    let properties =
        CanonicalProperties::parse(&serde_json::to_string(&case["inputProperties"]).unwrap())
            .unwrap();
    let context = JourneyContext::new(
        case["journey"].as_str().unwrap(),
        case["selectedTag"].as_str().unwrap(),
        properties,
        case["selectedTimestamp"].as_u64().unwrap(),
    )
    .unwrap();
    let mut durations = Vec::with_capacity(201);

    for _ in 0..201 {
        let started = Instant::now();
        let mut frame = Frame::from_journey(context.journey()).unwrap();
        for stage in stages_v1() {
            stage.apply(frame.lanes_mut(), &context);
        }
        assert_eq!(frame.to_hex(), case["score"].as_str().unwrap());
        durations.push(started.elapsed());
    }
    durations.sort();
    assert!(
        durations[100].as_millis() < 10,
        "median stage time exceeded 10 ms: {:?}",
        durations[100]
    );
}

#[test]
fn repeated_application_uses_no_hidden_global_state() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    let case = &fixtures["cases"][0];
    let properties =
        CanonicalProperties::parse(&serde_json::to_string(&case["inputProperties"]).unwrap())
            .unwrap();
    let context = JourneyContext::new(
        case["journey"].as_str().unwrap(),
        case["selectedTag"].as_str().unwrap(),
        properties,
        case["selectedTimestamp"].as_u64().unwrap(),
    )
    .unwrap();

    for _ in 0..100 {
        let mut frame = Frame::from_journey(context.journey()).unwrap();
        for stage in stages_v1() {
            stage.apply(frame.lanes_mut(), &context);
        }
        assert_eq!(frame.to_hex(), case["score"].as_str().unwrap());
    }
}
