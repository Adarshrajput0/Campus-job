const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    resume: {
      type: String,
      default: "",
    },
    coverLetter: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "applied", "Applied",
        "shortlisted", "Shortlisted",
        "interview", "Interview",
        "selected", "Selected",
        "completed", "Completed",
        "rejected", "Rejected",
        "withdrawn", "Withdrawn"
      ],
      default: "applied",
    },

    interviewDetails: {
      date: Date,
      time: String,
      location: String,
      notes: String,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    // Backward compatibility aliases for Booking schema
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    home: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    releaseRequested: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Pre-save hook to synchronize aliases
applicationSchema.pre("save", function (next) {
  if (!this.user && this.student) this.user = this.student;
  if (!this.student && this.user) this.student = this.user;
  if (!this.home && this.job) this.home = this.job;
  if (!this.job && this.home) this.job = this.home;
  next();
});

// Ensure a student can only apply to a job once
applicationSchema.index({ student: 1, job: 1 }, { unique: true });

const Application = mongoose.models.Application || mongoose.model("Application", applicationSchema, "applications");

if (!mongoose.models.Booking) {
  mongoose.model("Booking", applicationSchema, "applications");
}

module.exports = Application;


