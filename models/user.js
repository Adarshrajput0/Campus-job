const mongoose = require("mongoose");
const userSchema = mongoose.Schema({
  firstName: {
    type: String,
    required: [true, "First name is required"],
  },
  lastName: String,
  email: {
    type: String,
    required: [true, "Email is required"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  userType: {
    type: String,
    enum: ["guest", "host"],
    default: "guest",
  },
  favourites: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
    },
  ],

  bio: { type: String, maxlength: 200, default: "" },
  skills: { type: [String], default: [] },
  location: { type: String, default: "" },
  avatar: { type: String, default: "" },
  rating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
  completedTasks: { type: Number, default: 0 },
  expectedPrice: { type: Number, default: 0 },
  distance: { type: Number, default: 0 },
});

module.exports = mongoose.model("User", userSchema);
