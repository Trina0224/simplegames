// constants.js — the Earth-Moon system, and the units everything else speaks.
//
// The CR3BP is written in normalised units where the Earth-Moon distance, the
// total mass and the angular rate are all 1. That is not a convenience: it is
// what makes the equations parameter-free apart from `mu`, and it is why the
// same code describes Sun-Earth or Earth-Moon by changing one number.
//
// Everything the user reads is dimensional, so the conversions live here and
// nowhere else. A kilometre must never appear inside the dynamics.

/**
 * Earth-Moon mass parameter, m2 / (m1 + m2).
 *
 * Fixed by the specification rather than recomputed from GM values, so that a
 * Lagrange point solved here can be compared against the published Earth-Moon
 * positions without the comparison quietly testing two different systems.
 */
export const MU = 0.0121505856;

/** One distance unit: the Earth-Moon separation. */
export const DU_KM = 384400;

/** One time unit: 1/n, where n is the system's angular rate. */
export const TU_DAYS = 4.3425;
export const TU_S = TU_DAYS * 86400;

/** Velocity unit follows from the other two. */
export const VU_KMS = DU_KM / TU_S;

/**
 * Physical body radii, in DU. Collision uses these and only these — the
 * renderer draws whatever it likes, and the spec is explicit that an enlarged
 * display radius must never reach the physics.
 */
export const EARTH_RADIUS_KM = 6371;
export const MOON_RADIUS_KM = 1737.4;
export const EARTH_RADIUS = EARTH_RADIUS_KM / DU_KM;   // ~0.01657 DU
export const MOON_RADIUS = MOON_RADIUS_KM / DU_KM;     // ~0.00452 DU

/** Primary positions in the rotating frame. They do not move; that is the point. */
export const EARTH_X = -MU;
export const MOON_X = 1 - MU;

export const kmToDu = (km) => km / DU_KM;
export const duToKm = (du) => du * DU_KM;
export const daysToTu = (d) => d / TU_DAYS;
export const tuToDays = (t) => t * TU_DAYS;
export const kmsToVu = (kms) => kms / VU_KMS;
export const vuToKms = (vu) => vu * VU_KMS;
export const vuToMs = (vu) => vu * VU_KMS * 1000;
export const msToVu = (ms) => ms / (VU_KMS * 1000);
