const User = require('../models/user');

/**
 * Decrease rating and trustScore for a guest who cancels after being hired.
 * Rating: -1 point, TrustScore: -10 (out of 100)
 */
const applyGuestPenalty = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    $inc: { rating: -1, trustScore: -10 },
  });
};

/**
 * Decrease rating and trustScore for a host who re‑selects another guest after already selecting one.
 */
const applyHostPenalty = async (hostId) => {
  await User.findByIdAndUpdate(hostId, {
    $inc: { rating: -1, trustScore: -10 },
  });
};

module.exports = { applyGuestPenalty, applyHostPenalty };
