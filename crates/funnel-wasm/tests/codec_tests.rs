use funnel_wasm::codec::CanonicalProperties;
use serde_json::Value;

const FIXTURES: &str = include_str!("../../../tests/fixtures/conversion-v1.json");

fn bytes_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn canonical_properties_match_every_golden_fixture() {
    let fixtures: Value = serde_json::from_str(FIXTURES).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let input = serde_json::to_string(&case["inputProperties"]).unwrap();
        let properties = CanonicalProperties::parse(&input).unwrap_or_else(|error| {
            panic!(
                "case {} was rejected: {error}",
                case["name"].as_str().unwrap()
            )
        });
        assert_eq!(
            properties.canonical_json(),
            case["canonicalPropertiesJson"].as_str().unwrap(),
            "JSON in case {}",
            case["name"].as_str().unwrap()
        );
        let mut bytes = Vec::new();
        properties.write_bytes(&mut bytes);
        assert_eq!(
            bytes_hex(&bytes),
            case["canonicalPropertiesHex"].as_str().unwrap(),
            "binary data in case {}",
            case["name"].as_str().unwrap()
        );
    }
}

#[test]
fn empty_properties_still_have_a_canonical_form() {
    let properties = CanonicalProperties::parse("[]").unwrap();
    let mut bytes = vec![0xaa];
    properties.write_bytes(&mut bytes);
    assert_eq!(properties.canonical_json(), "[]");
    assert_eq!(
        bytes,
        vec![0xaa],
        "encoding must append without changing existing bytes"
    );
}

#[test]
fn duplicate_and_reserved_names_are_rejected() {
    for input in [
        r#"[["same","one"],["same","two"]]"#,
        r#"[["sys.journey","/api/auth/register"]]"#,
        r#"[["sys.touchpoint","replacement"]]"#,
    ] {
        assert!(
            CanonicalProperties::parse(input).is_err(),
            "accepted {input}"
        );
    }
}

#[test]
fn malformed_names_values_and_shapes_are_rejected() {
    for input in [
        r#"[["","empty"]]"#,
        r#"[["Upper","no"]]"#,
        r#"[["two words","no"]]"#,
        r#"[["number",1]]"#,
        r#"[["null",null]]"#,
        r#"[["object",{}]]"#,
        r#"{"name":"not-an-array"}"#,
        r#"[["missing-value"]]"#,
        r#"[["too","many","parts"]]"#,
    ] {
        assert!(
            CanonicalProperties::parse(input).is_err(),
            "accepted {input}"
        );
    }

    let long_name = format!(r#"[["{}","value"]]"#, "a".repeat(65));
    assert!(CanonicalProperties::parse(&long_name).is_err());
    let long_value = format!(r#"[["name","{}"]]"#, "x".repeat(513));
    assert!(CanonicalProperties::parse(&long_value).is_err());
}

#[test]
fn documented_limits_accept_the_largest_individual_values() {
    let long_name = "a".repeat(64);
    let long_value = "я".repeat(256); // Exactly 512 UTF-8 bytes.
    let input = serde_json::to_string(&vec![vec![long_name, long_value]]).unwrap();
    assert!(CanonicalProperties::parse(&input).is_ok());

    let pairs: Vec<Vec<String>> = (0..32)
        .map(|index| vec![format!("property.{index:02}"), String::new()])
        .collect();
    assert!(CanonicalProperties::parse(&serde_json::to_string(&pairs).unwrap()).is_ok());

    let too_many: Vec<Vec<String>> = (0..33)
        .map(|index| vec![format!("property.{index:02}"), String::new()])
        .collect();
    assert!(CanonicalProperties::parse(&serde_json::to_string(&too_many).unwrap()).is_err());
}

#[test]
fn canonical_json_uses_stable_escaping_and_utf8() {
    let properties = CanonicalProperties::parse(
        "[[\"controls\",\"\\u0000\\b\\t\\n\\f\\r\\u001f\"],[\"quotes\",\"\\\"\\\\/я\"]]",
    )
    .unwrap();
    assert_eq!(
        properties.canonical_json(),
        "[[\"controls\",\"\\u0000\\b\\t\\n\\f\\r\\u001f\"],[\"quotes\",\"\\\"\\\\/я\"]]"
    );
}
