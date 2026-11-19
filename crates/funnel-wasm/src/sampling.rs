//! Детерминированный поиск cv2 от заданного начального clickId.

use crate::click::{validate_score_prefix, ClickId, ClickIdError};
use crate::frame::Frame;
use crate::journey::JourneyContext;
use crate::stages::{apply_v2_prefix, apply_v2_tail};

/// Первый принятый результат и количество выполненных попыток.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClickSample {
    pub click_id: ClickId,
    pub score: String,
    pub attempts: u64,
}

/// Повторно использует общий prefix frame и меняет только click-стадию.
pub fn sample_v2(
    context: &JourneyContext,
    initial: ClickId,
    score_prefix: &str,
) -> Result<ClickSample, ClickIdError> {
    validate_score_prefix(score_prefix)?;
    let mut prefix_frame = Frame::initial();
    apply_v2_prefix(&mut prefix_frame, context);

    let mut click_id = initial;
    let mut attempts = 0_u64;
    loop {
        attempts += 1;
        let mut candidate = prefix_frame;
        apply_v2_tail(&mut candidate, context, click_id);
        let score = candidate.to_hex();
        if score.starts_with(score_prefix) {
            return Ok(ClickSample {
                click_id,
                score,
                attempts,
            });
        }
        click_id = click_id.incremented();
    }
}
