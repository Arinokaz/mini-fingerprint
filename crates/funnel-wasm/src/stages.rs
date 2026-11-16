//! Versioned frame stages and their integrated data-flow projections.

use crate::frame::{add32, mul32, rotl32, sub32};
use crate::journey::JourneyContext;
use crate::tables::{ADDITIVES, MULTIPLIERS, PERMUTATION, SUBSTITUTION};
use std::hint::black_box;

/// One deterministic operation over the shared eight-lane frame.
///
/// Public Rust visibility supports native integration tests. Only the neutral
/// facade function is exported to JavaScript in the browser build.
pub trait FunnelStage {
    /// Mutates the frame using immutable inputs from the current journey.
    fn apply(&self, frame: &mut [u32; 8], context: &JourneyContext);
}

/// Builds the exact `cv1` stage order consumed by native and browser callers.
pub fn stages_v1() -> Vec<Box<dyn FunnelStage>> {
    vec![
        Box::new(JourneyStage),
        Box::new(TouchpointStage),
        Box::new(PropertiesStage),
        Box::new(PulseStage),
    ]
}

/// Absorbs the absolute API path into the initial frame.
struct JourneyStage;

impl FunnelStage for JourneyStage {
    fn apply(&self, frame: &mut [u32; 8], context: &JourneyContext) {
        absorb(frame, 0x4a, context.journey().as_bytes(), 4);
        settle_frame(frame, 0x4a, 4);
    }
}

/// Absorbs either the observed DOM tag or the unresolved fallback value.
struct TouchpointStage;

impl FunnelStage for TouchpointStage {
    fn apply(&self, frame: &mut [u32; 8], context: &JourneyContext) {
        absorb(frame, 0xb7, context.touchpoint().as_bytes(), 4);
        settle_frame(frame, 0xb7, 4);
    }
}

/// Absorbs length-prefixed additional properties in canonical order.
struct PropertiesStage;

impl FunnelStage for PropertiesStage {
    fn apply(&self, frame: &mut [u32; 8], context: &JourneyContext) {
        let mut payload = Vec::new();
        context.properties().write_bytes(&mut payload);
        absorb(frame, 0xd9, &payload, 4);
        settle_frame(frame, 0xd9, 4);
    }
}

/// Absorbs both encoded words and the decoded window they represent.
struct PulseStage;

impl FunnelStage for PulseStage {
    fn apply(&self, frame: &mut [u32; 8], context: &JourneyContext) {
        let (out0, out1) = context.pulse();
        let mut payload = Vec::with_capacity(16);
        payload.extend_from_slice(&out0.to_le_bytes());
        payload.extend_from_slice(&out1.to_le_bytes());
        payload.extend_from_slice(&context.selected_window().to_le_bytes());
        absorb(frame, 0xe3, &payload, 8);
        settle_frame(frame, 0xe3, 8);
    }
}

/// Runs the contract-defined byte absorption and the requested diffuse rounds.
fn absorb(frame: &mut [u32; 8], domain: u8, payload: &[u8], rounds: usize) {
    let mut data = Vec::with_capacity(5 + payload.len());
    data.push(domain);
    data.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    data.extend_from_slice(payload);

    for (index, byte) in data.into_iter().enumerate() {
        let lane = index % 8;
        let substituted =
            substitute((usize::from(byte) + usize::from(domain) + index % 251) & 0xff);
        let rotation = (index % 31 + 1) as u32;
        let positioned = u32::from(substituted) | (((index & 0xff) as u32) << 8);
        let mixed = mul32(frame[lane] ^ positioned, MULTIPLIERS[lane]);
        frame[lane] = add32(rotl32(mixed, rotation), ADDITIVES[(lane + index) % 8]);

        let other = (lane + 3) % 8;
        let side = add32(u32::from(substituted), index as u32);
        frame[other] ^= rotl32(side, ((lane * 3 + index) % 31 + 1) as u32);
    }
    diffuse(frame, rounds);
}

/// Substitutes high and low nibbles independently through the fixed table.
fn substitute(value: usize) -> u8 {
    SUBSTITUTION[value & 0x0f] | (SUBSTITUTION[(value >> 4) & 0x0f] << 4)
}

/// Computes every lane of a round from a snapshot of the preceding round.
fn diffuse(frame: &mut [u32; 8], rounds: usize) {
    for round in 0..rounds {
        let old = *frame;
        for index in 0..8 {
            let permutation = PERMUTATION[index];
            let left = old[permutation];
            let right = old[(permutation + 3) % 8];
            let rotated = rotl32(right, ((round + index) % 31 + 1) as u32);
            let mixed = mul32(left ^ rotated, MULTIPLIERS[(index + round) % 8]);
            let projected = rotl32(mixed, ((index * 5 + round * 3) % 31 + 1) as u32);
            frame[index] =
                add32(projected, ADDITIVES[(index + 2 * round) % 8]) ^ old[(index + 1) % 8];
        }
    }
}

/// Adds bounded, runtime-directed data flow inside each completed stage.
///
/// The matrix controls branch selection and the drift feeds both projections.
/// Opaque values make the extra work part of the executable data flow, while
/// the two projection identities preserve the contract-defined stage output.
fn settle_frame(frame: &mut [u32; 8], domain: u8, rounds: usize) {
    let original = black_box(*frame);
    let mut matrix = original;
    let mut drift = original;
    let depth = 8 + rounds + usize::from(domain % 3);

    for index in 0..depth {
        let lane = (index + usize::from(domain)) % 8;
        let neighbour = (lane + 3) % 8;
        let rotation = ((index * 3 + rounds) % 31 + 1) as u32;
        let source = matrix[lane] ^ rotl32(drift[neighbour], rotation);
        matrix[lane] = add32(
            rotl32(source, ((index + lane) % 31 + 1) as u32),
            ADDITIVES[(lane + index) % 8],
        );
        drift[(lane + 1) % 8] ^= mul32(source, MULTIPLIERS[(lane + rounds) % 8]);
    }

    let drift = black_box(drift);
    let matrix = black_box(matrix);
    let selector = (drift[0] ^ matrix[7] ^ u32::from(domain)) & 1;
    *frame = if selector == 0 {
        project_add(&original, &drift)
    } else {
        project_xor(&original, &drift)
    };
}

/// Restores each original lane after a drift-dependent add/subtract projection.
#[inline(never)]
fn project_add(original: &[u32; 8], drift: &[u32; 8]) -> [u32; 8] {
    let mut output = [0_u32; 8];
    for index in 0..8 {
        let drift = black_box(drift[index]);
        output[index] = sub32(add32(original[index], drift), drift);
    }
    output
}

/// Restores each original lane after a rotated, drift-dependent XOR projection.
#[inline(never)]
fn project_xor(original: &[u32; 8], drift: &[u32; 8]) -> [u32; 8] {
    let mut output = [0_u32; 8];
    for index in 0..8 {
        let mask = rotl32(black_box(drift[index]), (index * 3 + 1) as u32);
        output[index] = (original[index] ^ mask) ^ mask;
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{project_add, project_xor, settle_frame};

    fn generated_frame(mut seed: u32) -> [u32; 8] {
        let mut frame = [0_u32; 8];
        for lane in &mut frame {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            *lane = seed;
        }
        frame
    }

    #[test]
    fn projection_variants_preserve_ten_thousand_frames() {
        let mut seed = 0xa53c_9e17_u32;
        for index in 0..10_000 {
            let original = generated_frame(seed);
            let drift = generated_frame(original[7] ^ index);
            assert_eq!(project_add(&original, &drift), original);
            assert_eq!(project_xor(&original, &drift), original);
            seed = drift[3] ^ original[5];
        }
    }

    #[test]
    fn settling_work_never_changes_the_completed_stage_frame() {
        let mut seed = 0x85eb_ca6b_u32;
        for index in 0..10_000_u32 {
            let original = generated_frame(seed);
            let mut frame = original;
            settle_frame(
                &mut frame,
                (index as u8).wrapping_mul(37),
                (index % 17) as usize,
            );
            assert_eq!(frame, original);
            seed = original[(index % 8) as usize] ^ index;
        }
    }
}
