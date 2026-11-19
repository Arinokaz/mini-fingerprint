use funnel_wasm::click::{validate_score_prefix, ClickId};

#[test]
fn click_id_round_trips_between_words_bytes_and_hex() {
    let id = ClickId::from_words([0x0302_0100, 0x0706_0504, 0x0b0a_0908, 0x0f0e_0d0c]);
    assert_eq!(id.to_le_bytes(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert_eq!(id.to_hex(), "000102030405060708090a0b0c0d0e0f");
    assert_eq!(ClickId::from_hex(&id.to_hex()).unwrap(), id);
}

#[test]
fn increment_carries_across_all_four_little_endian_words() {
    assert_eq!(
        ClickId::from_words([0xffff_ffff, 0, 0, 0]).incremented(),
        ClickId::from_words([0, 1, 0, 0]),
    );
    assert_eq!(
        ClickId::from_words([0xffff_ffff; 4]).incremented(),
        ClickId::from_words([0; 4]),
    );
}

#[test]
fn score_prefix_accepts_only_up_to_three_zero_hex_digits() {
    for accepted in ["", "0", "00", "000"] {
        assert!(validate_score_prefix(accepted).is_ok(), "prefix {accepted:?}");
    }
    for rejected in ["1", "0000", "00a", "0O"] {
        assert!(validate_score_prefix(rejected).is_err(), "prefix {rejected:?}");
    }
}
