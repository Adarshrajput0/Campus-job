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
    enum: ["student", "host", "admin", "guest"],
    default: "student",
  },
  profileComplete: {
    type: Boolean,
    default: false, // set to true after role is chosen & details filled
  },

  // Parul University Student Fields & Verification
  universityEmail: { type: String, default: "" },
  enrollmentNo: { type: String, default: "" },
  campusLocation: { type: String, default: "" },
  department: { type: String, default: "" },
  branch: { type: String, default: "" },
  semester: { type: String, default: "" },
  division: { type: String, default: "" },
  graduationYear: { type: Number, default: null },
  resume: { type: String, default: "" },
  isVerified: { type: Boolean, default: false },
  verificationStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  rejectionReason: { type: String, default: "" },

  // Parul University Host Fields & Verification
  organization: { type: String, default: "" },
  universityAffiliation: { type: String, default: "" },
  contactInfo: { type: String, default: "" },
  hostDescription: { type: String, default: "" },
  isHostVerified: { type: Boolean, default: false },
  hostVerificationStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },

  favourites: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
    },
  ],

  bio: { type: String, maxlength: 500, default: "" },
  skills: { type: [String], default: [] },
  location: { type: String, default: "" },
  avatar: { type: String, default: "" },
  rating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
  completedTasks: { type: Number, default: 0 },
  expectedPrice: { type: Number, default: 0 },
  trustScore: { type: Number, default: 100 },
  distance: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);

