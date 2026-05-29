const mongoose = require("mongoose");
const userSchema = mongoose.Schema({
  clerkId: {
    type: String,
    unique: true,
    sparse: true, // allows multiple docs without clerkId
  },
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
    required: false, // Not needed for Clerk-authenticated users
  },
  userType: {
    type: String,
    enum: ["guest", "host"],
    default: "guest",
  },
  profileComplete: {
    type: Boolean,
    default: false, // set to true after role is chosen
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
  trustScore: { type: Number, default: 100 },
  distance: { type: Number, default: 0 },
});

module.exports = mongoose.model("User", userSchema);

