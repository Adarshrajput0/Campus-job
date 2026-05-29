const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    home: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    checkInDate: Date,
    checkOutDate: Date,
    guests: Number,
    totalPrice: Number,
    status: String,
    releaseRequested: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true },
);

module.exports = mongoose.model("Booking", bookingSchema);
